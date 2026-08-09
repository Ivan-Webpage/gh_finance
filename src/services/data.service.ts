
import { Injectable, inject, signal } from '@angular/core';
// FIX: Added `MonthlySalesRow` to the import list to resolve a type error.
import { LedgerEntry, POSSale, FinancialSummary, MonthlyData, ExpenseByCategory, TopProduct, ProductAnalysis, PurchaseEntry, PurchaseByCategory, IncomeStatement, BalanceSheet, ReportLineItem, MonthlyBalanceSheetReport, MonthlyIncomeStatementReport, MonthlyReportSection, MonthlyReportLineItem, ProductAnalysisReport, ProductAnalysisRow, MonthlyProductMetrics, ProductCategoryGroup, TransactionEntry, TransactionItem, EventEntry, DailyRevenueEntry, Employee, PunchRecord, Vendor, PurchaseOrder, ProductCost, Customer, CustomerFeedback, Gender, CigarCost, WineCost, AnnualSummaryReport, MonthlyDetailReport, ProductGrossMarginReport, MonthlySalesRow, ShareholderRebate, RebateTransaction, User, TargetGoal } from '../models/financial.model';
import { of, firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DataService {
  private apiService = inject(ApiService);
  // 注意：此服務使用模擬數據。在真實應用中，您需要在此處實作 Google API 客戶端，
  // 從 Google Sheets 和 Drive 獲取資料。這將涉及處理 OAuth 2.0 身份驗證。
  // 目前的數據已根據您的需求進行客製化，以提供更真實的體驗。
  
  private mockTargetGoals = signal<TargetGoal[]>([
    { id: 'TG001', title: '八月總營收目標', type: '營收', targetValue: 350000, currentValue: 289190, startDate: '2024-08-01', endDate: '2024-08-31', status: '進行中', unit: '元', assigneeId: 'USR002', period: 'monthly' },
    { id: 'TG002', title: '十月活動場次', type: '活動', targetValue: 15, currentValue: 13, startDate: '2024-10-01', endDate: '2024-10-31', status: '進行中', unit: '場', assigneeId: 'USR003', period: 'monthly' },
    { id: 'TG003', title: '第三季 VIP 顧客增長', type: '顧客', targetValue: 10, currentValue: 12, startDate: '2024-07-01', endDate: '2024-09-30', status: '已達成', unit: '人', assigneeId: 'USR003', period: 'monthly' },
    { id: 'TG004', title: '第四季顧客滿意度提升', type: '顧客', targetValue: 5, currentValue: 4, startDate: '2024-10-01', endDate: '2024-12-31', status: '進行中', unit: '分', period: 'monthly' },
    { id: 'TG005', title: '2024年年度總營收', type: '營收', targetValue: 4000000, currentValue: 2850000, startDate: '2024-01-01', endDate: '2024-12-31', status: '進行中', unit: '元', period: 'yearly' },
    { id: 'TG006', title: '2024年總活動場次', type: '活動', targetValue: 100, currentValue: 85, startDate: '2024-01-01', endDate: '2024-12-31', status: '進行中', unit: '場', assigneeId: 'USR003', period: 'yearly' },
  ]);
  
  private mockEvents = signal<EventEntry[]>([
    { id: 'EVT001', type: '宴客', status: 'active', date: '2024-10-03', name: '勞倫斯', attendees: '10~15', estimatedRevenue: 19000, actualRevenue: 20980, notes: '酒商費: 9600/餐點: 人600' },
    { id: 'EVT002', type: '皮卡', status: 'active', date: '2024-10-04', time: '14:30~18:30', name: '卡牌', attendees: '10~15', estimatedRevenue: 8000, actualRevenue: 8540 },
    { id: 'EVT003', type: '商務、店內', status: 'active', date: '2024-10-07', name: '漫霧', attendees: '6', estimatedRevenue: 4200, actualRevenue: 4900, notes: '是否調整' },
    { id: 'EVT004', type: '宴客', status: 'active', date: '2024-10-13', name: 'Dave', attendees: '8~10', estimatedRevenue: 15000, actualRevenue: 24080, notes: '8000/中式' },
    { id: 'EVT005', type: '皮卡', status: 'active', date: '2024-10-14', time: '14:30~18:00', name: 'TCBA', organizer: '皮卡', attendees: '8', estimatedRevenue: 4000, actualRevenue: 4000, notes: '人/530' },
    { id: 'EVT006', type: '店內', status: 'cancelled', date: '2024-10-17', name: '烈酒品酒會', attendees: '0', estimatedRevenue: 0, actualRevenue: 0 },
    { id: 'EVT007', type: '維綸', status: 'active', date: '2024-10-18', time: '晚上18:00後', name: 'slp創業學院', attendees: '70', estimatedRevenue: 70000, deposit: 21000, actualRevenue: 77640, notes: '訂金已收' },
    { id: 'EVT008', type: '紅白聯誼', status: 'active', date: '2024-10-19', time: '14:00~17:00', name: '小瑜', attendees: '7', estimatedRevenue: 36000, actualRevenue: 7000, notes: '酒商費: 12000~14000/人數: 男女對半 小瑜抽500元/人' },
    { id: 'EVT009', type: '店內', status: 'active', date: '2024-10-22', name: '紅白酒品會', attendees: '4', estimatedRevenue: 15000, actualRevenue: 6000, notes: '酒商費: 12000 費用: 1,500元/人 4隻酒/搭配風味食物' },
    { id: 'EVT010', type: '活動', status: 'cancelled', date: '2024-10-23', time: '19:00~22:00', name: 'Scott', organizer: 'Scott', attendees: '0', estimatedRevenue: 0, actualRevenue: 0, notes: '1人/400' },
    { id: 'EVT011', type: '維綸', status: 'active', date: '2024-10-25', time: '晚上18:00後', name: 'slp創業學院', attendees: '55', estimatedRevenue: 70000, deposit: 21000, actualRevenue: 74010, notes: '訂金已收' },
    { id: 'EVT012', type: 'Laurence', status: 'active', date: '2024-10-26', time: '下午開幕', name: '公司開幕', attendees: '30', estimatedRevenue: 10000, actualRevenue: 10000 },
    { id: 'EVT013', type: '股東會', status: 'active', date: '2024-10-28', name: '股東會', attendees: '5', estimatedRevenue: 0, actualRevenue: 0 },
    { id: 'EVT014', type: '客戶', status: 'active', date: '2024-10-29', name: 'Connyn', attendees: '20~25', estimatedRevenue: 15000, actualRevenue: 15000, notes: '菜: 15000' },
    { id: 'EVT015', type: '皮卡', status: 'active', date: '2024-10-30', time: '晚上18:00後', name: '卡牌', organizer: '皮卡', attendees: '8', estimatedRevenue: 4000, actualRevenue: 12890 },
    { id: 'EVT016', type: '店內', status: 'active', date: '2024-10-31', name: '漫霧', attendees: '6', estimatedRevenue: 8400, actualRevenue: 4900 },
    // New events for August 2024 to match the daily revenue image
    { id: 'EVT017', type: '商務', status: 'active', date: '2024-08-01', name: '漫霧', attendees: '20', estimatedRevenue: 20000, actualRevenue: 21450 },
    { id: 'EVT018', type: '私人', status: 'active', date: '2024-08-09', name: '啟帆', attendees: '5', estimatedRevenue: 2000, actualRevenue: 1900 },
    { id: 'EVT019', type: '私人', status: 'active', date: '2024-08-13', name: '啟帆', attendees: '10', estimatedRevenue: 0, actualRevenue: 0 }, // No revenue on this day
    { id: 'EVT020', type: '宴客', status: 'active', date: '2024-08-14', name: 'vic / jackle', attendees: '15', estimatedRevenue: 18000, actualRevenue: 20000 },
    { id: 'EVT021', type: '商務', status: 'active', date: '2024-08-22', name: '漫霧', attendees: '12', estimatedRevenue: 10000, actualRevenue: 10155 },
    { id: 'EVT022', type: '私人', status: 'active', date: '2024-08-27', name: '啟帆', attendees: '8', estimatedRevenue: 8000, actualRevenue: 9300 },
    { id: 'EVT023', type: '品酒會', status: 'active', date: '2024-08-28', name: '內部品酒', attendees: '10', estimatedRevenue: 10000, actualRevenue: 10700 },
  ]);

  private mockDailyRevenue = signal<DailyRevenueEntry[]>([
    { date: '2024-08-01', nonEventRevenue: 10520, isDayOff: false },
    { date: '2024-08-02', nonEventRevenue: 3340, isDayOff: false },
    { date: '2024-08-03', nonEventRevenue: 970, isDayOff: false },
    { date: '2024-08-04', nonEventRevenue: 0, isDayOff: true },
    { date: '2024-08-05', nonEventRevenue: 200, isDayOff: false },
    { date: '2024-08-06', nonEventRevenue: 0, isDayOff: false },
    { date: '2024-08-07', nonEventRevenue: 0, isDayOff: false },
    { date: '2024-08-08', nonEventRevenue: 17950, isDayOff: false },
    { date: '2024-08-09', nonEventRevenue: 6800, isDayOff: false }, // 8700 total - 1900 event
    { date: '2024-08-10', nonEventRevenue: 8410, isDayOff: false },
    { date: '2024-08-11', nonEventRevenue: 0, isDayOff: true },
    { date: '2024-08-12', nonEventRevenue: 8970, isDayOff: false },
    { date: '2024-08-13', nonEventRevenue: 14900, isDayOff: false },
    { date: '2024-08-14', nonEventRevenue: 14130, isDayOff: false }, // 34130 total - 20000 event
    { date: '2024-08-15', nonEventRevenue: 23630, isDayOff: false },
    { date: '2024-08-16', nonEventRevenue: 10740, isDayOff: false },
    { date: '2024-08-17', nonEventRevenue: 6090, isDayOff: false },
    { date: '2024-08-18', nonEventRevenue: 0, isDayOff: true },
    { date: '2024-08-19', nonEventRevenue: 7500, isDayOff: false },
    { date: '2024-08-20', nonEventRevenue: 1860, isDayOff: false },
    { date: '2024-08-21', nonEventRevenue: 700, isDayOff: false },
    { date: '2024-08-22', nonEventRevenue: -845, isDayOff: false }, // 9310 total - 10155 event
    { date: '2024-08-23', nonEventRevenue: 36100, isDayOff: false },
    { date: '2024-08-24', nonEventRevenue: 3140, isDayOff: false },
    { date: '2024-08-25', nonEventRevenue: 0, isDayOff: true },
    { date: '2024-08-26', nonEventRevenue: 2180, isDayOff: false },
    { date: '2024-08-27', nonEventRevenue: 4720, isDayOff: false }, // 14020 total - 9300 event
    { date: '2024-08-28', nonEventRevenue: 17600, isDayOff: false }, // 28300 total - 10700 event
    { date: '2024-08-29', nonEventRevenue: 18560, isDayOff: false },
    { date: '2024-08-30', nonEventRevenue: 11500, isDayOff: false },
    { date: '2024-08-31', nonEventRevenue: 4850, isDayOff: false },
  ]);

  private mockEmployees = signal<Employee[]>([
    { id: 'EMP001', name: '王小明', type: 'full-time', monthlySalary: 55000 },
    { id: 'EMP002', name: '陳美麗', type: 'full-time', monthlySalary: 62000 },
    { id: 'EMP003', name: '李大衛', type: 'part-time', hourlyRate: 200 },
    { id: 'EMP004', name: '張佳玲', type: 'part-time', hourlyRate: 200 },
    { id: 'EMP005', name: '黃志強', type: 'part-time', hourlyRate: 200 },
  ]);
  
  private mockPunchRecords = signal<PunchRecord[]>([
    // --- 李大衛 (EMP003) ---
    { employeeId: 'EMP003', date: '2024-08-01', clockIn: '10:00', clockOut: '18:30', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-02', clockIn: '10:05', clockOut: '17:55', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-05', clockIn: '14:00', clockOut: '22:15', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-06', clockIn: '13:58', clockOut: '22:05', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-08', clockIn: '10:00', clockOut: '14:00', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-09', clockIn: '09:55', clockOut: '18:00', isDoublePay: true }, // Double pay
    { employeeId: 'EMP003', date: '2024-08-12', clockIn: '10:00', clockOut: '18:00', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-13', clockIn: '10:00', clockOut: '18:00', isDoublePay: false },
    { employeeId: 'EMP003', date: '2024-08-15', clockIn: '10:00', clockOut: null, isDoublePay: false }, // Missing clock out
    { employeeId: 'EMP003', date: '2024-08-16', clockIn: '14:00', clockOut: '22:00', isDoublePay: false },
    
    // --- 張佳玲 (EMP004) ---
    { employeeId: 'EMP004', date: '2024-08-01', clockIn: '18:00', clockOut: '22:00', isDoublePay: false },
    { employeeId: 'EMP004', date: '2024-08-03', clockIn: '18:00', clockOut: '22:30', isDoublePay: false },
    { employeeId: 'EMP004', date: '2024-08-07', clockIn: '17:55', clockOut: '22:01', isDoublePay: false },
    { employeeId: 'EMP004', date: '2024-08-10', clockIn: '17:30', clockOut: '22:30', isDoublePay: false },
    { employeeId: 'EMP004', date: '2024-08-14', clockIn: '18:00', clockOut: '22:00', isDoublePay: false },
    { employeeId: 'EMP004', date: '2024-08-17', clockIn: '18:00', clockOut: '22:00', isDoublePay: false },
    
    // --- 黃志強 (EMP005) ---
    { employeeId: 'EMP005', date: '2024-08-20', clockIn: '12:00', clockOut: '20:00', isDoublePay: false },
    { employeeId: 'EMP005', date: '2024-08-21', clockIn: '12:05', clockOut: '20:08', isDoublePay: false },
    { employeeId: 'EMP005', date: '2024-08-22', clockIn: null, clockOut: '20:00', isDoublePay: false }, // Missing clock in
    { employeeId: 'EMP005', date: '2024-08-24', clockIn: '11:58', clockOut: '20:03', isDoublePay: false },
  ]);

  private mockTransactions = signal<TransactionEntry[]>([
    { id: 'TXN001', date: '2025-12-16', item: '負債', category: '應付雪茄進貨', amount: -66350, approved: true },
    { id: 'TXN002', date: '2025-12-17', item: '營業收入', category: '-銷或折讓', amount: 0, approved: true },
    { id: 'TXN003', date: '2025-12-17', item: '營業收入', category: '銷貨收入', amount: 1150, approved: false },
    { id: 'TXN004', date: '2025-12-17', item: '資產', category: '營業設備', amount: -295, vendorName: '蝦皮', description: '可麗露烤盤', approved: true },
    { id: 'TXN005', date: '2025-12-18', item: '營業收入', category: '-銷或折讓', amount: -2862, approved: true },
    { id: 'TXN006', date: '2025-12-18', item: '營業收入', category: '銷貨收入', amount: 17440, approved: true },
    { id: 'TXN007', date: '2025-12-19', item: '營業收入', category: '-銷或折讓', amount: -191, approved: true },
    { id: 'TXN008', date: '2025-12-19', item: '營業費用', category: '文具用品', amount: -100, vendorTaxId: '14713177', vendorName: '金吉刻印行', approved: true },
    { id: 'TXN009', date: '2025-12-19', item: '營業費用', category: '文具用品', amount: -7, invoiceNumber: 'VF-79457330', vendorTaxId: '90113315', vendorName: '全方位數位輸出有限公司南京東路分公司', approved: true },
    { id: 'TXN010', date: '2025-12-19', item: '營業費用', category: '文具用品', amount: -114, invoiceNumber: 'UB-05014356', vendorTaxId: '97616452', vendorName: '全聯福利中心', approved: false },
    { id: 'TXN011', date: '2025-12-19', item: '資產', category: '存貨-酒水', amount: -5580, vendorName: '添潤洋行', approved: true },
    { id: 'TXN012', date: '2025-12-19', item: '資產', category: '存貨-餐飲', amount: -189, invoiceNumber: '12170425', vendorName: '親民食品有限公司', approved: true },
    { id: 'TXN013', date: '2025-12-19', item: '資產', category: '存貨-餐飲', amount: -427, vendorName: '洋華鮮食實業有限公司', approved: true },
    { id: 'TXN014', date: '2025-12-19', item: '資產', category: '存貨-餐飲', amount: -280, invoiceNumber: 'UK88724800', vendorName: '開元食品工業股份有限公司', approved: true },
    { id: 'TXN015', date: '2025-12-19', item: '資產', category: '存貨-餐飲', amount: -45, invoiceNumber: '111412191194', vendorTaxId: '79997612', vendorName: '國豐商行有限公司', approved: true },
    { id: 'TXN016', date: '2025-12-19', item: '資產', category: '存貨-餐飲', amount: -1874, vendorTaxId: '79997612', vendorName: '國豐商行有限公司', approved: true },
    { id: 'TXN017', date: '2025-12-19', item: '營業收入', category: '銷貨收入', amount: 9280, approved: true },
    { id: 'TXN018', date: '2025-12-20', item: '營業收入', category: '-銷或折讓', amount: -4349, approved: false },
    { id: 'TXN019', date: '2025-12-20', item: '營業費用', category: '文具用品', amount: -240, vendorTaxId: '93138304', vendorName: '福寶刻印行', approved: true },
    { id: 'TXN020', date: '2025-12-20', item: '資產', category: '存貨-餐飲', amount: -72, invoiceNumber: 'UB-05015759', vendorTaxId: '97616452', vendorName: '全聯福利中心', approved: true },
    { id: 'TXN021', date: '2025-12-20', item: '資產', category: '存貨-餐飲', amount: -568, invoiceNumber: 'UB-05015750', vendorTaxId: '97616452', vendorName: '全聯福利中心', approved: true },
    { id: 'TXN022', date: '2025-12-20', item: '資產', category: '存貨-餐飲', amount: -160, vendorName: '市場', approved: true },
    { id: 'TXN023', date: '2025-12-20', item: '營業費用', category: '拜拜費用', amount: -198, invoiceNumber: 'UN-74686337', vendorTaxId: '28983777', vendorName: '7-ELEVEN', approved: true },
    { id: 'TXN024', date: '2025-12-20', item: '營業收入', category: '銷貨收入', amount: 25310, approved: true },
    { id: 'TXN025', date: '2025-12-21', item: '營業收入', category: '-銷或折讓', amount: -1612, approved: true },
    { id: 'TXN026', date: '2025-12-21', item: '營業收入', category: '銷貨收入', amount: 14660, approved: true },
    { id: 'TXN027', date: '2025-12-22', item: '營業費用', category: '貸款利息', amount: -3824, approved: true },
    { id: 'TXN028', date: '2025-12-22', item: '營業收入', category: '-銷或折讓', amount: 0, approved: true },
    { id: 'TXN029', date: '2025-12-23', item: '資產', category: '存貨-餐飲', amount: -2020, invoiceNumber: 'SO1412221261', vendorTaxId: '22161107', vendorName: '鼎耀食品股份有限公司', approved: true },
    { id: 'TXN030', date: '2025-12-23', item: '資產', category: '存貨-餐飲', amount: -36, invoiceNumber: 'UB-15207729', vendorTaxId: '97616452', vendorName: '全聯福利中心', approved: false },
    { id: 'TXN031', date: '2025-12-23', item: '資產', category: '存貨-餐飲', amount: -150, invoiceNumber: 'UB-15209268', vendorTaxId: '97616452', vendorName: '全聯福利中心', approved: true },
    { id: 'TXN032', date: '2025-12-23', item: '營業收入', category: '銷貨收入', amount: 2650, approved: true },
  ]);

  private mockVendors = signal<Vendor[]>([
    { id: 'V001', category: '食材', name: '國豐', contactInfo: '業務line @926yleos', restDays: '六、日', taxId: '79997612' },
    { id: 'V002', category: '食材', name: '國成', contactInfo: '(02)8671-9056', restDays: '六、日' },
    { id: 'V003', category: '奶製/雞翅', name: '開元', contactInfo: '業務 MR.辜 0916-250-990', restDays: '六、日', taxId: 'UK88724800'},
    { id: 'V004', category: '冰淇淋', name: '合穀', contactInfo: '(03)3578-130', restDays: '六、日' },
    { id: 'V005', category: '可頌', name: '親民', contactInfo: '(02)2999-9381', restDays: '六、日' },
    { id: 'V006', category: '貝果', name: '布朗主廚', contactInfo: '業務line @928ebhwu', restDays: '六、日' },
    { id: 'V007', category: '蛋糕', name: '西點小舖', contactInfo: '網頁下單, (02)2995-0596', restDays: '二、三、四、六、日' },
    { id: 'V008', category: '酒', name: '利多吉', contactInfo: 'Line', restDays: '日、一' },
    { id: 'V009', category: '酒', name: '九樽', contactInfo: '(02)7728-6670', restDays: '六、日' },
    { id: 'V010', category: '酒', name: '酒鼎', contactInfo: '(02)2578-1515', restDays: '六、日' },
    { id: 'V011', category: '耗材', name: '易達豐', contactInfo: '業務line 0926077730', restDays: '-' },
    { id: 'V012', category: '制服', name: '國豪', contactInfo: '王地義 0932-036356', restDays: '-' },
    { id: 'V013', category: '方冰塊', name: '快樂冰塊', contactInfo: '0932-357-696', restDays: '-' },
    { id: 'V014', category: '菜商', name: '津華', contactInfo: '(02)2307-5255', restDays: '-' },
    { id: 'V015', category: '收廢油', name: '尤加利', contactInfo: '0909-511-256 林奕霖 02-8287 5522', restDays: '二三四六日' },
    { id: 'V016', category: '收廢油', name: '永瑞', contactInfo: '07-6161-580 蔡佳成 0965-659-532', restDays: '須提前安排' },
    { id: 'V017', category: '牛豬肉', name: '美福', contactInfo: '(02)8791-9688', restDays: '六、日, 切肉加1天' },
    { id: 'V018', category: '咖啡豆', name: '上群', contactInfo: '(02)2504-2715', restDays: '六、日' },
    { id: 'V019', category: '海鮮', name: '臻翔', contactInfo: '(02)2223-9647', restDays: '日、一' },
    { id: 'V020', category: '瓦斯', name: '順安', contactInfo: '(02)2765-7778', restDays: '-' },
    { id: 'V021', category: '布', name: '榮冠呢絨', contactInfo: '022556-6668 周榮乾 0931-337-876', restDays: '-' },
    { id: 'V022', category: '食材', name: '鼎耀', contactInfo: 'APP下單, (02) 2910-6111', restDays: '日', taxId: '22161107' },
    { id: 'V023', category: '酒', name: '尚德', contactInfo: 'Line', restDays: '六、日' },
    { id: 'V024', category: '食材', name: 'COSTCO', contactInfo: '自行採買', restDays: '-' },
  ]);

  private mockPurchaseOrders = signal<PurchaseOrder[]>([
    {
      id: 'PO001', poNumber: 'PO-2024-001', vendorId: 'V001', date: '2024-08-05',
      items: [
        { productName: '特級初榨橄欖油', quantity: 10, unitPrice: 350, total: 3500 },
        { productName: '義大利麵', quantity: 20, unitPrice: 80, total: 1600 }
      ],
      totalAmount: 5100
    },
    {
      id: 'PO002', poNumber: 'PO-2024-002', vendorId: 'V009', date: '2024-08-10',
      items: [
        { productName: '波爾多紅酒', quantity: 12, unitPrice: 800, total: 9600 },
        { productName: '夏布利白酒', quantity: 6, unitPrice: 950, total: 5700 }
      ],
      totalAmount: 15300
    },
    {
      id: 'PO003', poNumber: 'PO-2024-003', vendorId: 'V017', date: '2024-08-12',
      items: [
        { productName: '美國 Prime 級肋眼牛排', quantity: 5, unitPrice: 1200, total: 6000 }
      ],
      totalAmount: 6000
    },
  ]);

  private mockProductCosts = signal<ProductCost[]>([
    { id: 'PC001', productId: 'LIQ-001', productName: '告白', vendorId: 'V023', category: '酒水', itemQuantity: 700, itemUnit: 'ml', totalUnit: '瓶', price: 280 },
    { id: 'PC002', productId: 'LIQ-002', productName: '玫瑰啤酒', vendorId: 'V023', category: '酒水', itemQuantity: 700, itemUnit: 'ml', totalUnit: '瓶', price: 420 },
    { id: 'PC003', productId: 'LIQ-003', productName: '橙酒', vendorId: 'V023', category: '酒水', itemQuantity: 700, itemUnit: 'ml', totalUnit: '瓶', price: 520 },
    { id: 'PC004', productId: 'LIQ-004', productName: '金賓威士忌', vendorId: 'V023', category: '酒水', itemQuantity: 700, itemUnit: 'ml', totalUnit: '瓶', price: 330 },
    { id: 'PC005', productId: 'LIQ-005', productName: '牙買加麥斯辣姆酒', vendorId: 'V023', category: '酒水', itemQuantity: 1000, itemUnit: 'ml', totalUnit: '瓶', price: 420 },
    { id: 'PC006', productId: 'LIQ-006', productName: '馬丁尼白香艾酒', vendorId: 'V023', category: '酒水', itemQuantity: 750, itemUnit: 'ml', totalUnit: '瓶', price: 420 },
    { id: 'PC007', productId: 'LIQ-007', productName: 'Kahkua咖啡利口酒', vendorId: 'V023', category: '酒水', itemQuantity: 750, itemUnit: 'ml', totalUnit: '瓶', price: 430 },
    { id: 'PC013', productId: 'FOD-001', productName: '宮保雞丁', vendorId: 'V024', category: '食材', itemQuantity: 1200, itemUnit: 'g', totalUnit: '包', price: 358 },
    { id: 'PC014', productId: 'FOD-002', productName: 'Swiss Delice 72%黑巧克力', vendorId: 'V024', category: '食材', itemQuantity: 216, itemUnit: '顆', totalUnit: '包', price: 879 },
    { id: 'PC015', productId: 'FOD-003', productName: '堅果', vendorId: 'V024', category: '食材', itemQuantity: 1070, itemUnit: 'g', totalUnit: '罐', price: 659 },
    { id: 'PC016', productId: 'LIQ-013', productName: '百加得蘭姆酒', vendorId: 'V024', category: '酒水', itemQuantity: 1000, itemUnit: 'ml', totalUnit: '瓶', price: 469 },
    { id: 'PC017', productId: 'LIQ-014', productName: '美國伏特加', vendorId: 'V024', category: '酒水', itemQuantity: 1750, itemUnit: 'ml', totalUnit: '瓶', price: 375 },
    { id: 'PC018', productId: 'LIQ-015', productName: '科克蘭龍舌蘭酒', vendorId: 'V024', category: '酒水', itemQuantity: 1750, itemUnit: 'ml', totalUnit: '瓶', price: 769 },
    { id: 'PC019', productId: 'LIQ-016', productName: '科克蘭琴酒', vendorId: 'V024', category: '酒水', itemQuantity: 1750, itemUnit: 'ml', totalUnit: '瓶', price: 495 },
    { id: 'PC020', productId: 'LIQ-017', productName: '高登粉紅琴酒', vendorId: 'V024', category: '酒水', itemQuantity: 1000, itemUnit: 'ml', totalUnit: '瓶', price: 549 },
  ]);

  private mockWineCosts = signal<WineCost[]>([
    { id: 'W01', vendor: '尚德', productName: '告白', type: '白氣泡', cost: 280, sellingPrice: 1100 },
    { id: 'W02', vendor: '九樽', productName: 'Primo Amore Moscato Delle Venezie IGT 初戀', type: '甜白', cost: 450, sellingPrice: 1100 },
    { id: 'W03', vendor: '九樽', productName: 'Francois Confuron Gindre Bourgogne (2020)', type: '白酒', cost: 1150, sellingPrice: 2300 },
    { id: 'W04', vendor: '九樽', productName: 'Moet & Chandon', type: '香檳', cost: 1650, sellingPrice: 3500 },
    { id: 'W05', vendor: '九樽', productName: 'McManis Cab. Sau (2022)', type: '紅酒', cost: 550, sellingPrice: 1100 },
    { id: 'W06', vendor: '九樽', productName: 'Botter Cuvee16 Limited Edition Rosso Vino 16樂章', type: '紅酒', cost: 750, sellingPrice: 2200 },
    { id: 'W07', vendor: '九樽', productName: 'Saint-Estephe Calon Segur 卡隆賽格三軍 (2015)', type: '紅酒', cost: 1350, sellingPrice: 3000 },
    { id: 'W08', vendor: '酒鼎', productName: 'Adobe Reserva Sauvignon White (2018)', type: '白酒', cost: 550, sellingPrice: 1600 },
    { id: 'W09', vendor: '酒鼎', productName: 'De Martino Estate Cabernet Sauvignon (2022)', type: '紅酒', cost: 480, sellingPrice: 1800 },
    { id: 'W10', vendor: '酒鼎', productName: 'Adobe Reserva Sauvignon Red (2021)', type: '紅酒', cost: 550, sellingPrice: 1600 },
    { id: 'W11', vendor: '吉多利', productName: 'Santero Dile Moscato sweet天使之手', type: '白氣泡', cost: 285, sellingPrice: 1100 },
    { id: 'W12', vendor: '吉多利', productName: 'Louis Eschenauer 24K Carat Gold Muscat Sparkling', type: '白氣泡', cost: 520, sellingPrice: 1600 },
    { id: 'W13', vendor: '吉多利', productName: 'Joly de Trébuis Réserve Brut Champagne', type: '香檳', cost: 1100, sellingPrice: 2800 },
    { id: 'W14', vendor: '吉多利', productName: 'Dark Horse Cabernet Sauvignon', type: '紅酒', cost: 480, sellingPrice: 1450 },
    { id: 'W15', vendor: '吉多利', productName: 'Domaine Viticole de la Ville de Colmar Signature de Colmar Pinot Noir', type: '紅酒', cost: 630, sellingPrice: 1600 },
    { id: 'W16', vendor: '添潤', productName: 'Glendronach 格蘭多納12年', type: '單一麥芽威士忌', cost: 1150, sellingPrice: 3200 },
    { id: 'W17', vendor: '添潤', productName: 'Aberlour 亞伯樂12年', type: '單一麥芽威士忌', cost: 1100, sellingPrice: 3200 },
    { id: 'W18', vendor: '添潤', productName: 'Laphroaig 拉佛格10年', type: '單一麥芽威士忌', cost: 1050, sellingPrice: 3300 },
    { id: 'W19', vendor: '添潤', productName: 'Fettercairn 費特肯12年', type: '單一麥芽威士忌', cost: 1050, sellingPrice: 3300 },
    { id: 'W20', vendor: '添潤', productName: 'Glenfiddich 格蘭菲迪12年', type: '單一麥芽威士忌', cost: 950, sellingPrice: 3500 },
    { id: 'W21', vendor: '添潤', productName: 'Balvenie 百富12年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3800 },
    { id: 'W22', vendor: '添潤', productName: 'Mortlach 慕赫12年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3800 },
    { id: 'W23', vendor: '添潤', productName: 'Dalmore 大摩12年', type: '單一麥芽威士忌', cost: 1396, sellingPrice: 3900 },
    { id: 'W24', vendor: '添潤', productName: 'Ardbeg 雅柏10年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3900 },
    { id: 'W25', vendor: '添潤', productName: 'Macallan 麥卡倫12年', type: '單一麥芽威士忌', cost: 1650, sellingPrice: 4200 },
    { id: 'W26', vendor: '添潤', productName: 'Hibiki 響', type: '調和威士忌', cost: 2300, sellingPrice: 4900 },
    { id: 'W27', vendor: '添潤', productName: 'Johnnie Walker 約翰走路 黑牌 12年', type: '調和威士忌', cost: 750, sellingPrice: 2100 },
    { id: 'W28', vendor: '添潤', productName: 'Johnnie Walker 約翰走路XR 21年', type: '調和威士忌', cost: 2390, sellingPrice: 4900 },
    { id: 'W29', vendor: '添潤', productName: 'Royal Salute 皇家禮炮', type: '調和威士忌', cost: 2500, sellingPrice: 4900 },
    { id: 'W30', vendor: '大摩', productName: '大摩15', type: '單一麥芽威士忌', cost: 2300, sellingPrice: 5200 },
    { id: 'W31', vendor: '百富', productName: '百富14', type: '單一麥芽威士忌', cost: 1850, sellingPrice: 4200 },
    { id: 'W32', vendor: '慕赫', productName: '慕赫16', type: '單一麥芽威士忌', cost: 2300, sellingPrice: 4900 },
    { id: 'W33', vendor: '百富', productName: '百齡罈30', type: '調和威士忌', cost: 7800, sellingPrice: 14000 },
  ]);

  private mockCigarCosts = signal<CigarCost[]>([
    { id: 'C01', brand: 'Allados', productName: 'Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 340, baijiaCost: 370, sellingPrice: 560 },
    { id: 'C02', brand: 'Allados', productName: 'Toro', size: '6*52', quantityPerBox: 20, lishengCost: 370, baijiaCost: 390, sellingPrice: 780 },
    { id: 'C03', brand: 'Oliva', productName: 'Flor De Oliva Robusto', size: '5*50', quantityPerBox: 25, lishengCost: 255, baijiaCost: 285, sellingPrice: 520 },
    { id: 'C04', brand: 'Oliva', productName: 'Flor De Oliva Toro', size: '6*50', quantityPerBox: 25, lishengCost: 270, baijiaCost: 300, sellingPrice: 580 },
    { id: 'C05', brand: 'Oliva', productName: 'Serie O Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 375, baijiaCost: 405, sellingPrice: 750 },
    { id: 'C06', brand: 'Oliva', productName: 'Serie O Corona', size: '6*46', quantityPerBox: 20, lishengCost: 335, baijiaCost: 365, sellingPrice: 700 },
    { id: 'C07', brand: 'Oliva', productName: 'Serie V Lancero', size: '7*38', quantityPerBox: 24, lishengCost: 415, baijiaCost: 430, sellingPrice: 790 },
    { id: 'C08', brand: 'Oliva', productName: 'Serie V Belicoso', size: '5*54', quantityPerBox: 24, lishengCost: 415, baijiaCost: 445, sellingPrice: 800 },
    { id: 'C09', brand: 'Oliva', productName: 'Serie V DBL.Robusto', size: '5*54', quantityPerBox: 24, lishengCost: 450, baijiaCost: 480, sellingPrice: 820 },
    { id: 'C10', brand: 'Oliva', productName: 'Serie V DBL. Toro', size: '6*60', quantityPerBox: 24, lishengCost: 520, baijiaCost: 550, sellingPrice: 1100 },
    { id: 'C11', brand: 'Oliva', productName: 'Serie V Melanio Figurado', size: '6.5*52', quantityPerBox: 10, lishengCost: 570, baijiaCost: 670, sellingPrice: 1480 },
    { id: 'C12', brand: 'Oliva', productName: 'Serie V Melanio Toro', size: '6.5*52', quantityPerBox: 10, lishengCost: 690, baijiaCost: 790, sellingPrice: 1600 },
    { id: 'C13', brand: 'Oliva', productName: 'Connecticut Res.PETIT Corona', size: '4*38', quantityPerBox: 30, lishengCost: 270, baijiaCost: 300, sellingPrice: 540 },
    { id: 'C14', brand: 'Oliva', productName: 'Master Blender 3 Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 440, baijiaCost: 470, sellingPrice: 950 },
    { id: 'C15', brand: 'Oliva', productName: 'Master Blender 3 Torpedo', size: '6.5*52', quantityPerBox: 10, lishengCost: 490, baijiaCost: 520, sellingPrice: 1000 },
    { id: 'C16', brand: 'Oliva', productName: 'Oliva 135週年紀念', size: '5.5*54', quantityPerBox: 12, lishengCost: 900, baijiaCost: 1000, sellingPrice: 2000 },
    { id: 'C17', brand: 'Oliva', productName: 'Oliva 2024龍年系列', size: '5.5*60', quantityPerBox: 10, lishengCost: 900, baijiaCost: 1000, sellingPrice: 2000 },
    { id: 'C18', brand: 'Oliva', productName: 'Serie V Melanio Torpedo', size: '6.5*52', quantityPerBox: 10, lishengCost: 690, baijiaCost: 790, sellingPrice: 1600 },
  ]);

  public readonly itemCategoryMap: Record<TransactionItem, string[]> = {
    '資產': ['現金', '應收帳款', '存貨-餐飲', '存貨-酒水', '存貨-雪茄', '裝潢', '押金', '營業設備'],
    '負債': ['應付帳款', '應付裝潢款', '應付薪資', '應付股東回饋金', '應付雪茄進貨', '銀行借款'],
    '業主權益': ['資本', '業主存入', '業主提出', '本期損益'],
    '營業收入': ['銷貨收入', '其他收入', '-銷或折讓'],
    '營業費用': ['薪資支出', '健保費', '勞保費', '回饋金支出', '租金支出', '保險費', '貸款利息', '廚房消耗品', '文具用品', '網路費', '電話費', '大樓管理費', '會計費用', '獎金支出', '水費', '瓦斯費', '電費', '傭金費用', '試菜費用', '拜拜費用', 'pos機費用', '其他費用', '營業稅']
  };

  private mockCustomers = signal<Customer[]>([
    { id: 'C101', name: '林小姐', phone: '0912-345-678', note: 'VIP客戶，常客', gender: '女性', birthday: '05/20', birthYear: '1990', loyaltyPoints: 1250, originStore: '信義門市', lastCheckoutAt: '2026-01-25T15:30:00Z', isDeleted: false },
    { id: 'C102', name: '陳先生', phone: '0987-654-321', note: 'VIP客戶，喜愛威士忌', gender: '男性', birthday: '11/12', birthYear: '1985', loyaltyPoints: 3400, originStore: '信義門市', lastCheckoutAt: '2026-01-23T18:45:00Z', isDeleted: false },
    { id: 'C103', name: '黃先生', phone: '0928-111-222', note: '喜愛紅酒', gender: '男性', birthday: '02/28', birthYear: '1992', loyaltyPoints: 320, originStore: '南京門市', lastCheckoutAt: '2026-01-20T12:15:00Z', isDeleted: false },
    { id: 'C104', name: '張小姐', phone: '0933-444-555', note: null, gender: '女性', birthday: '08/08', birthYear: '1998', loyaltyPoints: 880, originStore: '信義門市', lastCheckoutAt: '2026-01-19T20:30:00Z', isDeleted: false },
    { id: 'C201', name: '吳先生', phone: '0955-666-777', note: '定期來訪', gender: '男性', birthday: '07/15', birthYear: '1988', loyaltyPoints: 150, originStore: '東門門市', lastCheckoutAt: '2026-01-18T16:00:00Z', isDeleted: false },
    { id: 'C202', name: '劉小姐', phone: '0911-222-333', note: '已停止服務', gender: '女性', birthday: '03/30', birthYear: '1995', loyaltyPoints: 0, originStore: '信義門市', lastCheckoutAt: '2025-06-30T14:20:00Z', isDeleted: false },
  ]) as any

  private mockCustomerFeedback = signal<CustomerFeedback[]>([
    { id: 'F001', customerId: 'C101', date: '2026-01-21', rating: 5, comment: '咖啡很好喝，甜點也很棒，環境舒適。' },
    { id: 'F002', customerId: 'C102', date: '2026-01-10', rating: 4, comment: '威士忌選擇很多，雪茄品質不錯，但價格偏高。' },
    { id: 'F003', customerId: 'C103', date: '2026-01-15', rating: 5, comment: '紅酒很順口，炸物拼盤超好吃！' },
    { id: 'F004', customerId: 'C101', date: '2026-01-05', rating: 4, comment: '餐點好吃，但氣泡飲的氣有點不足。' },
  ]);

  private mockLedger2024: LedgerEntry[] = [
    { date: '2024-01-15', description: '網站開發專案 - A公司', category: '銷貨收入', income: 150000, expense: 0 },
    { date: '2024-01-20', description: '辦公室用品採購', category: '文具用品', income: 0, expense: 4500 },
    { date: '2024-02-10', description: '設計服務費 - B客戶', category: '銷貨收入', income: 225000, expense: 0 },
    { date: '2024-02-22', description: 'SaaS 軟體訂閱費', category: '其他費用', income: 0, expense: 6000 },
    { date: '2024-03-05', description: '雲端伺服器費用', category: '網路費', income: 0, expense: 9000 },
    { date: '2024-03-18', description: '維護合約 - C公司', category: '銷貨收入', income: 186000, expense: 0 },
    { date: '2024-04-12', description: '數位廣告投放', category: '行銷費用', income: 0, expense: 36000 },
    { date: '2024-04-25', description: 'App開發專案 - D客戶', category: '銷貨收入', income: 243000, expense: 0 },
    { date: '2024-05-15', description: '外包專案費用', category: '傭金費用', income: 0, expense: 45000 },
    { date: '2024-06-20', description: '顧問服務費', category: '銷貨收入', income: 279000, expense: 0 },
    { date: '2024-07-01', description: '辦公室租金 - Q3', category: '租金支出', income: 0, expense: 60000 },
    { date: '2024-08-10', description: '系統開發 - E公司', category: '銷貨收入', income: 165000, expense: 0 },
  ];

  private mockLedger2025: LedgerEntry[] = [
     { date: '2025-01-15', description: '年度維護合約 - A公司', category: '銷貨收入', income: 180000, expense: 0 },
     { date: '2025-01-20', description: '採購新筆電', category: '營業設備', income: 0, expense: 75000 },
     { date: '2025-02-10', description: '品牌設計專案 - F客戶', category: '銷貨收入', income: 255000, expense: 0 },
     { date: '2025-02-22', description: 'SaaS 軟體訂閱費', category: 'pos機費用', income: 0, expense: 7500 },
     { date: '2025-03-05', description: '雲端伺服器費用', category: '網路費', income: 0, expense: 10500 },
     { date: '2025-04-10', description: '數位廣告投放 - Q2', category: '行銷費用', income: 0, expense: 42000 },
     { date: '2025-05-20', description: 'ERP 系統導入 - G 公司', category: '銷貨收入', income: 350000, expense: 0 },
     { date: '2025-06-15', description: '辦公室擴建工程', category: '裝潢', income: 0, expense: 150000 },
     { date: '2025-07-01', description: '辦公室租金 - Q3', category: '租金支出', income: 0, expense: 78000 },
     { date: '2025-08-18', description: '法律顧問費', category: '會計費用', income: 0, expense: 25000 },
     { date: '2025-09-25', description: '雲端平台開發 - H 客戶', category: '銷貨收入', income: 420000, expense: 0 },
     { date: '2025-10-05', description: '伺服器硬體升級', category: '營業設備', income: 0, expense: 95000 },
     { date: '2025-11-12', description: '行銷活動費用', category: '行銷費用', income: 0, expense: 65000 },
     { date: '2025-12-20', description: '年度獎金發放', category: '獎金支出', income: 0, expense: 250000 },
  ];

  private mockLedger2026: LedgerEntry[] = [
    // 收入
    { date: '2026-06-01', description: 'VIP包廂服務費', category: '銷貨收入', income: 88000, expense: 0 },
    { date: '2026-06-05', description: '企業包場活動', category: '銷貨收入', income: 150000, expense: 0 },
    { date: '2026-06-10', description: '系統整合服務 - M 公司', category: '銷貨收入', income: 220000, expense: 0 },
    { date: '2026-06-12', description: '場地租賃收入', category: '其他收入', income: 25000, expense: 0 },
    { date: '2026-06-15', description: '顧客訂金沒收', category: '其他收入', income: 5000, expense: 0 },
    { date: '2026-06-20', description: '熟客優惠折讓', category: '銷貨折讓', income: 12000, expense: 0 }, // 折讓以收入形式記錄
    
    // 費用
    { date: '2026-06-02', description: '六月份辦公室租金', category: '租金支出', income: 0, expense: 80000 },
    { date: '2026-06-02', description: '六月份大樓管理費', category: '大樓管理費', income: 0, expense: 5000 },
    { date: '2026-06-05', description: '員工薪資', category: '薪資支出', income: 0, expense: 180000 },
    { date: '2026-06-05', description: '勞健保費用', category: '勞保費', income: 0, expense: 15000 },
    { date: '2026-06-05', description: '勞健保費用', category: '健保費', income: 0, expense: 18000 },
    { date: '2026-06-08', description: '水電瓦斯費', category: '水費', income: 0, expense: 2500 },
    { date: '2026-06-08', description: '水電瓦斯費', category: '電費', income: 0, expense: 12000 },
    { date: '2026-06-08', description: '水電瓦斯費', category: '瓦斯費', income: 0, expense: 3500 },
    { date: '2026-06-10', description: '電信網路費', category: '網路費', income: 0, expense: 2000 },
    { date: '2026-06-10', description: '電信網路費', category: '電話費', income: 0, expense: 1500 },
    { date: '2026-06-12', description: '廚房食材、紙巾等消耗品', category: '廚房消耗品', income: 0, expense: 18000 },
    { date: '2026-06-15', description: '影印紙、筆等辦公用品', category: '文具用品', income: 0, expense: 3000 },
    { date: '2026-06-18', description: '行銷活動傭金', category: '傭金費用', income: 0, expense: 22000 },
    { date: '2026-06-20', description: 'POS系統月費', category: 'pos機費用', income: 0, expense: 5000 },
    { date: '2026-06-21', description: '端午節拜拜用品', category: '拜拜費用', income: 0, expense: 2000 },
    { date: '2026-06-22', description: '新菜色研發食材', category: '試菜費用', income: 0, expense: 8000 },
    { date: '2026-06-24', description: '營業用財產保險', category: '保險費', income: 0, expense: 6000 },
    { date: '2026-06-25', description: '會計師記帳費', category: '會計費用', income: 0, expense: 8000 },
    { date: '2026-06-25', description: '銀行貸款利息', category: '貸款利息', income: 0, expense: 12000 },
  ];
  
  private mockPurchases: PurchaseEntry[] = [
    { date: '2024-01-18', category: '酒水', amount: 12000 },
    { date: '2024-02-05', category: '餐飲', amount: 8500 },
    { date: '2024-02-25', category: '雪茄', amount: 25000 },
    { date: '2024-03-12', category: '酒水', amount: 15000 },
    { date: '2024-04-20', category: '餐飲', amount: 9800 },
    { date: '2024-05-10', category: '雪茄', amount: 32000 },
    { date: '2024-06-22', category: '酒水', amount: 18000 },
    { date: '2024-07-15', category: '餐飲', amount: 11000 },
    { date: '2025-01-22', category: '酒水', amount: 16000 },
    { date: '2025-02-15', category: '雪茄', amount: 45000 },
    { date: '2025-03-01', category: '餐飲', amount: 13500 },
    { date: '2025-04-10', category: '酒水', amount: 22000 },
    { date: '2025-05-15', category: '餐飲', amount: 15000 },
    { date: '2025-06-20', category: '雪茄', amount: 52000 },
    { date: '2025-08-05', category: '酒水', amount: 25000 },
    { date: '2025-10-18', category: '餐飲', amount: 18000 },
    { date: '2025-12-01', category: '雪茄', amount: 65000 },
    { date: '2026-01-20', category: '酒水', amount: 28000 },
    { date: '2026-02-18', category: '餐飲', amount: 25000 },
    { date: '2026-03-10', category: '餐飲', amount: 21000 },
    { date: '2026-03-25', category: '雪茄', amount: 82000 },
    { date: '2026-04-25', category: '雪茄', amount: 75000 },
    { date: '2026-05-15', category: '酒水', amount: 35000 },
    { date: '2026-06-05', category: '酒水', amount: 32000 },
    { date: '2026-06-12', category: '餐飲', amount: 28000 },
    { date: '2026-06-20', category: '雪茄', amount: 95000 },
  ];

  private mockPOSSales: POSSale[] = [
      // 2026-01
      { transactionId: 'T201', customerId: 'C101', date: '2026-01-05', items: [{ name: '主食', price: 350, quantity: 2 }, { name: '氣泡飲', price: 120, quantity: 2 }], total: 940 },
      { transactionId: 'T202', customerId: 'C102', date: '2026-01-10', items: [{ name: '威士忌', price: 2800, quantity: 1 }, { name: '雪茄', price: 900, quantity: 2 }], total: 4600 },
      { transactionId: 'T203', customerId: 'C103', date: '2026-01-15', items: [{ name: '紅酒/白酒', price: 1800, quantity: 1 }, { name: '炸物', price: 250, quantity: 1 }], total: 2050 },
      { transactionId: 'T204', customerId: 'C101', date: '2026-01-20', items: [{ name: '咖啡', price: 150, quantity: 2 }, { name: '甜點', price: 180, quantity: 2 }], total: 660 },
      { transactionId: 'T205', customerId: 'C104', date: '2026-01-25', items: [{ name: '活動', price: 13000, quantity: 1 }], total: 13000 },
      
      // 2026-02
      { transactionId: 'T301', customerId: 'C201', date: '2026-02-03', items: [{ name: '啤酒', price: 200, quantity: 4 }, { name: '炸物', price: 250, quantity: 2 }], total: 1300 },
      { transactionId: 'T302', customerId: 'C202', date: '2026-02-12', items: [{ name: '威士忌', price: 3200, quantity: 1 }], total: 3200 },
      { transactionId: 'T303', customerId: 'C103', date: '2026-02-18', items: [{ name: '主食', price: 400, quantity: 1 }, { name: '茶飲', price: 130, quantity: 1 }], total: 530 },
      { transactionId: 'T304', customerId: 'C201', date: '2026-02-25', items: [{ name: '雪茄', price: 1200, quantity: 1 }], total: 1200 },

      // 2026-03
      { transactionId: 'T401', customerId: 'C104', date: '2026-03-05', items: [{ name: '場地使用費', price: 4000, quantity: 1 }], total: 4000 },
      { transactionId: 'T402', customerId: 'C101', date: '2026-03-10', items: [{ name: '調酒', price: 450, quantity: 2 }, { name: '單點', price: 300, quantity: 1 }], total: 1200 },
      { transactionId: 'T403', customerId: 'C102', date: '2026-03-20', items: [{ name: '威士忌', price: 2500, quantity: 1 }, { name: '雪茄', price: 850, quantity: 3 }], total: 5050 },
      { transactionId: 'T404', customerId: 'C101', date: '2026-03-28', items: [{ name: '下午茶套餐', price: 600, quantity: 2 }], total: 1200 },
      
      // 2026-04
      { transactionId: 'T501', customerId: 'C104', date: '2026-04-02', items: [{ name: '場地使用費', price: 15000, quantity: 1 }], total: 15000 },
      { transactionId: 'T502', customerId: 'C101', date: '2026-04-10', items: [{ name: '主食', price: 380, quantity: 2 }, { name: '紅酒/白酒', price: 2200, quantity: 1 }], total: 2960 },
      { transactionId: 'T503', customerId: 'C103', date: '2026-04-22', items: [{ name: '雪茄', price: 1100, quantity: 2 }], total: 2200 },
  ];

  private productCategoryMap = new Map<string, string>([
    ['場地使用費', '活動場地'],
    ['活動', '活動場地'],
    ['調酒', '酒水'],
    ['紅酒/白酒', '酒水'],
    ['啤酒', '酒水'],
    ['威士忌', '酒水'],
    ['主食', '餐飲'],
    ['炸物', '餐飲'],
    ['奶昔', '餐飲'],
    ['氣泡飲', '餐飲'],
    ['單點', '餐飲'],
    ['茶飲', '餐飲'],
    ['貝果/可頌', '餐飲'],
    ['咖啡', '餐飲'],
    ['甜點', '餐飲'],
    ['沙拉', '餐飲'],
    ['下午茶套餐', '餐飲'],
    ['雪茄', '雪茄']
  ]);

  private mockCostRateMap = new Map<string, number>([
      ['活動場地', 0.10],
      ['酒水', 0.35],
      ['餐飲', 0.25],
      ['雪茄', 0.55],
  ]);

  private getFilteredLedger(startDate?: string, endDate?: string): LedgerEntry[] {
    const allLedger = [...this.mockLedger2024, ...this.mockLedger2025, ...this.mockLedger2026];
    if (!startDate && !endDate) {
        return allLedger;
    }
    return allLedger.filter(entry => {
        const entryDate = entry.date;
        const startMatch = startDate ? entryDate >= startDate : true;
        const endMatch = endDate ? entryDate <= endDate : true;
        return startMatch && endMatch;
    });
  }

  private getFilteredPurchases(startDate?: string, endDate?: string): PurchaseEntry[] {
    if (!startDate && !endDate) {
        return this.mockPurchases;
    }
    return this.mockPurchases.filter(purchase => {
        const purchaseDate = purchase.date;
        const startMatch = startDate ? purchaseDate >= startDate : true;
        const endMatch = endDate ? purchaseDate <= endDate : true;
        return startMatch && endMatch;
    });
  }

  private getFilteredPOSSales(startDate?: string, endDate?: string, customerId?: string): POSSale[] {
    let sales = this.mockPOSSales;
    
    if (customerId) {
        sales = sales.filter(sale => sale.customerId === customerId);
    }

    if (!startDate && !endDate) {
        return sales;
    }

    return sales.filter(sale => {
        const saleDate = sale.date;
        const startMatch = startDate ? saleDate >= startDate : true;
        const endMatch = endDate ? saleDate <= endDate : true;
        return startMatch && endMatch;
    });
  }

  // --- Methods for Dashboard & old components ---
  getFinancialSummary(startDate?: string, endDate?: string): FinancialSummary {
    const allEntries = this.getFilteredLedger(startDate, endDate);
    const totalRevenue = allEntries.filter(e => e.category !== '銷貨折讓').reduce((sum, item) => sum + item.income, 0);
    const totalAllowance = allEntries.filter(e => e.category === '銷貨折讓').reduce((sum, item) => sum + item.income, 0);
    const netRevenue = totalRevenue - totalAllowance;
    const totalExpenses = allEntries.reduce((sum, item) => sum + item.expense, 0);
    const netIncome = netRevenue - totalExpenses;
    const allPurchases = this.getFilteredPurchases(startDate, endDate);
    const totalPurchases = allPurchases.reduce((sum, item) => sum + item.amount, 0);
    const totalAssets = 1000000 + netIncome;
    const totalLiabilities = 300000;
    const equity = totalAssets - totalLiabilities;
    return { totalRevenue: netRevenue, totalExpenses, netIncome, totalAssets, totalLiabilities, equity, totalPurchases, totalAllowance };
  }
  
  public getPOSSales(startDate?: string, endDate?: string, customerId?: string): POSSale[] {
    return this.getFilteredPOSSales(startDate, endDate, customerId);
  }

  getMonthlyPerformance(startDate?: string, endDate?: string): MonthlyData[] {
    const monthlyMap = new Map<string, { revenue: number, expenses: number, accountsPayable: number }>();
    const allEntries = this.getFilteredLedger(startDate, endDate);
    allEntries.forEach(entry => {
      const month = entry.date.substring(0, 7);
      if (!monthlyMap.has(month)) { monthlyMap.set(month, { revenue: 0, expenses: 0, accountsPayable: 0 }); }
      const data = monthlyMap.get(month)!;
      if (entry.category === '銷貨折讓') { data.revenue -= entry.income; } else { data.revenue += entry.income; }
      data.expenses += entry.expense;
      data.accountsPayable = data.expenses * 0.4 + data.revenue * 0.05;
    });
    return Array.from(monthlyMap.keys()).sort().map(key => ({ month: key, ...monthlyMap.get(key)! }));
  }

  getExpensesByCategory(startDate?: string, endDate?: string): ExpenseByCategory[] {
    const categoryMap = new Map<string, number>();
    const allEntries = this.getFilteredLedger(startDate, endDate);
    allEntries.forEach(entry => {
      if (entry.expense > 0 && entry.category !== '資本支出') { categoryMap.set(entry.category, (categoryMap.get(entry.category) || 0) + entry.expense); }
    });
    return Array.from(categoryMap.entries()).map(([category, amount]) => ({ category, amount }));
  }

  getPurchasesByCategory(startDate?: string, endDate?: string): PurchaseByCategory[] {
    const categoryMap = new Map<string, number>();
    const allPurchases = this.getFilteredPurchases(startDate, endDate);
    allPurchases.forEach(purchase => { categoryMap.set(purchase.category, (categoryMap.get(purchase.category) || 0) + purchase.amount); });
    return Array.from(categoryMap.entries()).map(([category, amount]) => ({ category, amount }));
  }
  
  getTopSellingProducts(startDate?: string, endDate?: string): TopProduct[] {
    const productMap = new Map<string, { quantitySold: number; revenue: number }>();
    this.getFilteredPOSSales(startDate, endDate).forEach(sale => {
      sale.items.forEach(item => {
        const product = productMap.get(item.name) || { quantitySold: 0, revenue: 0 };
        product.quantitySold += item.quantity;
        product.revenue += item.price * item.quantity;
        productMap.set(item.name, product);
      });
    });
    return Array.from(productMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }
  
  private getFilteredPOSSalesByMonth(startYearMonth?: string, endYearMonth?: string): POSSale[] {
    if (!startYearMonth && !endYearMonth) {
        return this.mockPOSSales;
    }
    return this.mockPOSSales.filter(sale => {
        const saleYearMonth = sale.date.substring(0, 7);
        const startMatch = startYearMonth ? saleYearMonth >= startYearMonth : true;
        const endMatch = endYearMonth ? saleYearMonth <= endYearMonth : true;
        return startMatch && endMatch;
    });
  }

  getAllProductsAnalysis(startYearMonth?: string, endYearMonth?: string): ProductAnalysis[] {
    const productMap = new Map<string, { quantitySold: number; revenue: number; prices: number[] }>();
    const filteredSales = this.getFilteredPOSSalesByMonth(startYearMonth, endYearMonth);
    let totalOverallRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const product = productMap.get(item.name) || { quantitySold: 0, revenue: 0, prices: [] };
        product.quantitySold += item.quantity;
        product.revenue += item.price * item.quantity;
        product.prices.push(item.price);
        productMap.set(item.name, product);
      });
    });
    if (productMap.size === 0) return [];
    return Array.from(productMap.entries()).map(([name, data]) => {
      const avgPrice = data.prices.length > 0 ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length : 0;
      const revenueShare = totalOverallRevenue > 0 ? (data.revenue / totalOverallRevenue) * 100 : 0;
      return { 
          name, 
          category: this.productCategoryMap.get(name) || '其他',
          quantitySold: data.quantitySold, 
          revenue: data.revenue, 
          avgPrice: avgPrice, 
          revenueShare: revenueShare 
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }

  getProductAnalysisReport(startYearMonth?: string, endYearMonth?: string): ProductAnalysisReport | null {
    const filteredSales = this.getFilteredPOSSalesByMonth(startYearMonth, endYearMonth);
    if (filteredSales.length === 0) return null;

    const months = [...new Set(filteredSales.map(s => s.date.substring(0, 7)))].sort();

    const productAggregates = new Map<string, {
        category: string;
        totalRevenue: number;
        totalQuantity: number;
        monthly: Map<string, { revenue: number; quantity: number }>;
    }>();

    const monthlyTotals = new Map<string, { revenue: number }>();
    months.forEach(m => monthlyTotals.set(m, { revenue: 0 }));

    for (const sale of filteredSales) {
        const month = sale.date.substring(0, 7);
        monthlyTotals.get(month)!.revenue += sale.total;

        for (const item of sale.items) {
            if (!productAggregates.has(item.name)) {
                productAggregates.set(item.name, {
                    category: this.productCategoryMap.get(item.name) || '其他',
                    totalRevenue: 0,
                    totalQuantity: 0,
                    monthly: new Map()
                });
            }
            const agg = productAggregates.get(item.name)!;
            const itemRevenue = item.price * item.quantity;
            agg.totalRevenue += itemRevenue;
            agg.totalQuantity += item.quantity;

            if (!agg.monthly.has(month)) agg.monthly.set(month, { revenue: 0, quantity: 0 });
            const monthAgg = agg.monthly.get(month)!;
            monthAgg.revenue += itemRevenue;
            monthAgg.quantity += item.quantity;
        }
    }
    
    const grandTotalRevenue = Array.from(monthlyTotals.values()).reduce((sum, m) => sum + m.revenue, 0);
    if (grandTotalRevenue === 0) return null;

    const productRows = Array.from(productAggregates.entries()).map(([name, agg]) => {
        const monthlyMetrics: { [month: string]: MonthlyProductMetrics } = {};
        for (const month of months) {
            const monthAgg = agg.monthly.get(month);
            const totalMonthRevenue = monthlyTotals.get(month)!.revenue;
            const baseCostRate = this.mockCostRateMap.get(agg.category) || 0;
            monthlyMetrics[month] = {
                quantitySold: monthAgg?.quantity || 0,
                revenue: monthAgg?.revenue || 0,
                revenueShare: totalMonthRevenue > 0 ? ((monthAgg?.revenue || 0) / totalMonthRevenue) * 100 : 0,
                costRate: baseCostRate > 0 ? baseCostRate + (Math.random() - 0.5) * 0.1 : 0 // Add slight variance
            };
        }

        return {
            name,
            category: agg.category,
            totalRevenue: agg.totalRevenue,
            totalQuantity: agg.totalQuantity,
            totalRevenueShare: (agg.totalRevenue / grandTotalRevenue) * 100,
            monthlyMetrics
        };
    });
    
    const categoryOrder = ['活動場地', '酒水', '餐飲', '雪茄'];
    const categoryGroups: ProductCategoryGroup[] = [];
    
    for (const category of categoryOrder) {
        const products = productRows.filter(p => p.category === category).sort((a,b) => b.totalRevenue - a.totalRevenue);
        if (products.length === 0) continue;

        const subtotalMonthlyMetrics: { [month: string]: MonthlyProductMetrics } = {};
        for(const month of months) {
            const quantitySold = products.reduce((sum, p) => sum + p.monthlyMetrics[month].quantitySold, 0);
            const revenue = products.reduce((sum, p) => sum + p.monthlyMetrics[month].revenue, 0);
            const totalMonthRevenue = monthlyTotals.get(month)!.revenue;
            const costSum = products.reduce((sum, p) => sum + (p.monthlyMetrics[month].revenue * p.monthlyMetrics[month].costRate), 0);

            subtotalMonthlyMetrics[month] = {
                quantitySold,
                revenue,
                revenueShare: totalMonthRevenue > 0 ? (revenue / totalMonthRevenue) * 100 : 0,
                costRate: revenue > 0 ? costSum / revenue : 0
            };
        }
        
        const totalCategoryRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
        const subtotal: ProductAnalysisRow = {
            name: '小計',
            category,
            totalRevenue: totalCategoryRevenue,
            totalQuantity: products.reduce((sum, p) => sum + p.totalQuantity, 0),
            totalRevenueShare: (totalCategoryRevenue / grandTotalRevenue) * 100,
            monthlyMetrics: subtotalMonthlyMetrics
        };

        categoryGroups.push({ category, products, subtotal });
    }

    const grandTotalMonthlyMetrics: { [month: string]: MonthlyProductMetrics } = {};
     for(const month of months) {
        const revenue = monthlyTotals.get(month)!.revenue;
        const costSum = categoryGroups.reduce((sum, g) => sum + (g.subtotal.monthlyMetrics[month].revenue * g.subtotal.monthlyMetrics[month].costRate), 0);
        grandTotalMonthlyMetrics[month] = {
            quantitySold: categoryGroups.reduce((sum, g) => sum + g.subtotal.monthlyMetrics[month].quantitySold, 0),
            revenue,
            revenueShare: 100,
            costRate: revenue > 0 ? costSum / revenue : 0
        };
    }
    const grandTotal: ProductAnalysisRow = {
        name: '總計',
        category: '',
        totalRevenue: grandTotalRevenue,
        totalQuantity: categoryGroups.reduce((sum, g) => sum + g.subtotal.totalQuantity, 0),
        totalRevenueShare: 100,
        monthlyMetrics: grandTotalMonthlyMetrics
    };

    return { months, categoryGroups, grandTotal };
  }

  // --- Old Detailed Statement Methods ---
  getIncomeStatement(startDate?: string, endDate?: string): IncomeStatement {
    const entries = this.getFilteredLedger(startDate, endDate);
    const revenueItems = new Map<string, number>();
    const expenseItems = new Map<string, number>();
    entries.forEach(e => {
      if (e.income > 0) { revenueItems.set(e.category, (revenueItems.get(e.category) || 0) + e.income); }
      if (e.expense > 0) { expenseItems.set(e.category, (expenseItems.get(e.category) || 0) + e.expense); }
    });
    const salesRevenue = revenueItems.get('銷貨收入') || 0;
    const otherRevenue = revenueItems.get('其他收入') || 0;
    const salesAllowance = revenueItems.get('銷貨折讓') || 0;
    const operatingRevenue = { items: [ { account: '銷貨收入', amount: salesRevenue }, { account: '其他收入', amount: otherRevenue }, { account: '銷貨折讓', amount: -salesAllowance } ], total: salesRevenue + otherRevenue - salesAllowance };
    const operatingExpenses = { items: Array.from(expenseItems.entries()).map(([account, amount]) => ({ account, amount })).sort((a,b) => b.amount - a.amount), total: Array.from(expenseItems.values()).reduce((sum, amount) => sum + amount, 0) };
    return { operatingRevenue, operatingExpenses, netIncome: operatingRevenue.total - operatingExpenses.total };
  }

  getBalanceSheet(startDate?: string, endDate?: string): BalanceSheet {
    const incomeStatement = this.getIncomeStatement(startDate, endDate);
    const netIncomeForPeriod = incomeStatement.netIncome;
    const purchases = this.getFilteredPurchases(startDate, endDate);
    let cash = 500000 + netIncomeForPeriod;
    const assets = { items: [ { account: '現金', amount: cash }, { account: '應收帳款', amount: (incomeStatement.operatingRevenue.total * 0.15) }, { account: '存貨-餐飲', amount: purchases.filter(p=>p.category === '餐飲').reduce((s,i)=>s+i.amount, 0) * 0.4 }, { account: '存貨-酒水', amount: purchases.filter(p=>p.category === '酒水').reduce((s,i)=>s+i.amount, 0) * 0.5 }, { account: '存貨-雪茄', amount: purchases.filter(p=>p.category === '雪茄').reduce((s,i)=>s+i.amount, 0) * 0.6 }, { account: '裝潢', amount: 1200000 }, { account: '押金', amount: 150000 }, { account: '營業設備', amount: 450000 } ], total: 0 };
    assets.total = assets.items.reduce((sum, item) => sum + item.amount, 0);
    const liabilities = { items: [ { account: '應付帳款', amount: (incomeStatement.operatingExpenses.total * 0.3) }, { account: '應付裝潢款', amount: 250000 }, { account: '應付薪資', amount: 45000 }, { account: '應付股東回饋金', amount: 15000 }, { account: '應付雪茄進貨', amount: 35000 }, { account: '銀行借款', amount: 800000 } ], total: 0 };
    liabilities.total = liabilities.items.reduce((sum, item) => sum + item.amount, 0);
    const equity = { items: [ { account: '資本', amount: 1000000 }, { account: '業主存入', amount: 50000 }, { account: '業主提出', amount: -20000 }, { account: '本期損益', amount: netIncomeForPeriod } ], total: 0 };
    equity.total = equity.items.reduce((sum, item) => sum + item.amount, 0);
    const totalLiabilitiesAndEquity = liabilities.total + equity.total;
    const difference = assets.total - totalLiabilitiesAndEquity;
    const capitalItem = equity.items.find(i => i.account === '資本');
    if(capitalItem) { capitalItem.amount += difference; equity.total += difference; }
    return { assets, liabilities, equity, totalLiabilitiesAndEquity: assets.total };
  }
  
  // --- NEW MONTHLY REPORT METHODS ---

  private mockMonthlyBalanceSheetData2026 = {
    assets: {
      '現金': {'2026-01': -60372, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '應收帳款': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '存貨-餐飲': {'2026-01': 42459, '2026-02': 56424, '2026-03': 63318, '2026-04': 53737, '2026-05': 41714, '2026-06': 62941, '2026-07': 55331, '2026-08': 57454, '2026-09': 42199, '2026-10': 88353, '2026-11': 56195, '2026-12': 70131},
      '存貨-酒水': {'2026-01': 4561, '2026-02': 51162, '2026-03': 28630, '2026-04': 51807, '2026-05': 26140, '2026-06': 7117, '2026-07': 5707, '2026-08': 23549, '2026-09': 40217, '2026-10': 80083, '2026-11': 38428, '2026-12': 13344},
      '存貨-雪茄': {'2026-01': 106380, '2026-02': 114733, '2026-03': 150810, '2026-04': 112936, '2026-05': 79912, '2026-06': 91653, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '裝潢': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 1700030, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '押金': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '營業設備': {'2026-01': 20472, '2026-02': 9694, '2026-03': 4235, '2026-04': 25624, '2026-05': 25084, '2026-06': 1044, '2026-07': 770, '2026-08': 2876, '2026-09': 6678, '2026-10': 25840, '2026-11': 5444, '2026-12': 1589},
    },
    liabilities: {
      '應付帳款': {'2026-01': -116791, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '應付裝潢款': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': -340000, '2026-07': -340000, '2026-08': -340000, '2026-09': -340000, '2026-10': -260000, '2026-11': 0, '2026-12': 0},
      '應付薪資': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': -73145, '2026-08': -53145, '2026-09': -38145, '2026-10': 0, '2026-11': -67145, '2026-12': -50145},
      '應付股東回饋金': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': -21181, '2026-09': -1830, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '應付雪茄進貨': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': -99275, '2026-07': -78270, '2026-08': -224230, '2026-09': -113975, '2026-10': -118535, '2026-11': -71145, '2026-12': -66350},
      '銀行借款': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 2000000, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
    },
    equity: {
      '資本': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '業主存入': {'2026-01': 0, '2026-02': 300000, '2026-03': 150000, '2026-04': 50000, '2026-05': 100000, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '業主提出': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
    }
  };
  
  private mockMonthlyIncomeStatementData2026 = {
    revenue: {
      '銷貨收入': {'2026-01': 515140, '2026-02': 347057, '2026-03': 327890, '2026-04': 261350, '2026-05': 256858, '2026-06': 187580, '2026-07': 200710, '2026-08': 308020, '2026-09': 224550, '2026-10': 504140, '2026-11': 236815, '2026-12': 340853},
      '其他收入': {'2026-01': 100, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 27677, '2026-07': 636, '2026-08': 25000, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '銷貨折讓': {'2026-01': -111972, '2026-02': -84928, '2026-03': -59978, '2026-04': -58915, '2026-05': -35331, '2026-06': -29417, '2026-07': -22367, '2026-08': -30058, '2026-09': -36237, '2026-10': -55599, '2026-11': -22119, '2026-12': -35978},
    },
    expenses: {
      '薪資支出': {'2026-01': -117806, '2026-02': -97814, '2026-03': -110799, '2026-04': -105507, '2026-05': -110155, '2026-06': -109977, '2026-07': -25718, '2026-08': -52922, '2026-09': -70688, '2026-10': -95017, '2026-11': -35040, '2026-12': -37492},
      '健保費': {'2026-01': 0, '2026-02': -2368, '2026-03': -2368, '2026-04': -2368, '2026-05': -2373, '2026-06': -2368, '2026-07': -2368, '2026-08': -2368, '2026-09': -2368, '2026-10': -2368, '2026-11': -2368, '2026-12': 0},
      '勞保費': {'2026-01': -4447, '2026-02': -8883, '2026-03': -5382, '2026-04': -15787, '2026-05': -5138, '2026-06': -4827, '2026-07': -4827, '2026-08': -4827, '2026-09': -4827, '2026-10': -4827, '2026-11': -4827, '2026-12': -4827},
      '回饋金支出': {'2026-01': -1654, '2026-02': -1581, '2026-03': -1623, '2026-04': -3320, '2026-05': -9792, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': -15000, '2026-12': 0},
      '租金支出': {'2026-01': -72425, '2026-02': -72425, '2026-03': -72425, '2026-04': -72425, '2026-05': -72425, '2026-06': -72425, '2026-07': -72425, '2026-08': -72410, '2026-09': -72410, '2026-10': -72410, '2026-11': -72410, '2026-12': -72410},
      '保險費': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': -21297, '2026-12': 0},
      '貸款利息': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': -3824, '2026-07': -3824, '2026-08': -3824, '2026-09': -3824, '2026-10': -3824, '2026-11': -3824, '2026-12': -3824},
      '廚房消耗品': {'2026-01': -596, '2026-02': -834, '2026-03': -79, '2026-04': -3002, '2026-05': 0, '2026-06': 0, '2026-07': -641, '2026-08': -300, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': -1293},
      '文具用品': {'2026-01': -266, '2026-02': -590, '2026-03': -1263, '2026-04': -9358, '2026-05': -149, '2026-06': -1255, '2026-07': -207, '2026-08': -953, '2026-09': -152, '2026-10': -163, '2026-11': -1989, '2026-12': -621},
      '網路費': {'2026-01': -4794, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': -4794, '2026-06': 0, '2026-07': -2397, '2026-08': 0, '2026-09': 0, '2026-10': -2553, '2026-11': -2302, '2026-12': -1344},
      '電話費': {'2026-01': 0, '2026-02': -334, '2026-03': -1302, '2026-04': -338, '2026-05': -369, '2026-06': -359, '2026-07': -330, '2026-08': -316, '2026-09': -328, '2026-10': -310, '2026-11': -357, '2026-12': -340},
      '大樓管理費': {'2026-01': -1400, '2026-02': -1400, '2026-03': -1400, '2026-04': 0, '2026-05': 0, '2026-06': -1400, '2026-07': -1400, '2026-08': 0, '2026-09': 0, '2026-10': -1400, '2026-11': -1400, '2026-12': 0},
      '會計費用': {'2026-01': 0, '2026-02': -14730, '2026-03': -4000, '2026-04': 0, '2026-05': -4162, '2026-06': 0, '2026-07': -4000, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '獎金支出': {'2026-01': 0, '2026-02': -3000, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '水費': {'2026-01': -709, '2026-02': 0, '2026-03': -696, '2026-04': 0, '2026-05': -599, '2026-06': 0, '2026-07': -525, '2026-08': 0, '2026-09': -578, '2026-10': 0, '2026-11': -1218, '2026-12': 0},
      '瓦斯費': {'2026-01': -300, '2026-02': 0, '2026-03': 0, '2026-04': -300, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': -2100, '2026-10': -600, '2026-11': -300, '2026-12': -1540},
      '電費': {'2026-01': 0, '2026-02': -8811, '2026-03': -807, '2026-04': 0, '2026-05': 0, '2026-06': -12543, '2026-07': 0, '2026-08': -24358, '2026-09': 0, '2026-10': -24920, '2026-11': 0, '2026-12': -14417},
      '傭金費用': {'2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': -3000},
      '試菜費用': {'2026-01': -10530, '2026-02': -1070, '2026-03': -1403, '2026-04': 0, '2026-05': 0, '2026-06': -225, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '拜拜費用': {'2026-01': -3744, '2026-02': -6043, '2026-03': -1174, '2026-04': -838, '2026-05': -554, '2026-06': -1228, '2026-07': -608, '2026-08': -1258, '2026-09': -1216, '2026-10': -1216, '2026-11': -585, '2026-12': -806},
      'pos機費用': {'2026-01': 0, '2026-02': -11700, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 0, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0},
      '其他費用': {'2026-01': -2030, '2026-02': -3058, '2026-03': -3570, '2026-04': 0, '2026-05': -25418, '2026-06': -13010, '2026-07': -6445, '2026-08': -154, '2026-09': -1302, '2026-10': -6413, '2026-11': -1000, '2026-12': -13126},
      // FIX: Corrected a typo in the mock data key from '2027' to '2026-07'. This ensures data for July is correctly processed.
      '營業稅': {'2026-01': 0, '2026-02': 0, '2026-03': -8421, '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': -4915, '2026-08': 0, '2026-09': 0, '2026-10': 0, '2026-11': -22930, '2026-12': 0},
    }
  };

  getMonthlyBalanceSheetReport(year: number, quarter: number | 'all'): MonthlyBalanceSheetReport | null {
    if (year !== 2026) return null; // Only have data for 2026
    const rawData = this.mockMonthlyBalanceSheetData2026;
    
    const yearPrefix = `${year}-`;
    const allMonths = Array.from({length: 12}, (_, i) => yearPrefix + String(i + 1).padStart(2, '0'));

    let targetMonths: string[];
    if (quarter === 'all') {
      targetMonths = allMonths;
    } else {
      const startMonth = (quarter - 1) * 3 + 1;
      targetMonths = allMonths.slice(startMonth - 1, startMonth + 2);
    }
    
    const processSection = (sectionData: any): MonthlyReportSection => {
      const items: MonthlyReportLineItem[] = [];
      const monthlyTotals: { [month: string]: number } = {};
      
      for (const account in sectionData) {
        const monthlyAmounts = sectionData[account];
        const lastMonthValue = monthlyAmounts[targetMonths[targetMonths.length - 1]] || 0;
        
        items.push({
          account,
          monthlyAmounts,
          total: lastMonthValue,
          percentage: 0 // Will be calculated later
        });
      }
      
      for (const month of allMonths) {
        monthlyTotals[month] = items.reduce((sum, item) => sum + (item.monthlyAmounts[month] || 0), 0);
      }
      
      const grandTotal = monthlyTotals[targetMonths[targetMonths.length - 1]] || 0;
      
      return { items, monthlyTotals, grandTotal };
    };

    const assets = processSection(rawData.assets);
    const liabilities = processSection(rawData.liabilities);
    const equity = processSection(rawData.equity);

    // Calculate percentages
    if (assets.grandTotal !== 0) {
      assets.items.forEach(item => item.percentage = (item.total / assets.grandTotal) * 100);
    }
    const totalLiabilitiesAndEquityGrandTotal = liabilities.grandTotal + equity.grandTotal;
    if (totalLiabilitiesAndEquityGrandTotal !== 0) {
        liabilities.items.forEach(item => item.percentage = (item.total / totalLiabilitiesAndEquityGrandTotal) * 100);
        equity.items.forEach(item => item.percentage = (item.total / totalLiabilitiesAndEquityGrandTotal) * 100);
    }


    const totalLiabilitiesAndEquity: MonthlyReportSection = {
        items: [],
        monthlyTotals: {},
        grandTotal: totalLiabilitiesAndEquityGrandTotal
    };
    for (const month of allMonths) {
        totalLiabilitiesAndEquity.monthlyTotals[month] = (liabilities.monthlyTotals[month] || 0) + (equity.monthlyTotals[month] || 0);
    }

    return { months: targetMonths, assets, liabilities, equity, totalLiabilitiesAndEquity };
  }

  getMonthlyIncomeStatementReport(year: number, quarter: number | 'all'): MonthlyIncomeStatementReport | null {
    if (year !== 2026) return null;
    const rawData = this.mockMonthlyIncomeStatementData2026;

    const yearPrefix = `${year}-`;
    const allMonths = Array.from({length: 12}, (_, i) => yearPrefix + String(i + 1).padStart(2, '0'));
    
    let targetMonths: string[];
    if (quarter === 'all') {
        targetMonths = allMonths;
    } else {
        const startMonth = (quarter - 1) * 3 + 1;
        targetMonths = allMonths.slice(startMonth - 1, startMonth + 2);
    }

    const processSection = (sectionData: any): MonthlyReportSection => {
        const items: MonthlyReportLineItem[] = [];
        const monthlyTotals: { [month: string]: number } = {};

        for (const account in sectionData) {
            const monthlyAmounts = sectionData[account];
            const total = targetMonths.reduce((sum, month) => sum + (monthlyAmounts[month] || 0), 0);
            items.push({ account, monthlyAmounts, total, percentage: 0 });
        }
        
        for (const month of allMonths) {
            monthlyTotals[month] = items.reduce((sum, item) => sum + (item.monthlyAmounts[month] || 0), 0);
        }
        
        const grandTotal = targetMonths.reduce((sum, month) => sum + (monthlyTotals[month] || 0), 0);
        
        // Calculate percentage
        if (grandTotal !== 0) {
          items.forEach(item => item.percentage = (item.total / grandTotal) * 100);
        }

        return { items, monthlyTotals, grandTotal };
    };

    const operatingRevenue = processSection(rawData.revenue);
    const operatingExpenses = processSection(rawData.expenses);

    const netIncome = {
        monthlyTotals: {} as {[key: string]: number},
        grandTotal: operatingRevenue.grandTotal + operatingExpenses.grandTotal
    };

    for (const month of allMonths) {
        netIncome.monthlyTotals[month] = (operatingRevenue.monthlyTotals[month] || 0) + (operatingExpenses.monthlyTotals[month] || 0);
    }

    return { months: targetMonths, operatingRevenue, operatingExpenses, netIncome };
  }

  // --- NEW LEDGER METHODS ---

  getTransactions(filters: { startDate?: string, endDate?: string, item?: string, category?: string, vendorName?: string, description?: string }): TransactionEntry[] {
    let transactions = this.mockTransactions();

    if (filters.startDate) {
      transactions = transactions.filter(t => t.date >= filters.startDate!);
    }
    if (filters.endDate) {
      transactions = transactions.filter(t => t.date <= filters.endDate!);
    }
    if (filters.item) {
      transactions = transactions.filter(t => t.item === filters.item);
    }
    if (filters.category) {
      transactions = transactions.filter(t => t.category === filters.category);
    }
    if (filters.vendorName) {
      transactions = transactions.filter(t => t.vendorName === filters.vendorName);
    }
    if (filters.description) {
        const searchTerm = filters.description.toLowerCase();
        transactions = transactions.filter(t => t.description?.toLowerCase().includes(searchTerm));
    }
    
    return transactions;
  }

  addTransaction(entry: Omit<TransactionEntry, 'id'>): void {
    const newTransaction: TransactionEntry = {
      ...entry,
      id: `TXN${Date.now()}`
    };
    this.mockTransactions.update(transactions => [...transactions, newTransaction]);
  }

  updateTransaction(updatedEntry: TransactionEntry): void {
    this.mockTransactions.update(transactions => 
      transactions.map(t => t.id === updatedEntry.id ? updatedEntry : t)
    );
  }

  getLedgerFilterOptions(): { items: string[], categories: string[], vendorNames: string[] } {
    const transactions = this.mockTransactions();
    const items = [...new Set<string>(transactions.map(t => t.item))];
    const categories = [...new Set<string>(transactions.map(t => t.category))];
    const vendorNames = [...new Set<string>(transactions.map(t => t.vendorName).filter((v): v is string => !!v))];
    return { 
      items: items.sort(), 
      categories: categories.sort(), 
      vendorNames: vendorNames.sort() 
    };
  }
  
  // --- NEW EVENT METHODS ---
  getEvents(): EventEntry[] {
    return this.mockEvents();
  }

  getEventById(id: string): EventEntry | undefined {
    return this.mockEvents().find(e => e.id === id);
  }

  addEvent(eventData: Omit<EventEntry, 'id'>): void {
    const newEvent: EventEntry = {
      ...eventData,
      id: `EVT${Date.now()}`
    };
    this.mockEvents.update(events => [...events, newEvent]);
  }

  updateEvent(updatedEvent: EventEntry): void {
    this.mockEvents.update(events =>
      events.map(e => e.id === updatedEvent.id ? updatedEvent : e)
    );
  }
  
  deleteEvent(id: string): void {
    this.mockEvents.update(events => events.filter(e => e.id !== id));
  }

  // --- NEW DAILY REVENUE METHODS ---
  getDailyRevenueReport(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const daysInMonth = endDate.getDate();
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const report = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        
        const dailyData = this.mockDailyRevenue().find(d => d.date === dateStr) 
            || { date: dateStr, nonEventRevenue: 0, isDayOff: false };

        const eventsOnDay = this.mockEvents().filter(e => e.date === dateStr && e.status === 'active');
        
        const eventRevenue = eventsOnDay.reduce((sum, e) => sum + e.actualRevenue, 0);
        const totalDailyRevenue = dailyData.nonEventRevenue + eventRevenue;
        const eventNames = eventsOnDay.map(e => e.name);
        
        report.push({
            day,
            date: dateStr,
            isDayOff: dailyData.isDayOff,
            totalDailyRevenue,
            eventRevenue,
            eventNames
        });
    }
    return report;
  }

  getDailyRevenueEntryByDate(date: string): DailyRevenueEntry {
    return this.mockDailyRevenue().find(d => d.date === date) 
        || { date, nonEventRevenue: 0, isDayOff: false };
  }

  updateDailyRevenueEntry(date: string, updatedData: Partial<Omit<DailyRevenueEntry, 'date'>>) {
    this.mockDailyRevenue.update(entries => {
        const index = entries.findIndex(e => e.date === date);
        if (index > -1) {
            const newEntries = [...entries];
            newEntries[index] = { ...newEntries[index], ...updatedData };
            return newEntries;
        } else {
            return [...entries, { date, nonEventRevenue: updatedData.nonEventRevenue ?? 0, isDayOff: updatedData.isDayOff ?? false }];
        }
    });
  }

  // --- NEW PAYROLL METHODS ---

  getEmployees(type?: 'part-time' | 'full-time'): Employee[] {
    const employees = this.mockEmployees();
    if (type) {
      return employees.filter(e => e.type === type);
    }
    return employees;
  }

  getEmployeeById(id: string): Employee | undefined {
      return this.mockEmployees().find(e => e.id === id);
  }

  getPayrollSummary(year: number, month: number) {
    const ftEmployees = this.getEmployees('full-time');
    const ptEmployees = this.getEmployees('part-time');
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    const fullTimePayroll = ftEmployees.reduce((sum, emp) => sum + (emp.monthlySalary || 0), 0);
    
    const partTimePayrollDetails = ptEmployees.map(emp => {
      const records = this.mockPunchRecords().filter(r => r.employeeId === emp.id && r.date.startsWith(monthPrefix));
      let totalHours = 0;
      let totalPay = 0;
      let hasMissingPunch = false;

      records.forEach(r => {
        if (!r.clockIn || !r.clockOut) {
          hasMissingPunch = true;
          return;
        }
        
        const [inHours, inMinutes] = r.clockIn.split(':').map(Number);
        const [outHours, outMinutes] = r.clockOut.split(':').map(Number);
        
        const start = new Date(0, 0, 0, inHours, inMinutes);
        const end = new Date(0, 0, 0, outHours, outMinutes);
        
        if (end < start) return; // Ignore invalid entries
        
        const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        const hours = diffMinutes / 60;
        const roundedHours = Math.floor(hours * 100) / 100;

        totalHours += roundedHours;
        let dailyPay = roundedHours * (emp.hourlyRate || 0);
        if (r.isDoublePay) {
            dailyPay *= 2;
        }
        totalPay += dailyPay;
      });
      
      return {
        employeeId: emp.id,
        name: emp.name,
        totalHours,
        totalPay,
        hasMissingPunch
      };
    });
    
    const partTimeTotalPayroll = partTimePayrollDetails.reduce((sum, emp) => sum + emp.totalPay, 0);

    return {
      fullTimePayroll,
      partTimePayroll: partTimeTotalPayroll,
      partTimeDetails: partTimePayrollDetails
    };
  }

  getPunchRecordsForMonth(employeeId: string, year: number, month: number): PunchRecord[] {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.mockPunchRecords().filter(r => r.employeeId === employeeId && r.date.startsWith(monthPrefix));
  }

  updatePunchRecords(employeeId: string, year: number, month: number, updatedRecords: PunchRecord[]): void {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    this.mockPunchRecords.update(records => {
      const otherRecords = records.filter(r => !(r.employeeId === employeeId && r.date.startsWith(monthPrefix)));
      const newRecordsForMonth = updatedRecords.filter(r => r.clockIn || r.clockOut);
      return [...otherRecords, ...newRecordsForMonth];
    });
  }

  // --- Purchasing & Vendors Methods ---

  getVendors(): Vendor[] {
    return this.mockVendors();
  }

  addVendor(vendorData: Omit<Vendor, 'id'>): void {
    const newVendor: Vendor = { ...vendorData, id: `V${Date.now()}` };
    this.mockVendors.update(vendors => [...vendors, newVendor]);
  }

  updateVendor(updatedVendor: Vendor): void {
    this.mockVendors.update(vendors => vendors.map(v => v.id === updatedVendor.id ? updatedVendor : v));
  }

  deleteVendor(id: string): void {
    this.mockVendors.update(vendors => vendors.filter(v => v.id !== id));
  }

  getPurchaseOrders(): PurchaseOrder[] {
    return this.mockPurchaseOrders();
  }

  addPurchaseOrder(poData: Omit<PurchaseOrder, 'id'>): void {
    const newPO: PurchaseOrder = { ...poData, id: `PO${Date.now()}` };
    this.mockPurchaseOrders.update(pos => [...pos, newPO]);
  }

  updatePurchaseOrder(updatedPO: PurchaseOrder): void {
    this.mockPurchaseOrders.update(pos => pos.map(p => p.id === updatedPO.id ? updatedPO : p));
  }

  deletePurchaseOrder(id: string): void {
    this.mockPurchaseOrders.update(pos => pos.filter(p => p.id !== id));
  }

  // --- Product Cost Methods ---
  getProductCosts(): ProductCost[] { return this.mockProductCosts(); }
  addProductCost(costData: Omit<ProductCost, 'id'>): void {
    const newItem: ProductCost = { ...costData, id: `PC${Date.now()}` };
    this.mockProductCosts.update(costs => [...costs, newItem]);
  }
  updateProductCost(updatedCost: ProductCost): void {
    this.mockProductCosts.update(costs => costs.map(c => c.id === updatedCost.id ? updatedCost : c));
  }
  deleteProductCost(id: string): void {
    this.mockProductCosts.update(costs => costs.filter(c => c.id !== id));
  }

  // 雪茄成本 API
  async getCigarCosts(): Promise<CigarCost[]> {
    try {
      const response = await firstValueFrom(
        this.apiService.get('/product-cost?type=cigars')
      ) as any;
      if (response.success && Array.isArray(response.data)) {
        const mapped = response.data.map((row: any) => ({
          id: String(row.id),
          brand: row.brand ?? '',
          productName: row.productName ?? row.product_name ?? '',
          size: row.size ?? '',
          quantityPerBox: Number(row.quantityPerBox ?? row.quantity_per_box ?? 0),
          lishengCost: Number(row.lishengCost ?? row.lisheng_cost ?? 0),
          baijiaCost: Number(row.baijiaCost ?? row.baijia_cost ?? 0),
          sellingPrice: Number(row.sellingPrice ?? row.selling_price ?? 0),
        })) as CigarCost[];
        this.mockCigarCosts.set(mapped);
        return mapped;
      }
      return this.mockCigarCosts();
    } catch (error) {
      console.error('Failed to fetch cigar costs:', error);
      return this.mockCigarCosts();
    }
  }
  
  async addCigarCost(costData: Omit<CigarCost, 'id'>): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.post('/product-cost', {
        recordType: 'cigars',
        product_name: costData.productName,
        brand: costData.brand,
        size: costData.size,
        quantity_per_box: costData.quantityPerBox,
        lisheng_cost: costData.lishengCost,
        baijia_cost: costData.baijiaCost,
        selling_price: costData.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '新增雪茄資料失敗');
    }

    await this.getCigarCosts();
  }
  
  async updateCigarCost(updatedCost: CigarCost): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.put('/product-cost', {
        recordType: 'cigars',
        id: updatedCost.id,
        product_name: updatedCost.productName,
        brand: updatedCost.brand,
        size: updatedCost.size,
        quantity_per_box: updatedCost.quantityPerBox,
        lisheng_cost: updatedCost.lishengCost,
        baijia_cost: updatedCost.baijiaCost,
        selling_price: updatedCost.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '更新雪茄資料失敗');
    }

    await this.getCigarCosts();
  }
  
  async deleteCigarCost(id: string): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.delete(`/product-cost?type=cigars&id=${id}`)
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '刪除雪茄資料失敗');
    }

    this.mockCigarCosts.update(costs => costs.filter(c => c.id !== id));
  }

  // 紅白酒成本 API
  async getWineCosts(): Promise<WineCost[]> {
    try {
      const response = await firstValueFrom(
        this.apiService.get('/product-cost?type=wines')
      ) as any;
      if (response.success && Array.isArray(response.data)) {
        const mapped = response.data.map((row: any) => ({
          id: String(row.id),
          vendor: row.vendor ?? row.vendor_name ?? '',
          productName: row.productName ?? row.product_name ?? '',
          type: row.type ?? '',
          cost: Number(row.cost ?? 0),
          sellingPrice: Number(row.sellingPrice ?? row.selling_price ?? 0),
        })) as WineCost[];
        this.mockWineCosts.set(mapped);
        return mapped;
      }
      return this.mockWineCosts();
    } catch (error) {
      console.error('Failed to fetch wine costs:', error);
      return this.mockWineCosts();
    }
  }
  
  async addWineCost(costData: Omit<WineCost, 'id'>): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.post('/product-cost', {
        recordType: 'wines',
        vendor_name: costData.vendor,
        product_name: costData.productName,
        type: costData.type,
        cost: costData.cost,
        selling_price: costData.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '新增酒類資料失敗');
    }

    await this.getWineCosts();
  }
  
  async updateWineCost(updatedCost: WineCost): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.put('/product-cost', {
        recordType: 'wines',
        id: updatedCost.id,
        vendor_name: updatedCost.vendor,
        product_name: updatedCost.productName,
        type: updatedCost.type,
        cost: updatedCost.cost,
        selling_price: updatedCost.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '更新酒類資料失敗');
    }

    await this.getWineCosts();
  }
  
  async deleteWineCost(id: string): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.delete(`/product-cost?type=wines&id=${id}`)
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '刪除酒類資料失敗');
    }

    this.mockWineCosts.update(costs => costs.filter(c => c.id !== id));
  }
  
  // --- Customer Methods ---
  getCustomers(): Customer[] {
    return this.mockCustomers();
  }
  getFeedbackForCustomer(customerId: string): CustomerFeedback[] {
    return this.mockCustomerFeedback().filter(f => f.customerId === customerId);
  }

  // --- Annual Summary Methods ---
  getAnnualSummaryReport(startYear: number, endYear: number): AnnualSummaryReport {
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    const report: AnnualSummaryReport = {
      years,
      revenue: { total: 0 } as any,
      expense: { total: 0 } as any,
      net: { total: 0 } as any,
      unpaid: { total: 0 } as any,
    };
    const allLedger = [...this.mockLedger2024, ...this.mockLedger2025, ...this.mockLedger2026];

    years.forEach(year => {
      const yearEntries = allLedger.filter(e => e.date.startsWith(year.toString()));
      const revenue = yearEntries.filter(e => e.category !== '銷貨折讓').reduce((sum, item) => sum + item.income, 0);
      const allowance = yearEntries.filter(e => e.category === '銷貨折讓').reduce((sum, item) => sum + item.income, 0);
      const netRevenue = revenue - allowance;
      const expense = yearEntries.reduce((sum, item) => sum + item.expense, 0);
      report.revenue[year] = netRevenue;
      report.expense[year] = expense;
      report.net[year] = netRevenue - expense;
      report.unpaid[year] = expense * 0.15; // Mock data for unpaid
    });
    
    report.revenue.total = years.reduce((s, y) => s + report.revenue[y], 0);
    report.expense.total = years.reduce((s, y) => s + report.expense[y], 0);
    report.net.total = years.reduce((s, y) => s + report.net[y], 0);
    report.unpaid.total = years.reduce((s, y) => s + report.unpaid[y], 0);

    return report;
  }

  getMonthlyDetail(year: number, type: 'revenue' | 'expense' | 'unpaid'): MonthlyDetailReport | null {
      // Mock implementation.
      const yearStr = year.toString();
      const allLedger = [...this.mockLedger2024, ...this.mockLedger2025, ...this.mockLedger2026];
      const yearEntries = allLedger.filter(e => e.date.startsWith(yearStr));
      
      const report: MonthlyDetailReport = { year, type: type === 'unpaid' ? '未付' : (type === 'revenue' ? '收入' : '支出'), data: [] };

      for (let i = 1; i <= 12; i++) {
        const monthStr = `${yearStr}-${String(i).padStart(2, '0')}`;
        const monthEntries = (yearEntries as any[]).filter((e: any) => e.date?.startsWith(monthStr));
        if (monthEntries.length === 0) continue;

        let total = 0;
        const itemMap = new Map<string, number>();

        if (type === 'revenue') {
          (monthEntries as any[]).forEach((e: any) => {
            if (e.income > 0) {
              const amount = e.category === '銷貨折讓' ? -e.income : e.income;
              itemMap.set(e.category, (itemMap.get(e.category) || 0) + amount);
              total += amount;
            }
          });
        } else if (type === 'expense') {
          (monthEntries as any[]).forEach((e: any) => {
            if (e.expense > 0) {
              itemMap.set(e.category, (itemMap.get(e.category) || 0) + e.expense);
              total += e.expense;
            }
          });
        } else { // unpaid
            const expenseTotal = (monthEntries as any[]).reduce((s: number, e: any) => s + e.expense, 0);
            total = expenseTotal * 0.15; // Mock logic
            itemMap.set('應付帳款', total * 0.7);
            itemMap.set('應付薪資', total * 0.3);
        }

        report.data.push({
          month: i,
          total,
          items: Array.from(itemMap.entries()).map(([name, amount]) => ({ name, amount }))
        });
      }
      return report.data.length > 0 ? report : null;
  }
  
  // --- Product Gross Margin ---
  getProductGrossMarginReport(startYearMonth: string, endYearMonth: string): ProductGrossMarginReport {
    // This is a simplified mock implementation
    const summary = {
      dining: { totalPurchases: 50000, totalSales: 150000, grossMargin: 100000, grossMarginRate: 0.66 },
      drinks: { totalPurchases: 80000, totalSales: 200000, grossMargin: 120000, grossMarginRate: 0.60 },
      cigars: { totalPurchases: 120000, totalSales: 220000, grossMargin: 100000, grossMarginRate: 0.45 },
      venue: { totalPurchases: 10000, totalSales: 80000, grossMargin: 70000, grossMarginRate: 0.875 },
      total: { totalPurchases: 260000, totalSales: 650000, grossMargin: 390000, grossMarginRate: 0.60 },
    };

    const monthlySales: MonthlySalesRow[] = [];
    let currentDate = new Date(startYearMonth.replace('/', '-') + '-01');
    const endDate = new Date(endYearMonth.replace('/', '-') + '-01');

    while (currentDate <= endDate) {
        const dining = 50000 + Math.random() * 20000;
        const drinks = 60000 + Math.random() * 30000;
        const cigars = 70000 + Math.random() * 40000;
        const venue = 20000 + Math.random() * 10000;
        monthlySales.push({
            month: `${currentDate.getFullYear()}/${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
            dining,
            drinks,
            cigars,
            venue,
            total: dining + drinks + cigars + venue,
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return { summary, monthlySales };
  }
  
  // --- Shareholder Rebates ---
  private mockRebateTransactions = signal<RebateTransaction[]>([
    { id: 'RT001', shareholderName: '股東 A', checkoutTime: '2024/08/01 20:30:15', discountDetails: '餐飲8折', invoiceAmount: 5000, rebatePercentage: 5, rebateAmount: 250, discountUsed: '無' },
    { id: 'RT002', shareholderName: '股東 A', checkoutTime: '2024/08/15 21:00:00', discountDetails: '雪茄9折', invoiceAmount: 8000, rebatePercentage: 5, rebateAmount: 400, discountUsed: '生日券' },
    { id: 'RT003', shareholderName: '股東 B', checkoutTime: '2024/08/10 19:45:00', discountDetails: '全單85折', invoiceAmount: 12000, rebatePercentage: 8, rebateAmount: 960, discountUsed: '無' },
  ]);

  getShareholderRebates(year: number, month: number): ShareholderRebate[] {
    // Mock data for a specific month
    return [
      { name: '股東 A', currentMonthRebate: 650, unpaidRebate: 1500, cumulativeRebate: 8500 },
      { name: '股東 B', currentMonthRebate: 960, unpaidRebate: 500, cumulativeRebate: 12000 },
      { name: '股東 C', currentMonthRebate: 200, unpaidRebate: 2200, cumulativeRebate: 5500 },
    ];
  }
  
  getMonthlyRebateHistory(shareholderName: string): { year: number, month: number, totalRebate: number, unpaidRebate: number }[] {
    // Mock data
    return [
      { year: 2024, month: 8, totalRebate: 650, unpaidRebate: 0 },
      { year: 2024, month: 7, totalRebate: 850, unpaidRebate: 850 },
      { year: 2024, month: 6, totalRebate: 500, unpaidRebate: 0 },
    ].filter(h => h.totalRebate > 0); // simplistic filter
  }

  getRebateTransactions(shareholderName: string, year: number, month: number): RebateTransaction[] {
    const prefix = `${year}/${String(month).padStart(2, '0')}`;
    return this.mockRebateTransactions().filter(tx => tx.shareholderName === shareholderName && tx.checkoutTime.startsWith(prefix));
  }

  updateRebateTransaction(updatedTx: RebateTransaction): void {
      this.mockRebateTransactions.update(txs => 
          txs.map(tx => tx.id === updatedTx.id ? { ...updatedTx, isEdited: true } : tx)
      );
  }

  // --- Goal Setting Methods ---
  getTargetGoals(): TargetGoal[] {
    return this.mockTargetGoals();
  }

  addTargetGoal(goalData: Omit<TargetGoal, 'id'>): void {
    const newGoal: TargetGoal = {
      ...goalData,
      id: `TG${Date.now()}`
    };
    this.mockTargetGoals.update(goals => [...goals, newGoal]);
  }

  updateTargetGoal(updatedGoal: TargetGoal): void {
    this.mockTargetGoals.update(goals =>
      goals.map(g => (g.id === updatedGoal.id ? updatedGoal : g))
    );
  }

  deleteTargetGoal(id: string): void {
    this.mockTargetGoals.update(goals => goals.filter(g => g.id !== id));
  }
}
