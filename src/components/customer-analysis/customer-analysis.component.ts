import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import type { Customer, CustomerConsumptionSummary, CustomerTransaction, BasketAnalysisResult } from '../../models/financial.model';
import { CustomerFeedback } from '../../models/financial.model';

@Component({
  selector: 'app-customer-analysis',
  templateUrl: './customer-analysis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerAnalysisComponent {
  apiService = inject(ApiService);
  private route = inject(ActivatedRoute);

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
    * 顧客分類篩選 (all, regular, cigar, exCigar, shareholder)
   */
  categoryFilter = signal<string>('all');
  
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
    if (category !== 'all') {
      filtered = filtered.filter(c => this.getCustomerCategory(c) === category);
    }
    
    // 按搜尋詞篩選
    const term = this.searchTerm().toLowerCase();
    if (term) {
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.phone?.includes(term)
      );
    }

    // 依最後結帳時間遞減排序（沒有結帳紀錄的排在最後）
    filtered = [...filtered].sort((a, b) => {
      const timeA = a.lastCheckoutAt ? new Date(a.lastCheckoutAt).getTime() : -Infinity;
      const timeB = b.lastCheckoutAt ? new Date(b.lastCheckoutAt).getTime() : -Infinity;
      return timeB - timeA;
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
   * 計算顧客統計數據
   * 根據顧客名稱中的關鍵字分類：
   *   - 前雪茄會員：名稱包含「EX雪茄會員」（英文大小寫不敏感）
   *   - 雪茄會員：名稱包含「雪茄」
   *   - 股東：名稱包含「股東」
   *   - 一般顧客：其他
   */
  customerStats = computed(() => {
    const all = this.customers();
    const total = all.length;
    const exCigarCount = all.filter(c => this.getCustomerCategory(c) === 'exCigar').length;
    const cigarCount = all.filter(c => this.getCustomerCategory(c) === 'cigar').length;
    const shareholderCount = all.filter(c => this.getCustomerCategory(c) === 'shareholder').length;
    const regularCount = all.filter(c => this.getCustomerCategory(c) === 'regular').length;
    return { total, exCigarCount, cigarCount, regularCount, shareholderCount };
  });

  constructor() {
    this.route.queryParamMap.subscribe(params => {
      const category = String(params.get('category') || '').trim();
      if (category && ['all', 'regular', 'cigar', 'exCigar', 'shareholder'].includes(category)) {
        this.categoryFilter.set(category);
      }
    });
    this.loadCustomers();
    this.loadMonthlyVisitorCount();
    this.loadBasketAnalysis();

    // 搜尋詞或分類篩選變動時，捲動載入進度重置回第一批
    effect(() => {
      this.searchTerm();
      this.categoryFilter();
      this.visibleCustomerCount.set(this.CUSTOMER_PAGE_SIZE);
    });
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
  async loadCustomers(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // 調用 API 服務獲取顧客列表
      const response = await this.apiService.getCustomers();
      
      if (response.success && response.data && Array.isArray(response.data)) {
        // 直接使用後端返回的 Customer 對象（已正確映射）
        this.customers.set(response.data as Customer[]);
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
    this.consumptionSummary.set(null);
    this.loadConsumptionSummary(customer.id);
    this.resetTransactionFilters();
    this.loadTransactions(1);
  }

  /**
   * 清除當前選中的顧客及其相關數據
   */
  clearSelection(): void {
    this.selectedCustomer.set(null);
    this.customerFeedback.set([]);
    this.consumptionSummary.set(null);
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
   * 根據顧客名稱中的關鍵字判斷分類
   * 
   * @param customer 顧客對象
   * @returns 顧客分類 ('exCigar' | 'cigar' | 'shareholder' | 'regular')
   */
  getCustomerCategory(customer: Customer): string {
    const name = customer.name || '';
    if (/ex雪茄會員/i.test(name)) return 'exCigar';
    if (name.includes('雪茄')) return 'cigar';
    if (name.includes('股東')) return 'shareholder';
    return 'regular';
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
   * 根據顧客分類返回相應的 CSS 樣式類
   * 
   * @param customer 顧客對象
   * @returns CSS 樣式類字符串
   */
  getCustomerTypeClass(customer: Customer): string {
    const category = this.getCustomerCategory(customer);
    switch (category) {
      case 'exCigar':
        return 'bg-gray-100 text-gray-800';
      case 'cigar':
        return 'bg-purple-100 text-purple-800';
      case 'shareholder':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  }

  /**
   * 根據分類返回顯示文字
   * 
   * @param customer 顧客對象
   * @returns 顧客類型字符串
   */
  getCustomerType(customer: Customer): string {
    const category = this.getCustomerCategory(customer);
    switch (category) {
      case 'exCigar':
        return '前雪茄會員';
      case 'cigar':
        return '雪茄會員';
      case 'shareholder':
        return '股東';
      default:
        return '一般顧客';
    }
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
