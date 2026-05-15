// --- API Response Models (與後端 API 對應的資料結構) ---

/**
 * 流水帳記錄（從後端 API 返回的完整資料）
 */
export interface LedgerEntry {
  entry_id?: number;
  entry_date?: string;
  item_group?: string;
  subject_name?: string;
  amount?: number;
  description?: string;
  invoice_no?: string;
  vendor_id?: number;
  vendor_name?: string;
  vendor_tax_id?: string;
  gl_account_id?: number;
  account_code?: string;
  account_name?: string;
  account_type?: string;
  is_sigh_off?: boolean;
  created_at?: string;
  updated_at?: string;
  updated_editor?: string;
  
  // 為了相容性，允許使用舊欄位名稱（用於前端假資料）
  date?: string;
  category?: string;
  income?: number;
  expense?: number;
}

/**
 * 會計科目（GL Account）
 */
export interface GLAccount {
  gl_account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  level: number;
  parent_account_id?: number | null; // 一級科目則為 null，二級及以上會有值
  created_at: string;
  updated_at: string;
}

/**
 * 收入分類詳情 - 用於表示收入中的銷貨收入和其他收入
 */
export interface RevenueBreakdown {
  salesRevenue: Record<number, number> & { total: number }; // 銷貨收入
  otherRevenue: Record<number, number> & { total: number }; // 其他收入
}

/**
 * 支出分類詳情 - 用於表示支出中的商品和雜項變動
 */
export interface ExpenseBreakdown {
  merchandise: Record<number, number> & { total: number }; // 商品：存貨-餐飲、存貨-酒水、存貨-雪茄
  miscellaneous: Record<number, number> & { total: number }; // 雜項變動：所有營業費用項目加總
}

/**
 * 未付分類詳情 - 用於表示未付款項的各種類型
 */
export interface UnpaidBreakdown {
  accountsPayable: Record<number, number> & { total: number }; // 應付帳款
  payableForRenovation: Record<number, number> & { total: number }; // 應付裝潢款
  payableSalary: Record<number, number> & { total: number }; // 應付薪資
  payableShareholderRebate: Record<number, number> & { total: number }; // 應付股東回饋金
  payableForGoods: Record<number, number> & { total: number }; // 應付貨款
}

/**
 * 年度總表報告（財務報表總表）
 * 包含收入、支出和未付的詳細分類
 */
export interface AnnualSummaryReport {
  years: number[];
  revenue: Record<number, number> & { total: number };
  salesDiscount?: Record<number, number> & { total: number }; // 新增：銷貨折讓（減項）
  revenueBreakdown?: RevenueBreakdown; // 收入詳細分類（可選，用於顯示銷貨收入和其他收入）
  expense: Record<number, number> & { total: number };
  expenseBreakdown?: ExpenseBreakdown; // 支出詳細分類（可選，用於顯示商品和雜項變動）
  net: Record<number, number> & { total: number };
  unpaid: Record<number, number> & { total: number };
  unpaidBreakdown?: UnpaidBreakdown; // 未付詳細分類（可選，用於顯示各種未付款項）
}

/**
 * 月度明細報告（點擊總表數字後顯示）
 */
export type MonthlyDetailReport = {
  year: number;
  type: string;
  data: Array<{
    month: number;
    total: number;
    items: Array<{
      name: string;
      amount: number;
    }>;
  }>;
};

// --- Original UI Models (保留原有的前端顯示用資料結構) ---

export interface PurchaseEntry {
  date: string;
  category: string;
  amount: number;
}

export interface POSSale {
  transactionId: string;
  customerId: string;
  date: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  totalPurchases: number;
  totalAllowance: number;
}

export interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
  accountsPayable: number;
}

export interface ExpenseByCategory {
  category: string;
  amount: number;
}

export interface PurchaseByCategory {
  category: string;
  amount: number;
}

export interface TopProduct {
    name: string;
    quantitySold: number;
    revenue: number;
}

export interface ProductAnalysis {
    name: string;
    category: string;
    quantitySold: number;
    revenue: number;
    avgPrice: number;
    revenueShare: number;
}

// --- Detailed Financial Statement Models ---

