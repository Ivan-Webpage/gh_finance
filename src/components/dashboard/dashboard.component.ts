import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, effect, inject, signal, afterNextRender, computed, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Customer,
  EventEntry,
  ReminderEntry,
  ReminderStatus,
  ShiftScheduleEntry,
  ShiftUnavailabilityEntry,
} from '../../models/financial.model';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';

declare var Chart: any;

interface DashboardData {
  revenue: number;           // 營業收入
  expenses: number;          // 營業費用
  allowance: number;         // 營業折讓
  purchases: number;         // 進貨總額 (餐點+飲品+雪茄+其他)
  beveragePurchase: number;  // 進貨-飲品
  foodPurchase: number;      // 進貨-餐點
  cigarPurchase: number;     // 進貨-雪茄 + 其他類進貨
}

interface MonthlyPerformance {
  month: string;
  revenue: number;
  expenses: number;
  allowance: number;
  purchases: number;
}

interface DailyRevenuePoint {
  date: string;
  amount: number;
}

interface PayableEmployeeRow {
  employee_id: number;
  employee_name: string;
  pending_amount: number;
  total_payable: number;
  display_amount: number;
}

interface PayableMonthlyItem {
  monthLabel: string;
  amount: number;
}

interface AccountsPayableRow {
  entry_id: number;
  entry_date: string;
  creditor: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string | null;
  description: string | null;
}

interface DashboardPayables {
  accountsPayableTotal: number;
  salaryEmployees: PayableEmployeeRow[];
  shareholderEmployees: PayableEmployeeRow[];
  cigarPurchaseTotal: number;
  renovationTotal: number;
  accountsPayableMonthly: PayableMonthlyItem[];
  cigarPurchaseMonthly: PayableMonthlyItem[];
}

interface DashboardCashState {
  cash: number;
  bankDeposit: number;
  linePay: number;
  jko: number;
  creditCard: number;
}

interface SpecialDateEntry {
  id?: number | string;
  date: string;
  name?: string;
  multiplier?: number;
  is_active?: boolean;
}

interface CalendarFilterState {
  events: boolean;
  reminders: boolean;
  specialDates: boolean;
  schedules: boolean;
  unavailable: boolean;
}

