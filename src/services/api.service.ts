import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { resolveApiBaseUrl } from '../utils/api-base-url';
import type { 
  LedgerEntry, 
  Vendor, 
  GLAccount,
  AnnualSummaryReport,
  MonthlyDetailReport,
  MonthlyRevenueResponse,
  EventEntry,
  ReminderEntry,
  ShiftAiImportAnalysisResult,
  ShiftScheduleEntry,
  ShiftUnavailabilityEntry,
  ShipmentItem,
  ShipmentItemsResponse,
  PurchaseOrderAiScanFile,
  PurchaseOrderAiImportResult
} from '../models/financial.model';

export type { LedgerEntry, Vendor, GLAccount } from '../models/financial.model';

/**
 * API 響應的統一格式
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  count?: number;
}

export interface DashboardCashState {
  cash: number;
  bankDeposit: number;
  linePay: number;
  jko: number;
  creditCard: number;
}

/**
 * API 服務 - 提供與後端 API 的所有互動方法
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl);

  constructor(private http: HttpClient) {}

  /**
   * 通用 GET（供尚未封裝成專屬方法的 API 使用）
   */
  get<T = any>(path: string, options?: { params?: HttpParams }): any {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.http.get<T>(`${this.baseUrl}${normalizedPath}`, options);
  }

  /**
   * 通用 POST（供尚未封裝成專屬方法的 API 使用）
   */
  post<T = any>(path: string, body: unknown, options?: Record<string, unknown>): any {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.http.post<T>(`${this.baseUrl}${normalizedPath}`, body, options as any);
  }

  /**
   * 通用 PUT（供尚未封裝成專屬方法的 API 使用）
   */
  put<T = any>(path: string, body: unknown, options?: Record<string, unknown>): any {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.http.put<T>(`${this.baseUrl}${normalizedPath}`, body, options as any);
  }

  /**
   * 通用 DELETE（供尚未封裝成專屬方法的 API 使用）
   */
  delete<T = any>(path: string, options?: Record<string, unknown>): any {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.http.delete<T>(`${this.baseUrl}${normalizedPath}`, options as any);
  }

  // ========== DASHBOARD CASH (儀表板現金區塊) ==========

  /**
   * 取得儀表板現金狀態
   */
  getDashboardCashState(): Promise<ApiResponse<DashboardCashState>> {
    return firstValueFrom(this.http.get<ApiResponse<DashboardCashState>>(`${this.baseUrl}/dashboard-cash`));
  }

  /**
   * 更新儀表板現金狀態（自動 upsert）
   */
  updateDashboardCashState(payload: DashboardCashState): Promise<ApiResponse<DashboardCashState>> {
    return firstValueFrom(this.http.put<ApiResponse<DashboardCashState>>(`${this.baseUrl}/dashboard-cash`, payload));
  }

  // ========== LEDGER API METHODS (流水帳) ==========

  /**
   * 獲取流水帳資料
   * @param params 查詢參數
   * @returns Promise<ApiResponse<LedgerEntry[]>>
   */
  getLedgerEntries(params?: {
    startDate?: string;
    endDate?: string;
    itemGroup?: string;
    subjectName?: string;
    subjectNameExact?: string;
    glAccountId?: number;
    vendorName?: string;
    description?: string;
    entryId?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<LedgerEntry[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(this.http.get<ApiResponse<LedgerEntry[]>>(`${this.baseUrl}/ledger`, { params: httpParams }));
  }

  /**
   * 新增流水帳記錄
   * @param entry 流水帳資料
   * @returns Promise<ApiResponse<LedgerEntry>>
   */
  createLedgerEntry(entry: {
    entry_date: string;
    item_group: string;
    subject_name: string;
    amount: number;
    description?: string;
    invoice_no?: string;
    vendor_id?: number;
    gl_account_id?: number;
    is_sigh_off?: boolean;
  }): Promise<ApiResponse<LedgerEntry>> {
    return firstValueFrom(this.http.post<ApiResponse<LedgerEntry>>(`${this.baseUrl}/ledger`, entry));
  }

  /**
   * 更新流水帳記錄
   * @param entry 更新資料（必須包含entry_id）
   * @returns Promise<ApiResponse<LedgerEntry>>
   */
  updateLedgerEntry(entry: {
    entry_id: number;
    entry_date?: string;
    item_group?: string;
    subject_name?: string;
    amount?: number;
    description?: string;
    invoice_no?: string;
    vendor_id?: number;
    gl_account_id?: number;
    is_sigh_off?: boolean;
  }): Promise<ApiResponse<LedgerEntry>> {
    return firstValueFrom(this.http.put<ApiResponse<LedgerEntry>>(`${this.baseUrl}/ledger`, entry));
  }

  /**
   * 刪除流水帳記錄
   * @param entryId 記錄ID
   * @returns Promise<ApiResponse<LedgerEntry>>
   */
  deleteLedgerEntry(entryId: number): Promise<ApiResponse<LedgerEntry>> {
    const params = new HttpParams().set('id', entryId.toString());
    return firstValueFrom(this.http.delete<ApiResponse<LedgerEntry>>(`${this.baseUrl}/ledger`, { params }));
  }

  // ========== ACCOUNTS PAYABLE API METHODS (應付帳款) ==========

  /**
   * 獲取應付帳款列表（以流水帳 subject_name='應付帳款' 為來源）
   */
  getAccountsPayables(): Promise<ApiResponse<any[]>> {
    return firstValueFrom(this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/accounts-payable`));
  }

  /**
   * 取得某筆應付帳款的還款明細
   */
  getAccountsPayablePayments(entryId: number): Promise<ApiResponse<any[]>> {
    const params = new HttpParams().set('entryId', String(entryId));
    return firstValueFrom(this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/accounts-payable/payments`, { params }));
  }

  /**
   * 取得（並在需要時建立）某筆應付帳款的主檔資料
   */
  getAccountsPayableMaster(entryId: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('entryId', String(entryId));
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/accounts-payable/master`, { params }));
  }

  /**
   * 更新（或建立）某筆應付帳款主檔（債權人/還款期限）
   */
  updateAccountsPayableMaster(payload: { entryId: number; creditor: string; dueDate: string; glAccountId?: number | null }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/accounts-payable/master`, payload));
  }

  /**
   * 新增還款明細
   */
  createAccountsPayablePayment(payload: {
    entryId: number;
    paymentDate: string;
    amount: number;
    description?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/accounts-payable/payments`, payload));
  }

  /**
   * 檢查流水帳是否有關聯的進貨單
   * @param entryId 流水帳ID
   * @returns Promise<ApiResponse<{ shipmentItemsCount: number; hasRelatedItems: boolean }>>
   */
  checkLedgerShipmentItems(entryId: number): Promise<ApiResponse<{ shipmentItemsCount: number; hasRelatedItems: boolean }>> {
    const params = new HttpParams().set('id', entryId.toString());
    return firstValueFrom(this.http.get<ApiResponse<{ shipmentItemsCount: number; hasRelatedItems: boolean }>>(`${this.baseUrl}/ledger/check-shipment`, { params }));
  }

  // ========== VENDOR API METHODS (廠商) ==========

  /**
   * 獲取廠商資料
   * @returns Promise<ApiResponse<Vendor[]>>
   */
  getVendors(): Promise<ApiResponse<Vendor[]>> {
    return firstValueFrom(this.http.get<ApiResponse<Vendor[]>>(`${this.baseUrl}/vendors`));
  }

  /**
   * 更新廠商資料
   * @param vendor 廠商更新資料（必須包含vendor_id）
   * @returns Promise<ApiResponse<Vendor>>
   */
  updateVendor(vendor: {
    vendor_id: number;
    vendor_name: string;
    tax_id?: string;
    category: string;
    aliases?: string[];
    contact_info: string;
    rest_days?: string[];
    remark?: string;
  }): Promise<ApiResponse<Vendor>> {
    return firstValueFrom(this.http.put<ApiResponse<Vendor>>(`${this.baseUrl}/vendors`, vendor));
  }

  /**
   * 刪除廠商
   * @param vendorId 廠商ID
   * @returns Promise<ApiResponse<Vendor>>
   */
  deleteVendor(vendorId: number): Promise<ApiResponse<Vendor>> {
    const params = new HttpParams().set('id', vendorId.toString());
    return firstValueFrom(this.http.delete<ApiResponse<Vendor>>(`${this.baseUrl}/vendors`, { params }));
  }

  /**
   * 根據統編查詢廠商
   * @param taxId 廠商統編
   * @returns Promise<ApiResponse<{vendor_id: number, vendor_name: string}>>
   */
  getVendorByTaxId(taxId: string): Promise<ApiResponse<{vendor_id: number, vendor_name: string}>> {
    const params = new HttpParams().set('tax_id', taxId);
    return firstValueFrom(this.http.get<ApiResponse<{vendor_id: number, vendor_name: string}>>(`${this.baseUrl}/vendors`, { params }));
  }

  // ========== GL ACCOUNTS API METHODS (會計科目) ==========

  /**
   * 獲取會計科目資料
   * @param params 查詢參數
   * @returns Promise<ApiResponse<GLAccount[]>>
   */
  getGLAccounts(params?: {
    level?: number;
    parentId?: number;
  }): Promise<ApiResponse<GLAccount[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(this.http.get<ApiResponse<GLAccount[]>>(`${this.baseUrl}/gl-accounts`, { params: httpParams }));
  }

  /**
   * 根據 item_group 和 subject_name 查詢 GL Account ID
   * @param itemGroup 項目
   * @param subjectName 科目
   * @returns Promise<ApiResponse<{ glAccountId: number | null; matchType: string }>>
   */
  resolveGLAccount(itemGroup: string, subjectName: string): Promise<ApiResponse<{ glAccountId: number | null; matchType: string }>> {
    let httpParams = new HttpParams()
      .set('itemGroup', itemGroup)
      .set('subjectName', subjectName);

    return firstValueFrom(this.http.get<ApiResponse<{ glAccountId: number | null; matchType: string }>>(`${this.baseUrl}/gl-accounts/resolve`, { params: httpParams }));
  }

  // ========== FINANCIAL STATEMENTS API METHODS (財務報表) ==========

  // ========== AUTO DEBITS API METHODS (固定自動扣繳) ==========

  getAutoDebits(): Promise<ApiResponse<any[]>> {
    return firstValueFrom(this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/auto-debits`));
  }

  generateAutoDebits(payload?: { ruleId?: number; amount?: number }): Promise<ApiResponse<{ createdCount: number }>> {
    return firstValueFrom(this.http.post<ApiResponse<{ createdCount: number }>>(`${this.baseUrl}/auto-debits/generate`, payload ?? {}));
  }

  createAutoDebit(payload: {
    name: string;
    cycleType: 'monthly' | 'bimonthly' | 'semiannual' | 'yearly';
    monthOfYear?: number | null;
    dayOfMonth: number;
    nextRunDate?: string | null;
    amount: number;
    itemGroup?: string;
    subjectName?: string;
    remark?: string | null;
    vendorId?: number | null;
    isActive?: boolean;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/auto-debits`, payload));
  }

  updateAutoDebit(payload: {
    ruleId: number;
    name: string;
    cycleType: 'monthly' | 'bimonthly' | 'semiannual' | 'yearly';
    monthOfYear?: number | null;
    dayOfMonth: number;
    nextRunDate?: string | null;
    amount: number;
    itemGroup?: string;
    subjectName?: string;
    remark?: string | null;
    vendorId?: number | null;
    isActive?: boolean;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/auto-debits`, payload));
  }

  disableAutoDebit(ruleId: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(ruleId));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/auto-debits`, { params }));
  }

  /**
   * 獲取年度總表資料
   * 從後端流水帳資料計算年度收入、支出、淨利、未付款等彙總數據
   * @param startYear 開始年度
   * @param endYear 結束年度
   * @returns Promise<ApiResponse<AnnualSummaryReport>>
   */
  async getAnnualSummary(startYear: number, endYear: number): Promise<ApiResponse<AnnualSummaryReport>> {
    const params = new HttpParams()
      .set('type', 'summary')
      .set('startYear', startYear.toString())
      .set('endYear', endYear.toString());
    
    const response = await firstValueFrom(
      this.http.get<ApiResponse<AnnualSummaryReport>>(`${this.baseUrl}/financial-statements`, { params })
    );

    // 轉換數據型別（Postgres numeric 類型會序列化為字串）
    if (response.success && response.data) {
      response.data = this.normalizeAnnualSummary(response.data);
    }

    return response;
  }

  /**
   * 獲取損益表資料
   * 從後端流水帳資料計算指定期間的收入和費用明細
   * @param year 年度
   * @param quarter 季度 (1, 2, 3, 4, 或 'all')
   * @returns Promise<ApiResponse<any>>
   */
  getIncomeStatement(year: number, quarter: number | 'all'): Promise<ApiResponse<any>> {
    const params = new HttpParams()
      .set('type', 'income')
      .set('year', year.toString())
      .set('quarter', quarter.toString());
    
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/financial-statements`, { params }));
  }

  /**
   * 獲取資產負債表資料
   * 從後端流水帳資料計算指定期間的資產、負債、權益餘額
   * @param year 年度
   * @param quarter 季度 (1, 2, 3, 4, 或 'all')
   * @returns Promise<ApiResponse<any>>
   */
  getBalanceSheet(year: number, quarter: number | 'all'): Promise<ApiResponse<any>> {
    const params = new HttpParams()
      .set('type', 'balance')
      .set('year', year.toString())
      .set('quarter', quarter.toString());
    
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/financial-statements`, { params }));
  }

  /**
   * 獲取財務報表明細資料
   * 點擊總表數字後顯示的月度明細（收入、支出、未付款）
   * @param year 年度
   * @param type 明細類型 (revenue: 收入, expense: 支出, unpaid: 未付)
   * @returns Promise<ApiResponse<MonthlyDetailReport>>
   */
  async getFinancialStatementsDetails(year: number, type: 'revenue' | 'expense' | 'unpaid'): Promise<ApiResponse<MonthlyDetailReport>> {
    const params = new HttpParams()
      .set('year', year.toString())
      .set('type', type);
    
    const response = await firstValueFrom(
      this.http.get<ApiResponse<MonthlyDetailReport>>(`${this.baseUrl}/financial-statements/details`, { params })
    );

    // 轉換數據型別（Postgres numeric 類型會序列化為字串）
    if (response.success && response.data) {
      response.data = this.normalizeMonthlyDetail(response.data);
    }

    return response;
  }

  // ========== DATA NORMALIZATION HELPERS ==========

  /**
   * 將字串或數字轉換為 JavaScript number 類型
   * Postgres 的 numeric/decimal 類型在 JSON 序列化時會變成字串
   * @param value 值（可能是字串或數字）
   * @returns JavaScript number
   */
  private parseNumeric(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
  }

  /**
   * 批量轉換年度總計物件中的所有數值
   * @param obj Record<number, any> & { total: any }
   * @returns Record<number, number> & { total: number }
   */
  private convertYearTotalsToNumbers(obj: Record<number, any> & { total: any }): Record<number, number> & { total: number } {
    const result: Record<number | string, number> = {};
    
    Object.entries(obj).forEach(([key, value]) => {
      if (key === 'total') {
        (result as Record<string, number>).total = this.parseNumeric(value);
      } else {
        const yearKey = parseInt(key);
        if (!isNaN(yearKey)) {
          result[yearKey] = this.parseNumeric(value);
        }
      }
    });

    return result as Record<number, number> & { total: number };
  }

  /**
   * 標準化年度總表資料，將所有數值轉換為 JavaScript number
   * @param report 原始報表資料
   * @returns 標準化後的報表資料
   */
  private normalizeAnnualSummary(report: any): AnnualSummaryReport {
    return {
      years: report.years || [],
      revenue: this.convertYearTotalsToNumbers(report.revenue || { total: 0 }),
      salesDiscount: report.salesDiscount ? this.convertYearTotalsToNumbers(report.salesDiscount) : undefined,
      expense: this.convertYearTotalsToNumbers(report.expense || { total: 0 }),
      expenseBreakdown: report.expenseBreakdown
        ? {
            merchandise: this.convertYearTotalsToNumbers(report.expenseBreakdown.merchandise || { total: 0 }),
            miscellaneous: this.convertYearTotalsToNumbers(report.expenseBreakdown.miscellaneous || { total: 0 })
          }
        : undefined,
      net: this.convertYearTotalsToNumbers(report.net || { total: 0 }),
      unpaid: this.convertYearTotalsToNumbers(report.unpaid || { total: 0 }),
      unpaidBreakdown: report.unpaidBreakdown
        ? {
            accountsPayable: this.convertYearTotalsToNumbers(report.unpaidBreakdown.accountsPayable || { total: 0 }),
            payableForRenovation: this.convertYearTotalsToNumbers(report.unpaidBreakdown.payableForRenovation || { total: 0 }),
            payableSalary: this.convertYearTotalsToNumbers(report.unpaidBreakdown.payableSalary || { total: 0 }),
            payableShareholderRebate: this.convertYearTotalsToNumbers(report.unpaidBreakdown.payableShareholderRebate || { total: 0 }),
            payableForGoods: this.convertYearTotalsToNumbers(report.unpaidBreakdown.payableForGoods || { total: 0 })
          }
        : undefined
    };
  }

  /**
   * 標準化月度明細資料，將所有金額轉換為 JavaScript number
   * @param report 原始明細資料
   * @returns 標準化後的明細資料
   */
  private normalizeMonthlyDetail(report: any): MonthlyDetailReport {
    const normalizedData = (report.data || []).map((monthData: any) => ({
      month: monthData.month,
      total: this.parseNumeric(monthData.total),
      items: (monthData.items || []).map((item: any) => ({
        name: item.name,
        amount: this.parseNumeric(item.amount)
      }))
    }));

    return {
      year: report.year,
      type: report.type,
      data: normalizedData
    };
  }

  // ========== CUSTOMER API METHODS (顾客管理) ==========

  /**
   * 創建新顧客
   * @param customer 顧客資料
   * @returns Promise<ApiResponse<Customer>>
   */
  createCustomer(customer: any): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/customers`, customer));
  }

  /**
   * 更新顧客資料
   * @param customer 更新的顧客資料（必須包含ID）
   * @returns Promise<ApiResponse<Customer>>
   */
  updateCustomer(customer: any): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/customers`, customer));
  }

  /**
   * 刪除顧客
   * @param customerId 顧客ID
   * @returns Promise<ApiResponse<Customer>>
   */
  deleteCustomer(customerId: string): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', customerId);
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/customers`, { params }));
  }

  // ========== DAILY REVENUE API METHODS (當日營收 from POS) ==========

  /**
   * 獲取單日營收資料
   * 時間範圍：該日 21:00:00 到隔日 07:00:00
   * @param date 日期 (YYYY-MM-DD)
   * @returns Promise<MonthlyRevenueResponse>
   */
  getDailyRevenue(date: string): Promise<any> {
    const params = new HttpParams().set('date', date);
    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/daily-revenue`, { params }));
  }

  /**
   * 獲取整月營收資料
   * 時間範圍：每一天從 21:00:00 到隔日 07:00:00
   * @param year 年份
   * @param month 月份 (1-12)
   * @returns Promise<MonthlyRevenueResponse>
   */
  getMonthlyRevenue(year: number, month: number): Promise<MonthlyRevenueResponse> {
    const params = new HttpParams()
      .set('year', year.toString())
      .set('month', month.toString());
    return firstValueFrom(this.http.get<MonthlyRevenueResponse>(`${this.baseUrl}/daily-revenue`, { params }));
  }

  // ========== EVENTS API METHODS (活動管理) ==========

  /**
   * 獲取活動列表（支援日期區間、搜尋、排序、分頁）
   */
  getEvents(params?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'date' | 'type' | 'time' | 'name' | 'organizer' | 'attendees' | 'estimatedRevenue' | 'deposit' | 'actualRevenue' | 'notes';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<EventEntry[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(this.http.get<ApiResponse<EventEntry[]>>(`${this.baseUrl}/events`, { params: httpParams }));
  }

  /**
   * 取得完整活動列表（自動分頁抓取全部資料）。
   * - 後端單次最大 limit=200，因此這裡會逐頁抓取直到沒有下一頁。
   * - 主要給「日曆」使用：不受 UI 日期篩選限制。
   */
  async getAllEvents(params?: {
    search?: string;
    sortBy?: 'date' | 'type' | 'time' | 'name' | 'organizer' | 'attendees' | 'estimatedRevenue' | 'deposit' | 'actualRevenue' | 'notes';
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<EventEntry[]>> {
    const limit = 200;
    const safeMaxPages = 200;
    let page = 1;
    const allEvents: EventEntry[] = [];

    while (page <= safeMaxPages) {
      const response = await this.getEvents({
        ...params,
        page,
        limit,
      });

      if (!response.success) {
        return response;
      }

      if (response.data?.length) {
        allEvents.push(...response.data);
      }

      const hasNext = Boolean(response.pagination?.hasNext);
      if (!hasNext) {
        break;
      }
      page += 1;
    }

    return { success: true, data: allEvents };
  }

  /**
   * 新增活動
   */
  createEvent(payload: {
    type?: string;
    status?: 'active' | 'pending' | 'cancelled';
    useSpace?: string;
    date: string;
    time?: string;
    name: string;
    organizer?: string;
    attendees?: string;
    estimatedRevenue?: number | null;
    deposit?: number | null;
    actualRevenue?: number | null;
    notes?: string;
  }): Promise<ApiResponse<{ id: number }>> {
    return firstValueFrom(this.http.post<ApiResponse<{ id: number }>>(`${this.baseUrl}/events/create`, payload));
  }

  /**
   * 取得單筆活動
   */
  getEventById(eventId: string): Promise<ApiResponse<EventEntry>> {
    return firstValueFrom(this.http.get<ApiResponse<EventEntry>>(`${this.baseUrl}/events/${eventId}`));
  }

  /**
   * 更新活動
   */
  updateEvent(eventId: string, payload: {
    type?: string;
    status?: 'active' | 'pending' | 'cancelled';
    useSpace?: string;
    date: string;
    time?: string;
    name: string;
    organizer?: string;
    attendees?: string;
    estimatedRevenue?: number | null;
    deposit?: number | null;
    actualRevenue?: number | null;
    notes?: string;
  }): Promise<ApiResponse<{ id: number }>> {
    return firstValueFrom(this.http.put<ApiResponse<{ id: number }>>(`${this.baseUrl}/events/${eventId}`, payload));
  }

  /**
   * 刪除活動（軟刪除）
   */
  deleteEvent(eventId: string): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/events/${eventId}`));
  }

  // ========== REMINDERS API METHODS (事項提醒) ==========

  /**
   * 獲取事項提醒列表（支援日期區間、搜尋）
   */
  getReminders(params?: {
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
  }): Promise<ApiResponse<ReminderEntry[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(this.http.get<ApiResponse<ReminderEntry[]>>(`${this.baseUrl}/reminders`, { params: httpParams }));
  }

  /**
   * 新增事項提醒
   */
  createReminder(payload: {
    date: string;
    time?: string;
    category?: string;
    event: string;
    status?: 'active' | 'pending' | 'cancelled';
  }): Promise<ApiResponse<{ id: string; googleSyncStatus?: 'disabled' | 'success' | 'failed'; googleEventId?: string | null; googleSyncError?: string | null }>> {
    return firstValueFrom(this.http.post<ApiResponse<{ id: string; googleSyncStatus?: 'disabled' | 'success' | 'failed'; googleEventId?: string | null; googleSyncError?: string | null }>>(`${this.baseUrl}/reminders`, payload));
  }

  // ========== CUSTOMER API METHODS (顧客管理) ==========

  /**
   * 獲取顧客列表
   * 從 pos.members 表獲取所有未刪除的會員記錄
   * @param options 查詢選項
   *   - search: 按名稱或電話搜尋
   *   - limit: 返回記錄數量（默認 100）
   *   - offset: 分頁偏移量（默認 0）
   * @returns Promise<CustomerListResponse>
   */
  getCustomers(options?: { search?: string; limit?: number; offset?: number }): Promise<any> {
    let params = new HttpParams();
    if (options?.search) {
      params = params.set('search', options.search);
    }
    if (options?.limit) {
      params = params.set('limit', options.limit.toString());
    }
    if (options?.offset) {
      params = params.set('offset', options.offset.toString());
    }
    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/customers`, { params }));
  }

  // ========== PRODUCT SALES API METHODS (商品銷售) ==========

  /**
   * 獲取商品銷售摘要資料
   * 從 pos.item_sales_summary 表查詢商品銷售數據
   * @param options 查詢選項
   *   - startMonth: 起始月份 (YYYY-MM 格式，必填)
   *   - endMonth: 結束月份 (YYYY-MM 格式，必填)
   *   - category: 分類篩選 (可選)
   *   - limit: 返回記錄數量（默認 1000）
   *   - offset: 分頁偏移量（默認 0）
   * @returns Promise 商品銷售數據
   * 
   * 使用示例:
   * ```typescript
   * const data = await this.apiService.getProductSales({
   *   startMonth: '2026-01',
   *   endMonth: '2026-04'
   * });
   * ```
   */
  getProductSales(options: {
    startMonth: string;
    endMonth: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    let params = new HttpParams()
      .set('startMonth', options.startMonth)
      .set('endMonth', options.endMonth);

    if (options.category) {
      params = params.set('category', options.category);
    }
    if (options.limit) {
      params = params.set('limit', options.limit.toString());
    }
    if (options.offset) {
      params = params.set('offset', options.offset.toString());
    }

    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/product-sales`, { params }));
  }

  /**
   * 獲取進貨成本資料（用於計算商品毛利）
   * 從 finance.ledger_entries 表查詢進貨成本
   * 
   * @param options 查詢選項
   *   - startMonth: 起始月份 (YYYY-MM 格式，必填)
   *   - endMonth: 結束月份 (YYYY-MM 格式，必填)
   * 
   * @returns Promise 進貨成本數據（包含匯總和月度數據）
   * 
   * 使用示例:
   * ```typescript
   * const costs = await this.apiService.getPurchaseCosts({
   *   startMonth: '2024-12',
   *   endMonth: '2025-12'
   * });
   * // 返回格式:
   * // {
   * //   success: true,
   * //   data: {
   * //     summary: { dining: 50000, drinks: 80000, cigars: 120000, venue: 0, total: 250000 },
   * //     monthly: [ { month: '2024-12', dining: 10000, ... }, ... ]
   * //   }
   * // }
   * ```
   */
  getPurchaseCosts(options: {
    startMonth: string;
    endMonth: string;
  }): Promise<any> {
    const params = new HttpParams()
      .set('startMonth', options.startMonth)
      .set('endMonth', options.endMonth);

    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/purchase-costs`, { params }));
  }

  /**
   * 獲取進貨單項目資料
   * 從 vendor.shipment_items 表查詢進貨單項目資訊
   * 
   * @param options 查詢選項
   *   - startDate: 起始日期 (YYYY-MM-DD 格式，可選)
   *   - endDate: 結束日期 (YYYY-MM-DD 格式，可選)
  *   - vendorId: 廠商 ID (可選，用於篩選特定廠商)
  *   - entryId: 流水帳 entry_id (可選，用於關聯查詢)
   *   - documentNo: 進貨單號 (可選，用於搜尋特定單號)
   *   - itemName: 品項名稱 (可選，用於搜尋特定品項)
   *   - limit: 返回記錄數（默認 1000）
   *   - offset: 分頁偏移量（默認 0）
   * 
   * @returns Promise 進貨單項目資料
   * 
   * 使用示例:
   * ```typescript
   * // 查詢特定日期範圍內的進貨單
   * const data = await this.apiService.getShipmentItems({
   *   startDate: '2025-01-01',
   *   endDate: '2025-12-31'
   * });
   * 
   * // 查詢特定廠商的進貨單
   * const vendorData = await this.apiService.getShipmentItems({
   *   vendorId: '1',
   *   limit: 50
   * });
   * 
   * // 搜尋特定品項
   * const itemData = await this.apiService.getShipmentItems({
   *   itemName: '黑啤',
   *   startDate: '2025-01-01',
   *   endDate: '2025-12-31'
   * });
   * ```
   */
  getShipmentItems(options?: {
    startDate?: string;
    endDate?: string;
    vendorId?: number | string;
    entryId?: number | string;
    documentNo?: string;
    itemName?: string;
    limit?: number;
    offset?: number;
  }): Promise<ShipmentItemsResponse> {
    let params = new HttpParams();

    if (options?.startDate) {
      params = params.set('startDate', options.startDate);
    }
    if (options?.endDate) {
      params = params.set('endDate', options.endDate);
    }
    if (options?.vendorId) {
      params = params.set('vendorId', options.vendorId.toString());
    }
    if (options?.entryId) {
      params = params.set('entryId', options.entryId.toString());
    }
    if (options?.documentNo) {
      params = params.set('documentNo', options.documentNo);
    }
    if (options?.itemName) {
      params = params.set('itemName', options.itemName);
    }
    if (options?.limit) {
      params = params.set('limit', options.limit.toString());
    }
    if (options?.offset) {
      params = params.set('offset', options.offset.toString());
    }

    return firstValueFrom(this.http.get<ShipmentItemsResponse>(`${this.baseUrl}/shipment-items`, { params }));
  }

  /**
   * 更新進貨單項目資料
   * 
   * @param shipmentId 進貨單項目ID
   * @param data 要更新的資料
   * @returns Promise 更新結果
   * 
   * 使用示例:
   * ```typescript
   * await this.apiService.updateShipmentItem(123, {
   *   itemName: '黑啤',
   *   qty: 10,
   *   unitPrice: 50,
   *   unit: '瓶',
   *   remark: '備註',
   *   entryId: 456
   * });
   * ```
   */
  updateShipmentItem(shipmentId: number, data: {
    itemName?: string;
    qty?: number | null;
    unitPrice?: number | null;
    unit?: string | null;
    remark?: string | null;
    entryId?: number | null;
  }): Promise<ApiResponse<ShipmentItem>> {
    const payload = {
      shipmentId,
      ...data
    };
    return firstValueFrom(this.http.put<ApiResponse<ShipmentItem>>(`${this.baseUrl}/shipment-items`, payload));
  }

  /**
   * 新增進貨單項目資料
   * 
   * @param data 進貨單項目資料
   * @returns Promise 新增結果
   * 
   * 使用示例:
   * ```typescript
   * await this.apiService.createShipmentItem({
   *   entryId: 123,
   *   issueDate: '2026-02-05',
   *   vendorId: 1,
   *   itemName: '黑啤',
   *   qty: 10,
   *   unitPrice: 50,
   *   unit: '瓶'
   * });
   * ```
   */
  createShipmentItem(data: {
    entryId: number;
    issueDate: string;
      vendorId?: number | null;
    documentNo?: string;
    itemName: string;
    qty?: number | null;
    unitPrice?: number | null;
    unit?: string | null;
    remark?: string | null;
  }): Promise<ApiResponse<ShipmentItem>> {
    return firstValueFrom(this.http.post<ApiResponse<ShipmentItem>>(`${this.baseUrl}/shipment-items`, data));
  }

  getPurchaseOrderAiScanFiles(): Promise<ApiResponse<{ count: number; files: PurchaseOrderAiScanFile[] }>> {
    return firstValueFrom(
      this.http.get<ApiResponse<{ count: number; files: PurchaseOrderAiScanFile[] }>>(
        `${this.baseUrl}/purchase-orders/ai-import`
      )
    );
  }

  importPurchaseOrdersByAi(fileIds?: string[]): Promise<ApiResponse<PurchaseOrderAiImportResult>> {
    return firstValueFrom(
      this.http.post<ApiResponse<PurchaseOrderAiImportResult>>(
        `${this.baseUrl}/purchase-orders/ai-import`,
        { fileIds: Array.isArray(fileIds) ? fileIds : [] }
      )
    );
  }

  /**
   * 刪除進貨單項目資料
   * 
   * @param shipmentId 進貨單項目ID
   * @returns Promise 刪除結果
   * 
   * 使用示例:
   * ```typescript
   * await this.apiService.deleteShipmentItem(123);
   * ```
   */
  deleteShipmentItem(shipmentId: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', shipmentId.toString());
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/shipment-items`, { params }));
  }

  /**
   * 獲取月度營收目標列表
   * 
   * @param options 查詢選項
   *   - startMonth: 起始月份 (YYYY-MM 格式，可選)
   *   - endMonth: 結束月份 (YYYY-MM 格式，可選)
   * 
   * @returns Promise 月度營收目標數據
   * 
   * 使用示例:
   * ```typescript
   * const targets = await this.apiService.getMonthlyTargets();
   * // 或查詢特定月份範圍
   * const targets = await this.apiService.getMonthlyTargets({
   *   startMonth: '2025-01',
   *   endMonth: '2025-12'
   * });
   * ```
   */
  getMonthlyTargets(options?: {
    startMonth?: string;
    endMonth?: string;
  }): Promise<any> {
    let params = new HttpParams();

    if (options?.startMonth) {
      params = params.set('startMonth', options.startMonth);
    }
    if (options?.endMonth) {
      params = params.set('endMonth', options.endMonth);
    }

    return firstValueFrom(this.http.get<any>(`${this.baseUrl}/monthly-targets`, { params }));
  }

  /**
   * 新增月度營收目標
   * 
   * @param data 目標數據
   *   - targetMonth: 目標月份 (YYYY-MM-DD 格式，每月第一天)
   *   - monthlyRevenueTarget: 月營業目標
   *   - eventRevenueTarget: 活動營收目標 (可選)
   *   - remark: 備註 (可選)
   * 
   * @returns Promise 新增結果
   * 
   * 使用示例:
   * ```typescript
   * const result = await this.apiService.createMonthlyTarget({
   *   targetMonth: '2025-01-01',
   *   monthlyRevenueTarget: 280000,
   *   eventRevenueTarget: 50000,
   *   remark: '春節活動月'
   * });
   * ```
   */
  createMonthlyTarget(data: {
    targetMonth: string;
    monthlyRevenueTarget: number;
    eventRevenueTarget?: number;
    remark?: string;
  }): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.baseUrl}/monthly-targets`, data));
  }

  /**
   * 更新月度營收目標
   * 
   * @param data 更新數據
   *   - targetId: 目標ID
   *   - monthlyRevenueTarget: 月營業目標
   *   - eventRevenueTarget: 活動營收目標 (可選)
   *   - remark: 備註 (可選)
   * 
   * @returns Promise 更新結果
   * 
   * 使用示例:
   * ```typescript
   * const result = await this.apiService.updateMonthlyTarget({
   *   targetId: 1,
   *   monthlyRevenueTarget: 300000,
   *   eventRevenueTarget: 60000,
   *   remark: '調整目標'
   * });
   * ```
   */
  updateMonthlyTarget(data: {
    targetId: number;
    monthlyRevenueTarget: number;
    eventRevenueTarget?: number;
    remark?: string;
  }): Promise<any> {
    return firstValueFrom(this.http.put<any>(`${this.baseUrl}/monthly-targets`, data));
  }

  /**
   * 刪除月度營收目標
   * 
   * @param targetId 目標ID
   * 
   * @returns Promise 刪除結果
   * 
   * 使用示例:
   * ```typescript
   * const result = await this.apiService.deleteMonthlyTarget(1);
   * ```
   */
  deleteMonthlyTarget(targetId: number): Promise<any> {
    const params = new HttpParams().set('targetId', targetId.toString());
    return firstValueFrom(this.http.delete<any>(`${this.baseUrl}/monthly-targets`, { params }));
  }

  // ========== PAYROLL API METHODS (薪資管理) ==========

  /**
   * 獲取每日薪資彙總
   * 
   * @param params 查詢參數
   *   - year: 年份
   *   - month: 月份
   *   - user_id: 員工 ID (可選)
   *   - is_paid: 是否已發放 (可選)
   *   - is_verified: 是否已核對 (可選)
   *   - limit: 分頁限制 (預設 100)
   *   - offset: 分頁偏移 (預設 0)
   * 
   * @returns Promise<ApiResponse<any[]>>
   */
  getDailySummaries(params?: {
    year?: number;
    month?: number;
    user_id?: number;
    is_paid?: boolean;
    is_verified?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<any[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(
      this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/payroll/daily-summaries`, { params: httpParams })
    );
  }

  /**
   * 建立每日薪資紀錄
   * 
   * @param data 薪資資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  createDailySummary(data: {
    user_id: number;
    clock_in_time?: string;
    display_name: string,
    release_amount: number
    clock_out_time?: string;
    work_hours?: number;
    regular_hours?: number;
    overtime_hours?: number;
    base_wage?: number;
    multiplier?: number;
    regular_wage?: number;
    overtime_wage?: number;
    special_bonus?: number;
    total_wage: number;
    is_special_day?: boolean;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/daily-summaries`, data)
    );
  }

  /**
   * 更新每日薪資紀錄
   * 
   * @param id 薪資記錄 ID
   * @param data 更新資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateDailySummary(id: number, data: any): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/payroll/daily-summaries`, { id, ...data })
    );
  }

  /**
   * 獲取月結薪資彙總
   *
   * @param params 查詢參數
   *   - year: 年份
   *   - month: 月份
   *   - user_id: 員工 ID (可選)
   *
   * @returns Promise<ApiResponse<any[]>>
   */
  getMonthlySummaries(params: {
    year: number;
    month: number;
    user_id?: number;
  }): Promise<ApiResponse<any[]>> {
    let httpParams = new HttpParams()
      .set('year', params.year.toString())
      .set('month', params.month.toString());

    if (params.user_id !== undefined) {
      httpParams = httpParams.set('user_id', params.user_id.toString());
    }

    return firstValueFrom(
      this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/payroll/monthly-summaries`, { params: httpParams })
    );
  }

  /**
   * 更新或建立月結薪資彙總 (用於月薪調整)
   */
  updateMonthlySummary(data: {
    user_id: number;
    year: number;
    month: number;
    total_wage: number;
    total_work_hours?: number;
    display_name?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/payroll/monthly-summaries`, data)
    );
  }

  /**
   * 批量發放薪資（建立流水帳並更新薪資紀錄）
   * 
   * @param dailySummaryIds 每日薪資記錄 IDs
   * 
   * @returns Promise<ApiResponse<any>>
   */
  batchReleasePayroll(dailySummaryIds: number[]): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/batch-release`, {
        daily_summary_ids: dailySummaryIds,
      })
    );
  }

  /**
   * 核對正職員工(月薪)薪資
   * 
   * @param data 核對資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  verifyMonthlySalarySummary(data: {
    user_id: number;
    year: number;
    month: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/verify-monthly-salary`, data)
    );
  }

  /**
   * 發放正職員工(月薪)薪資
   * 
   * @param data 發放資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  releaseMonthlySalarySummary(data: {
    user_id: number;
    year: number;
    month: number;
    display_name: string;
    total_wage: number;
    total_work_hours: number;
    release_amount: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/release-monthly-salary`, data)
    );
  }

  /**
   * 刪除每日薪資紀錄
   * 
   * @param id 薪資記錄 ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  deleteDailySummary(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', id.toString());
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/payroll/daily-summaries`, { params })
    );
  }

  /**
   * 獲取員工薪資設定
   * 
   * @param params 查詢參數
   *   - user_id: 員工 ID (可選)
   *   - is_active: 是否啟用 (可選)
   *   - effective_date: 查詢特定日期的有效薪資 (可選)
   *   - limit: 分頁限制 (預設 100)
   *   - offset: 分頁偏移 (預設 0)
   * 
   * @returns Promise<ApiResponse<any[]>>
   */
  getEmployeeWages(params?: {
    user_id?: number;
    is_active?: boolean;
    effective_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<any[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(
      this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/payroll/employee-wages`, { params: httpParams })
    );
  }

  /**
   * 建立員工薪資設定
   * 
   * @param data 薪資設定資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  createEmployeeWage(data: {
    user_id: number;
    display_name?: string;
    hourly_rate: number;
    wage_type?: string;
    effective_from: string;
    effective_to?: string;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-wages`, data)
    );
  }

  /**
   * 更新員工薪資設定
   * 
   * @param id 薪資設定 ID
   * @param data 更新資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateEmployeeWage(id: number, data: any): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-wages`, { id, ...data })
    );
  }

  /**
   * 刪除員工薪資設定
   * 
   * @param id 薪資設定 ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  deleteEmployeeWage(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', id.toString());
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-wages`, { params })
    );
  }

  // ========== SPECIAL DATES API METHODS (特殊工作日) ==========

  /**
   * 獲取特殊工作日資料
   * 
   * @param params 查詢參數
   * 
   * @returns Promise<ApiResponse<any[]>>
   */
  getSpecialDates(params?: {
    year?: number;
    is_active?: boolean;
  }): Promise<ApiResponse<any[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return firstValueFrom(
      this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/payroll/special-dates`, { params: httpParams })
    );
  }

  /**
   * 建立特殊工作日
   * 
   * @param data 特殊工作日資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  createSpecialDate(data: {
    date: string;
    name: string;
    multiplier: number;
    is_active?: boolean;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/special-dates`, data)
    );
  }

  /**
   * 更新特殊工作日
   * 
   * @param id 特殊工作日 ID
   * @param data 更新資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateSpecialDate(id: number, data: any): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/payroll/special-dates`, { id, ...data })
    );
  }

  /**
   * 刪除特殊工作日
   * 
   * @param id 特殊工作日 ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  deleteSpecialDate(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', id.toString());
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/payroll/special-dates`, { params })
    );
  }

  // ========== SHIFT SCHEDULE API METHODS (排班表) ==========

  getShiftSchedules(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: number;
    is_active?: boolean;
  }): Promise<ApiResponse<ShiftScheduleEntry[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return firstValueFrom(
      this.http.get<ApiResponse<ShiftScheduleEntry[]>>(`${this.baseUrl}/payroll/shift-schedules`, { params: httpParams })
    );
  }

  createShiftSchedule(data: {
    employee_id?: number | null;
    employee_name: string;
    employee_type: 'full-time' | 'part-time';
    date: string;
    start_time: string;
    end_time: string;
    estimated_hourly_rate?: number | null;
    notes?: string;
  }): Promise<ApiResponse<ShiftScheduleEntry>> {
    return firstValueFrom(
      this.http.post<ApiResponse<ShiftScheduleEntry>>(`${this.baseUrl}/payroll/shift-schedules`, data)
    );
  }

  updateShiftSchedule(id: number, data: Partial<ShiftScheduleEntry>): Promise<ApiResponse<ShiftScheduleEntry>> {
    return firstValueFrom(
      this.http.put<ApiResponse<ShiftScheduleEntry>>(`${this.baseUrl}/payroll/shift-schedules`, { id, ...data })
    );
  }

  deleteShiftSchedule(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/payroll/shift-schedules`, { params })
    );
  }

  getShiftUnavailability(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: number;
    is_active?: boolean;
  }): Promise<ApiResponse<ShiftUnavailabilityEntry[]>> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return firstValueFrom(
      this.http.get<ApiResponse<ShiftUnavailabilityEntry[]>>(`${this.baseUrl}/payroll/shift-unavailability`, { params: httpParams })
    );
  }

  createShiftUnavailability(data: {
    employee_id?: number | null;
    employee_name: string;
    date: string;
    is_all_day: boolean;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string;
  }): Promise<ApiResponse<ShiftUnavailabilityEntry>> {
    return firstValueFrom(
      this.http.post<ApiResponse<ShiftUnavailabilityEntry>>(`${this.baseUrl}/payroll/shift-unavailability`, data)
    );
  }

  updateShiftUnavailability(id: number, data: Partial<ShiftUnavailabilityEntry>): Promise<ApiResponse<ShiftUnavailabilityEntry>> {
    return firstValueFrom(
      this.http.put<ApiResponse<ShiftUnavailabilityEntry>>(`${this.baseUrl}/payroll/shift-unavailability`, { id, ...data })
    );
  }

  deleteShiftUnavailability(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/payroll/shift-unavailability`, { params })
    );
  }

  analyzeHandwrittenShiftSchedule(data: {
    filename: string;
    mimeType: string;
    imageBase64: string;
  }): Promise<ApiResponse<ShiftAiImportAnalysisResult>> {
    return firstValueFrom(
      this.http.post<ApiResponse<ShiftAiImportAnalysisResult>>(`${this.baseUrl}/payroll/shift-ai-analysis`, data)
    );
  }

  /**
   * 下載勞報單壓縮檔（含 Word 與 PDF）
   * 
   * @param userId 員工ID
   * @param yearMonth 年月 (格式: YYYY-MM)
   * 
   * @returns Promise<HttpResponse<Blob>>
   */
  async downloadLaborReport(userId: number, yearMonth: string): Promise<HttpResponse<Blob>> {
    const params = new HttpParams()
      .set('user_id', userId.toString())
      .set('year_month', yearMonth);

    return firstValueFrom(
      this.http.get(`${this.baseUrl}/payroll/labor-report`, {
        params,
        responseType: 'blob',
        observe: 'response'
      })
    );
  }

  /**
   * 下載勞報單壓縮檔（使用 employee_id，用於股東回饋金頁面）
   * 
   * @param employeeId 員工 ID (payroll.employee_info.id)
   * @param yearMonth 年月 (格式: YYYY-MM)
   * 
   * @returns Promise<HttpResponse<Blob>>
   */
  async downloadLaborReportByEmployeeId(employeeId: number, yearMonth: string): Promise<HttpResponse<Blob>> {
    const params = new HttpParams()
      .set('employee_id', employeeId.toString())
      .set('year_month', yearMonth);

    return firstValueFrom(
      this.http.get(`${this.baseUrl}/payroll/labor-report`, {
        params,
        responseType: 'blob',
        observe: 'response'
      })
    );
  }

  /**
   * 下載勞報單壓縮檔（使用 employee_id 和自訂金額，用於股東回饋金支付頁面）
   * 
   * @param employeeId 員工 ID (payroll.employee_info.id)
   * @param yearMonth 年月 (格式: YYYY-MM)
   * @param salary 自訂的工作費用/領款金額（支付金額）
   * 
   * @returns Promise<HttpResponse<Blob>>
   */
  async downloadLaborReportByEmployeeIdWithAmount(employeeId: number, yearMonth: string, salary: number): Promise<HttpResponse<Blob>> {
    const params = new HttpParams()
      .set('employee_id', employeeId.toString())
      .set('year_month', yearMonth)
      .set('salary', salary.toString());

    return firstValueFrom(
      this.http.get(`${this.baseUrl}/payroll/labor-report`, {
        params,
        responseType: 'blob',
        observe: 'response'
      })
    );
  }

  // ========== EMPLOYEE ID CARD UPLOAD (身份證圖片上傳) ==========

  /**
   * 取得所有員工資訊
   * 
   * @returns Promise<ApiResponse<any[]>>
   */
  getEmployeeInfo(): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-info`)
    );
  }

  /**
   * 新增員工資訊
   * 
   * @param data 員工資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  createEmployeeInfo(data: {
    employee_name: string;
    employee_number: string;
    schedule_name?: string;
    position?: string;
    id_number?: string;
    phone?: string;
    email?: string;
    registered_address?: string;
    mailing_address?: string;
    job_description?: string;
    payment_method?: string;
    bank?: string;
    branch?: string;
    account_number?: string;
    account_holder?: string;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-info`, data)
    );
  }

  /**
   * 更新員工資訊
   * 
   * @param employee_number 員工編號
   * @param data 要更新的資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateEmployeeInfo(employee_number: string | number, data: any): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('employee_number', employee_number.toString());
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/payroll/employee-info`, data, { params })
    );
  }

  /**
   * 上傳員工身份證圖片
   * 
   * @param file 圖片檔案
   * @param employee_id 員工 ID
   * @param card_side 'front' 或 'back'
   * 
   * @returns Promise<{success: boolean, filename: string, filepath: string}>
   */
  uploadIdCardImage(
    file: File,
    employee_id: number | string,
    card_side: 'front' | 'back'
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('employee_id', employee_id.toString());
    formData.append('card_side', card_side);

    return firstValueFrom(
      this.http.post<any>(`${this.baseUrl}/payroll/upload-id-card`, formData)
    );
  }

  /**
   * 更新員工身份證路徑到資料庫
   * 
   * @param employee_id 員工 ID
   * @param card_side 'front' 或 'back'
   * @param filepath 圖片路徑
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateEmployeeIdCardPath(
    employee_id: number,
    card_side: 'front' | 'back',
    filepath: string
  ): Promise<ApiResponse<any>> {
    const field = card_side === 'front' ? 'id_card_front' : 'id_card_back';
    const params = new HttpParams().set('employee_number', employee_id.toString());

    return firstValueFrom(
      this.http.put<ApiResponse<any>>(
        `${this.baseUrl}/payroll/employee-info`,
        { [field]: filepath },
        { params }
      )
    );
  }

  /**
   * 核對正職員工(月薪)薪資 (簡化版)
   * 
   * @param user_id 員工 ID
   * @param year 年份
   * @param month 月份
   * 
   * @returns Promise<ApiResponse<any>>
   */
  verifyMonthlySalary(
    user_id: number,
    year: number,
    month: number
  ): Promise<ApiResponse<any>> {
    return this.verifyMonthlySalarySummary({ user_id, year, month });
  }

  /**
   * 發放正職員工(月薪)薪資 (簡化版)
   * 
   * @param user_id 員工 ID
   * @param year 年份
   * @param month 月份
   * @param total_wage 總薪資
   * @param total_work_hours 總工時
   * @param display_name 員工姓名
   * @param release_amount 發放金額
   * 
   * @returns Promise<ApiResponse<any>>
   */
  releaseMonthlySalary(
    user_id: number,
    year: number,
    month: number,
    total_wage: number,
    total_work_hours: number,
    display_name: string,
    release_amount: number
  ): Promise<ApiResponse<any>> {
    return this.releaseMonthlySalarySummary({
      user_id,
      year,
      month,
      display_name,
      total_wage,
      total_work_hours,
      release_amount,
    });
  }

  /**
   * 獲取應付薪資統計
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getPayrollPayablesSummary(): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/payroll/payables-summary`)
    );
  }

  /**
   * 獲取員工應付薪資明細（按月彙總）
   * 
   * @param employeeId 員工ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getPayrollPayablesDetails(employeeId: number): Promise<ApiResponse<any>> {
    const params = new HttpParams()
      .set('employee_id', employeeId.toString());
    
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/payroll/payables-details`, { params })
    );
  }

  /**
   * 支付應付薪資
   *
   * @param data 支付資料
   *
   * @returns Promise<ApiResponse<any>>
   */
  payPayrollPayables(data: {
    employee_id: number;
    employee_name?: string;
    pay_amount: number;
    remark?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/payroll/payables-pay`, data)
    );
  }

  // ========== 股東回饋金 API METHODS ==========

  /**
   * 獲取每月回饋金統計
   * 
   * @param params 篩選參數 { year, month }
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getShareholderMonthlySummary(params: { year: number; month: number }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams()
      .set('year', params.year.toString())
      .set('month', params.month.toString());
    
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/monthly-summary`, { params: httpParams })
    );
  }

  /**
   * 獲取當月統計數字
   * 
   * @param params 篩選參數 { year, month }
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getShareholderMonthlyStats(params: { year: number; month: number }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams()
      .set('year', params.year.toString())
      .set('month', params.month.toString());
    
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/monthly-stats`, { params: httpParams })
    );
  }

  /**
   * 獲取特定員工、特定月份的回饋金明細
   * 
   * @param employeeId 員工ID
   * @param params 篩選參數 { year, month }
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getShareholderMonthlyDetail(employeeId: number, params: { year: number; month: number }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams()
      .set('year', params.year.toString())
      .set('month', params.month.toString());
    
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/monthly-detail/${employeeId}`, { params: httpParams })
    );
  }

  /**
   * 更新單筆回饋金明細（回饋%與回饋金）
   * 
   * @param recordId 明細ID
   * @param payload 更新資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  updateShareholderRebateRecord(
    recordId: number,
    payload: { 
      rebate_rate: number; 
      rebate_amount: number;
      invoice_amount?: number;
      remark?: string | null;
    }
  ): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.patch<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/record/${recordId}`, payload)
    );
  }

  /**
   * 新增回饋金明細
   * 
   * @param payload 新增資料
   * 
   * @returns Promise<ApiResponse<any>>
   */
  createShareholderRebateRecord(payload: {
    employee_id: number;
    checkout_at: string;
    invoice_no?: string | null;
    invoice_amount: number;
    taxable_amount: number;
    discount_amount: number;
    discount_note?: string | null;
    rebate_rate: number;
    rebate_amount: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/record`, payload)
    );
  }

  /**
   * 刪除單筆回饋金明細
   * 
   * @param recordId 明細ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  deleteShareholderRebateRecord(recordId: number): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/record/${recordId}`)
    );
  }

  /**
   * 核對股東回饋金
   * 
   * @param payload 核對資訊
   * 
   * @returns Promise<ApiResponse<any>>
   */
  verifyShareholderRebate(payload: {
    employee_id: number;
    year: number;
    month: number;
    employee_name?: string;
    total_rebate: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/verify`, payload)
    );
  }

  /**
   * 發放股東回饋金
   * 
   * @param payload 發放資訊
   * 
   * @returns Promise<ApiResponse<any>>
   */
  releaseShareholderRebate(payload: {
    employee_id: number;
    year: number;
    month: number;
    employee_name: string;
    total_rebate: number;
    release_amount: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/release`, payload)
    );
  }

  /**
   * 支付股東應付回饋金（支付該股東所有待支付餘額）
   *
   * @param payload 支付資訊
   *
   * @returns Promise<ApiResponse<any>>
   */
  payShareholderRebatePayables(payload: {
    employee_id: number;
    employee_name?: string;
    pay_amount: number;
    remark?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/payables-pay`, payload)
    );
  }

  /**
   * 獲取應付回饋金統計
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getShareholderPayablesSummary(): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/payables-summary`)
    );
  }

  /**
   * 獲取員工應付回饋金明細（按月彙總）
   * 
   * @param employeeId 員工ID
   * 
   * @returns Promise<ApiResponse<any>>
   */
  getShareholderPayablesDetail(employeeId: number): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholder-rebates/payables-detail/${employeeId}`)
    );
  }

  // ========== 股權比例 (股東資料) API METHODS ==========

  /**
   * 獲取股東列表（股權比例頁面使用）
   */
  getShareholders(): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/shareholders`)
    );
  }

  /**
   * 新增股東
   */
  createShareholder(payload: {
    shareholder_name: string;
    share_percentage: number;
    invested_amount: number;
    joined_at: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.post<ApiResponse<any>>(`${this.baseUrl}/shareholders`, payload)
    );
  }

  /**
   * 更新股東
   */
  updateShareholder(payload: {
    shareholder_id: number;
    shareholder_name: string;
    share_percentage: number;
    invested_amount: number;
    joined_at: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(
      this.http.put<ApiResponse<any>>(`${this.baseUrl}/shareholders`, payload)
    );
  }

  /**
   * 刪除股東
   */
  deleteShareholder(shareholderId: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', shareholderId.toString());
    return firstValueFrom(
      this.http.delete<ApiResponse<any>>(`${this.baseUrl}/shareholders`, { params })
    );
  }

  // ========== COLLABORATION API METHODS (協作空間) ==========

  getCollaborationGoals(params?: {
    includeKeyResults?: boolean;
    ownerEmployeeId?: number;
  }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams();
    if (params?.includeKeyResults !== undefined) {
      httpParams = httpParams.set('includeKeyResults', String(params.includeKeyResults));
    }
    if (params?.ownerEmployeeId !== undefined) {
      httpParams = httpParams.set('ownerEmployeeId', String(params.ownerEmployeeId));
    }

    return firstValueFrom(
      this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/goals`, { params: httpParams })
    );
  }

  createCollaborationGoal(data: {
    goalName: string;
    goalDescription?: string;
    ownerEmployeeId: number;
    startDate?: string;
    dueDate?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/goals`, data));
  }

  updateCollaborationGoal(data: {
    id: number;
    goalName?: string;
    goalDescription?: string;
    ownerEmployeeId?: number;
    startDate?: string;
    dueDate?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/goals`, data));
  }

  deleteCollaborationGoal(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/goals`, { params }));
  }

  getCollaborationKeyResults(goalId?: number): Promise<ApiResponse<any>> {
    let params = new HttpParams();
    if (goalId !== undefined) {
      params = params.set('goalId', String(goalId));
    }
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/key-results`, { params }));
  }

  createCollaborationKeyResult(data: {
    goalId: number;
    resultName: string;
    resultDescription?: string;
    resultType: 'numeric' | 'boolean';
    unit: string;
    targetValue?: number | null;
    currentValue?: number | null;
    isAchieved?: boolean | null;
    dueDate?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/key-results`, data));
  }

  updateCollaborationKeyResult(data: {
    id: number;
    goalId?: number;
    resultName?: string;
    resultDescription?: string;
    resultType?: 'numeric' | 'boolean';
    unit?: string;
    targetValue?: number | null;
    currentValue?: number | null;
    isAchieved?: boolean | null;
    dueDate?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/key-results`, data));
  }

  deleteCollaborationKeyResult(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/key-results`, { params }));
  }

  getCollaborationWeeklyProgress(params?: {
    ownerEmployeeId?: number;
    weekStartDate?: string;
  }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams();
    if (params?.ownerEmployeeId !== undefined) {
      httpParams = httpParams.set('ownerEmployeeId', String(params.ownerEmployeeId));
    }
    if (params?.weekStartDate) {
      httpParams = httpParams.set('weekStartDate', params.weekStartDate);
    }
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/weekly-progress`, { params: httpParams }));
  }

  generateCollaborationMeetingTopic(data: {
    meetingNotes?: string;
    actionItems?: string;
    maxLen?: number;
  }): Promise<ApiResponse<{ topic: string }>> {
    return firstValueFrom(
      this.http.post<ApiResponse<{ topic: string }>>(`${this.baseUrl}/collaboration/generate-meeting-topic`, data)
    );
  }

  generateCollaborationFuturePlanTopic(data: {
    content: string;
    maxLen?: number;
  }): Promise<ApiResponse<{ topic: string }>> {
    return firstValueFrom(
      this.http.post<ApiResponse<{ topic: string }>>(`${this.baseUrl}/collaboration/generate-future-plan-topic`, data)
    );
  }

  getCollaborationFuturePlans(params?: {
    keyword?: string;
    ownerEmployeeId?: number;
  }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams();
    if (params?.keyword) {
      httpParams = httpParams.set('keyword', params.keyword);
    }
    if (params?.ownerEmployeeId !== undefined) {
      httpParams = httpParams.set('ownerEmployeeId', String(params.ownerEmployeeId));
    }
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/future-plans`, { params: httpParams }));
  }

  createCollaborationFuturePlan(data: {
    title: string;
    content: string;
    ownerEmployeeId: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/future-plans`, data));
  }

  updateCollaborationFuturePlan(data: {
    id: number;
    title?: string;
    content?: string;
    ownerEmployeeId?: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/future-plans`, data));
  }

  deleteCollaborationFuturePlan(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/future-plans`, { params }));
  }

  createCollaborationWeeklyProgress(data: {
    ownerEmployeeId: number;
    weekStartDate: string;
    weekEndDate: string;
    category?: string;
    progressSummary?: string;
    blockers?: string;
    nextWeekPlan?: string;
    completionRate?: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/weekly-progress`, data));
  }

  updateCollaborationWeeklyProgress(data: {
    id: number;
    ownerEmployeeId?: number;
    weekStartDate?: string;
    weekEndDate?: string;
    category?: string;
    progressSummary?: string;
    blockers?: string;
    nextWeekPlan?: string;
    completionRate?: number;
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/weekly-progress`, data));
  }

  deleteCollaborationWeeklyProgress(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/weekly-progress`, { params }));
  }

  getCollaborationMeetings(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    let httpParams = new HttpParams();
    if (params?.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params?.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/meetings`, { params: httpParams }));
  }

  createCollaborationMeeting(data: {
    meetingDate: string;
    startAt?: string | null;
    endAt?: string | null;
    topic: string;
    meetingNotes?: string;
    decisions?: string;
    actionItems?: string;
    hostEmployeeId?: number | null;
    attendeeEmployeeIds?: number[];
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/meetings`, data));
  }

  updateCollaborationMeeting(data: {
    id: number;
    meetingDate?: string;
    startAt?: string | null;
    endAt?: string | null;
    topic?: string;
    meetingNotes?: string;
    decisions?: string;
    actionItems?: string;
    hostEmployeeId?: number | null;
    attendeeEmployeeIds?: number[];
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/meetings`, data));
  }

  deleteCollaborationMeeting(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/meetings`, { params }));
  }

  getCollaborationAnnouncements(): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.get<ApiResponse<any>>(`${this.baseUrl}/collaboration/announcements`));
  }

  createCollaborationAnnouncement(data: {
    title: string;
    content: string;
    announcedAt?: string;
    announcerEmployeeId?: number | null;
    isActive?: boolean;
    attendeeEmployeeIds?: number[];
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.post<ApiResponse<any>>(`${this.baseUrl}/collaboration/announcements`, data));
  }

  updateCollaborationAnnouncement(data: {
    id: number;
    title?: string;
    content?: string;
    announcedAt?: string;
    announcerEmployeeId?: number | null;
    isActive?: boolean;
    attendeeEmployeeIds?: number[];
  }): Promise<ApiResponse<any>> {
    return firstValueFrom(this.http.put<ApiResponse<any>>(`${this.baseUrl}/collaboration/announcements`, data));
  }

  deleteCollaborationAnnouncement(id: number): Promise<ApiResponse<any>> {
    const params = new HttpParams().set('id', String(id));
    return firstValueFrom(this.http.delete<ApiResponse<any>>(`${this.baseUrl}/collaboration/announcements`, { params }));
  }
}