export interface ReportLineItem {
  account: string;
  amount: number;
}

export interface IncomeStatement {
  operatingRevenue: {
    items: ReportLineItem[];
    total: number;
  };
  operatingExpenses: {
    items: ReportLineItem[];
    total: number;
  };
  netIncome: number;
}

export interface BalanceSheet {
  assets: {
    items: ReportLineItem[];
    total: number;
  };
  liabilities: {
    items: ReportLineItem[];
    total: number;
  };
  equity: {
    items: ReportLineItem[];
    total: number;
  };
  totalLiabilitiesAndEquity: number;
}

// --- New Monthly Report Models ---

export interface MonthlyReportLineItem {
  account: string;
  // Key is month string 'YYYY-MM', value is the amount for that month
  monthlyAmounts: { [month: string]: number };
  total: number; // For balance sheet, this is the end-of-period value. For income statement, it's the sum.
  percentage?: number; 
}

export interface MonthlyReportSection {
  items: MonthlyReportLineItem[];
  // Key is month string 'YYYY-MM', value is the total for that month
  monthlyTotals: { [month: string]: number };
  grandTotal: number; // Same logic as 'total' above
}

export interface MonthlyBalanceSheetReport {
  months: string[]; // An ordered array of month strings, e.g., ['2026-01', '2026-02']
  assets: MonthlyReportSection;
  liabilities: MonthlyReportSection;
  equity: MonthlyReportSection;
  totalLiabilitiesAndEquity: MonthlyReportSection;
}

export interface MonthlyIncomeStatementReport {
  months: string[];
  operatingRevenue: MonthlyReportSection;
  operatingExpenses: MonthlyReportSection;
  netIncome: {
    monthlyTotals: { [month: string]: number };
    grandTotal: number;
  };
}


// --- New Models for Monthly Product Analysis Report ---

export interface MonthlyProductMetrics {
  quantitySold: number;
  revenue: number;
  revenueShare: number; // Share of that month's total revenue
  costRate: number;     
}

export interface ProductAnalysisRow {
  name: string;
  category: string;
  totalRevenue: number;
  totalQuantity: number;
  totalRevenueShare: number; // Share of grand total revenue
  monthlyMetrics: { [month: string]: MonthlyProductMetrics };
}

export interface ProductCategoryGroup {
  category: string;
  products: ProductAnalysisRow[];
  subtotal: ProductAnalysisRow; // A special row for subtotals
}

export interface ProductAnalysisReport {
    months: string[]; // An ordered array of month strings, e.g., ['2026-01', '2026-02']
    categoryGroups: ProductCategoryGroup[];
    grandTotal: ProductAnalysisRow; // A special row for the grand total
}

// --- New Model for Ledger Transactions ---

export type TransactionItem = '資產' | '負債' | '業主權益' | '營業收入' | '營業費用';

export interface TransactionEntry {
  id: string; 
  date: string;
  item: TransactionItem;
  category: string; // 科目
  amount: number; // 總金額 (+ for income/revenue, - for expense/asset purchase)
  invoiceNumber?: string;
  vendorTaxId?: string;
  vendorName?: string;
  description?: string;
  approved: boolean; // 簽核
}

// --- New Model for Events ---

export type EventStatus = 'active' | 'pending' | 'cancelled';

export type ReminderStatus = 'active' | 'pending' | 'cancelled';

export interface ReminderEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string | null;
  category?: string | null;
  event: string; // 事件
  status?: ReminderStatus | string | null;
}

export interface EventEntry {
  id: string;
  type: string; // 類型
  status: EventStatus;
  useSpace?: string;
  date: string; // YYYY-MM-DD
  time?: string;
  name: string; // 名稱
  organizer?: string; // 介紹人
  attendees: string; // 人數, as string to support ranges like '10~15'
  estimatedRevenue: number;
  deposit?: number;
  actualRevenue: number;
  notes?: string;
}

// --- New Model for Holidays ---
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

// --- New Model for Daily Revenue ---
export interface DailyRevenueEntry {
  date: string; // YYYY-MM-DD
  nonEventRevenue: number;
  isDayOff: boolean;
}