function normalizeCalendarDate(dateValue: string | null | undefined): string {
  const raw = String(dateValue || '').trim();
  if (!raw) return '';
  if (raw.length >= 10) return raw.slice(0, 10);
  return raw;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true, // 根據 imports 判斷應為 standalone
  imports: [CommonModule, FormsModule, CalendarViewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  isViewer = computed(() => this.authService.hasRole('viewer'));

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatYearMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private parseAnnouncementFinalDecision(content: string): string {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return String(parsed.finalDecision || parsed.decision || '').trim();
      }
    } catch {
      // ignore
    }
    return String(content || '').trim();
  }

  private normalizeLedgerText(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
      const bytes = new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
      if (/[\u4e00-\u9fff]/.test(decoded)) {
        return decoded;
      }
    } catch {
      // noop
    }

    return raw;
  }

  private subjectEquals(source: string, target: string): boolean {
    return this.normalizeLedgerText(source) === this.normalizeLedgerText(target);
  }

  private subjectContains(source: string, keyword: string): boolean {
    return this.normalizeLedgerText(source).includes(this.normalizeLedgerText(keyword));
  }

  private isRevenueEntry(itemGroup: string, subject: string): boolean {
    return (
      this.subjectContains(itemGroup, '營業收入') ||
      this.subjectContains(subject, '營業收入') ||
      this.subjectContains(subject, '銷貨收入')
    );
  }

  private isAllowanceEntry(subject: string): boolean {
    return (
      this.subjectEquals(subject, '-銷貨折讓') ||
      this.subjectEquals(subject, '-營業折讓') ||
      this.subjectContains(subject, '營業折讓') ||
      this.subjectContains(subject, '銷或折讓') ||
      this.subjectContains(subject, '銷貨折讓')
    );
  }

  private getPurchaseType(subject: string): 'food' | 'beverage' | 'cigar' | null {
    const normalized = this.normalizeLedgerText(subject);

    if (
      normalized === '進貨-餐點' ||
      normalized === '採購-餐飲' ||
      normalized.startsWith('存貨-餐')
    ) {
      return 'food';
    }

    if (
      normalized === '進貨-飲品' ||
      normalized === '採購-酒水' ||
      normalized.startsWith('存貨-酒')
    ) {
      return 'beverage';
    }

    if (
      normalized === '進貨-雪茄' ||
      normalized === '進貨-其他' ||
      normalized === '採購-雪茄' ||
      normalized === '代採雪茄費用' ||
      normalized.includes('雪茄')
    ) {
      return 'cigar';
    }

    return null;
  }

        /**
         * 重設篩選條件
         */
        resetFilter(): void {
          // 範例：重設日期篩選欄位
          this.filterStartDate = this.formatDate(this.firstDayOfMonth);
          this.filterEndDate = this.formatDate(this.today);
          this.startDate.set(this.filterStartDate);
          this.endDate.set(this.filterEndDate);
          this.loadData(this.filterStartDate, this.filterEndDate);
        }
      /**
       * 建立日期區間陣列（YYYY-MM-DD）
       */
      buildDateRange(startDate: string, endDate: string): string[] {
        const result: string[] = [];
        let current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
          result.push(this.formatDate(current));
          current.setDate(current.getDate() + 1);
        }
        return result;
      }
    /**
     * 更新所有圖表資料
     * @param monthly 月績效資料
     * @param purchase 進貨資料
     * @param daily 每日營收資料
     */
    updateCharts(monthly: MonthlyPerformance[], purchase: any[], daily: DailyRevenuePoint[]): void {
      // TODO: 根據實際圖表實例更新資料
      // 可直接調用 this.monthlyChart, this.purchaseChart, this.dailyRevenueChart 的 .data/.update()
      if (this.monthlyChart) {
        this.monthlyChart.data.labels = monthly.map(d => d.month);
        this.monthlyChart.data.datasets[0].data = monthly.map(d => d.revenue);
        this.monthlyChart.data.datasets[1].data = monthly.map(d => d.expenses);
        this.monthlyChart.data.datasets[2].data = monthly.map(d => d.allowance);
        this.monthlyChart.data.datasets[3].data = monthly.map(d => d.purchases);
        this.monthlyChart.update();
      }
      if (this.purchaseChart) {
        this.purchaseChart.data.labels = purchase.map(d => d.category);
        this.purchaseChart.data.datasets[0].data = purchase.map(d => d.amount);
        this.purchaseChart.update();
      }
      if (this.dailyRevenueChart) {
        this.dailyRevenueChart.data.labels = daily.map(d => d.date);
        this.dailyRevenueChart.data.datasets[0].data = daily.map(d => d.amount);
        this.dailyRevenueChart.update();
      }
    }

    /**
     * 計算往前N個月的起始日期字串（YYYY-MM-DD）
     */
    calculateMonthsBack(months: number): string {
      const today = new Date();
      let y = today.getFullYear();
      let m = today.getMonth() + 1 - months;
      while (m <= 0) {
        y--;
        m += 12;
      }
      return `${y}-${String(m).padStart(2, '0')}-01`;
    }

    /**
     * 計算每月績效資料
     * @param ledgerData 帳務資料
     * @returns 月績效陣列
     */
    calculateMonthlyPerformance(ledgerData: any[]): MonthlyPerformance[] {
      const monthlyMap = new Map<string, MonthlyPerformance>();

      ledgerData.forEach((entry) => {
        const month = String(entry.entry_date || '').slice(0, 7);
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { month, revenue: 0, expenses: 0, allowance: 0, purchases: 0 });
        }

        const perf = monthlyMap.get(month)!;
        const subject = this.normalizeLedgerText(entry.subject_name || '');
        const itemGroup = this.normalizeLedgerText(entry.item_group || '');
        const signedAmount = Number(entry.amount) || 0;
        const amount = Math.abs(signedAmount);

        if (this.isAllowanceEntry(subject)) {
          perf.allowance += amount;
        } else if (this.isRevenueEntry(itemGroup, subject)) {
          perf.revenue += amount;
        } else if (itemGroup === '營業費用' || this.subjectContains(itemGroup, '營業費用')) {
          perf.expenses += amount;
        } else if (subject.startsWith('進貨') || subject.startsWith('存貨') || this.getPurchaseType(subject) !== null) {
          // 進貨/存貨允許負值沖抵（例如轉科/沖銷），不能用 abs 破壞淨額
          perf.purchases += signedAmount;
        }
      });

      return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * 根據科目名稱撈取所有帳務資料
     */
    async fetchAllLedgerEntriesBySubject(subjectName: string): Promise<any[]> {
      try {
        const response = await this.apiService.getLedgerEntries({ subjectNameExact: subjectName, limit: 10000 });
        if (response.success && response.data && response.data.length > 0) {
          return response.data;
        }

        const fallbackResponse = await this.apiService.getLedgerEntries({ limit: 10000 });
        if (!fallbackResponse.success || !fallbackResponse.data) {
          return [];
        }

        return fallbackResponse.data.filter(entry =>
          this.subjectEquals(entry.subject_name || '', subjectName)
        );
      } catch {
        return [];
      }
    }

    /**
     * 合計所有帳務資料金額
     */
    sumLedgerAmounts(entries: any[]): number {
      return entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    }

    /**
     * 將帳務資料分組為月結資料陣列
     */
    buildMonthlyPayableRows(entries: any[]): PayableMonthlyItem[] {
      const monthlyMap = new Map<string, number>();
      entries.forEach(entry => {
        const month = String(entry.entry_date || '').slice(0, 7);
        const amount = Number(entry.amount) || 0;
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + amount);
      });
      return Array.from(monthlyMap.entries()).map(([monthLabel, amount]) => ({ monthLabel, amount }));
    }
  apiService = inject(ApiService);

  // ===== Dashboard block: Customers (for Cigar members card) =====
  dashboardCustomers = signal<Customer[]>([]);
  dashboardCustomersLoading = signal(false);
  dashboardCustomersError = signal<string | null>(null);

  dashboardCigarMemberCount = computed(() => {
    const all = this.dashboardCustomers();
    return all.filter(c => this.getCustomerCategory(c) === 'cigar').length;
  });

  private getCustomerCategory(customer: Customer): 'exCigar' | 'cigar' | 'shareholder' | 'regular' {
    const name = customer.name || '';
    if (/ex雪茄會員/i.test(name)) return 'exCigar';
    if (name.includes('雪茄')) return 'cigar';
    if (name.includes('股東')) return 'shareholder';
    return 'regular';
  }

  goToCigarMembers(): void {
    this.router.navigate(['/customer-analysis'], {
      queryParams: {
        category: 'cigar',
      },
    });
  }

  // ===== Dashboard block: Cash =====
  cashState = signal<DashboardCashState>({
    cash: 0,
    bankDeposit: 0,
    linePay: 0,
    jko: 0,
    creditCard: 0,
  });

  cashTotal = computed(() => {
    const state = this.cashState();
    return (
      this.toNumber(state.cash) +
      this.toNumber(state.bankDeposit) +
      this.toNumber(state.linePay) +
      this.toNumber(state.jko) +
      this.toNumber(state.creditCard)
    );
  });

  private cashSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCashSavedJson = '';

  private readonly formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 初始化日期：預設為當月1日至今日
  private today = new Date();
  private firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);

  startDate = signal(this.formatDate(this.firstDayOfMonth));
  endDate = signal(this.formatDate(this.today));
  
  // 用於表單綁定的暫存變數
  filterStartDate = this.formatDate(this.firstDayOfMonth);
  filterEndDate = this.formatDate(this.today);

  dashboardData = signal<DashboardData | null>(null);
  monthlyPerformance = signal<MonthlyPerformance[]>([]);
  dailyRevenueTrend = signal<DailyRevenuePoint[]>([]);
  payablesData = signal<DashboardPayables>({
    accountsPayableTotal: 0,
    salaryEmployees: [],
    shareholderEmployees: [],
    cigarPurchaseTotal: 0,
    renovationTotal: 0,
    accountsPayableMonthly: [],
    cigarPurchaseMonthly: [],
  });

  payableDetailModalVisible = signal<boolean>(false);
  payableDetailModalTitle = signal<string>('');
  payableDetailKind = signal<'monthly' | 'accountsPayableUnpaid'>('monthly');
  payableDetailRows = signal<PayableMonthlyItem[]>([]);

  accountsPayableUnpaidLoading = signal(false);
  accountsPayableUnpaidError = signal<string | null>(null);
  accountsPayableUnpaidRows = signal<AccountsPayableRow[]>([]);

  payableDetailTotal = computed(() => {
    if (this.payableDetailKind() === 'accountsPayableUnpaid') {
      return this.accountsPayableUnpaidRows().reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0);
    }
    return this.payableDetailRows().reduce((sum, row) => sum + Number(row.amount || 0), 0);
  });

  private toNumber(value: any): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private toInteger(value: any): number {
    const n = this.toNumber(value);
    return Math.trunc(n);
  }

  private normalizeCashPayload(state: DashboardCashState): DashboardCashState {
    return {
      cash: this.toInteger(state.cash),
      bankDeposit: this.toInteger(state.bankDeposit),
      linePay: this.toInteger(state.linePay),
      jko: this.toInteger(state.jko),
      creditCard: this.toInteger(state.creditCard),
    };
  }

  formatDateText(value: string | null | undefined): string {
    return String(value || '').slice(0, 10);
  }

  salaryPayableTotal = computed(() => {
    return this.payablesData().salaryEmployees.reduce((sum, employee) => {
      return sum + Number(employee.display_amount || 0);
    }, 0);
  });

  shareholderPayableTotal = computed(() => {
    return this.payablesData().shareholderEmployees.reduce((sum, employee) => {
      return sum + Number(employee.display_amount || 0);
    }, 0);
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  // ===== Dashboard blocks: Calendar (Events) =====
  dashboardCalendarEvents = signal<EventEntry[]>([]);
  dashboardCalendarFilters = signal<CalendarFilterState>({
    events: true,
    reminders: true,
    specialDates: true,
    schedules: true,
    unavailable: true,
  });
  dashboardCalendarLoading = signal(false);
  dashboardCalendarError = signal<string | null>(null);

  filteredDashboardCalendarEvents = computed(() => {
    const filters = this.dashboardCalendarFilters();
    const all = this.dashboardCalendarEvents();

    return all.filter(event => {
      const id = String(event.id || '');
      if (id.startsWith('reminder-')) return filters.reminders;
      if (id.startsWith('special-date-')) return filters.specialDates;
      if (id.startsWith('shift-')) return filters.schedules;
      if (id.startsWith('unavailable-')) return filters.unavailable;
      return filters.events;
    });
  });

  dashboardCalendarYearMonth = signal(this.formatYearMonth(new Date()));

  dashboardEventsSummary = computed(() => {
    const yearMonth = this.dashboardCalendarYearMonth();
    const activeEvents = this.filteredDashboardCalendarEvents().filter(event => {
      if (event.status !== 'active') return false;
      const eventMonth = String(event.date || '').slice(0, 7);
      return !yearMonth || eventMonth === yearMonth;
    });
    const estimatedRevenue = activeEvents.reduce((sum, event) => sum + Number(event.estimatedRevenue || 0), 0);
    const actualRevenue = activeEvents.reduce((sum, event) => sum + Number(event.actualRevenue || 0), 0);
    const achievementRate = estimatedRevenue > 0 ? (actualRevenue / estimatedRevenue) * 100 : 0;
    return { estimatedRevenue, actualRevenue, achievementRate };
  });

  onDashboardCalendarMonthChange(yearMonth: string): void {
    this.dashboardCalendarYearMonth.set(String(yearMonth || '').trim());
  }

  setDashboardCalendarFilter(key: keyof CalendarFilterState, checked: boolean): void {
    this.dashboardCalendarFilters.update(prev => ({ ...prev, [key]: checked }));
  }

  // ===== Dashboard blocks: Major announcements =====
  dashboardAnnouncements = signal<Array<{ date: string; finalDecision: string }>>([]);
  dashboardAnnouncementsLoading = signal(false);
  dashboardAnnouncementsError = signal<string | null>(null);

  // 計算選取區間的平均每日營收
  averageDailyRevenue = computed(() => {
    const data = this.dashboardData();
    if (!data || !this.startDate() || !this.endDate()) return 0;

    const start = new Date(this.startDate());
    const end = new Date(this.endDate());

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays <= 0 ? data.revenue : data.revenue / diffDays;
  });

  // 計算粗利 = 營業收入 - 進貨 - 折讓 - 費用
  grossProfit = computed(() => {
    const data = this.dashboardData();
    if (!data) return 0;
    return data.revenue - data.purchases - data.allowance - data.expenses;
  });

  // 格式化進貨圖表資料
  purchaseChartData = computed(() => {
    const data = this.dashboardData();
    if (!data) return [];
    return [
      { category: '飲品', amount: data.beveragePurchase },
      { category: '餐點', amount: data.foodPurchase },
      { category: '雪茄(含應付)', amount: data.cigarPurchase }
    ];
  });

  @ViewChild('monthlyChart') monthlyChartRef!: ElementRef;
  @ViewChild('purchaseChart') purchaseChartRef!: ElementRef;
  @ViewChild('dailyRevenueChart') dailyRevenueChartRef!: ElementRef;

  private monthlyChart: any;
  private purchaseChart: any;
  private dailyRevenueChart: any;

  constructor() {
    this.loadData(this.startDate(), this.endDate());
    this.loadDashboardCalendarEvents();
    this.loadDashboardAnnouncements();
    this.loadDashboardCashState();
    this.loadDashboardCustomers();

    effect(() => {
      const monthly = this.monthlyPerformance();
      const purchase = this.purchaseChartData();
      const daily = this.dailyRevenueTrend();
      if (this.monthlyChart && this.purchaseChart && this.dailyRevenueChart) {
        this.updateCharts(monthly, purchase, daily);
      }
    });

    afterNextRender(() => {
      this.createCharts();
    });
  }

  private async loadDashboardCustomers(): Promise<void> {
    this.dashboardCustomersLoading.set(true);
    this.dashboardCustomersError.set(null);

    try {
      const response = await this.apiService.getCustomers();
      if (response.success && response.data && Array.isArray(response.data)) {
        this.dashboardCustomers.set(response.data as Customer[]);
      } else {
        this.dashboardCustomersError.set(response.error || '無法取得顧客資料');
      }
    } catch (error) {
      console.warn('Failed to load dashboard customers:', error);
      this.dashboardCustomersError.set('載入顧客資料失敗');
    } finally {
      this.dashboardCustomersLoading.set(false);
    }
  }

  private async loadDashboardCashState(): Promise<void> {
    try {
      const response = await this.apiService.getDashboardCashState();
      if (response.success && response.data) {
        const normalized = this.normalizeCashPayload(response.data as any);
        this.cashState.set(normalized);
        this.lastCashSavedJson = JSON.stringify(normalized);
      }
    } catch (error) {
      console.warn('Failed to load dashboard cash state:', error);
    }
  }

  updateCashField(field: keyof DashboardCashState, value: unknown): void {
    const next = {
      ...this.cashState(),
      [field]: this.toInteger(value),
    } as DashboardCashState;
    this.cashState.set(next);
    this.onCashStateChange();
  }

  onCashStateChange(): void {
    if (this.cashSaveTimer) {
      clearTimeout(this.cashSaveTimer);
    }

    this.cashSaveTimer = setTimeout(() => {
      this.saveDashboardCashState();
    }, 600);
  }

  private async saveDashboardCashState(): Promise<void> {
    const payload = this.normalizeCashPayload(this.cashState());
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === this.lastCashSavedJson) return;

    try {
      const response = await this.apiService.updateDashboardCashState(payload);
      if (response.success && response.data) {
        const normalized = this.normalizeCashPayload(response.data as any);
        this.cashState.set(normalized);
        this.lastCashSavedJson = JSON.stringify(normalized);
      } else {
        // If save failed, keep local state and retry on next edit.
        console.warn('Failed to save dashboard cash state:', response.error);
      }
    } catch (error) {
      console.warn('Failed to save dashboard cash state:', error);
    }
  }

  private async loadDashboardCalendarEvents(): Promise<void> {
    this.dashboardCalendarLoading.set(true);
    this.dashboardCalendarError.set(null);

    try {
      const [eventsResponse, remindersResponse, specialDatesResponse, schedulesResponse, unavailabilityResponse] = await Promise.all([
        this.apiService.getAllEvents({
          sortBy: 'date',
          sortOrder: 'asc',
        }),
        this.apiService.getReminders({
          limit: 2000,
        }),
        this.apiService.getSpecialDates({
          is_active: true,
        }),
        this.apiService.getShiftSchedules({
          is_active: true,
        }),
        this.apiService.getShiftUnavailability({
          is_active: true,
        }),
      ]);

      const events = eventsResponse.success && eventsResponse.data ? eventsResponse.data : [];
      const reminders = remindersResponse.success && remindersResponse.data ? remindersResponse.data : [];
      const specialDates = specialDatesResponse.success && specialDatesResponse.data ? specialDatesResponse.data : [];
      const schedules = schedulesResponse.success && schedulesResponse.data ? schedulesResponse.data : [];
      const unavailability = unavailabilityResponse.success && unavailabilityResponse.data ? unavailabilityResponse.data : [];
      const reminderEvents = this.mapRemindersToCalendarEvents(reminders);
      const specialDateEvents = this.mapSpecialDatesToCalendarEvents(specialDates);
      const scheduleEvents = this.mapSchedulesToCalendarEvents(schedules);
      const unavailabilityEvents = this.mapUnavailabilityToCalendarEvents(unavailability);

      this.dashboardCalendarEvents.set([
        ...events,
        ...reminderEvents,
        ...specialDateEvents,
        ...scheduleEvents,
        ...unavailabilityEvents,
      ]);

      if (!eventsResponse.success) {
        this.dashboardCalendarError.set(eventsResponse.error || '載入活動日曆失敗');
      } else if (!remindersResponse.success) {
        this.dashboardCalendarError.set(remindersResponse.error || '載入事項提醒失敗');
      } else if (!specialDatesResponse.success) {
        this.dashboardCalendarError.set(specialDatesResponse.error || '載入特殊工作日失敗');
      } else if (!schedulesResponse.success) {
        this.dashboardCalendarError.set(schedulesResponse.error || '載入排班失敗');
      } else if (!unavailabilityResponse.success) {
        this.dashboardCalendarError.set(unavailabilityResponse.error || '載入不可上班時段失敗');
      }
    } catch (error: any) {
      console.error('Failed to load dashboard calendar events:', error);
      this.dashboardCalendarEvents.set([]);
      this.dashboardCalendarError.set(error?.error?.error || '載入活動日曆失敗');
    } finally {
      this.dashboardCalendarLoading.set(false);
    }
  }

  private mapRemindersToCalendarEvents(reminders: ReminderEntry[]): EventEntry[] {
    return (reminders || []).map(r => ({
      id: `reminder-${r.id}`,
      type: (r.category || '事項提醒') as any,
      status: ((r.status as ReminderStatus) || 'pending') as any,
      useSpace: '',
      date: r.date,
      time: (r.time || '') as any,
      name: `[提醒]${r.event}`,
      organizer: '',
      attendees: '',
      estimatedRevenue: 0,
      deposit: null as any,
      actualRevenue: 0,
      notes: '',
    }));
  }

  private mapSpecialDatesToCalendarEvents(specialDates: SpecialDateEntry[]): EventEntry[] {
    return (specialDates || []).map(item => ({
      id: `special-date-${item.id ?? item.date}`,
      type: '特殊工作日' as any,
      status: 'active' as any,
      useSpace: '',
      date: normalizeCalendarDate(item.date),
      time: '' as any,
      name: `[特殊工作日]${item.name || '特殊工作日'} (${Number(item.multiplier || 1)}x)`,
      organizer: '',
      attendees: '',
      estimatedRevenue: 0,
      deposit: null as any,
      actualRevenue: 0,
      notes: '',
    }));
  }

  private mapSchedulesToCalendarEvents(items: ShiftScheduleEntry[]): EventEntry[] {
    return (items || []).map(item => ({
      id: `shift-${item.id}`,
      type: '排班表' as any,
      status: 'active' as any,
      useSpace: '',
      date: normalizeCalendarDate(item.date),
      time: `${item.start_time}~${item.end_time}`,
      name: `[排班]${item.employee_name} (${item.employee_type === 'full-time' ? '正職' : '計時'})`,
      organizer: '',
      attendees: '',
      estimatedRevenue: 0,
      deposit: null as any,
      actualRevenue: 0,
      notes: item.notes || '',
    }));
  }

  private mapUnavailabilityToCalendarEvents(items: ShiftUnavailabilityEntry[]): EventEntry[] {
    return (items || []).map(item => ({
      id: `unavailable-${item.id}`,
      type: '不可上班' as any,
      status: 'pending' as any,
      useSpace: '',
      date: normalizeCalendarDate(item.date),
      time: item.is_all_day ? '全天' : `${item.start_time || ''}~${item.end_time || ''}`,
      name: `[不可上班]${item.employee_name}`,
      organizer: '',
      attendees: '',
      estimatedRevenue: 0,
      deposit: null as any,
      actualRevenue: 0,
      notes: item.reason || '',
    }));
  }

  private async loadDashboardAnnouncements(): Promise<void> {
    this.dashboardAnnouncementsLoading.set(true);
    this.dashboardAnnouncementsError.set(null);

    try {
      const response = await this.apiService.getCollaborationAnnouncements();
      if (!response.success || !response.data) {
        throw new Error(response.error || '載入重大事項佈達失敗');
      }

      const mapped = (response.data as any[])
        .map(item => {
          const date = item?.announcedAt ? String(item.announcedAt).split('T')[0] : '';
          const finalDecision = this.parseAnnouncementFinalDecision(String(item?.content || ''));
          return { date, finalDecision };
        })
        .filter(row => row.date || row.finalDecision)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

      this.dashboardAnnouncements.set(mapped);
    } catch (error: any) {
      console.error('Failed to load dashboard announcements:', error);
      this.dashboardAnnouncements.set([]);
      this.dashboardAnnouncementsError.set(error?.message || '載入重大事項佈達失敗');
    } finally {
      this.dashboardAnnouncementsLoading.set(false);
    }
  }

  /**
   * 載入當前區間與過去12個月的財務數據
   */
  async loadData(startDate?: string, endDate?: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const start = startDate || this.startDate();
      const end = endDate || this.endDate();

      const [periodDataResponse, yearlyDataResponse] = await Promise.all([
        this.apiService.getLedgerEntries({
          startDate: start,
          endDate: end,
          limit: 10000,
        }),
        this.apiService.getLedgerEntries({
          startDate: this.calculateMonthsBack(12),
          endDate: end,
          limit: 10000,
        })
      ]);

      if (periodDataResponse.success && periodDataResponse.data) {
        this.dashboardData.set(this.calculateDashboardMetrics(periodDataResponse.data));
        this.dailyRevenueTrend.set(this.calculateDailyRevenueTrend(periodDataResponse.data, start, end));
      }

      if (yearlyDataResponse.success && yearlyDataResponse.data) {
        this.monthlyPerformance.set(this.calculateMonthlyPerformance(yearlyDataResponse.data));
      }

      await this.loadPayablesData();
    } catch (error) {
      console.error('載入財務數據時發生異常:', error);
      const errorMsg = error instanceof Error ? error.message : '載入資料失敗，請稍後再試';
      this.errorMessage.set(errorMsg);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadPayablesData(): Promise<void> {
    const [
      payrollResult,
      shareholderResult,
      accountsPayableResult,
      cigarPayableResult,
      renovationPayableResult,
    ] = await Promise.allSettled([
      this.apiService.getPayrollPayablesSummary(),
      this.apiService.getShareholderPayablesSummary(),
      this.fetchAllLedgerEntriesBySubject('應付帳款'),
      this.fetchAllLedgerEntriesBySubject('應付雪茄進貨'),
      this.fetchAllLedgerEntriesBySubject('應付裝潢款'),
    ]);

    // 處理員工與股東薪資發放邏輯 (省略重複映射邏輯)
    const payrollEmployees: PayableEmployeeRow[] =
      payrollResult.status === 'fulfilled' && payrollResult.value?.success
        ? (payrollResult.value.data?.employees || []).map((employee: any) => ({
            employee_id: Number(employee.employee_id || 0),
            employee_name: String(employee.employee_name || ''),
            pending_amount: Number(employee.total_payable || 0),
            total_payable: Number(employee.total_payable || 0),
            display_amount: Number(employee.total_payable || 0),
          }))
        : [];

    const shareholderEmployees: PayableEmployeeRow[] =
      shareholderResult.status === 'fulfilled' && shareholderResult.value?.success
        ? (shareholderResult.value.data?.employees || []).map((employee: any) => {
            const pendingAmount = Number(employee.pending_amount ?? employee.total_payable ?? 0);
            const totalAmount = Number(employee.total_payable || 0);
            return {
              employee_id: Number(employee.employee_id || 0),
              employee_name: String(employee.employee_name || ''),
              pending_amount: pendingAmount,
              total_payable: totalAmount,
              display_amount: pendingAmount,
            };
          })
        : [];

    const accountsPayableEntries = accountsPayableResult.status === 'fulfilled' ? accountsPayableResult.value : [];
    const cigarPayableEntries = cigarPayableResult.status === 'fulfilled' ? cigarPayableResult.value : [];
    const renovationPayableEntries = renovationPayableResult.status === 'fulfilled' ? renovationPayableResult.value : [];

    // 儀表板「應付帳款」卡片顯示：採用總帳淨額（允許負值沖抵），避免 abs 導致總計失真
    const accountsPayableRemainingTotal = this.sumLedgerAmounts(accountsPayableEntries);
    
    this.payablesData.set({
      ...this.payablesData(),
      salaryEmployees: payrollEmployees,
      shareholderEmployees,
      accountsPayableTotal: accountsPayableRemainingTotal,
      cigarPurchaseTotal: this.sumLedgerAmounts(cigarPayableEntries),
      renovationTotal: this.sumLedgerAmounts(renovationPayableEntries),
      accountsPayableMonthly: this.buildMonthlyPayableRows(accountsPayableEntries),
      cigarPurchaseMonthly: this.buildMonthlyPayableRows(cigarPayableEntries),
    });
  }

  private calculateDailyRevenueTrend(ledgerData: any[], startDate: string, endDate: string): DailyRevenuePoint[] {
    const dailyMap = new Map<string, number>();

    ledgerData.forEach(entry => {
      const itemGroup = entry.item_group || '';
      const subject = entry.subject_name || '';
      if (!this.isRevenueEntry(itemGroup, subject)) return;
      const amount = Math.abs(Number(entry.amount) || 0);
      const dateKey = String(entry.entry_date || '').slice(0, 10);
      if (!dateKey) return;
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + amount);
    });

    return this.buildDateRange(startDate, endDate).map(date => ({
      date,
      amount: dailyMap.get(date) || 0,
    }));
  }

  /**
   * 計算儀表板核心指標
   * 分類依據：
   * - 營業收入: 營業收入
   * - 營業費用: 營業費用項目組
   * - 營業折讓: -營業折讓
   * - 進貨類別: 進貨-餐點, 進貨-飲品, 進貨-雪茄等
   */
  private calculateDashboardMetrics(ledgerData: any[]): DashboardData {
    const metrics: DashboardData = {
      revenue: 0, expenses: 0, allowance: 0, purchases: 0,
      beveragePurchase: 0, foodPurchase: 0, cigarPurchase: 0,
    };

    ledgerData.forEach((entry) => {
      const signedAmount = Number(entry.amount) || 0;
      const amount = Math.abs(signedAmount);
      const itemGroup = this.normalizeLedgerText(entry.item_group || '');
      const subject = this.normalizeLedgerText(entry.subject_name || '');

      if (this.isAllowanceEntry(subject)) {
        metrics.allowance += amount;
      } else if (this.isRevenueEntry(itemGroup, subject)) {
        metrics.revenue += amount;
      } else if (itemGroup === '營業費用' || this.subjectContains(itemGroup, '營業費用')) {
        metrics.expenses += amount;
      } else {
        const purchaseType = this.getPurchaseType(subject);
        if (purchaseType === 'food') {
          metrics.foodPurchase += signedAmount;
          metrics.purchases += signedAmount;
        } else if (purchaseType === 'beverage') {
          metrics.beveragePurchase += signedAmount;
          metrics.purchases += signedAmount;
        } else if (purchaseType === 'cigar') {
          metrics.cigarPurchase += signedAmount;
          metrics.purchases += signedAmount;
        }
      }
    });

    return metrics;
  }

  applyFilter(): void {
    if (this.filterStartDate > this.filterEndDate) {
      alert('開始日期不可大於結束日期');
      return;
    }
    this.startDate.set(this.filterStartDate);
    this.loadData(this.filterStartDate, this.filterEndDate);
  }

  private createCharts(): void {
    // 趨勢圖標籤還原
    const monthlyCtx = this.monthlyChartRef.nativeElement.getContext('2d');
    const monthlyData = this.monthlyPerformance();
    
    this.monthlyChart = new Chart(monthlyCtx, {
      type: 'line',
      data: {
        labels: monthlyData.map(d => d.month),
        datasets: [
          { label: '營業收入', data: monthlyData.map(d => d.revenue), borderColor: '#4f46e5' },
          { label: '營業費用', data: monthlyData.map(d => d.expenses), borderColor: '#f43f5e' },
          { label: '營業折讓', data: monthlyData.map(d => d.allowance), borderColor: '#f59e0b' },
          { label: '進貨總額', data: monthlyData.map(d => d.purchases), borderColor: '#8b5cf6' }
        ]
      },
      options: { /* ... 省略樣式配置 ... */ }
    });

    const purchaseCtx = this.purchaseChartRef.nativeElement.getContext('2d');
    const purchaseData = this.purchaseChartData();
    this.purchaseChart = new Chart(purchaseCtx, {
      type: 'doughnut',
      data: {
        labels: purchaseData.map(d => d.category),
        datasets: [
          {
            data: purchaseData.map(d => d.amount),
            backgroundColor: ['#60a5fa', '#34d399', '#a78bfa'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    // 每日營收圖標籤
    const dailyCtx = this.dailyRevenueChartRef.nativeElement.getContext('2d');
    const dailyData = this.dailyRevenueTrend();
    this.dailyRevenueChart = new Chart(dailyCtx, {
      type: 'line',
      data: {
        labels: dailyData.map(d => d.date),
        datasets: [
          {
            label: '每日營收',
            data: dailyData.map(d => d.amount),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.12)',
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: '日期' } },
        },
      },
    });
  }

  async openPayableDetail(type: 'accountsPayable' | 'cigarPurchase'): Promise<void> {
    if (type === 'accountsPayable') {
      this.payableDetailKind.set('accountsPayableUnpaid');
      this.payableDetailModalTitle.set('應付帳款（尚未付清）');
      this.accountsPayableUnpaidLoading.set(true);
      this.accountsPayableUnpaidError.set(null);
      this.accountsPayableUnpaidRows.set([]);
      this.payableDetailModalVisible.set(true);

      try {
        const res = await this.apiService.getAccountsPayables();
        if (!res.success) {
          throw new Error(res.error || '載入應付帳款失敗');
        }

        const rows = (res.data || []).map((r: any) => {
          const remaining = this.toNumber(r.remaining_amount);
          return {
            entry_id: this.toNumber(r.entry_id),
            entry_date: String(r.entry_date || ''),
            creditor: r.creditor ?? null,
            total_amount: this.toNumber(r.total_amount),
            paid_amount: this.toNumber(r.paid_amount),
            remaining_amount: remaining,
            due_date: r.due_date ?? null,
            description: r.description ?? null,
          } as AccountsPayableRow;
        });

        this.accountsPayableUnpaidRows.set(rows.filter(r => r.remaining_amount > 0));
      } catch (e: any) {
        this.accountsPayableUnpaidError.set(e?.message || '載入應付帳款失敗');
      } finally {
        this.accountsPayableUnpaidLoading.set(false);
      }

      return;
    }

    this.payableDetailKind.set('monthly');
    this.payableDetailModalTitle.set('進貨雪茄月結明細');
    this.payableDetailRows.set(this.payablesData().cigarPurchaseMonthly);
    this.payableDetailModalVisible.set(true);
  }

  closePayableDetail(): void {
    this.payableDetailModalVisible.set(false);
    this.payableDetailRows.set([]);
    this.payableDetailModalTitle.set('');
    this.payableDetailKind.set('monthly');
    this.accountsPayableUnpaidLoading.set(false);
    this.accountsPayableUnpaidError.set(null);
    this.accountsPayableUnpaidRows.set([]);
  }
}