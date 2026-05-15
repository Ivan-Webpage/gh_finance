import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { LedgerEntry, ShipmentItem, GLAccount } from '../../models/financial.model';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type LedgerView = 'details' | 'add';
type SortDirection = 'asc' | 'desc';

interface FilterOptions {
  items: string[];
  categories: string[];
  vendorNames: string[];
}

@Component({
  selector: 'app-ledger',
  templateUrl: './ledger.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LedgerComponent {
  apiService = inject(ApiService);
  fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  isViewer = computed(() => this.authService.hasRole('viewer'));

  activeView = signal<LedgerView>('details');
  
  // Data & State
  allTransactions = signal<LedgerEntry[]>([]);
  displayedTransactions = signal<LedgerEntry[]>([]); // API 回傳的當前頁資料
  pagination = signal({ total: 0, totalPages: 1, page: 1, limit: 20 }); // API 回傳的分頁資訊
  filterOptions = signal<FilterOptions>({ items: [], categories: [], vendorNames: [] });
  editingTransaction = signal<LedgerEntry | null>(null);
  newlyCreatedEntry = signal<LedgerEntry | null>(null); // 新增後的流水帳記錄，用於在 add 視圖中顯示進貨資料
  isModalOpen = signal(false);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  confirmationState = signal<{ message: string; isChecked: boolean; target: HTMLInputElement; } | null>(null);

  // Shipment Items (進貨資料)
  shipmentItems = signal<ShipmentItem[]>([]);
  isLoadingShipmentItems = signal(false);
  shipmentItemsError = signal<string | null>(null);
  savingShipmentItemIds = signal<number[]>([]);
  deleteConfirmation = signal<{ shipmentId: number; itemName: string } | null>(null);
  newShipmentItemIds = signal<number[]>([]);
  saveSuccessMessage = signal<string | null>(null);
  
  // Ledger Delete
  ledgerDeleteConfirmation = signal<{ entryId: number; relatedShipmentCount: number } | null>(null);
  isCheckingShipment = signal(false);
  
  // Filters
  // 使用當前日期並設定預設時間範圍為本月初至本月底
  private today = new Date();
  private firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
  private lastDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0);
  startDate = signal(this.formatDate(this.firstDayOfMonth));
  endDate = signal(this.formatDate(this.lastDayOfMonth));
  selectedItem = signal('');
  selectedCategory = signal('');
  selectedVendor = signal('');
  descriptionFilter = signal('');
  entryIdFilter = signal('');
  appliedItem = signal('');
  appliedCategory = signal('');
  appliedVendor = signal('');
  appliedDescriptionFilter = signal('');
  appliedEntryIdFilter = signal('');

  // Pagination
  pageSize = 20;
  currentPage = signal(1);

  // Sorting
  sortColumn = signal<keyof LedgerEntry | null>('entry_date');
  sortDirection = signal<SortDirection>('desc');

  // Form
  submitted = signal(false);
  formItemGroup = signal<string | null>(null); // 追踪表單中的項目
  ledgerForm = this.fb.group({
    entry_id: [''],
    entry_date: ['', Validators.required],
    item_group: ['', Validators.required],
    subject_name: ['', Validators.required],
    amount: ['', Validators.required],
    invoice_no: [''],
    vendor_tax_id: ['', [Validators.pattern(/^\d{0,8}$/)]],
    vendor_id: [null as number | null],
    vendor_name: [''],
    description: [''],
    is_sigh_off: [false],
    gl_account_id: [null as number | null]
  });

  // GL Accounts 數據
  glAccounts = signal<GLAccount[]>([]);
  isLoadingGLAccounts = signal(false);
  glAccountsError = signal<string | null>(null);
  
  // 計算 GL Accounts 的層級結構（按 parent_account_id 分組）
  glAccountsHierarchy = computed(() => {
    const accounts = this.glAccounts();
    const hierarchy: { [parentId: string]: GLAccount[] } = {};
    
    accounts.forEach(acc => {
      const parentId = (acc.parent_account_id !== null && acc.parent_account_id !== undefined) ? acc.parent_account_id.toString() : 'null';
      if (!hierarchy[parentId]) {
        hierarchy[parentId] = [];
      }
      hierarchy[parentId].push(acc);
    });
    
    return hierarchy;
  });
  
  // 一級科目（項目）- 從 GL Accounts 獲取，parent_account_id 為 null 的
  topLevelAccounts = computed(() => {
    const hierarchy = this.glAccountsHierarchy();
    return (hierarchy['null'] || []).sort((a, b) => a.gl_account_id - b.gl_account_id);
  });
  
  // 選中項目的二級科目（科目）
  selectedItemSubAccounts = computed(() => {
    const selectedItem = this.formItemGroup();
    const accounts = this.glAccounts();
    
    if (!selectedItem || accounts.length === 0) return [];
    
    // 找到對應的一級科目（parent_account_id 為 null）
    const parentAccount = accounts.find(acc => acc.account_name === selectedItem && acc.parent_account_id === null);
    if (!parentAccount) return [];
    
    // 找出所有該一級科目的二級科目（parent_account_id === parentAccount.gl_account_id）
    return accounts
      .filter(acc => acc.parent_account_id === parentAccount.gl_account_id)
      .sort((a, b) => a.gl_account_id - b.gl_account_id);
  });

  // 新增/編輯表單的科目選項：僅使用 GL 二級科目
  formAvailableSubjects = computed(() => {
    return this.selectedItemSubAccounts()
      .map(acc => acc.account_name)
      .filter(Boolean)
      .sort();
  });
  
  // 簡化的分類映射（實際應該從後端 GL accounts 獲取）
  itemCategoryMap: Record<string, string[]> = {
    '資產': ['現金', '銀行存款', '應收帳款', '存貨'],
    '負債': ['應付帳款', '應付薪資', '應付稅款'],
    '業主權益': ['資本', '保留盈餘'],
    '營業收入': ['銷貨收入', '其他收入'],
    '營業費用': ['人事費用', '進貨成本', '其他費用']
  };

  availableCategories = computed(() => {
    const selectedItem = this.formItemGroup(); // 使用 signal 追踪表單值
    
    // 如果沒有選擇項目，返回空
    if (!selectedItem) {
      return [];
    }
    
    // 優先使用 GL Accounts 數據
    const glAccountsData = this.glAccounts();
    if (glAccountsData.length > 0) {
      const parentAccount = glAccountsData.find(acc => acc.account_name === selectedItem && acc.parent_account_id === null);
      if (parentAccount) {
        const glCategories = glAccountsData
          .filter(acc => acc.parent_account_id === parentAccount.gl_account_id)
          .map(acc => acc.account_name)
          .filter(Boolean)
          .sort();
        
        // 如果找到結果就使用
        if (glCategories.length > 0) {
          return glCategories;
        }
      }
    }
    
    // 備選：從交易數據中動態取得科目
    const allTransactions = this.allTransactions();
    const categoriesForItem = allTransactions
      .filter(t => t.item_group === selectedItem)
      .map(t => t.subject_name)
      .filter(Boolean) as string[];
    
    const uniqueCategories = [...new Set(categoriesForItem)].sort();
    
    // 如果還是沒有數據，從 itemCategoryMap 取得預設值
    if (uniqueCategories.length === 0) {
      const mapCategories = this.itemCategoryMap[selectedItem];
      if (mapCategories && mapCategories.length > 0) {
        return mapCategories;
      }
    }
    
    return uniqueCategories;
  });

  // 篩選用的可用科目選項 - 根據選擇的項目動態顯示
  filterAvailableCategories = computed(() => {
    const selectedItem = this.selectedItem();
    
    // 優先使用 GL Accounts 數據
    if (this.glAccounts().length > 0) {
      const accounts = this.glAccounts();
      const parentAccount = accounts.find(acc => acc.account_name === selectedItem && acc.parent_account_id === null);
      if (parentAccount) {
        const glCategories = accounts
          .filter(acc => acc.parent_account_id === parentAccount.gl_account_id)
          .map(acc => acc.account_name)
          .filter(Boolean)
          .sort();
        
        // 如果找到結果就使用
        if (glCategories.length > 0) {
          return glCategories;
        }
      }
    }
    
    // 備選：使用舊的 itemCategoryMap
    if (!selectedItem) {
      return [];
    }
    const allTransactions = this.allTransactions();
    const categoriesForItem = allTransactions
      .filter(t => t.item_group === selectedItem)
      .map(t => t.subject_name)
      .filter(Boolean);
    return [...new Set(categoriesForItem)].sort();
  });

  // 模態表單可用的項目選項 - 從 GL Accounts 獲取
  modalAvailableItems = computed(() => {
    if (this.glAccounts().length > 0) {
      return this.topLevelAccounts()
        .map(acc => acc.account_name)
        .filter(Boolean)
        .sort();
    }
    // 備選：返回 itemCategoryMap 的鍵
    return Object.keys(this.itemCategoryMap).sort();
  });

  // 使用後端分頁，直接顯示 API 回傳的資料
  pagedTransactions = computed(() => this.displayedTransactions());

  totalPages = computed(() => this.pagination().totalPages);

  totalRecords = computed(() => this.pagination().total);

  areAllApproved = computed(() => {
    const transactions = this.displayedTransactions();
    return transactions.length > 0 && transactions.every(t => t.is_sigh_off);
  });

  constructor() {
    this.loadInitialData();

    // Support deep link: /ledger?entryId=123
    this.route.queryParams.subscribe(params => {
      const entryId = params?.['entryId'];
      if (entryId !== undefined && entryId !== null && String(entryId).trim() !== '') {
        this.entryIdFilter.set(String(entryId));
        // trigger filtering (non-blocking)
        void this.applyFilters();
      }
    });
    
    // 訂閱表單 item_group 變化，更新 signal
    this.ledgerForm.get('item_group')?.valueChanges.subscribe(value => {
      this.formItemGroup.set(value);
    });
    
    // 監聽表單中項目的變化，自動更新科目下拉菜單
    effect(() => {
      const itemValue = this.formItemGroup();
      const categories = this.formAvailableSubjects(); // 強制重新計算
      
      // 如果新項目的可用科目列表不包含當前科目，則清空科目
      const currentSubject = this.ledgerForm.get('subject_name')?.value;
      if (currentSubject && categories.length > 0 && !categories.includes(currentSubject)) {
        this.ledgerForm.get('subject_name')?.setValue('', { emitEvent: false });
        this.ledgerForm.get('gl_account_id')?.setValue(null as any, { emitEvent: false });
      }
    });
    
    // 監聽科目的變化，自動更新 gl_account_id
    this.ledgerForm.get('subject_name')?.valueChanges.subscribe(async () => {
      await this.updateGLAccountId();
    });
    
    // 監聽篩選條件中項目的變化，自動清空科目篩選
    effect(() => {
      const selectedItem = this.selectedItem();
      if (!selectedItem) {
        this.selectedCategory.set('');
      }
    });
  }

  /**
   * 從 API 加載流水帳資料和 GL Accounts 資料
   */
  async loadInitialData(): Promise<void> {
    // 並行加載 GL Accounts 和流水帳資料
    await Promise.all([
      this.loadGLAccounts(),
      this.applyFilters()
    ]);
  }

  /**
   * 加載 GL Accounts 資料
   */
  private async loadGLAccounts(): Promise<void> {
    this.isLoadingGLAccounts.set(true);
    this.glAccountsError.set(null);

    try {
      const response = await this.apiService.getGLAccounts();
      if (response.success && response.data) {
        this.glAccounts.set(response.data);
      } else {
        this.glAccountsError.set(response.error || '無法加載會計科目');
      }
    } catch (error) {
      this.glAccountsError.set('加載會計科目失敗，請稍後重試');
    } finally {
      this.isLoadingGLAccounts.set(false);
    }
  }

  /**
   * 異步應用篩選條件並從 API 取得流水帳資料
   */
  async applyFilters(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // 套用使用者的篩選條件
    this.appliedItem.set(this.selectedItem());
    this.appliedCategory.set(this.selectedCategory());
    this.appliedVendor.set(this.selectedVendor());
    this.appliedDescriptionFilter.set(this.descriptionFilter());
    this.appliedEntryIdFilter.set(this.entryIdFilter());
    this.currentPage.set(1);
    
    await this.loadPageData(1);
  }

  /**
   * 從 API 載入指定頁數的資料
   */
  private async loadPageData(page: number): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const response = await this.apiService.getLedgerEntries({
        startDate: this.startDate(),
        endDate: this.endDate(),
        itemGroup: this.appliedItem() || undefined,
        subjectName: this.appliedCategory() || undefined,
        vendorName: this.appliedVendor() || undefined,
        description: this.appliedDescriptionFilter() || undefined,
        entryId: this.appliedEntryIdFilter() ? parseInt(this.appliedEntryIdFilter(), 10) : undefined,
        page: page,
        limit: 20
      });
      
      if (response.success && response.data) {
        this.displayedTransactions.set(response.data);
        
        // 更新分頁資訊
        if (response.pagination) {
          this.pagination.set({
            total: response.pagination.total,
            totalPages: response.pagination.totalPages,
            page: response.pagination.page,
            limit: response.pagination.limit
          });
        }
        
        // 首次載入或篩選時，從完整資料提取篩選選項
        if (page === 1) {
          // 需要取得所有資料來建立篩選選項，所以額外呼叫一次不分頁的 API
          const allDataResponse = await this.apiService.getLedgerEntries({
            startDate: this.startDate(),
            endDate: this.endDate(),
            limit: 9999 // 取得所有資料用於建立篩選選項
          });
          
          if (allDataResponse.success && allDataResponse.data) {
            this.allTransactions.set(allDataResponse.data);
            
            const baseItems = Object.keys(this.itemCategoryMap);
            const dataItems = allDataResponse.data.map(t => t.item_group).filter(Boolean) as string[];
            const items = [...new Set([...baseItems, ...dataItems])].sort();
            const categories = [...new Set(allDataResponse.data.map(t => t.subject_name).filter(Boolean))].sort();
            const vendorNames = [...new Set(allDataResponse.data.map(t => t.vendor_name).filter(Boolean))].sort();
            
            this.filterOptions.set({
              items: items as string[],
              categories: categories as string[],
              vendorNames: vendorNames as string[]
            });
          }
        }
      } else {
        this.errorMessage.set(response.error || '無法取得流水帳資料');
      }
    } catch (error) {
      console.error('Error loading ledger entries:', error);
      this.errorMessage.set('取得流水帳資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 重設所有篩選條件為預設值（本月初至本月底）
   */
  resetFilters(): void {
    this.startDate.set(this.formatDate(this.firstDayOfMonth));
    this.endDate.set(this.formatDate(this.lastDayOfMonth));
    this.selectedItem.set('');
    this.selectedCategory.set('');
    this.selectedVendor.set('');
    this.descriptionFilter.set('');
    this.entryIdFilter.set('');
    this.appliedItem.set('');
    this.appliedCategory.set('');
    this.appliedVendor.set('');
    this.appliedDescriptionFilter.set('');
    this.appliedEntryIdFilter.set('');
    this.currentPage.set(1);
    this.applyFilters();
  }

  changeView(view: LedgerView): void {
    this.activeView.set(view);
    if (view === 'add') {
      this.resetForm();
      this.newlyCreatedEntry.set(null); // 清空新增的記錄
      this.shipmentItems.set([]);
      this.shipmentItemsError.set(null);
    }
  }

  async goToPage(page: number): Promise<void> {
    const totalPages = this.totalPages();
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    if (nextPage !== this.currentPage()) {
      this.currentPage.set(nextPage);
      await this.loadPageData(nextPage);
    }
  }

  async goToPrevPage(): Promise<void> {
    await this.goToPage(this.currentPage() - 1);
  }

  async goToNextPage(): Promise<void> {
    await this.goToPage(this.currentPage() + 1);
  }
  
  sortData(column: keyof LedgerEntry): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  /**
   * 開啟編輯視窗並帶入選中的流水帳資料
   */
  async openEditModal(transaction: LedgerEntry): Promise<void> {
    this.editingTransaction.set(transaction);
    this.formItemGroup.set(transaction.item_group); // 立即更新 signal
    this.ledgerForm.patchValue({
      entry_id: transaction.entry_id ? transaction.entry_id.toString() : '',
      entry_date: this.normalizeDateInput(transaction.entry_date),
      item_group: transaction.item_group,
      subject_name: transaction.subject_name,
      amount: transaction.amount ? transaction.amount.toString() : '',
      invoice_no: transaction.invoice_no,
      vendor_tax_id: this.sanitizeVendorTaxId(transaction.vendor_tax_id), // 修復：帶入賣方統編
      vendor_name: transaction.vendor_name, // 修復：帶入賣方名稱
      description: transaction.description,
      is_sigh_off: transaction.is_sigh_off
    });
    this.isModalOpen.set(true);
    await this.loadShipmentItemsForEntry(transaction.entry_id);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingTransaction.set(null);
    this.shipmentItems.set([]);
    this.shipmentItemsError.set(null);
    this.isLoadingShipmentItems.set(false);
    this.resetForm();
  }

  private async loadShipmentItemsForEntry(entryId?: number): Promise<void> {
    if (!entryId) {
      this.shipmentItems.set([]);
      this.shipmentItemsError.set(null);
      return;
    }

    // 確保 entryId 是 number 類型
    const entryIdNum = typeof entryId === 'string' ? parseInt(entryId, 10) : entryId;
    
    this.isLoadingShipmentItems.set(true);
    this.shipmentItemsError.set(null);

    try {
      const queryOptions = {
        entryId: entryIdNum,
        limit: 1000,
        offset: 0
      };
      
      const response = await this.apiService.getShipmentItems(queryOptions);

      if (response.success && response.data) {
        const cloned = response.data.map(item => ({ ...item }));
        this.shipmentItems.set(cloned);
      } else {
        this.shipmentItems.set([]);
        this.shipmentItemsError.set(response.error || '無法取得進貨資料');
      }
    } catch (error) {
      console.error('Error loading shipment items:', error);
      this.shipmentItems.set([]);
      this.shipmentItemsError.set('取得進貨資料失敗，請稍後重試');
    } finally {
      this.isLoadingShipmentItems.set(false);
    }
  }

  isSavingShipmentItem(shipmentId: number): boolean {
    return this.savingShipmentItemIds().includes(shipmentId);
  }

  async saveShipmentItem(item: ShipmentItem): Promise<void> {
    if (!item?.shipment_id) {
      return;
    }

    const currentIds = this.savingShipmentItemIds();
    if (currentIds.includes(item.shipment_id)) {
      return;
    }

    // 支持编辑模式和新增模式
    const transaction = this.editingTransaction() || this.newlyCreatedEntry();
    const entryId = transaction?.entry_id;

    this.savingShipmentItemIds.set([...currentIds, item.shipment_id]);
    this.shipmentItemsError.set(null);

    try {
      const response = await this.apiService.updateShipmentItem(item.shipment_id, {
        itemName: item.itemName,
        qty: item.qty ?? null,
        unitPrice: item.unitPrice ?? null,
        unit: item.unit ?? null,
        remark: item.remark ?? null,
        entryId: entryId ?? null
      });

      if (!response.success) {
        this.shipmentItemsError.set(response.error || '更新進貨資料失敗');
      } else {
        // 顯示成功訊息
        this.saveSuccessMessage.set('進貨資料已儲存成功');
        // 移除此項目的新增標記
        this.newShipmentItemIds.set(this.newShipmentItemIds().filter(id => id !== item.shipment_id));
        // 3秒後自動隱藏成功訊息
        setTimeout(() => {
          this.saveSuccessMessage.set(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error updating shipment item:', error);
      this.shipmentItemsError.set('更新進貨資料失敗，請稍後重試');
    } finally {
      this.savingShipmentItemIds.set(this.savingShipmentItemIds().filter(id => id !== item.shipment_id));
    }
  }

  async addNewShipmentItem(): Promise<void> {
    // 支持编辑模式和新增模式
    const transaction = this.editingTransaction() || this.newlyCreatedEntry();
    if (!transaction || !transaction.entry_id) {
      this.shipmentItemsError.set('無法新增進貨單：流水帳尚未保存');
      return;
    }

    // 使用表單中的 vendor_id，如果沒有則使用 transaction 中的，都沒有則設為 null（允許市場買的貨單）
    const formVendorId = this.ledgerForm.get('vendor_id')?.value;
    const vendorId = formVendorId || transaction.vendor_id || null;

    this.isLoadingShipmentItems.set(true);
    this.shipmentItemsError.set(null);

    try {
      const response = await this.apiService.createShipmentItem({
        entryId: transaction.entry_id,
        issueDate: transaction.entry_date || new Date().toISOString().split('T')[0],
        vendorId: vendorId,
        itemName: '新品項',
        qty: 0,
        unitPrice: 0,
        unit: '',
        remark: ''
      });

      if (response.success && response.data) {
        const current = this.shipmentItems();
        // 在頂部插入新項目
        this.shipmentItems.set([response.data, ...current]);
        // 標記此項目為新增
        this.newShipmentItemIds.set([...this.newShipmentItemIds(), response.data.shipment_id]);
      } else {
        this.shipmentItemsError.set(response.error || '新增進貨資料失敗');
      }
    } catch (error) {
      console.error('Error creating shipment item:', error);
      this.shipmentItemsError.set('新增進貨資料失敗，請稍後重試');
    } finally {
      this.isLoadingShipmentItems.set(false);
    }
  }

  deleteShipmentItem(item: ShipmentItem): void {
    this.deleteConfirmation.set({
      shipmentId: item.shipment_id,
      itemName: item.itemName
    });
  }

  async confirmDeleteShipmentItem(): Promise<void> {
    const confirmation = this.deleteConfirmation();
    if (!confirmation) return;

    try {
      const response = await this.apiService.deleteShipmentItem(confirmation.shipmentId);
      
      if (response.success) {
        // 從列表中移除該項目
        const current = this.shipmentItems();
        this.shipmentItems.set(current.filter(item => item.shipment_id !== confirmation.shipmentId));
        this.shipmentItemsError.set(null);
      } else {
        this.shipmentItemsError.set(response.error || '刪除進貨資料失敗');
      }
    } catch (error) {
      console.error('Error deleting shipment item:', error);
      this.shipmentItemsError.set('刪除進貨資料失敗，請稍後重試');
    } finally {
      this.deleteConfirmation.set(null);
    }
  }

  cancelDeleteShipmentItem(): void {
    this.deleteConfirmation.set(null);
  }

  /**
   * 刪除流水帳記錄 - 先檢查是否有關聯的進貨單
   */
  async deleteLedgerEntry(): Promise<void> {
    const transaction = this.editingTransaction();
    if (!transaction?.entry_id) {
      this.errorMessage.set('無法取得流水帳ID');
      return;
    }

    this.isCheckingShipment.set(true);
    try {
      const response = await this.apiService.checkLedgerShipmentItems(transaction.entry_id);
      if (response.success) {
        this.ledgerDeleteConfirmation.set({
          entryId: transaction.entry_id,
          relatedShipmentCount: response.data?.shipmentItemsCount || 0
        });
      } else {
        this.errorMessage.set(response.error || '檢查進貨單失敗');
      }
    } catch (error) {
      console.error('Error checking shipment items:', error);
      this.errorMessage.set('檢查進貨單失敗，請稍後重試');
    } finally {
      this.isCheckingShipment.set(false);
    }
  }

  /**
   * 確認刪除流水帳記錄
   */
  async confirmDeleteLedgerEntry(): Promise<void> {
    const confirmation = this.ledgerDeleteConfirmation();
    if (!confirmation) return;

    try {
      const response = await this.apiService.deleteLedgerEntry(confirmation.entryId);
      
      if (response.success) {
        // 從列表中移除該項目
        const current = this.displayedTransactions();
        this.displayedTransactions.set(current.filter(t => t.entry_id !== confirmation.entryId));
        
        // 關閉所有確認對話框和模態框
        this.ledgerDeleteConfirmation.set(null);
        this.closeModal();
        
        // 顯示成功訊息
        this.errorMessage.set(`流水帳已刪除${confirmation.relatedShipmentCount > 0 ? `，並同時刪除了 ${confirmation.relatedShipmentCount} 筆進貨單項目` : ''}`);
        
        // 3秒後清除成功訊息
        setTimeout(() => {
          this.errorMessage.set(null);
        }, 3000);
      } else {
        this.errorMessage.set(response.error || '刪除流水帳失敗');
      }
    } catch (error) {
      console.error('Error deleting ledger entry:', error);
      this.errorMessage.set('刪除流水帳失敗，請稍後重試');
    }
  }

  /**
   * 取消刪除流水帳
   */
  cancelDeleteLedgerEntry(): void {
    this.ledgerDeleteConfirmation.set(null);
  }

  toggleAllApprovals(event: Event): void {
    const target = event.target as HTMLInputElement;
    const isChecked = target.checked;

    const message = isChecked
      ? "您確定要簽核所有可見項目嗎？"
      : "您確定要取消簽核所有可見項目嗎？";

    this.confirmationState.set({ message, isChecked, target });
  }

  /**
   * 確認簽核所有項目
   * 更新邏輯：先打API修改資料庫，再直接在前端更新簽核狀態，避免重複運算
   */
  async confirmApproval(): Promise<void> {
    const state = this.confirmationState();
    if (!state) return;

    const { isChecked } = state;
    const transactionsToUpdate = this.displayedTransactions().filter(tx => tx.is_sigh_off !== isChecked);

    // 批次更新所有需要更新的交易
    const updatePromises = transactionsToUpdate.map(tx => 
      this.apiService.updateLedgerEntry({ 
        entry_id: tx.entry_id,
        is_sigh_off: isChecked 
      })
    );

    try {
      await Promise.all(updatePromises);
      
      // 成功後，直接在前端更新簽核狀態，避免重新載入所有資料
      const updatedTransactions = this.allTransactions().map(tx => {
        const shouldUpdate = transactionsToUpdate.some(t => t.entry_id === tx.entry_id);
        if (shouldUpdate) {
          return { ...tx, is_sigh_off: isChecked };
        }
        return tx;
      });
      this.allTransactions.set(updatedTransactions);
      
    } catch (error) {
      console.error('更新簽核狀態失敗:', error);
      this.errorMessage.set('更新簽核狀態失敗');
    }
    
    this.confirmationState.set(null);
  }

  cancelApproval(): void {
    const state = this.confirmationState();
    if (!state) return;

    state.target.checked = !state.isChecked;
    this.confirmationState.set(null);
  }

  /**
   * 根據 item_group 和 subject_name 自動更新 gl_account_id
   */
  private async updateGLAccountId(): Promise<void> {
    const itemGroup = this.ledgerForm.get('item_group')?.value;
    const subjectName = this.ledgerForm.get('subject_name')?.value;

    if (!itemGroup || !subjectName) {
      this.ledgerForm.get('gl_account_id')?.setValue(null);
      return;
    }

    try {
      const response = await this.apiService.resolveGLAccount(itemGroup, subjectName);
      if (response.success && response.data?.glAccountId) {
        // 自動設置 gl_account_id，不觸發驗證錯誤
        this.ledgerForm.get('gl_account_id')?.setValue(response.data.glAccountId, { emitEvent: false });
      } else {
        this.ledgerForm.get('gl_account_id')?.setValue(null, { emitEvent: false });
      }
    } catch (error) {
      console.error('Error resolving GL account:', error);
      // 如果查詢失敗，只設置為 null，不中斷流程
      this.ledgerForm.get('gl_account_id')?.setValue(null, { emitEvent: false });
    }
  }

  /**
   * 處理表單提交（新增或修改流水帳）
   * 修改時的更新邏輯：打API更新資料庫後，直接在前端更新該筆資料，避免重複運算
   */
  async handleFormSubmit(): Promise<void> {
    this.submitted.set(true);
    if (this.ledgerForm.invalid) {
      return;
    }

    // 驗證賣方統編（可選：如果有填入才驗證）
    const vendorTaxId = this.ledgerForm.get('vendor_tax_id')?.value;
    if (vendorTaxId && vendorTaxId.trim().length > 0) {
      // 檢查格式：只能是數字，允許 1-8 位
      if (!/^\d{1,8}$/.test(vendorTaxId)) {
        this.errorMessage.set('賣方統編只能是 1-8 位數字');
        this.isLoading.set(false);
        return;
      }
      
      // 檢查統編是否存在於 vendor 表
      try {
        const vendorResponse = await this.apiService.getVendorByTaxId(vendorTaxId);
        if (vendorResponse.success && vendorResponse.data) {
          // 設置 vendor_id 到表單
          this.ledgerForm.patchValue({ 
            vendor_id: vendorResponse.data.vendor_id,
            vendor_name: vendorResponse.data.vendor_name
          }, { emitEvent: false });
        } else {
          // 統編不存在不一定是錯誤，可能是市場買的貨，允許保存
          console.warn('賣方統編不存在於系統中，但允許繼續保存（可能是市場買的貨）');
        }
      } catch (error) {
        // 驗證過程出錯不阻止保存，只記錄警告
        console.warn('驗證賣方統編時出錯：', error);
      }
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const formValue = this.ledgerForm.value;
      const entryData = {
        entry_date: formValue.entry_date,
        item_group: formValue.item_group,
        subject_name: formValue.subject_name,
        amount: Number(formValue.amount),
        invoice_no: formValue.invoice_no,
        vendor_tax_id: formValue.vendor_tax_id,
        vendor_name: formValue.vendor_name,
        vendor_id: formValue.vendor_id,
        description: formValue.description,
        is_sigh_off: formValue.is_sigh_off || false,
        gl_account_id: formValue.gl_account_id || null,
      };

      if (this.editingTransaction()) {
        // Update existing - 修改現有資料
        const editingTx = this.editingTransaction()!;
        const response = await this.apiService.updateLedgerEntry({ 
          entry_id: editingTx.entry_id,
          ...entryData
        });
        if (response.success) {
          // 直接在前端更新該筆資料，避免重新載入所有資料
          const updatedTransactions = this.allTransactions().map(tx => {
            if (tx.entry_id === editingTx.entry_id) {
              return { ...tx, ...entryData };
            }
            return tx;
          });
          this.allTransactions.set(updatedTransactions);
          this.closeModal();
        }
      } else {
        // Add new - 新增資料
        const response = await this.apiService.createLedgerEntry(entryData);
        if (response.success && response.data) {
          // 設置新建立的流水帳記錄，以便在 add 視圖中顯示進貨資料管理界面
          const newEntry: LedgerEntry = {
            entry_id: response.data.entry_id,
            entry_date: response.data.entry_date,
            item_group: response.data.item_group,
            subject_name: response.data.subject_name,
            amount: response.data.amount,
            invoice_no: response.data.invoice_no,
            vendor_tax_id: response.data.vendor_tax_id,
            vendor_name: response.data.vendor_name,
            vendor_id: response.data.vendor_id,
            description: response.data.description,
            is_sigh_off: response.data.is_sigh_off || false,
            gl_account_id: response.data.gl_account_id || null,
          };
          this.newlyCreatedEntry.set(newEntry);
          this.resetForm();
          // 加載新建立記錄的進貨資料
          await this.loadShipmentItemsForEntry(newEntry.entry_id);
        }
      }
    } catch (error) {
      console.error('保存失敗:', error);
      this.errorMessage.set('保存失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
    if (!this.editingTransaction()) {
      this.applyFilters();
    }
  }
  
  resetForm(): void {
      this.ledgerForm.reset({ is_sigh_off: false });
      this.submitted.set(false);
  }

  resetAddView(): void {
    this.newlyCreatedEntry.set(null);
    this.shipmentItems.set([]);
    this.shipmentItemsError.set(null);
    this.resetForm();
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (isNaN(value)) {
      return '';
    }
    // 保留負號，使用絕對值格式化，然後加上負號
    const isNegative = value < 0;
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
    return isNegative ? `-${formatted}` : formatted;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.ledgerForm.get(fieldName);
    if (!control || !control.errors) {
      return '';
    }
    if (fieldName === 'vendor_tax_id') {
      if (control.errors['pattern']) {
        return '賣方統編只能是 1-8 位數字';
      }
      if (control.errors['required']) {
        return '賣方統編為必填';
      }
    }
    if (control.errors['required']) {
      return `${fieldName} 為必填`;
    }
    if (control.errors['pattern']) {
      return `${fieldName} 格式不正確`;
    }
    return '輸入資料有誤';
  }

  sanitizeVendorTaxId(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value.replace(/\D/g, '').slice(0, 8);
  }

  onVendorTaxIdInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = this.sanitizeVendorTaxId(input.value);
    this.ledgerForm.get('vendor_tax_id')?.setValue(sanitized);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeDateInput(dateValue: string | null | undefined): string {
    if (!dateValue) {
      return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    return this.formatDate(parsed);
  }

  isInvalid(controlName: string): boolean {
    const control = this.ledgerForm.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitted());
  }
}