// --- Models for Daily Revenue from POS ---
export interface DailyAccountRecord {
  dailyUuid: string;
  type: string; // 'daily' or 'close'
  timestamp: string;
  timestampText: string;
  manager: string;
  totalAmount: number;
  cancelledInvoiceCount: number;
  shortAmount: number;
}

export interface DailyRevenueReport {
  day: number;
  date: string;
  totalRevenue: number;
  cancelledInvoiceCount: number;
  shortAmount: number;
  recordCount: number;
  records: DailyAccountRecord[];
}

export interface MonthlyRevenueResponse {
  year: number;
  month: number;
  dailyReports: DailyRevenueReport[];
  summary: {
    totalRevenue: number;
    totalCancelledInvoices: number;
    totalShortAmount: number;
    workingDays: number;
  };
}

// --- New Models for Payroll ---

export type EmployeeType = 'part-time' | 'full-time';

export interface Employee {
  id: string;
  name: string;
  type: EmployeeType;
  hourlyRate?: number;
  monthlySalary?: number;
}

export interface PunchRecord {
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null; // HH:mm
  clockOut: string | null; // HH:mm
  isDoublePay: boolean;
}

export interface ShiftScheduleEntry {
  id: string;
  employee_id?: number | null;
  employee_name: string;
  employee_type: 'full-time' | 'part-time';
  date: string;
  start_time: string;
  end_time: string;
  estimated_hourly_rate?: number | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface ShiftUnavailabilityEntry {
  id: string;
  employee_id?: number | null;
  employee_name: string;
  date: string;
  is_all_day: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
  is_active?: boolean;
}

export interface ShiftAiImportedScheduleDraft {
  employee_id?: number | null;
  employee_name: string;
  employee_type: 'full-time' | 'part-time';
  date: string;
  start_time: string;
  end_time: string;
  estimated_hourly_rate?: number | null;
  notes?: string | null;
  raw_alias?: string | null;
  matched?: boolean;
  enabled?: boolean;
}

export interface ShiftAiImportedUnavailabilityDraft {
  employee_id?: number | null;
  employee_name: string;
  date: string;
  is_all_day: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
  raw_alias?: string | null;
  matched?: boolean;
  enabled?: boolean;
}

export interface ShiftAiImportAnalysisResult {
  filename?: string;
  month?: number | null;
  year?: number | null;
  schedules: ShiftAiImportedScheduleDraft[];
  unavailability: ShiftAiImportedUnavailabilityDraft[];
  warnings?: string[];
}

// --- New Models for Purchasing & Vendors ---

/**
 * 廠商資料（與後端 API 對應）
 * 支援新格式（vendor_id, vendor_name）和舊格式（id, name）以保持向後相容
 */
export interface Vendor {
  // 新格式（來自後端 API）
  vendor_id?: string | number;
  vendor_name?: string;
  created_at?: string;
  updated_at?: string;
  
  // 舊格式（前端組件使用）
  id?: string | number;
  name?: string;
  
  // 共用欄位
  tax_id?: string;
  taxId?: string;  // 相容舊名稱
  category?: string;
  aliases?: string[];
  contact_info?: string;
  contactInfo?: string;  // 相容舊名稱
  rest_days?: string[];
  restDays?: string;  // 相容舊名稱
  remark?: string;
}

export interface PurchaseOrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  date: string; // YYYY-MM-DD
  items: PurchaseOrderItem[];
  totalAmount: number;
}

// --- New Model for Product Cost ---
export interface ProductCost {
  id: string;
  productId: string; // 商品編號
  productName: string; // 商品名稱
  vendorId: string;
  category: string; // 品項
  itemQuantity: number; // 細項數量
  itemUnit: string; // 細項單位 (ml, g)
  totalUnit: string; // 總單位 (瓶, 包)
  price: number; // 價格
  notes?: string; // 備註
}

export interface CigarCost {
  id: string;
  brand: string;
  productName: string;
  size: string;
  quantityPerBox: number;
  lishengCost: number; // 理晟成本
  baijiaCost: number; // 百泇進貨成本
  sellingPrice: number;
}

