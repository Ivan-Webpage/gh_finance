import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DataService } from '../../services/data.service';
import { ApiService } from '../../services/api.service';
import {
  PurchaseOrder,
  Vendor,
  ShipmentItem,
  PurchaseOrderAiScanFile,
  PurchaseOrderAiImportResult,
  PurchaseOrderAiPendingRow,
  WineCost,
  Ingredient,
} from '../../models/financial.model';

@Component({
  selector: 'app-purchase-orders',
  templateUrl: './purchase-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PurchaseOrdersComponent {
  private dataService = inject(DataService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  isModalOpen = signal(false);
  
  /** 編輯進貨單項目的模態框狀態 */
  isEditModalOpen = signal(false);
  
  /** 當前編輯的進貨單項目 */
  editingShipmentItem = signal<ShipmentItem | null>(null);

  /** 「對應商品」下拉選單資料來源（酒水成本／餐飲食材，供進貨單品項連結用） */
  allWineCostsForLink = signal<WineCost[]>([]);
  allIngredientsForLink = signal<Ingredient[]>([]);
  productLinkSaving = signal(false);
  productLinkError = signal<string | null>(null);

  allVendors = signal<Vendor[]>([]);
  allPOs = signal<PurchaseOrder[]>([]);
  editingPO = signal<PurchaseOrder | null>(null);

  // ========== 新的進貨單API資料狀態 ==========
  /** 從API獲取的進貨單項目資料 */
  shipmentItems = signal<ShipmentItem[]>([]);

  /**
   * 進貨單廠商篩選選項（動態）
   * 依目前已載入的 API 進貨單資料彙整（去重、排序）。
   */
  shipmentVendors = computed(() => {
    const items = this.shipmentItems();
    const byId = new Map<string, string>();

    for (const item of items) {
      const id = item.vendorId === null || item.vendorId === undefined ? '' : String(item.vendorId);
      const name = String(item.vendorName || '').trim();
      if (!id || !name) continue;
      if (!byId.has(id)) {
        byId.set(id, name);
      }
    }

    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  });
  
  /** 進貨單項目加載狀態 */
  isLoadingShipments = signal(false);
  
  /** 進貨單項目錯誤訊息 */
  shipmentError = signal<string | null>(null);

  /** AI 掃描/匯入進貨單模態框狀態 */
  isAiImportModalOpen = signal(false);
  isScanningAiFiles = signal(false);
  isAiImporting = signal(false);
  aiImportError = signal<string | null>(null);
  aiScanFiles = signal<PurchaseOrderAiScanFile[]>([]);
  aiImportResult = signal<PurchaseOrderAiImportResult | null>(null);

  aiImportSuccessRows = computed(() => this.aiImportResult()?.rows.filter(row => row.success) ?? []);
  aiImportFailedRows = computed(() => this.aiImportResult()?.rows.filter(row => !row.success) ?? []);

  /** 掃描時偵測到疑似重複（日期+金額皆相同）、或廠商比對不到、暫緩匯入、待使用者確認的項目 */
  aiImportPendingRows = computed(() => this.aiImportResult()?.pending ?? []);
  pendingSelection = signal<Set<string>>(new Set());
  isConfirmingPendingImport = signal(false);
  confirmPendingError = signal<string | null>(null);

  /** 「待確認」畫面用的廠商下拉選單選項——一律走真實 API，跟 dataService.getVendors() 的假資料分開 */
  pendingVendorOptions = signal<Vendor[]>([]);
  isPendingVendorQuickAddOpen = signal(false);
  pendingVendorQuickAddFileId = signal<string | null>(null);
  pendingVendorQuickAddName = signal('');
  pendingVendorQuickAddCategory = signal('');
  pendingVendorQuickAddError = signal<string | null>(null);
  pendingVendorQuickAddSaving = signal(false);
  pendingVendorCategoryOptions = computed(() => [...new Set(this.pendingVendorOptions().map(v => v.category).filter((c): c is string => !!c))].sort());

  poForm = this.fb.group({
    id: [''],
    poNumber: ['', Validators.required],
    vendorId: ['', Validators.required],
    date: ['', Validators.required],
    items: this.fb.array([]),
    totalAmount: [0],
  });

  // ========== 進貨單篩選條件 ==========
  /** 進貨單搜尋文字 */
  poSearchTerm = signal('');
  
  /** 廠商篩選 */
  selectedPOVendor = signal('');
  
  /** 進貨單起始日期篩選 - 預設為當月1號 */
  private today = new Date();
  private firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
  poStartDate = signal(this.formatDateToISO(this.firstDayOfMonth));
  
  /** 進貨單結束日期篩選 - 預設為今天 */
  poEndDate = signal(this.formatDateToISO(this.today));

  // ========== 進貨單顯示頁籤 ==========
  currentTab = signal<'api' | 'analysis'>('api');

  /** 分頁狀態 */
  shipmentPage = signal(1); // 當前頁碼
  readonly pageSize = 20; // 每頁顯示 20 筆

  /** 取得分頁後的進貨單資料 */
  pagedShipments = computed(() => {
    const all = this.filteredShipments();
    const start = (this.shipmentPage() - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  /** 取得總頁數 */
  shipmentTotalPages = computed(() => {
    const total = this.filteredShipments().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });

  /** 切換頁碼 */
  setShipmentPage(page: number) {
    if (page < 1 || page > this.shipmentTotalPages()) return;
    this.shipmentPage.set(page);
  }

  /**
   * 切換頁籤
   */
  setTab(tab: 'api' | 'analysis'): void {
    this.currentTab.set(tab);
  }

  /**
   * 過濾後的進貨單（範例資料）
   * 根據搜尋條件、廠商、日期範圍過濾本地資料
   */
  filteredPOs = computed(() => {
    const term = this.poSearchTerm().toLowerCase();
    const vendorId = this.selectedPOVendor();
    const startDate = this.poStartDate();
    const endDate = this.poEndDate();
    let pos = this.allPOs();

    if (vendorId) {
      pos = pos.filter(po => po.vendorId === vendorId);
    }

    if (startDate) {
      pos = pos.filter(po => po.date >= startDate);
    }

    if (endDate) {
      pos = pos.filter(po => po.date <= endDate);
    }

    if (term) {
      pos = pos.filter(po => 
        po.poNumber.toLowerCase().includes(term) ||
        this.getVendorName(po.vendorId).toLowerCase().includes(term)
      );
    }
    return pos;
  });

  /**
   * 過濾後的進貨單（API資料）
   * 根據搜尋條件、廠商、日期範圍過濾API資料
   */
  filteredShipments = computed(() => {
    const term = this.poSearchTerm().toLowerCase();
    const vendorId = this.selectedPOVendor();
    const startDate = this.poStartDate();
    const endDate = this.poEndDate();
    let items = this.shipmentItems();

    if (vendorId) {
      items = items.filter(item => item.vendorId.toString() === vendorId);
    }

    if (startDate) {
      items = items.filter(item => item.issueDate >= startDate);
    }

    if (endDate) {
      items = items.filter(item => item.issueDate <= endDate);
    }

    if (term) {
      items = items.filter(item =>
        (item.documentNo?.toLowerCase().includes(term) ?? false) ||
        item.itemName.toLowerCase().includes(term) ||
        item.vendorName.toLowerCase().includes(term)
      );
    }

    return items;
  });

  /**
   * API進貨單統計
   * 計算API進貨單資料的統計資訊（總金額、項目數等）
   * 確保使用數字運算，避免字串拼接
   */
  shipmentStats = computed(() => {
    const items = this.filteredShipments();
    const totalAmount = items.reduce((sum, item) => sum + Number(item.lineAmount || 0), 0);
    
    // 計算每個廠商的進貨總金額
    const vendorAmounts: Record<string, number> = {};
    items.forEach(item => {
      const vendorName = item.vendorName;
      vendorAmounts[vendorName] = (vendorAmounts[vendorName] || 0) + Number(item.lineAmount || 0);
    });
    
    return {
      // 使用 Number() 強制轉換為數字，避免字串相加
      totalAmount: totalAmount,
      totalItems: items.length,
      vendorAmounts: vendorAmounts, // 按廠商分類的金額
    };
  });

  /**
   * 圓餅圖資料計算
   */
  pieChartData = computed(() => {
    const stats = this.shipmentStats();
    const vendors = Object.keys(stats.vendorAmounts).sort();
    const totalAmount = stats.totalAmount;
    
    return vendors.map(vendor => ({
      name: vendor,
      amount: stats.vendorAmounts[vendor],
      percentage: totalAmount > 0 ? (stats.vendorAmounts[vendor] / totalAmount) * 100 : 0,
    }));
  });

  /**
   * 懸停的圓餅圖切片
   */
  hoveredVendor = signal<string | null>(null);

  /**
   * 廠商金額清單（用於模板顯示）
   */
  vendorAmountEntries = computed(() => {
    const stats = this.shipmentStats();
    return Object.entries(stats.vendorAmounts)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  constructor() {
    this.loadData();
    this.loadShipments();
    this.loadProductLinkOptions();

    this.poItems.valueChanges.subscribe(items => {
      const total = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
      this.poForm.get('totalAmount')?.setValue(total, { emitEvent: false });
    });
  }

  /**
   * 載入範例進貨單資料（本地）
   */
  loadData(): void {
    this.allVendors.set(this.dataService.getVendors());
    this.allPOs.set(this.dataService.getPurchaseOrders());
  }

  /**
   * 從API載入進貨單資料（資料庫）
   * 調用 /api/shipment-items 端點獲取進貨單項目資料
   */
  async loadShipments(): Promise<void> {
    this.isLoadingShipments.set(true);
    this.shipmentError.set(null);

    try {
      // 構建查詢選項
      const options: any = {
        limit: 1000,
        offset: 0,
      };

      // 如果有設定日期範圍，則添加到查詢中
      if (this.poStartDate()) {
        options.startDate = this.poStartDate();
      }
      if (this.poEndDate()) {
        options.endDate = this.poEndDate();
      }

      // 調用API
      const response = await this.apiService.getShipmentItems(options);

      if (response.success && response.data) {
        this.shipmentItems.set(response.data);
      } else {
        this.shipmentError.set(response.error || '無法獲取進貨單資料');
      }
    } catch (error) {
      console.error('Error loading shipments:', error);
      this.shipmentError.set('載入進貨單資料失敗，請稍後重試');
    } finally {
      this.isLoadingShipments.set(false);
    }
  }

  /**
   * 套用進貨單篩選
   * 根據設定的篩選條件（日期範圍）重新載入API資料
   */
  async applyShipmentFilter(): Promise<void> {
    await this.loadShipments();
    this.shipmentPage.set(1); // 篩選後回到第 1 頁
  }

  /**
   * 重設進貨單篩選條件
   */
  resetPOFilters(): void {
    this.poSearchTerm.set('');
    this.selectedPOVendor.set('');
    this.poStartDate.set('');
    this.poEndDate.set('');
  }

  async openAiImportModal(): Promise<void> {
    this.isAiImportModalOpen.set(true);
    this.aiImportError.set(null);
    this.aiImportResult.set(null);
    this.pendingSelection.set(new Set());
    this.confirmPendingError.set(null);
    await Promise.all([this.scanAiImportFiles(), this.loadPendingVendorOptions()]);
  }

  /** 「待確認」畫面的廠商下拉選單資料，來自真實 API（不是 dataService 的假資料）。 */
  async loadPendingVendorOptions(): Promise<void> {
    try {
      const response = await this.apiService.getVendors();
      if (response.success && response.data) {
        this.pendingVendorOptions.set(response.data);
      }
    } catch (error) {
      console.error('Error loading vendors for pending confirmation:', error);
    }
  }

  vendorIdOf(vendor: Vendor): number | null {
    return vendor.vendor_id !== undefined && vendor.vendor_id !== null ? Number(vendor.vendor_id) : null;
  }

  /** 待確認列的廠商下拉選單目前應該顯示的 value：真實廠商 id、`'__raw__'`（明確選擇不指定）、或 `null`（尚未選擇）。 */
  pendingVendorSelectValue(row: PurchaseOrderAiPendingRow): number | '__raw__' | null {
    if (row.vendorId !== null) return row.vendorId;
    if (row.vendorDecided) return '__raw__';
    return null;
  }

  /** 待確認列的廠商是否還沒決定——沒決定前不能勾選匯入，避免又拿 OCR 原始文字誤建新資料夾。 */
  pendingVendorUndecided(row: PurchaseOrderAiPendingRow): boolean {
    return row.vendorId === null && !row.vendorDecided;
  }

  onPendingVendorSelectChange(row: PurchaseOrderAiPendingRow, value: number | '__raw__' | null): void {
    if (value === '__raw__') {
      this.applyPendingRowVendor(row.fileId, { vendorId: null, vendorName: row.aiVendorName || row.vendorName, vendorTaxId: '', decided: true });
      return;
    }
    if (value === null) {
      this.applyPendingRowVendor(row.fileId, { vendorId: null, vendorName: row.aiVendorName || row.vendorName, vendorTaxId: '', decided: false });
      return;
    }
    const vendor = this.pendingVendorOptions().find(v => this.vendorIdOf(v) === value);
    if (!vendor) return;
    this.applyPendingRowVendor(row.fileId, {
      vendorId: this.vendorIdOf(vendor),
      vendorName: vendor.vendor_name || vendor.name || row.vendorName,
      vendorTaxId: vendor.tax_id || vendor.taxId || '',
      decided: true,
    });
  }

  private applyPendingRowVendor(
    fileId: string,
    picked: { vendorId: number | null; vendorName: string; vendorTaxId: string; decided: boolean }
  ): void {
    const current = this.aiImportResult();
    if (!current) return;
    const nextPending = (current.pending ?? []).map(row => row.fileId === fileId
      ? { ...row, vendorId: picked.vendorId, vendorName: picked.vendorName, vendorTaxId: picked.vendorTaxId, vendorDecided: picked.decided }
      : row);
    this.aiImportResult.set({ ...current, pending: nextPending });

    // 廠商還沒決定（或改回未決定）就不該留在勾選清單裡
    if (!picked.decided && picked.vendorId === null) {
      const next = new Set(this.pendingSelection());
      next.delete(fileId);
      this.pendingSelection.set(next);
    }
  }

  openPendingVendorQuickAdd(row: PurchaseOrderAiPendingRow): void {
    this.pendingVendorQuickAddFileId.set(row.fileId);
    this.pendingVendorQuickAddName.set(row.aiVendorName || row.vendorName || '');
    this.pendingVendorQuickAddCategory.set('');
    this.pendingVendorQuickAddError.set(null);
    this.isPendingVendorQuickAddOpen.set(true);
  }

  closePendingVendorQuickAdd(): void {
    this.isPendingVendorQuickAddOpen.set(false);
  }

  async submitPendingVendorQuickAdd(): Promise<void> {
    const name = this.pendingVendorQuickAddName().trim();
    const category = this.pendingVendorQuickAddCategory().trim();
    const fileId = this.pendingVendorQuickAddFileId();
    if (!name || !category || !fileId) {
      this.pendingVendorQuickAddError.set('請輸入廠商名稱與類別');
      return;
    }

    this.pendingVendorQuickAddSaving.set(true);
    this.pendingVendorQuickAddError.set(null);

    try {
      const response = await this.apiService.createVendor({ vendor_name: name, category });
      if (!response.success || !response.data) {
        this.pendingVendorQuickAddError.set(response.error || '新增廠商失敗');
        return;
      }

      await this.loadPendingVendorOptions();
      this.applyPendingRowVendor(fileId, {
        vendorId: this.vendorIdOf(response.data),
        vendorName: response.data.vendor_name || name,
        vendorTaxId: response.data.tax_id || '',
        decided: true,
      });
      this.isPendingVendorQuickAddOpen.set(false);
    } catch (error) {
      console.error('Error creating vendor from pending confirmation:', error);
      this.pendingVendorQuickAddError.set('新增廠商失敗，請稍後再試');
    } finally {
      this.pendingVendorQuickAddSaving.set(false);
    }
  }

  closeAiImportModal(): void {
    this.isAiImportModalOpen.set(false);
    this.aiImportError.set(null);
    this.aiImportResult.set(null);
    this.aiScanFiles.set([]);
    this.pendingSelection.set(new Set());
    this.confirmPendingError.set(null);
    this.isPendingVendorQuickAddOpen.set(false);
  }

  async scanAiImportFiles(): Promise<void> {
    this.isScanningAiFiles.set(true);
    this.aiImportError.set(null);

    try {
      const response = await this.apiService.getPurchaseOrderAiScanFiles();
      if (response.success && response.data) {
        this.aiScanFiles.set(response.data.files ?? []);
      } else {
        this.aiImportError.set(response.error || '掃描待匯入進貨單失敗');
        this.aiScanFiles.set([]);
      }
    } catch (error) {
      console.error('Error scanning AI import files:', error);
      this.aiImportError.set(this.extractApiErrorMessage(error, '掃描待匯入進貨單失敗，請稍後重試'));
      this.aiScanFiles.set([]);
    } finally {
      this.isScanningAiFiles.set(false);
    }
  }

  async runAiImport(): Promise<void> {
    if (this.isAiImporting()) return;

    this.isAiImporting.set(true);
    this.aiImportError.set(null);

    try {
      const response = await this.apiService.importPurchaseOrdersByAi();
      if (response.success && response.data) {
        this.aiImportResult.set(response.data);
        // 疑似重複的項目預設全選，使用者可以自行取消勾選要略過的項目；
        // 廠商比對不到的項目掃描時一定還沒決定廠商，不能預先勾選（見 pendingVendorUndecided()）
        this.pendingSelection.set(new Set(
          (response.data.pending ?? []).filter(p => !this.pendingVendorUndecided(p)).map(p => p.fileId)
        ));
        if ((response.data.failedCount ?? 0) > 0) {
          const firstFailed = response.data.rows.find(row => !row.success);
          this.aiImportError.set(firstFailed?.reason || `共有 ${response.data.failedCount} 筆匯入失敗`);
        }
        await this.loadShipments();
      } else {
        this.aiImportError.set(response.error || 'AI 匯入進貨單失敗');
      }
    } catch (error) {
      console.error('Error importing purchase orders by AI:', error);
      this.aiImportError.set(this.extractApiErrorMessage(error, 'AI 匯入進貨單失敗，請稍後重試'));
    } finally {
      this.isAiImporting.set(false);
    }
  }

  isPendingSelected(fileId: string): boolean {
    return this.pendingSelection().has(fileId);
  }

  togglePendingSelection(fileId: string): void {
    const next = new Set(this.pendingSelection());
    if (next.has(fileId)) {
      next.delete(fileId);
    } else {
      next.add(fileId);
    }
    this.pendingSelection.set(next);
  }

  selectAllPending(): void {
    this.pendingSelection.set(new Set(
      this.aiImportPendingRows().filter(p => !this.pendingVendorUndecided(p)).map(p => p.fileId)
    ));
  }

  deselectAllPending(): void {
    this.pendingSelection.set(new Set());
  }

  /**
   * 匯入使用者勾選、確認不是重複記帳的項目。
   * 帶回掃描階段已經解析好的資料（不重新呼叫 Gemini OCR），成功匯入的項目
   * 會併入「成功」清單、從「疑似重複」清單移除；失敗的項目改併入「失敗」清單。
   */
  async confirmSelectedPendingImports(): Promise<void> {
    if (this.isConfirmingPendingImport()) return;

    const selectedIds = this.pendingSelection();
    // 保險起見再擋一次：廠商還沒決定的項目就算勾選狀態被前端邏輯以外的方式改到，也不該送出去匯入
    const itemsToConfirm = this.aiImportPendingRows().filter(p => selectedIds.has(p.fileId) && !this.pendingVendorUndecided(p));
    if (itemsToConfirm.length === 0) return;

    this.isConfirmingPendingImport.set(true);
    this.confirmPendingError.set(null);

    try {
      const response = await this.apiService.confirmPurchaseOrderAiImport(itemsToConfirm);
      if (response.success && response.data) {
        const confirmedFileIds = new Set(itemsToConfirm.map(p => p.fileId));
        const current = this.aiImportResult();
        if (current) {
          const remainingPending = (current.pending ?? []).filter(p => !confirmedFileIds.has(p.fileId));
          const newRows = [...current.rows, ...response.data.rows];
          this.aiImportResult.set({
            ...current,
            rows: newRows,
            successCount: newRows.filter(r => r.success).length,
            failedCount: newRows.filter(r => !r.success).length,
            pendingCount: remainingPending.length,
            pending: remainingPending,
          });
        }

        const nextSelection = new Set(this.pendingSelection());
        confirmedFileIds.forEach(id => nextSelection.delete(id));
        this.pendingSelection.set(nextSelection);

        const failed = response.data.rows.find(row => !row.success);
        if (failed) {
          this.confirmPendingError.set(failed.reason || `共有 ${response.data.failedCount} 筆確認匯入失敗`);
        }

        await this.loadShipments();
      } else {
        this.confirmPendingError.set(response.error || '確認匯入失敗');
      }
    } catch (error) {
      console.error('Error confirming pending AI import:', error);
      this.confirmPendingError.set(this.extractApiErrorMessage(error, '確認匯入失敗，請稍後重試'));
    } finally {
      this.isConfirmingPendingImport.set(false);
    }
  }

  private extractApiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object' && typeof body.error === 'string' && body.error.trim()) {
        return body.error;
      }
      if (typeof error.message === 'string' && error.message.trim()) return error.message;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const msg = String((error as any).message || '').trim();
      if (msg) return msg;
    }

    return fallback;
  }

  /**
   * 打開進貨單編輯/新增模態視窗
   * @param po 要編輯的進貨單，null 表示新增
   */
  openModal(po: PurchaseOrder | null = null): void {
    this.editingPO.set(po);
    this.poForm.reset({ totalAmount: 0 });
    this.poItems.clear();
    if (po) {
      this.poForm.patchValue(po);
      po.items.forEach(i => this.addItem(i.productName, i.quantity, i.unitPrice));
    }
    this.isModalOpen.set(true);
  }

  /**
   * 關閉進貨單編輯/新增模態視窗
   */
  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingPO.set(null);
  }

  /**
   * 載入「對應商品」下拉選單資料（酒水成本／餐飲食材）
   */
  async loadProductLinkOptions(): Promise<void> {
    try {
      this.allWineCostsForLink.set(await this.dataService.getWineCosts());
    } catch (error) {
      console.error('Error loading wine costs for shipment link:', error);
    }
    try {
      const response = await this.apiService.getIngredients();
      if (response.success && response.data) {
        this.allIngredientsForLink.set(response.data);
      }
    } catch (error) {
      console.error('Error loading ingredients for shipment link:', error);
    }
  }

  /** 依「對應類型」回傳可選商品清單，供「對應商品」下拉選單使用 */
  productLinkOptionsForType(type: 'wine' | 'ingredient' | null): { id: number; name: string }[] {
    if (type === 'wine') return this.allWineCostsForLink().map(w => ({ id: Number(w.id), name: w.productName }));
    if (type === 'ingredient') return this.allIngredientsForLink().map(i => ({ id: Number(i.id), name: i.ingredientName }));
    return [];
  }

  /** 切換「對應類型」時，先前選的商品不一定還存在於新類型清單裡，一併清空 */
  onShipmentProductTypeChange(newType: 'wine' | 'ingredient' | ''): void {
    const item = this.editingShipmentItem();
    if (!item) return;
    item.productType = newType === '' ? null : newType;
    item.productId = null;
  }

  /**
   * 打開進貨單項目編輯模態視窗
   * @param item 要編輯的進貨單項目
   */
  openShipmentEditModal(item: ShipmentItem): void {
    this.productLinkError.set(null);
    // 複製一份，避免使用者在對應區塊按了「取消」之後，list 裡的物件已經被 ngModel 直接改到
    this.editingShipmentItem.set({ ...item });
    this.isEditModalOpen.set(true);
  }

  /**
   * 關閉進貨單項目編輯模態視窗
   */
  closeShipmentEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editingShipmentItem.set(null);
  }

  /**
   * 保存進貨單項目編輯
   */
  async saveShipmentEdit(): Promise<void> {
    const item = this.editingShipmentItem();
    if (!item) return;

    try {
      this.isLoadingShipments.set(true);
      
      // 調用 API 更新進貨單項目（productType/productId 一律帶上目前的值——
      // 三態欄位裡「帶值」跟「帶 null」都代表要覆蓋，只有完全不帶這個 key 才是
      // 不變更，這裡永遠知道目前完整狀態，所以直接送出即可）
      const response = await this.apiService.updateShipmentItem(item.shipment_id, {
        itemName: item.itemName,
        qty: item.qty || undefined,
        unitPrice: item.unitPrice || undefined,
        unit: item.unit || undefined,
        remark: item.remark || undefined,
        productType: item.productType,
        productId: item.productId,
      });

      if (response.success && response.data) {
        // 成功更新，直接更新前端 signal，無需重新加載整個列表
        const updatedItems = this.shipmentItems().map(si => 
          si.shipment_id === item.shipment_id ? response.data : si
        );
        this.shipmentItems.set(updatedItems);

        // 重置分頁到第一頁，以防更新後影響排序
        this.shipmentPage.set(1);

        // 關閉模態框
        this.closeShipmentEditModal();

        // 顯示成功訊息
        alert('進貨單項目已成功更新');
      } else {
        throw new Error(response.error || '更新失敗');
      }
    } catch (error) {
      console.error('Error saving shipment item:', error);
      alert('保存進貨單項目失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      this.isLoadingShipments.set(false);
    }
  }

  /**
   * 建立進貨單品項表單群組
   * @param name 品項名稱
   * @param qty 數量
   * @param price 單價
   * @returns 品項表單群組
   */
  createItem(name = '', qty = 1, price = 0) {
    const itemGroup = this.fb.group({
      productName: [name, Validators.required],
      quantity: [qty, [Validators.required, Validators.min(1)]],
      unitPrice: [price, [Validators.required, Validators.min(0)]],
      total: [qty * price],
    });

    itemGroup.get('quantity')?.valueChanges.subscribe(() => this.updateItemTotal(itemGroup));
    itemGroup.get('unitPrice')?.valueChanges.subscribe(() => this.updateItemTotal(itemGroup));
    
    return itemGroup;
  }

  /**
   * 更新品項小計
   * @param itemGroup 品項表單群組
   */
  updateItemTotal(itemGroup: any) {
    const qty = itemGroup.get('quantity')?.value || 0;
    const price = itemGroup.get('unitPrice')?.value || 0;
    itemGroup.get('total')?.setValue(qty * price, { emitEvent: false });
  }

  /**
   * 新增進貨單品項
   * @param name 品項名稱（可選）
   * @param qty 數量（可選，默認 1）
   * @param price 單價（可選，默認 0）
   */
  addItem(name = '', qty = 1, price = 0): void {
    this.poItems.push(this.createItem(name, qty, price));
  }

  /**
   * 移除進貨單品項
   * @param index 品項在陣列中的索引
   */
  removeItem(index: number): void {
    this.poItems.removeAt(index);
  }

  /**
   * 處理進貨單表單提交
   * 保存或更新進貨單到本地資料
   */
  handlePOSubmit(): void {
    if (this.poForm.invalid) return;
    const formData = this.poForm.getRawValue();
    const poData = {
      poNumber: formData.poNumber,
      vendorId: formData.vendorId,
      date: formData.date,
      items: formData.items,
      totalAmount: formData.totalAmount
    } as Omit<PurchaseOrder, 'id'>;

    if (this.editingPO()) {
      this.dataService.updatePurchaseOrder({ ...poData, id: this.editingPO()!.id });
    } else {
      this.dataService.addPurchaseOrder(poData);
    }
    this.loadData();
    this.closeModal();
  }

  /**
   * 刪除進貨單
   * @param id 進貨單 ID
   */
  deletePurchaseOrder(id: string): void {
    if (confirm('確定要刪除此進貨單嗎？')) {
      this.dataService.deletePurchaseOrder(id);
      this.loadData();
    }
  }

  /**
   * 取得廠商名稱
   * @param vendorId 廠商 ID
   * @returns 廠商名稱，如果未找到則返回 'N/A'
   */
  getVendorName(vendorId: string | number): string {
    const id = vendorId.toString();
    return this.allVendors().find(v => v.id === id)?.name || 'N/A';
  }

  /**
   * 格式化貨幣
   * 將數字轉換為台幣格式（NT$）
   * @param value 要格式化的數值
   * @returns 格式化後的貨幣字串
   */
  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /**
   * 格式化日期為 YYYY-MM-DD 格式
   * @param dateStr 日期字串
   * @returns 格式化後的日期字串 (YYYY-MM-DD)
   */
  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    // 如果已經是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // 將其他格式轉換為 YYYY-MM-DD
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return this.formatDateToISO(date);
  }

  /**
   * 將 Date 物件轉換為 YYYY-MM-DD 格式
   */
  private formatDateToISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 取得進貨單表單中的品項陣列
   */
  get poItems(): FormArray {
    return this.poForm.get('items') as FormArray;
  }

  /**
   * 計算圓餅圖顏色 - 根據索引選擇顏色
   */
  getPieColor(index: number, total: number): string {
    const colors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
      '#14B8A6', '#F97316', '#6366F1', '#06B6D4', '#84CC16', '#D946EF'
    ];
    return colors[index % colors.length];
  }

  /**
   * 依廠商名稱取得圓餅圖顏色
   */
  getVendorColor(vendorName: string): string {
    const data = this.pieChartData();
    const index = data.findIndex(item => item.name === vendorName);
    if (index < 0) {
      return '#9CA3AF';
    }
    return this.getPieColor(index, data.length);
  }

  /**
   * 計算圓餅圖切片路徑 (SVG)
   */
  getPieSlicePath(index: number, data: Array<{percentage: number}>): string {
    const radius = 120;
    const centerX = 200;
    const centerY = 200;
    
    let startAngle = 0;
    for (let i = 0; i < index; i++) {
      startAngle += (data[i].percentage * 360) / 100;
    }
    
    const sliceAngle = (data[index].percentage * 360) / 100;
    const endAngle = startAngle + sliceAngle;
    
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    
    const largeArc = sliceAngle > 180 ? 1 : 0;
    
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }

}
