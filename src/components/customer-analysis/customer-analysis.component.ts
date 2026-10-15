import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, computed, effect, inject, signal, viewChild, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import type { Customer, CustomerConsumptionSummary, CustomerTransaction, BasketAnalysisResult, MemberTag } from '../../models/financial.model';
import { CustomerFeedback } from '../../models/financial.model';
import { MemberTagManagerComponent } from '../member-tag-manager/member-tag-manager.component';
import { MEMBER_TAG_EDITOR_ROLES, memberTagClass } from '../../utils/member-tags';

/**
 * 舊連結（例如儀表板「雪茄會員」卡片）的 ?category= 值 → 標籤名稱；
 * 分類改成標籤後，regular（一般顧客）對應到「未貼標籤」。
 */
const LEGACY_CATEGORY_TAG_NAMES: Record<string, string> = {
  cigar: '雪茄會員',
  exCigar: '前雪茄會員',
  shareholder: '股東',
};

@Component({
  selector: 'app-customer-analysis',
  templateUrl: './customer-analysis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MemberTagManagerComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerAnalysisComponent implements AfterViewInit, OnDestroy {
  apiService = inject(ApiService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private ngZone = inject(NgZone);

  /**
   * 右側詳細資訊欄（顧客名稱／總消費統計／交易歷史）的元素參考，
   * 用來量測其實際渲染高度，讓左側顧客列表的總長度可以對齊到同樣高度。
   */
  private detailColumn = viewChild<ElementRef<HTMLElement>>('detailColumn');
  private resizeObserver?: ResizeObserver;

  /**
   * 右側詳細資訊欄目前的渲染高度（px），由 ResizeObserver 量測
   */
  detailColumnHeight = signal<number | null>(null);

  /**
   * 是否為桌面版並排版面（lg 斷點以上）；只有在並排時才需要讓
   * 左側顧客列表對齊右側高度，手機版兩欄上下堆疊時不適用
   */
  isWideLayout = signal(typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);
  private onWindowResize = () => this.isWideLayout.set(window.innerWidth >= 1024);

  ngAfterViewInit(): void {
    window.addEventListener('resize', this.onWindowResize);

    const el = this.detailColumn()?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height;
        if (height) {
          this.ngZone.run(() => this.detailColumnHeight.set(height));
        }
      });
      this.resizeObserver.observe(el);
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onWindowResize);
    this.resizeObserver?.disconnect();
  }

  // --- State Signals ---
  /**
   * 所有顧客列表（從 pos.members 表加載）
   */
  customers = signal<Customer[]>([]);
  
  /**
   * 搜尋關鍵字（用於按名稱或電話過濾）
   */
  searchTerm = signal('');
  
  /**
   * 頁籤：顧客列表／會員分類標籤（後者只有超級管理員、經營管理者看得到）
   */
  activeTab = signal<'customers' | 'tags'>('customers');

  /** 可以維護標籤、幫會員貼標籤（超級管理員、經營管理者） */
  canManageTags = computed(() => {
    this.authService.currentAdmin();
    return this.authService.hasAnyRole(MEMBER_TAG_EDITOR_ROLES);
  });

  /** 會員分類標籤主檔（/api/member-tags） */
  memberTags = signal<MemberTag[]>([]);

  /** 從網址帶進來、等標籤載入後才能換成 tag id 的標籤名稱 */
  private pendingTagFilterName: string | null = null;

  readonly tagClass = memberTagClass;

  /**
   * 標籤篩選：all（全部）／untagged（未貼標籤）／標籤 id（字串）
   */
  categoryFilter = signal<string>('all');

  /** 詳細資料裡正在編輯標籤時勾選的標籤 id；null＝沒有在編輯 */
  editingTagIds = signal<Set<number> | null>(null);
  isSavingTags = signal(false);
  /** LINE 連結狀態篩選：all／linked（已連結）／unlinked（尚未連結） */
  lineFilter = signal<string>('all');

  /**
   * 顧客列表排序方式（lastCheckout：最後結帳時間新→舊；spentDesc／spentAsc：總消費金額高→低／低→高）
   */
  customerSort = signal<'lastCheckout' | 'spentDesc' | 'spentAsc'>('lastCheckout');
  
  /**
   * 當前選中的顧客
   */
  selectedCustomer = signal<Customer | null>(null);
  
  /**
   * 所選顧客的反饋記錄
   */
  customerFeedback = signal<CustomerFeedback[]>([]);

  /**
   * 顧客列表捲動載入：目前顯示的筆數（每次捲到底 +CUSTOMER_PAGE_SIZE）
   */
  readonly CUSTOMER_PAGE_SIZE = 20;
  visibleCustomerCount = signal(this.CUSTOMER_PAGE_SIZE);

  /**
   * 所選顧客的交易歷史（分頁）
   * 資料來源：pos.invoices，僅發票層級資訊，沒有品項明細
   */
  transactions = signal<CustomerTransaction[]>([]);
  transactionsTotal = signal(0);
  transactionsPage = signal(1);
  readonly TRANSACTIONS_PAGE_SIZE = 10;
  isTransactionsLoading = signal(false);
  transactionsError = signal<string | null>(null);

  /**
   * 交易歷史篩選條件（表單暫存值，按「套用篩選」才會真的查詢）
   */
  transactionFilterStartDate = signal('');
  transactionFilterEndDate = signal('');
  transactionFilterMinAmount = signal<number | null>(null);
  transactionFilterMaxAmount = signal<number | null>(null);
  transactionFilterProduct = signal('');
  
  /**
   * 數據加載狀態
   */
  isLoading = signal(false);

  /**
   * 錯誤訊息
   */
  errorMessage = signal<string | null>(null);

  /**
   * 所選顧客的消費統計（依年份分組 + 累積總額）
   */
  consumptionSummary = signal<CustomerConsumptionSummary | null>(null);

  /**
   * 消費統計加載狀態
   */
  isConsumptionLoading = signal(false);

  /**
   * 「總消費統計」表格中目前展開顯示逐月明細的年份集合
   */
  expandedConsumptionYears = signal<Set<number>>(new Set());

  /**
   * 本月來店會員數（資料來源：pos.invoices，本月內有效交易且對應到會員，依會員 UUID 去重）
   */
  monthlyVisitorCount = signal<number | null>(null);

  /**
   * 整體購物籃分析結果（關聯規則探勘，非 AI；資料來源：pos.customer_group_orders）
   */
  basketAnalysis = signal<BasketAnalysisResult | null>(null);
  isBasketAnalysisLoading = signal(false);
  basketAnalysisError = signal<string | null>(null);

  // --- Computed Properties ---
  /**
   * 根據搜尋詞和分類過濾顧客列表
   * 支持按名稱或電話號碼搜尋，以及按分類篩選
   */
  filteredCustomers = computed(() => {
    let filtered = this.customers();
    
    // 按分類篩選
    const category = this.categoryFilter();
    if (category === 'untagged') {
      filtered = filtered.filter(c => !c.tags?.length);
    } else if (category !== 'all') {
      const tagId = Number(category);
      filtered = filtered.filter(c => c.tags?.some(t => t.id === tagId));
    }

    const line = this.lineFilter();
    if (line === 'linked') {
      filtered = filtered.filter(c => c.lineLinked);
    } else if (line === 'unlinked') {
      filtered = filtered.filter(c => !c.lineLinked);
    }
    
    // 按搜尋詞篩選
    const term = this.searchTerm().toLowerCase();
    if (term) {
      // 也可以輸入雪茄會員編號（12 或 #12）
      const memberNoTerm = term.replace(/^#/, '');
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.phone?.includes(term) ||
        (c.memberNo != null && String(c.memberNo) === memberNoTerm)
      );
    }

    // 依選擇的排序方式排序（同金額時再依最後結帳時間；沒有結帳紀錄的排在最後）
    const sort = this.customerSort();
    const byLastCheckout = (a: Customer, b: Customer) => {
      const timeA = a.lastCheckoutAt ? new Date(a.lastCheckoutAt).getTime() : -Infinity;
      const timeB = b.lastCheckoutAt ? new Date(b.lastCheckoutAt).getTime() : -Infinity;
      return timeB - timeA;
    };
    filtered = [...filtered].sort((a, b) => {
      if (sort === 'spentDesc' || sort === 'spentAsc') {
        const diff = (a.totalSpent ?? 0) - (b.totalSpent ?? 0);
        if (diff !== 0) return sort === 'spentDesc' ? -diff : diff;
      }
      return byLastCheckout(a, b);
    });

    return filtered;
  });

  /**
   * 依捲動載入進度截取要顯示的顧客（每次捲到底多顯示 CUSTOMER_PAGE_SIZE 筆）
   */
  visibleCustomers = computed(() => {
    return this.filteredCustomers().slice(0, this.visibleCustomerCount());
  });

  /**
   * 交易歷史總頁數
   */
  transactionsTotalPages = computed(() => {
    return Math.max(1, Math.ceil(this.transactionsTotal() / this.TRANSACTIONS_PAGE_SIZE));
  });

  /**
   * 統計卡片要顯示的標籤（使用者 2026-10-15 指定只列這兩個；依標籤名稱比對，改名後卡片會消失）
   */
  private readonly STAT_CARD_TAG_NAMES = ['雪茄會員', '前雪茄會員'];

  /**
   * 顧客統計：總數、統計卡片標籤的會員數
   */
  customerStats = computed(() => {
    const all = this.customers();
    const tagCounts = new Map<number, number>();
    for (const customer of all) {
      for (const tag of customer.tags ?? []) {
        tagCounts.set(tag.id, (tagCounts.get(tag.id) ?? 0) + 1);
      }
    }
    return {
      total: all.length,
      tags: this.memberTags()
        .filter(tag => this.STAT_CARD_TAG_NAMES.includes(tag.name))
        .map(tag => ({ tag, count: tagCounts.get(tag.id) ?? 0 })),
    };
  });

  constructor() {
    this.route.queryParamMap.subscribe(params => {
      const category = String(params.get('category') || '').trim();
      const tagName = String(params.get('tag') || '').trim() || LEGACY_CATEGORY_TAG_NAMES[category] || null;
      if (category === 'regular' || category === 'untagged') {
        this.categoryFilter.set('untagged');
      } else if (tagName) {
        this.pendingTagFilterName = tagName;
        this.applyPendingTagFilter();
      }
    });
    this.loadMemberTags();
    this.loadCustomers();
    this.loadMonthlyVisitorCount();
    this.loadBasketAnalysis();

    // 搜尋詞、分類篩選或排序方式變動時，捲動載入進度重置回第一批
    effect(() => {
      this.searchTerm();
      this.categoryFilter();
      this.lineFilter();
      this.customerSort();
      this.visibleCustomerCount.set(this.CUSTOMER_PAGE_SIZE);
    });
  }

  /**
   * 載入會員分類標籤（篩選下拉、統計卡片、貼標籤用）
   */
  async loadMemberTags(): Promise<void> {
    try {
      const response = await this.apiService.getMemberTags();
      if (response.success && response.data) {
        this.memberTags.set(response.data);
        const current = this.categoryFilter();
        if (current !== 'all' && current !== 'untagged' && !response.data.some(t => String(t.id) === current)) {
          this.categoryFilter.set('all'); // 篩選中的標籤被刪掉了
        }
        this.applyPendingTagFilter();
      }
    } catch (error) {
      console.error('Error loading member tags:', error);
    }
  }

  /** 網址帶的標籤名稱（?tag= 或舊的 ?category=）換成標籤篩選 */
  private applyPendingTagFilter(): void {
    const name = this.pendingTagFilterName;
    if (!name) return;
    const tag = this.memberTags().find(t => t.name === name);
    if (tag) {
      this.categoryFilter.set(String(tag.id));
      this.pendingTagFilterName = null;
    }
  }

  /** 點統計卡片直接篩選該標籤 */
  filterByTag(value: string): void {
    this.categoryFilter.set(value);
  }

  /** 標籤管理分頁有異動：重新載入標籤與顧客（改名／改色／刪除要反映到顧客身上） */
  async onTagsChanged(): Promise<void> {
    await Promise.all([this.loadMemberTags(), this.loadCustomers({ silent: true })]);
  }

  startEditCustomerTags(customer: Customer): void {
    this.editingTagIds.set(new Set((customer.tags ?? []).map(t => t.id)));
  }

  cancelEditCustomerTags(): void {
    this.editingTagIds.set(null);
  }

  toggleEditingTag(tagId: number): void {
    this.editingTagIds.update(current => {
      const next = new Set(current ?? []);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async saveCustomerTags(customer: Customer): Promise<void> {
    const ids = this.editingTagIds();
    if (!ids) return;
    this.isSavingTags.set(true);
    try {
      const response = await this.apiService.setMemberTags(customer.id, Array.from(ids));
      if (response.success && response.data) {
        const tags = response.data.tags;
        this.customers.update(list => list.map(c => (c.id === customer.id ? { ...c, tags } : c)));
        this.selectedCustomer.update(c => (c && c.id === customer.id ? { ...c, tags } : c));
        this.editingTagIds.set(null);
      }
    } catch (error: any) {
      alert(error?.error?.error || '儲存標籤失敗，請稍後再試');
      await this.loadMemberTags();
    } finally {
      this.isSavingTags.set(false);
    }
  }

  /**
   * 載入本月來店會員數
   */
  async loadMonthlyVisitorCount(): Promise<void> {
    try {
      const response = await this.apiService.getMonthlyVisitorCount();
      if (response.success && response.data) {
        this.monthlyVisitorCount.set(response.data.count);
      }
    } catch (error) {
      console.error('Error loading monthly visitor count:', error);
    }
  }

  /**
   * 載入整體購物籃分析（關聯規則探勘，非 AI）
   */
  async loadBasketAnalysis(): Promise<void> {
    this.isBasketAnalysisLoading.set(true);
    this.basketAnalysisError.set(null);
    try {
      const response = await this.apiService.getBasketAnalysis();
      if (response.success && response.data) {
        this.basketAnalysis.set(response.data);
      } else {
        this.basketAnalysisError.set(response.error || '無法取得購物籃分析');
      }
    } catch (error) {
      console.error('Error loading basket analysis:', error);
      this.basketAnalysisError.set('載入購物籃分析失敗，請稍後重試');
    } finally {
      this.isBasketAnalysisLoading.set(false);
    }
  }

  /**
   * 顧客列表捲動到底時，多顯示下一批顧客
   */
  onCustomerListScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (nearBottom && this.visibleCustomerCount() < this.filteredCustomers().length) {
      this.visibleCustomerCount.update(count => count + this.CUSTOMER_PAGE_SIZE);
    }
  }

  /**
   * 從後端 API 加載顧客資料
   * 
   * 此方法會從後端的 /api/customers 端點獲取所有顧客數據。
   * 數據來源：pos.members 表格
   * 
   * 欄位對應關係：
   *   - member_uuid → id (顧客唯一識別符)
   *   - name → name (顧客名稱)
   *   - mobile → phone (行動電話)
   *   - gender → gender (性別)
   *   - birth → birthday (生日，MM/DD格式)
   *   - birth_year → birthYear (出生年份)
   *   - loyalty_points → loyaltyPoints (積分點數)
   *   - origin_store_name → originStore (原始門店名稱)
   *   - last_checkout_at → lastCheckoutAt (最後結帳時間，ISO 8601格式)
   *   - is_deleted → isDeleted (是否已刪除)
   * 
   * 錯誤處理：
   *   - API 調用失敗時會設置 errorMessage signal
   *   - console 會輸出詳細的錯誤信息用於調試
   * 
   * @async
   * @returns {Promise<void>}
   */
  async loadCustomers(options?: { silent?: boolean }): Promise<void> {
    if (!options?.silent) this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // 調用 API 服務獲取顧客列表
      const response = await this.apiService.getCustomers();
      
      if (response.success && response.data && Array.isArray(response.data)) {
        // 直接使用後端返回的 Customer 對象（已正確映射）
        const customers = response.data as Customer[];
        this.customers.set(customers);
        // 重新載入時，右側詳細資料也換成最新內容（例如標籤改名）
        const selectedId = this.selectedCustomer()?.id;
        if (selectedId) {
          const latest = customers.find(c => c.id === selectedId);
          if (latest) this.selectedCustomer.set(latest);
        }
      } else {
        this.errorMessage.set(response.error || '無法取得顧客資料');
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      this.errorMessage.set('載入顧客資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 選擇顧客並顯示其詳細信息
   * 
   * @param customer 選中的顧客對象
   */
  selectCustomer(customer: Customer): void {
    this.selectedCustomer.set(customer);
    this.editingTagIds.set(null);
    this.consumptionSummary.set(null);
    this.expandedConsumptionYears.set(new Set());
    this.loadConsumptionSummary(customer.id);
    this.resetTransactionFilters();
    this.loadTransactions(1);
  }

  /**
   * 清除當前選中的顧客及其相關數據
   */
  clearSelection(): void {
    this.selectedCustomer.set(null);
    this.editingTagIds.set(null);
    this.customerFeedback.set([]);
    this.consumptionSummary.set(null);
    this.expandedConsumptionYears.set(new Set());
    this.transactions.set([]);
    this.transactionsTotal.set(0);
    this.transactionsPage.set(1);
    this.transactionsError.set(null);
    this.resetTransactionFilters();
  }

  /**
   * 載入所選顧客的消費統計（依年份分組 + 累積總額）
   * 資料來源：pos.invoices，依會員 UUID 對應
   *
   * @param memberUuid 顧客 UUID
   */
  async loadConsumptionSummary(memberUuid: string): Promise<void> {
    this.isConsumptionLoading.set(true);
    try {
      const response = await this.apiService.getCustomerConsumptionSummary(memberUuid);
      if (response.success && response.data) {
        this.consumptionSummary.set(response.data);
      }
    } catch (error) {
      console.error('Error loading customer consumption summary:', error);
    } finally {
      this.isConsumptionLoading.set(false);
    }
  }

  /**
   * 載入所選顧客的交易歷史（分頁 + 篩選）
   * 資料來源：pos.invoices，僅發票層級資訊
   *
   * @param page 要載入的頁碼（從 1 開始）
   */
  async loadTransactions(page: number): Promise<void> {
    const customer = this.selectedCustomer();
    if (!customer) return;

    this.isTransactionsLoading.set(true);
    this.transactionsError.set(null);
    try {
      const response = await this.apiService.getCustomerTransactions(customer.id, {
        page,
        pageSize: this.TRANSACTIONS_PAGE_SIZE,
        startDate: this.transactionFilterStartDate() || undefined,
        endDate: this.transactionFilterEndDate() || undefined,
        minAmount: this.transactionFilterMinAmount() ?? undefined,
        maxAmount: this.transactionFilterMaxAmount() ?? undefined,
        product: this.transactionFilterProduct() || undefined,
      });
      if (response.success && response.data) {
        this.transactions.set(response.data.transactions);
        this.transactionsTotal.set(response.data.total);
        this.transactionsPage.set(response.data.page);
      } else {
        this.transactionsError.set(response.error || '無法取得交易歷史');
      }
    } catch (error) {
      console.error('Error loading customer transactions:', error);
      this.transactionsError.set('載入交易歷史失敗，請稍後重試');
    } finally {
      this.isTransactionsLoading.set(false);
    }
  }

  /**
   * 切換「總消費統計」表格中某一年份的逐月明細展開/收合狀態
   */
  toggleConsumptionYear(year: number): void {
    const expanded = new Set(this.expandedConsumptionYears());
    if (expanded.has(year)) {
      expanded.delete(year);
    } else {
      expanded.add(year);
    }
    this.expandedConsumptionYears.set(expanded);
  }

  /**
   * 判斷某一年份目前是否已展開顯示逐月明細
   */
  isConsumptionYearExpanded(year: number): boolean {
    return this.expandedConsumptionYears().has(year);
  }

  /**
   * 套用交易歷史篩選條件，並回到第一頁重新查詢
   */
  applyTransactionFilters(): void {
    this.loadTransactions(1);
  }

  /**
   * 清除交易歷史篩選條件，並回到第一頁重新查詢
   */
  resetTransactionFilters(): void {
    this.transactionFilterStartDate.set('');
    this.transactionFilterEndDate.set('');
    this.transactionFilterMinAmount.set(null);
    this.transactionFilterMaxAmount.set(null);
    this.transactionFilterProduct.set('');
  }

  clearTransactionFiltersAndReload(): void {
    this.resetTransactionFilters();
    this.loadTransactions(1);
  }

  /**
   * 切換交易歷史頁碼
   */
  goToTransactionsPage(page: number): void {
    if (page < 1 || page > this.transactionsTotalPages() || page === this.transactionsPage()) {
      return;
    }
    this.loadTransactions(page);
  }


  /**
   * 移除顧客名稱中的分類關鍵字
   * 
   * @param customer 顧客對象
   * @returns 清理後的名稱
   */
  getCleanCustomerName(customer: Customer): string {
    let name = customer.name || '';
    name = name.replace(/ex雪茄會員\s*/gi, '');
    // 移除「雪茄」和「股東」關鍵字及其後的空格
    name = name.replace(/雪茄\s*/g, '').replace(/股東\s*/g, '');
    return name.trim();
  }

  /**
   * 格式化交易品項清單為字串（供交易歷史表格顯示）
   */
  formatTransactionItems(items: { itemName: string }[]): string {
    if (!items || items.length === 0) return '-';
    return items.map((i) => i.itemName).join('、');
  }

  /**
   * 格式化貨幣顯示
   * 將數字轉換為台幣格式，使用千分位分隔符
   * 
   * @param value 要格式化的數值
   * @returns 格式化後的貨幣字符串（例：NT$1,000）
   */
  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /**
   * 生成星級評分的已填充星星數組
   * 
   * @param rating 評分值（0-5）
   * @returns 長度為 rating 的數組，用於模板迴圈顯示星星
   */
  getStars(rating: number): number[] {
    return Array(rating).fill(0);
  }

  /**
   * 生成星級評分的空星星數組
   * 
   * @param rating 評分值（0-5）
   * @returns 長度為 (5 - rating) 的數組，用於模板迴圈顯示空星星
   */
  getEmptyStars(rating: number): number[] {
    return Array(5 - rating).fill(0);
  }
}