export interface WineCost {
  id: string;
  vendor: string; // 廠商
  productName: string;
  type: string; // 類型
  cost: number; // 進貨成本
  sellingPrice: number; // 售價
}


// --- New Models for Customer Management ---
export type Gender = '男性' | '女性' | '其他';

export interface CustomerFeedback {
  id: string;
  customerId: string;
  date: string; // YYYY-MM-DD
  rating: number; // 1-5
  comment: string;
}

// --- New Models for Product Gross Margin Report ---
export interface GrossMarginCategorySummary {
  totalPurchases: number;
  totalSales: number;
  grossMargin: number;
  grossMarginRate: number;
}

export interface MonthlySalesRow {
  month: string; // 'YYYY/MM'
  dining: number;
  drinks: number;
  cigars: number;
  venue: number;
  total: number;
}

export interface ProductGrossMarginReport {
  summary: {
    dining: GrossMarginCategorySummary;
    drinks: GrossMarginCategorySummary;
    cigars: GrossMarginCategorySummary;
    venue: GrossMarginCategorySummary;
    total: GrossMarginCategorySummary;
  };
  monthlySales: MonthlySalesRow[];
}

// --- New Model for Shareholder Rebates ---
export interface ShareholderRebate {
  name: string;
  currentMonthRebate: number;
  unpaidRebate: number;
  cumulativeRebate: number;
}

// --- New Model for Shareholder Rebate Details ---
export interface RebateTransaction {
  id: string;
  shareholderName: string;
  checkoutTime: string; // 'YYYY/MM/DD HH:mm:ss'
  discountDetails: string;
  invoiceAmount: number;
  rebatePercentage: number;
  rebateAmount: number;
  discountUsed: string;
  isEdited?: boolean;
}

// --- New Models for Goal Progress ---
export type GoalStatus = '進行中' | '已完成' | '落後' | '已擱置';

export interface KeyResult {
  id: string;
  description: string;
  isCompleted: boolean;
}

export interface Goal {
  id: string;
  title: string;
  ownerId: string;
  dueDate: string; // YYYY-MM-DD
  status: GoalStatus;
  progress: number; // 0-100
  keyResults: KeyResult[];
  period: 'monthly' | 'weekly';
}

// --- New Models for User Management ---
export type UserRole = '超級管理員' | '管理員' | '財務' | '營運';
export type UserStatus = '啟用' | '停用';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLogin: string; // YYYY-MM-DD HH:mm
}

// --- New Models for Goal Setting ---
export type TargetGoalType = '店內' | '財務' | '活動' | '行銷' | '系統' | '會員' | '加盟' | '營收' | '顧客' | '其他';
export type TargetGoalStatus = '進行中' | '已達成' | '未達成';

export interface TargetGoal {
  id: string;
  title: string;
  type: TargetGoalType;
  targetValue: number;
  currentValue: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: TargetGoalStatus;
  unit: string; // e.g., '元', '場', '人'
  assigneeId?: string;
  period: 'monthly' | 'yearly';
}
// --- Customer Models (顧客管理) ---

/**
 * 顧客資料（從 pos.members 表映射而來）
 * 對應欄位映射：
 *   member_uuid → id
 *   name → name
 *   mobile → phone
 *   gender → gender
 *   birth/birth_year → birthday/birthYear
 *   loyalty_points → loyaltyPoints
 *   origin_store_name → originStore
 *   last_checkout_at → lastCheckoutAt
 */
export interface Customer {
  id: string; // member_uuid
  name: string; // 顧客名稱
  phone: string | null; // 行動電話
  note: string | null; // 備註
  gender: string | null; // 性別
  birthday: string | null; // 生日 (MM/DD格式)
  birthYear: string | null; // 出生年份
  loyaltyPoints: number; // 積分點數
  originStore: string | null; // 原始門店
  lastCheckoutAt: string | null; // 最後結帳時間 (ISO 8601格式)
  isDeleted: boolean; // 是否已刪除
}

/**
 * 顧客列表API響應
 */
export interface CustomerListResponse {
  success: boolean;
  data: Customer[];
  total: number; // 符合條件的總顧客數
  count: number; // 本次返回的顧客數
  offset: number; // 分頁偏移量
  limit: number; // 單頁限制數量
}

// --- Product Sales Models (商品銷售) ---

/**
 * 商品銷售摘要資料（從 pos.item_sales_summary 表映射而來）
 * 每一筆記錄代表一個商品在某個月的銷售數據
 */
export interface ItemSalesSummary {
  itemUuid: string; // 商品唯一識別符
  reportMonth: string; // 報表月份 (YYYY-MM)
  itemName: string; // 商品名稱
  type: string; // 商品類型 (item/combo)
  categoryUuid: string; // 分類唯一識別符
  categoryName: string; // 分類名稱 (餐飲/酒水/雪茄/其他)
  salesAmount: number; // 銷售金額 (該商品該月營收)
  salesNumber: number; // 銷售數量 (售出件數)
  averagePrice: number; // 平均單價 (金額/數量)
  orderRate: number; // 點單率 (%)
  salesNumberRate: number; // 數量占比 (%)
  salesNumberRank: number; // 數量排名
  salesAmountRate: number; // 金額占比 (%)
  salesAmountRank: number; // 金額排名
  hasNameChanged: boolean; // 名稱是否變更
}

/**
 * 分類銷售摘要資料（聚合）
 * 將同分類的商品銷售數據聚合展示
 */
export interface CategorySalesSummary {
  categoryName: string; // 分類名稱
  categoryUuid: string; // 分類唯一識別符
  reportMonth: string; // 報表月份
  salesAmount: number; // 該分類總銷售金額
  salesNumber: number; // 該分類總銷售數量
  averagePrice: number; // 該分類平均單價
  orderRate: number; // 該分類點單率
  salesNumberRate: number; // 該分類數量占比
  salesAmountRate: number; // 該分類金額占比
  items: ItemSalesSummary[]; // 該分類下所有商品
}

/**
 * 商品銷售查詢API響應
 */
export interface ProductSalesResponse {
  success: boolean;
  data: ItemSalesSummary[]; // 商品銷售列表
  categories: CategorySalesSummary[]; // 按分類分組的銷售數據
  total: number; // 符合條件的總商品數
  count: number; // 本次返回的商品數
  offset: number; // 分頁偏移量
  limit: number; // 單頁限制數量
  startMonth: string; // 查詢起始月份
  endMonth: string; // 查詢結束月份
}

// ─────────────────────────────────────────────────────────────
// 進貨單資料模型

/**
 * 進貨單項目資料（來自 vendor.shipment_items 表）
 * 包含進貨的單一品項資訊
 */
export interface ShipmentItem {
  shipment_id: number; // 進貨單項目 ID
  entryId?: number | null; // 對應流水帳 entry_id（可選）
  issueDate: string; // 開立日期 (YYYY-MM-DD)
  vendorId: number; // 廠商 ID
  vendorName: string; // 廠商名稱
  documentNo: string | null; // 單據編號
  itemName: string; // 品項名稱
  qty: number | null; // 數量
  unitPrice: number | null; // 單價
  unit: string | null; // 單位（瓶、盒、包等）
  lineAmount: number | null; // 小計（數量 × 單價）
  remark: string | null; // 備註
  createdAt: string; // 建立時間
  updatedAt: string; // 更新時間
}

/**
 * 進貨單 API 回應
 */
export interface ShipmentItemsResponse {
  success: boolean; // 是否成功
  data?: ShipmentItem[]; // 進貨單項目陣列
  error?: string; // 錯誤訊息
  total?: number; // 符合條件的總記錄數
  count?: number; // 本次返回的記錄數
}

export interface PurchaseOrderAiScanFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdDateTime: string;
}

export interface PurchaseOrderAiImportRow {
  fileId: string;
  fileName: string;
  success: boolean;
  reason?: string;
  invoiceNo?: string;
  issueDate?: string;
  vendorName?: string;
  amount?: number;
  itemGroup?: string;
  subjectName?: string;
  itemCount?: number;
  movedTo?: string;
}

export interface PurchaseOrderAiImportResult {
  total: number;
  successCount: number;
  failedCount: number;
  rows: PurchaseOrderAiImportRow[];
}
