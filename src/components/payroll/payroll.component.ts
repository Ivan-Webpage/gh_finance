
import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder } from '@angular/forms';

import { ApiService } from '../../services/api.service';

// ====== 補齊缺失的型別定義（Stub） ======
// TODO: 請依實際資料結構補上正確欄位
export interface DailySummary {
  id?: number;
  user_id?: number;
  display_name?: string;
  work_date?: string;
  clock_in_time?: string;
  clock_out_time?: string;
  clock_in_time_input?: string;
  clock_out_time_input?: string;
  work_hours?: number;
  base_wage?: number;
  multiplier?: number;
  special_bonus?: number;
  total_wage?: number;
  is_special_day?: boolean;
  notes?: string;
  is_verified?: boolean;
  is_paid?: boolean;
  wage_type?: string;
}

export interface MonthlySummaryRecord {
  id?: number;
  user_id?: number;
  display_name?: string;
  year?: number;
  month?: number;
  total_work_hours?: number;
  total_wage?: number;
  missing_records?: number;
  is_closed?: boolean;
  is_paid?: boolean;
  is_fully_paid?: boolean;
  is_fully_verified?: boolean;
  entry_id?: number | null;
  year_month?: string;
  wage_type?: string;
}

export interface MonthlySummaryRow extends MonthlySummaryRecord {}

export interface MonthlyDetailRow extends DailySummary {}

export interface EmployeeWage {
  id?: number;
  user_id?: number;
  display_name?: string;
  hourly_rate?: number;
  wage_type?: string;
  effective_from?: string;
  effective_to?: string;
  notes?: string;
}

// PayableEmployee 型別宣告
export interface PayableEmployee {
  employee_id: number;
  employee_name: string;
  total_payable: number;
}

function getPreviousYearMonth(baseDate: Date = new Date()): { year: number; month: number } {
  const d = new Date(baseDate);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}


@Component({
  selector: 'app-payroll',
  templateUrl: './payroll.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PayrollComponent {
  payablesPaymentModalVisible = signal<boolean>(false);
  payablesDetailModalVisible = signal<boolean>(false);
  monthlySalaryAdjustModalVisible = signal<boolean>(false);
  monthlySalaryReleaseModalVisible = signal<boolean>(false);
  dailyFormVisible = signal<boolean>(false);
  activeTab = signal<'daily' | 'wages' | 'special' | 'payables'>('daily');

  getCurrentMonthlySummary() { return this.currentMonthlySummary(); }
  getMonthlyDetailsTitle() { return this.monthlyDetailsTitle(); }
  getMonthlyDetailsVisible() { return this.monthlyDetailsVisible(); }
  getSelectedRows() { return this.selectedRows(); }
  getEmployeeWages() { return this.employeeWages(); }
  getWagesLoading() { return this.wagesLoading(); }
  getWagesError() { return this.wagesError(); }
  getEditingWage() { return this.editingWage(); }
  getEditingDaily() { return this.editingDaily(); }
  getWageForm() { return this.wageForm; }
  getWagesFormVisible() { return this.wagesFormVisible(); }
  getMonthlySalaryOverrides() { return this.monthlySalaryOverrides(); }
  getReleasingMonthlySalarySummary() { return this.releasingMonthlySalarySummary(); }
  getReleasingAmountForm() { return this.releasingAmountForm; }
  getMonthlySalaryReleaseModalVisible() { return this.monthlySalaryReleaseModalVisible(); }
  getAdjustingMonthlySalarySummary() { return this.adjustingMonthlySalarySummary(); }
  getAdjustingAmountForm() { return this.adjustingAmountForm; }
  getMonthlySalaryAdjustModalVisible() { return this.monthlySalaryAdjustModalVisible(); }
  getPayablesLoading() { return this.payablesLoading(); }
  getPayablesError() { return this.payablesError(); }
  getPayablesSummary() { return this.payablesSummary(); }
  getPayablesDetailModalVisible() { return this.payablesDetailModalVisible(); }
  getPayablesDetails() { return this.payablesDetails(); }
  getPayingEmployee() { return this.payingEmployee(); }
  getPayablesPaymentForm() { return this.payablesPaymentForm; }
  getPayablesPaymentModalVisible() { return this.payablesPaymentModalVisible(); }
  getPayablesPaymentSubmitting() { return this.payablesPaymentSubmitting(); }
  getPayablesDetailsLoading() { return this.payablesDetailsLoading(); }

  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  private readonly defaultYearMonth = getPreviousYearMonth();
  selectedYear = this.defaultYearMonth.year;
  selectedMonth = this.defaultYearMonth.month;
  private dailySummariesSignal = signal<DailySummary[]>([]);

  dailySummaries(): DailySummary[] { return this.dailySummariesSignal(); }

  editingDaily = signal<DailySummary | null>(null);
  monthlySummaryRecords = signal<MonthlySummaryRow[]>([]);
  monthlyDetailsRows = signal<MonthlyDetailRow[]>([]);
  currentMonthlySummary = signal<MonthlySummaryRow | null>(null);
  monthlyDetailsTitle = signal<string>('');
  monthlyDetailsVisible = signal<boolean>(false);
  selectedRows = signal<MonthlyDetailRow[]>([]);

  dailyForm = this.fb.group({
    id: [0],
    user_id: [0],
    display_name: [''],
    work_date: [''],
    clock_in_time: [''],
    clock_out_time: [''],
    base_wage: [200],
    multiplier: [1],
    special_bonus: [0],
    is_special_day: [false],
    notes: [''],
  });

  employeeWages = signal<EmployeeWage[]>([]);
  wagesLoading = signal<boolean>(false);
  wagesError = signal<string>('');
  editingWage = signal<EmployeeWage | null>(null);
  wageForm = this.fb.group({
    id: [0],
    user_id: [0],
    display_name: [''],
    hourly_rate: [0],
    wage_type: ['hourly'],
    effective_from: [''],
    effective_to: [''],
    notes: [''],
  });
  wagesFormVisible = signal<boolean>(false);

  monthlySalaryOverrides = signal<Map<string, any>>(new Map());
  releasingMonthlySalarySummary = signal<MonthlySummaryRow | null>(null);
  releasingAmountForm = this.fb.group({
    release_amount: [0],
  });
  adjustingMonthlySalarySummary = signal<MonthlySummaryRow | null>(null);
  adjustingAmountForm = this.fb.group({
    total_wage: [0],
  });

  payablesLoading = signal<boolean>(false);
  payablesError = signal<string>('');
  payablesSummary = signal<{ total_payable: number; employees: PayableEmployee[] }>({
    total_payable: 0,
    employees: [],
  });
  payablesDetailsLoading = signal<boolean>(false);
  payablesDetails = signal<any | null>(null);
  payingEmployee = signal<PayableEmployee | null>(null);
  payablesPaymentSubmitting = signal<boolean>(false);
  payablesPaymentForm = this.fb.group({
    pay_amount: [0],
    remark: [''],
  });

  dailyLoading = signal<boolean>(false);
  dailyError = signal<string>('');
  specialDates = signal<any[]>([]);
  specialLoading = signal<boolean>(false);
  specialError = signal<string>('');
  specialFormVisible = signal<boolean>(false);
  editingSpecial = signal<any | null>(null);
  downloadingReports = signal<Set<string>>(new Set());

  constructor() {
    void this.initializePageData();
  }

  private async initializePageData(): Promise<void> {
    await this.loadDailySummaries();
    await this.loadMonthlySummaries();
  }

  resetFilter(): void {}

  async loadDailySummaries(): Promise<void> {
    this.dailyLoading.set(true);
    this.dailyError.set('');
    try {
      const response = await this.apiService.getDailySummaries({
        year: this.selectedYear,
        month: this.selectedMonth,
        limit: 1000,
      });

      if (response.success && response.data) {
        const normalized = (response.data as any[]).map(row => this.normalizeDailySummary(row));
        this.dailySummariesSignal.set(normalized);
      } else {
        this.dailyError.set(response.error || '讀取每日薪資資料失敗');
        this.dailySummariesSignal.set([]);
      }
    } catch (error) {
      console.error('Error loading daily summaries:', error);
      this.dailyError.set('讀取每日薪資資料失敗');
      this.dailySummariesSignal.set([]);
    } finally {
      this.dailyLoading.set(false);
    }
  }

  normalizeEmployeeWage(row: any): EmployeeWage {
    return {
      ...row,
      user_id: this.toNumber(row.user_id),
      hourly_rate: this.toNumber(row.hourly_rate),
      effective_from: this.toDateInput(row.effective_from),
      effective_to: this.toDateInput(row.effective_to),
    };
  }
  
  private toDateInput(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      if (typeof value === 'string' && value.includes('T')) {
        return value.split('T')[0];
      }
      return typeof value === 'string' ? value : '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }


  private combineDateTime(dateValue: string, timeValue: string): string | null {
    if (!timeValue) return null;
    const date = this.toDateInput(dateValue);
    const dateTime = new Date(`${date}T${timeValue}:00`);
    if (isNaN(dateTime.getTime())) return null;
    const year = dateTime.getFullYear();
    const month = String(dateTime.getMonth() + 1).padStart(2, '0');
    const day = String(dateTime.getDate()).padStart(2, '0');
    const hours = String(dateTime.getHours()).padStart(2, '0');
    const minutes = String(dateTime.getMinutes()).padStart(2, '0');
    const seconds = String(dateTime.getSeconds()).padStart(2, '0');
    const tzOffset = -dateTime.getTimezoneOffset();
    const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
    const tzMinutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
    const tzSign = tzOffset >= 0 ? '+' : '-';
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMinutes}`;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  private requireId(value: unknown, missingMessage: string): number | null {
    const id = this.toNumber(value);
    if (!id) {
      alert(missingMessage);
      return null;
    }
    return id;
  }

  private getSummaryContext(summary: MonthlySummaryRow): {
    userId: number;
    yearMonth: string;
    year: number;
    month: number;
    totalWage: number;
    totalWorkHours: number;
    displayName: string;
    overrideKey: string;
  } {
    const yearMonth = this.getSummaryYearMonth(summary);
    const [year, month] = yearMonth.split('-').map(Number);
    const userId = this.toNumber(summary.user_id);
    const totalWage = this.toNumber(summary.total_wage);
    const totalWorkHours = this.toNumber(summary.total_work_hours);
    const displayName = String(summary.display_name || '');
    const overrideKey = `${userId}-${yearMonth}`;

    return { userId, yearMonth, year, month, totalWage, totalWorkHours, displayName, overrideKey };
  }

  private toTimeInput(value: string | null | undefined): string {
    if (!value) return '';
    
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      // 使用在地時間（Local Time），而非 UTC 時間
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    if (typeof value === 'string') {
      if (value.includes('T')) {
        const timePart = value.split('T')[1] || '';
        return timePart.slice(0, 5);
      }
      return value.slice(0, 5);
    }

    return '';
  }

  private isWageEffectiveForMonth(wageRow: any, year: number, month: number): boolean {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const effectiveFromRaw = wageRow?.effective_from;
    if (!effectiveFromRaw) return false;

    const effectiveFrom = new Date(this.toDateInput(effectiveFromRaw));
    if (Number.isNaN(effectiveFrom.getTime())) return false;

    const effectiveToRaw = wageRow?.effective_to;
    const effectiveTo = effectiveToRaw ? new Date(this.toDateInput(effectiveToRaw)) : null;

    if (effectiveFrom > monthEnd) return false;
    if (effectiveTo && !Number.isNaN(effectiveTo.getTime()) && effectiveTo < monthStart) return false;
    return true;
  }


  /**
   * 計算工作時數（以小時為單位）
   * @param clockInStr 上班打卡時間
   * @param clockOutStr 下班打卡時間
   * @returns 工作時數（小時）
   */
  private calculateWorkHours(clockInStr: string | null, clockOutStr: string | null): number {
    if (!clockInStr || !clockOutStr) return 0;
    
    try {
      // 使用 Date 轉換各種可能的日期格式
      // 支援多種格式: ISO 8601, UTC, 或自定義格式
      let clockIn = new Date(clockInStr);
      let clockOut = new Date(clockOutStr);
      
      // 如果格式不正確，嘗試手動格式化
      if (isNaN(clockIn.getTime())) {
        // 嘗試將 "YYYY-MM-DD HH:mm:ss +HH:mm" 轉換為 ISO 8601
        const formatted = clockInStr.replace(/ /g, 'T').split('+')[0];
        clockIn = new Date(formatted);
      }
      
      if (isNaN(clockOut.getTime())) {
        const formatted = clockOutStr.replace(/ /g, 'T').split('+')[0];
        clockOut = new Date(formatted);
      }

      if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) return 0;

      let diffMs = clockOut.getTime() - clockIn.getTime();
      
      // 如果跨夜（下班時間小於上班時間），補足 24 小時
      if (diffMs < 0) {
        diffMs += 24 * 60 * 60 * 1000;
      }

      // 轉換成小時，並取小數點後兩位
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) * 100) / 100;
      return hours;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 計算薪資 - 包含加班費計算（四捨五入取整數）
   * @param workHours 工作時數
   * @param baseWage 基本時薪
   * @returns 總薪資（整數）
   */
  private calculateWage(workHours: number, baseWage: number): number {
    if (workHours <= 0) return 0;
    let totalWage: number;
    
    if (workHours <= 8) {
      // 基本工時內
      totalWage = workHours * baseWage;
    } else {
      // 超過 8 小時的部分計算加班費 (1.34倍)
      const regularWage = 8 * baseWage;
      const overtimeWage = (workHours - 8) * baseWage * 1.34;
      totalWage = regularWage + overtimeWage;
    }
    
    return Math.floor(totalWage);
  }

  
  private normalizeDailySummary(row: any): DailySummary {
    return {
      ...row,
      id: this.toNumber(row.id),
      user_id: this.toNumber(row.user_id),
      clock_in_time_input: this.toTimeInput(row.clock_in_time),
      clock_out_time_input: this.toTimeInput(row.clock_out_time),
      wage_type: String(row.wage_type || '').toLowerCase() || undefined,
      work_hours: this.toNumber(row.work_hours),
      regular_hours: this.toNumber(row.regular_hours),
      overtime_hours: this.toNumber(row.overtime_hours),
      base_wage: this.toNumber(row.base_wage),
      multiplier: this.toNumber(row.multiplier),
      regular_wage: this.toNumber(row.regular_wage),
      overtime_wage: this.toNumber(row.overtime_wage),
      special_bonus: this.toNumber(row.special_bonus),
      total_wage: this.toNumber(row.total_wage),
    } as DailySummary;
  }

  async loadMonthlySummaries(): Promise<void> {
    try {
      const response = await this.apiService.getMonthlySummaries({
        year: this.selectedYear,
        month: this.selectedMonth,
      });

      const wagesResponse = await this.apiService.getEmployeeWages({
        is_active: true,
        limit: 2000,
      });

      const wageTypeMap = new Map<number, string>();
      if (wagesResponse.success && wagesResponse.data) {
        for (const wageRow of wagesResponse.data) {
          if (!this.isWageEffectiveForMonth(wageRow, this.selectedYear, this.selectedMonth)) {
            continue;
          }

          const employeeId = this.toNumber((wageRow as any).user_id);
          if (!employeeId) continue;
          const wageType = String((wageRow as any).wage_type || '').toLowerCase();
          if (wageType) {
            wageTypeMap.set(employeeId, wageType);
          }
        }
      }

      if (response.success && response.data) {
        const normalized = response.data.map(row => ({
          ...row,
          user_id: this.toNumber(row.user_id),
          year: this.toNumber(row.year),
          month: this.toNumber(row.month),
          year_month: row.year_month || `${this.toNumber(row.year)}-${String(this.toNumber(row.month)).padStart(2, '0')}`,
          wage_type: wageTypeMap.get(this.toNumber(row.user_id)) || String(row.wage_type || '').toLowerCase() || 'hourly',
          total_work_hours: this.toNumber(row.total_work_hours),
          total_wage: this.toNumber(row.total_wage),
          missing_records: this.toNumber(
            row.missing_records ?? row.missing_clock_records ?? row.missing_punch_records ?? row.missing_punch_count
          ),
          is_fully_verified: !!row.is_fully_verified || !!row.is_closed || !!row.is_paid,
          is_fully_paid: !!row.is_fully_paid || !!row.is_paid,
        })) as MonthlySummaryRecord[];

        const yearMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
        const monthlyRecordsByUserId = new Set(
          normalized
            .filter(row => String(row.wage_type || '').toLowerCase() === 'monthly')
            .map(row => this.toNumber(row.user_id))
        );

        if (wagesResponse.success && wagesResponse.data) {
          for (const wageRow of wagesResponse.data) {
            if (!this.isWageEffectiveForMonth(wageRow, this.selectedYear, this.selectedMonth)) {
              continue;
            }

            const employeeId = this.toNumber((wageRow as any).user_id);
            if (!employeeId) continue;

            const wageType = String((wageRow as any).wage_type || '').toLowerCase();
            if (wageType !== 'monthly') continue;
            if (monthlyRecordsByUserId.has(employeeId)) continue;

            normalized.push({
              id: 0,
              user_id: employeeId,
              display_name: String((wageRow as any).display_name || `員工${employeeId}`),
              year: this.selectedYear,
              month: this.selectedMonth,
              year_month: yearMonth,
              total_work_hours: 0,
              total_wage: this.toNumber((wageRow as any).hourly_rate),
              missing_records: 0,
              is_closed: false,
              is_paid: false,
              is_fully_paid: false,
              is_fully_verified: false,
              entry_id: null,
              wage_type: 'monthly',
            });
          }
        }

        this.monthlySummaryRecords.set(normalized);
      } else {
        const fallbackRows: MonthlySummaryRecord[] = [];
        const yearMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;

        if (wagesResponse.success && wagesResponse.data) {
          for (const wageRow of wagesResponse.data) {
            if (!this.isWageEffectiveForMonth(wageRow, this.selectedYear, this.selectedMonth)) {
              continue;
            }

            const employeeId = this.toNumber((wageRow as any).user_id);
            if (!employeeId) continue;

            const wageType = String((wageRow as any).wage_type || '').toLowerCase();
            if (wageType !== 'monthly') continue;

            fallbackRows.push({
              id: 0,
              user_id: employeeId,
              display_name: String((wageRow as any).display_name || `員工${employeeId}`),
              year: this.selectedYear,
              month: this.selectedMonth,
              year_month: yearMonth,
              total_work_hours: 0,
              total_wage: this.toNumber((wageRow as any).hourly_rate),
              missing_records: 0,
              is_closed: false,
              is_paid: false,
              is_fully_paid: false,
              is_fully_verified: false,
              entry_id: null,
              wage_type: 'monthly',
            });
          }
        }

        this.monthlySummaryRecords.set(fallbackRows);
      }
    } catch (error: any) {
      console.error('Error loading monthly summaries:', error);
      this.monthlySummaryRecords.set([]);
    }
  }
  
  openDailyForm(daily?: DailySummary): void {
    if (daily) {
      const normalized = this.normalizeDailySummary(daily);
      this.editingDaily.set(normalized);
      this.dailyForm.patchValue({
        ...normalized,
        work_date: this.toDateInput(normalized.work_date),
      });
    } else {
      this.editingDaily.set(null);
      const summary = this.currentMonthlySummary();
      this.dailyForm.reset({
        user_id: this.toNumber(summary?.user_id),
        display_name: String(summary?.display_name || ''),
        work_date: `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`,
        base_wage: 200,
        multiplier: 1.0,
        special_bonus: 0,
        is_special_day: false,
      });
    }
    this.dailyFormVisible.set(true);
  }

  private getSummaryYearMonth(summary: MonthlySummaryRow): string {
    if (summary.year_month) return summary.year_month;
    if (summary.year && summary.month) {
      return `${summary.year}-${String(summary.month).padStart(2, '0')}`;
    }
    return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
  }

  private getSummaryWageType(summary: MonthlySummaryRow): string {
    const fromSummary = String(summary.wage_type || '').toLowerCase();
    if (fromSummary) return fromSummary;

    const fromDaily = this.dailySummaries().find(row =>
      this.toNumber(row.user_id) === this.toNumber(summary.user_id) &&
      String((row as any).wage_type || '').length > 0
    );

    return String((fromDaily as any)?.wage_type || 'hourly').toLowerCase();
  }

  async openMonthlyDetails(summary: MonthlySummaryRow): Promise<void> {
    const yearMonth = this.getSummaryYearMonth(summary);
    const [year, month] = yearMonth.split('-').map(Number);

    let sourceRows: DailySummary[] = [];
    try {
      const detailResponse = await this.apiService.getDailySummaries({
        year,
        month,
        user_id: this.toNumber(summary.user_id),
        limit: 1000,
      });

      if (detailResponse.success && detailResponse.data) {
        sourceRows = detailResponse.data.map(row => this.normalizeDailySummary(row));
      }
    } catch {
      sourceRows = [];
    }

    if (sourceRows.length === 0) {
      sourceRows = this.dailySummaries().filter(row => this.toNumber(row.user_id) === this.toNumber(summary.user_id));
    }

    const processedRows = sourceRows.map(row => {
      const workDate = row.work_date || '';
      let clockInTime = this.combineDateTime(workDate, row.clock_in_time_input || '');
      let clockOutTime = this.combineDateTime(workDate, row.clock_out_time_input || '');
      if (clockInTime && clockOutTime) {
        const clockInDate = new Date(clockInTime).getTime();
        const clockOutDate = new Date(clockOutTime).getTime();
        if (clockOutDate < clockInDate) {
          const [year, month, day] = workDate.split('-');
          const nextDay = new Date(parseInt(year), parseInt(month) - 1, parseInt(day) + 1);
          const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
          clockOutTime = this.combineDateTime(nextDayStr, row.clock_out_time_input || '');
        }
      }
      if (clockInTime && clockOutTime) {
        const newWorkHours = this.calculateWorkHours(clockInTime, clockOutTime);
        const newTotalWage = this.calculateWage(newWorkHours, this.toNumber(row.base_wage));
        return {
          ...row,
          work_hours: newWorkHours,
          total_wage: newTotalWage,
        };
      }
      return row;
    });
    this.monthlyDetailsRows.set(processedRows);
    this.currentMonthlySummary.set(summary);
    this.monthlyDetailsTitle.set(`${summary.display_name} - ${yearMonth}`);
    this.monthlyDetailsVisible.set(true);
  }

  closeMonthlyDetails(): void {
    this.monthlyDetailsVisible.set(false);
    this.monthlyDetailsRows.set([]);
    this.monthlyDetailsTitle.set('');
    this.currentMonthlySummary.set(null);
    this.selectedRows.set([]); // 清空選取項目
    // 重新載入每日摘要以更新狀態
    this.loadDailySummaries();
  }

  async verifyMonthlyDetail(row: MonthlyDetailRow): Promise<void> {
    const rowId = this.requireId(row.id, '缺少薪資記錄 ID，無法核對');
    if (!rowId) return;

    try {
      const response = await this.apiService.updateDailySummary(rowId, {
        is_verified: !row.is_verified,
      });
      if (response.success) {
        alert(row.is_verified ? '已取消審核' : '審核成功');
        this.loadDailySummaries();
      } else {
        alert('操作失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
    }
  }

  async releaseMonthlyDetail(row: MonthlyDetailRow): Promise<void> {
    const rowId = this.requireId(row.id, '缺少薪資記錄 ID，無法發放');
    if (!rowId) return;

    try {
      const response = await this.apiService.updateDailySummary(rowId, {
        is_paid: !row.is_paid,
      });
      if (response.success) {
        alert(row.is_paid ? '已取消發放' : '發放成功');
        this.loadDailySummaries();
      } else {
        alert('操作失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
    }
  }

  closeDailyForm(): void {
    this.dailyFormVisible.set(false);
    this.editingDaily.set(null);
    this.dailyForm.reset();
  }

  async saveDailyRecord(): Promise<void> {
    if (!this.dailyForm.valid) {
      alert('請填寫必要欄位');
      return;
    }

    try {
      const formData = this.dailyForm.value;
      const editing = this.getEditingDaily();
      const userId = this.toNumber(formData.user_id);
      const displayName = String(formData.display_name || '').trim();

      if (!userId) {
        alert('員工 ID 不可為空，請從員工明細視窗新增打卡記錄');
        return;
      }

      if (!displayName) {
        alert('員工姓名不可為空');
        return;
      }

      if (!formData.work_date) {
        alert('請填寫工作日期');
        return;
      }

      // 檢查是否重複（新增紀錄時檢查）
      if (!editing) {
        const existingRecord = this.dailySummaries().find(
          (summary: any) => this.toNumber(summary.user_id) === userId && summary.work_date === formData.work_date
        );
        if (existingRecord) {
          alert(`該人員已在 ${formData.work_date} 有打卡紀錄，請前往編輯或刪除原紀錄`);
          return;
        }
      }

      // 組合日期與時間
      let clockInTime = null;
      let clockOutTime = null;
      if (formData.work_date && formData.clock_in_time) {
        clockInTime = this.combineDateTime(formData.work_date, formData.clock_in_time);
      }
      if (formData.work_date && formData.clock_out_time) {
        clockOutTime = this.combineDateTime(formData.work_date, formData.clock_out_time);
      }

      // 檢查是否需要針對下班時間進行跨日處理
      if (clockInTime && clockOutTime) {
        const clockInDate = new Date(clockInTime).getTime();
        const clockOutDate = new Date(clockOutTime).getTime();
        // 如果下班時間小於上班時間，自動將下班日期設為隔日
        if (clockOutDate < clockInDate) {
          const [year, month, day] = formData.work_date.split('-');
          const nextDay = new Date(parseInt(year), parseInt(month) - 1, parseInt(day) + 1);
          const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
          clockOutTime = this.combineDateTime(nextDayStr, formData.clock_out_time || '');
        }
      }

      // 計算工作時數與薪資
      const newWorkHours = this.calculateWorkHours(clockInTime, clockOutTime);
      const newTotalWage = this.calculateWage(newWorkHours, formData.base_wage || 200);

      const payload = {
        user_id: userId,
        display_name: displayName,
        work_date: formData.work_date,
        clock_in_time: clockInTime || undefined,
        clock_out_time: clockOutTime || undefined,
        work_hours: newWorkHours,
        base_wage: formData.base_wage || 200,
        multiplier: formData.multiplier || 1.0,
        special_bonus: formData.special_bonus || 0,
        total_wage: newTotalWage,
        release_amount: newTotalWage,
        is_special_day: formData.is_special_day || false,
        notes: formData.notes || '',
      };

      if (editing) {
        const editingId = this.requireId(editing.id, '缺少薪資記錄 ID，無法更新');
        if (!editingId) return;

        // 更新紀錄
        const response = await this.apiService.updateDailySummary(editingId, payload);
        if (response.success) {
          alert('更新成功');
          this.closeDailyForm();
          this.loadDailySummaries();
        } else {
          alert('更新失敗: ' + (response.error || '未知錯誤'));
        }
      } else {
        // 新增紀錄
        const response = await this.apiService.createDailySummary(payload);
        if (response.success) {
          alert('新增成功');
          this.closeDailyForm();
          this.loadDailySummaries();
        } else {
          alert('新增失敗: ' + (response.error || '未知錯誤'));
        }
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
      console.error('Error saving daily record:', error);
    }
  }

  async deleteDailyRecord(daily: DailySummary): Promise<void> {
    const dailyId = this.requireId(daily.id, '缺少薪資記錄 ID，無法刪除');
    if (!dailyId) return;

    if (!confirm(`確定要刪除 ${daily.display_name} 的薪資紀錄嗎？`)) {
      return;
    }

    try {
      const response = await this.apiService.deleteDailySummary(dailyId);
      if (response.success) {
        alert('刪除成功');
        this.loadDailySummaries();
      } else {
        alert('刪除失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('刪除失敗: ' + error?.message);
      console.error('Error deleting daily record:', error);
    }
  }

  async verifyDailyRecord(daily: DailySummary): Promise<void> {
    const dailyId = this.requireId(daily.id, '缺少薪資記錄 ID，無法審核');
    if (!dailyId) return;

    try {
      const response = await this.apiService.updateDailySummary(dailyId, {
        is_verified: !daily.is_verified,
        verified_by: 'user',
        verified_at: !daily.is_verified ? new Date().toISOString() : null,
      });

      if (response.success) {
        alert(daily.is_verified ? '已取消審核' : '審核成功');
        this.loadDailySummaries();
      } else {
        alert('操作失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
    }
  }

  async releaseDailyRecord(daily: DailySummary): Promise<void> {
    const dailyId = this.requireId(daily.id, '缺少薪資記錄 ID，無法發放');
    if (!dailyId) return;

    try {
      const response = await this.apiService.updateDailySummary(dailyId, {
        is_paid: !daily.is_paid,
        paid_by: 'user',
        paid_at: !daily.is_paid ? new Date().toISOString() : null,
      });

      if (response.success) {
        alert(daily.is_paid ? '已取消發放' : '發放成功');
        this.loadDailySummaries();
      } else {
        alert('操作失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
    }
  }

  // ========== 正式員工(月薪)管理 暫不開發 ==========

  // ========== 員工時薪管理 ==========

  async loadEmployeeWages(): Promise<void> {
    this.wagesLoading.set(true);
    this.wagesError.set('');

    try {
      const response = await this.apiService.getEmployeeWages({
        limit: 1000,
      });

      if (response.success && response.data) {
        const normalized = response.data.map(row => this.normalizeEmployeeWage(row));
        this.employeeWages.set(normalized);
      } else {
        this.wagesError.set(response.error || '讀取資料失敗');
      }
    } catch (error: any) {
      this.wagesError.set(error?.message || '讀取失敗');
      console.error('Error loading employee wages:', error);
    } finally {
      this.wagesLoading.set(false);
    }
  }

  openWageForm(wage?: EmployeeWage): void {
    if (wage) {
      const normalized = this.normalizeEmployeeWage(wage);
      this.editingWage.set(normalized);
      this.wageForm.patchValue({
        ...normalized,
        effective_from: this.toDateInput(normalized.effective_from),
        effective_to: this.toDateInput(normalized.effective_to),
      });
    } else {
      this.editingWage.set(null);
      this.wageForm.reset({
        wage_type: 'hourly',
        effective_from: this.toDateInput(new Date()),
      });
    }
    this.wagesFormVisible.set(true);
  }

  closeWageForm(): void {
    this.wagesFormVisible.set(false);
    this.editingWage.set(null);
    this.wageForm.reset();
  }

  async saveWageRecord(): Promise<void> {
    if (!this.wageForm.valid) {
      alert('請填寫必要欄位');
      return;
    }

    try {
      const formData = this.wageForm.value;
      const editing = this.getEditingWage();

      if (editing) {
        const editingId = this.requireId(editing.id, '缺少薪資設定 ID，無法更新');
        if (!editingId) return;

        // 更新
        const response = await this.apiService.updateEmployeeWage(editingId, formData);
        if (response.success) {
          alert('更新成功');
          this.closeWageForm();
          this.loadEmployeeWages();
        } else {
          alert('更新失敗: ' + (response.error || '未知錯誤'));
        }
      } else {
        // 新增
        const response = await this.apiService.createEmployeeWage({
          user_id: Number(formData.user_id || 0),
          display_name: String(formData.display_name || ''),
          hourly_rate: Number(formData.hourly_rate || 0),
          wage_type: String(formData.wage_type || 'hourly'),
          effective_from: String(formData.effective_from || this.toDateInput(new Date())),
          effective_to: formData.effective_to ? String(formData.effective_to) : undefined,
          notes: formData.notes ? String(formData.notes) : undefined,
        });
        if (response.success) {
          alert('新增成功');
          this.closeWageForm();
          this.loadEmployeeWages();
        } else {
          alert('新增失敗: ' + (response.error || '未知錯誤'));
        }
      }
    } catch (error: any) {
      alert('操作失敗: ' + error?.message);
      console.error('Error saving wage record:', error);
    }
  }

  async deleteWageRecord(wage: EmployeeWage): Promise<void> {
    const wageId = this.requireId(wage.id, '缺少薪資設定 ID，無法刪除');
    if (!wageId) return;

    if (!confirm(`確定要刪除 ${wage.display_name || `ID: ${wage.user_id}`} 的薪資設定嗎？`)) {
      return;
    }

    try {
      const response = await this.apiService.deleteEmployeeWage(wageId);
      if (response.success) {
        alert('刪除成功');
        this.loadEmployeeWages();
      } else {
        alert('刪除失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('刪除失敗: ' + error?.message);
      console.error('Error deleting wage record:', error);
    }
  }

  // ========== 格式化方法 ==========

  formatCurrency(value: number | undefined): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
    });
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dateString;
    }
  }

  formatDateYMD(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return dateString || '';
    }
  }

  formatMonth(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    } catch {
      return dateString;
    }
  }

  formatDateYM(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      return `${year}年${month}月`;
    } catch {
      return dateString;
    }
  }

  
  formatDateTime(dateTimeString: string | undefined): string {
    if (!dateTimeString) return '';
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return dateTimeString;
    }
  }

  formatTime(timeString: string | undefined): string {
    if (!timeString) return '';
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeString;
    }
  }

  // ========== 月薪管理功能 ==========
  async verifyMonthlySalarySummary(summary: MonthlySummaryRow): Promise<void> {
    const ctx = this.getSummaryContext(summary);

    if (!confirm(`確定要審核 ${ctx.displayName} (${ctx.yearMonth}) 的薪資嗎？`)) {
      return;
    }

    try {
      if (!ctx.userId) {
        alert('缺少員工 ID，無法審核薪資');
        return;
      }

      const response = await this.apiService.verifyMonthlySalary(
        ctx.userId,
        ctx.year,
        ctx.month
      );

      if (response.success) {
        alert('審核成功');
        // 更新本地快取
        const nextOverrides = new Map(this.monthlySalaryOverrides());
        const current = nextOverrides.get(ctx.overrideKey) || {};
        nextOverrides.set(ctx.overrideKey, { ...current, is_fully_verified: true });
        this.monthlySalaryOverrides.set(nextOverrides);

        const currentRecords = this.monthlySummaryRecords();
        let matched = false;
        const nextRecords = currentRecords.map(record => {
          if (record.user_id === summary.user_id && record.year === ctx.year && record.month === ctx.month) {
            matched = true;
            return { ...record, is_closed: true };
          }
          return record;
        });

        if (!matched) {
          nextRecords.push({
            id: 0,
            user_id: summary.user_id,
            display_name: summary.display_name,
            year: ctx.year,
            month: ctx.month,
            total_work_hours: summary.total_work_hours,
            total_wage: summary.total_wage,
            is_closed: true,
            is_paid: false,
            entry_id: summary.entry_id || null,
          });
        }
        this.monthlySummaryRecords.set(nextRecords);
      } else {
        alert('審核失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('審核失敗: ' + error?.message);
    }
  }

  async releaseMonthlySalarySummary(summary: MonthlySummaryRow): Promise<void> {
    // 開啟發放金額輸入 Modal
    this.releasingMonthlySalarySummary.set(summary);
    this.releasingAmountForm.patchValue({
      release_amount: summary.total_wage,
    });
    this.monthlySalaryReleaseModalVisible.set(true);
  }

  openMonthlySalaryAdjust(summary: MonthlySummaryRow): void {
    if (summary.is_fully_paid) {
      alert('已發放完成的薪資無法調整');
      return;
    }

    this.adjustingMonthlySalarySummary.set(summary);
    this.adjustingAmountForm.patchValue({
      total_wage: summary.total_wage,
    });
    this.monthlySalaryAdjustModalVisible.set(true);
  }

  
  closeMonthlySalaryAdjustModal(): void {
    this.monthlySalaryAdjustModalVisible.set(false);
    this.adjustingMonthlySalarySummary.set(null);
    this.adjustingAmountForm.reset();
  }

  async confirmMonthlySalaryAdjust(): Promise<void> {
    if (!this.adjustingAmountForm.valid) {
      alert('請輸入正確的薪資金額');
      return;
    }

    const summary = this.getAdjustingMonthlySalarySummary();
    if (!summary) {
      return;
    }

    const totalWage = Number(this.adjustingAmountForm.get('total_wage')?.value);
    if (Number.isNaN(totalWage) || totalWage < 0) {
      alert('請輸入正確的總薪資，且必須大於等於 0');
      return;
    }

    const ctx = this.getSummaryContext(summary);

    if (!confirm(`確定要調整 ${ctx.displayName} (${ctx.yearMonth}) 薪資為 ${this.formatCurrency(totalWage)} 嗎？`)) {
      return;
    }

    try {
      if (!ctx.userId) {
        alert('缺少員工 ID，無法調整薪資');
        return;
      }

      const response = await this.apiService.updateMonthlySummary({
        user_id: ctx.userId,
        year: ctx.year,
        month: ctx.month,
        total_wage: totalWage,
        total_work_hours: summary.total_work_hours,
        display_name: ctx.displayName,
      });

      if (response.success && response.data) {
        alert('調整成功');
        const currentRecords = this.monthlySummaryRecords();
        let matched = false;
        const nextRecords = currentRecords.map(record => {
          if (record.user_id === summary.user_id && record.year === ctx.year && record.month === ctx.month) {
            matched = true;
            return {
              ...record,
              total_wage: totalWage,
              total_work_hours: summary.total_work_hours,
              display_name: summary.display_name,
            };
          }
          return record;
        });
        if (!matched) {
          nextRecords.push({
            id: response.data.id || 0,
            user_id: summary.user_id,
            display_name: ctx.displayName,
            year: ctx.year,
            month: ctx.month,
            total_work_hours: summary.total_work_hours,
            total_wage: totalWage,
            is_closed: false,
            is_paid: false,
            entry_id: summary.entry_id || null,
          });
        }
        this.monthlySummaryRecords.set(nextRecords);
        this.closeMonthlySalaryAdjustModal();
      } else {
        alert('調整失敗：' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('調整失敗：' + error?.message);
    }
  }

  closeMonthlySalaryReleaseModal(): void {
    this.monthlySalaryReleaseModalVisible.set(false);
    this.releasingMonthlySalarySummary.set(null);
    this.releasingAmountForm.reset();
  }

  
  async confirmReleaseMonthlySalarySummary(): Promise<void> {
    if (!this.releasingAmountForm.valid) {
      alert('請輸入正確的發放金額');
      return;
    }

    const summary = this.getReleasingMonthlySalarySummary();
    if (!summary) {
      return;
    }

    const releaseAmount = Number(this.releasingAmountForm.get('release_amount')?.value);
    const ctx = this.getSummaryContext(summary);

    if (!ctx.userId) {
      alert('缺少員工 ID，無法發放薪資');
      return;
    }

    if (Number.isNaN(releaseAmount) || releaseAmount < 0 || releaseAmount > ctx.totalWage) {
      alert(`發放金額需介於 0 ~ ${ctx.totalWage} 元之間`);
      return;
    }

    if (!confirm(`確定要發放 ${ctx.displayName} (${ctx.yearMonth}) 金額 ${this.formatCurrency(releaseAmount)} 嗎？`)) {
      return;
    }

    try {
      const response = await this.apiService.releaseMonthlySalary(
        ctx.userId,
        ctx.year,
        ctx.month,
        ctx.totalWage,
        ctx.totalWorkHours,
        ctx.displayName,
        releaseAmount
      );

      if (response.success && response.data) {
        alert(`發放成功（單號 #${response.data.entry_id}）`);
        const isFullyPaid = releaseAmount >= ctx.totalWage;
        // 更新本地覆寫狀態
        const nextOverrides = new Map(this.monthlySalaryOverrides());
        const current = nextOverrides.get(ctx.overrideKey) || {};
        nextOverrides.set(ctx.overrideKey, {
          ...current,
          is_fully_verified: true,
          is_fully_paid: isFullyPaid,
          entry_id: response.data.entry_id,
        });
        this.monthlySalaryOverrides.set(nextOverrides);

        const currentRecords = this.monthlySummaryRecords();
        let matched = false;
        const nextRecords = currentRecords.map(record => {
          if (record.user_id === summary.user_id && record.year === ctx.year && record.month === ctx.month) {
            matched = true;
            return {
              ...record,
              is_closed: true,
              is_fully_verified: true,
              is_paid: isFullyPaid,
              is_fully_paid: isFullyPaid,
              entry_id: response.data.entry_id,
            };
          }
          return record;
        });
        if (!matched) {
          nextRecords.push({
            id: 0,
            user_id: summary.user_id,
            display_name: summary.display_name,
            year: ctx.year,
            month: ctx.month,
            total_work_hours: summary.total_work_hours,
            total_wage: summary.total_wage,
            is_closed: true,
            is_fully_verified: true,
            is_paid: isFullyPaid,
            is_fully_paid: isFullyPaid,
            entry_id: response.data.entry_id,
          });
        }
        this.monthlySummaryRecords.set(nextRecords);
        this.closeMonthlySalaryReleaseModal();
      } else {
        alert('發放失敗：' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('發放失敗：' + error?.message);
    }

  }

  async onMonthChange(): Promise<void> {
    if (this.activeTab() === 'special') {
      await this.loadSpecialDates();
      return;
    }

    await this.loadDailySummaries();
    await this.loadMonthlySummaries();

    if (this.activeTab() === 'payables') {
      await this.loadPayablesSummary();
    }
  }

  async switchTab(tab: 'daily' | 'wages' | 'special' | 'payables'): Promise<void> {
    this.activeTab.set(tab);

    if (tab === 'wages') {
      await this.loadEmployeeWages();
      return;
    }

    if (tab === 'special') {
      await this.loadSpecialDates();
      return;
    }

    if (tab === 'payables') {
      await this.loadPayablesSummary();
      return;
    }

    await this.loadDailySummaries();
    await this.loadMonthlySummaries();
  }

  dailyStats(): { totalRecords: number; totalWages: number; verifiedCount: number; paidCount: number } {
    const rows = this.dailySummaries();
    const hourlyTotalWages = this.hourlySummaries().reduce((sum, row) => sum + this.toNumber(row.total_wage), 0);
    const monthlyTotalWages = this.monthlySalarySummaries().reduce((sum, row) => sum + this.toNumber(row.total_wage), 0);
    return {
      totalRecords: rows.length,
      totalWages: hourlyTotalWages + monthlyTotalWages,
      verifiedCount: rows.filter(row => !!row.is_verified).length,
      paidCount: rows.filter(row => !!row.is_paid).length,
    };
  }

  private getDailyWageType(row: DailySummary): string {
    return String(row.wage_type || '').toLowerCase() || 'hourly';
  }

  private getMissingRecordsByUser(): Map<number, number> {
    const missingMap = new Map<number, number>();

    for (const row of this.dailySummaries()) {
      const userId = this.toNumber(row.user_id);
      if (!userId) continue;

      const hasMissingPunch = !row.clock_in_time || !row.clock_out_time;
      if (!hasMissingPunch) continue;

      missingMap.set(userId, (missingMap.get(userId) || 0) + 1);
    }

    return missingMap;
  }

  getMonthlyDetailsTotalWorkHours(): number {
    return this.monthlyDetailsRows().reduce((sum, row) => sum + this.toNumber(row.work_hours), 0);
  }

  getMonthlyDetailsTotalWage(): number {
    return this.monthlyDetailsRows().reduce((sum, row) => sum + this.toNumber(row.total_wage), 0);
  }

  hourlySummaries(): MonthlySummaryRow[] {
    const yearMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const monthlyRecordMap = new Map<number, MonthlySummaryRow>();
    const missingMap = this.getMissingRecordsByUser();

    for (const summary of this.monthlySummaryRecords()) {
      const summaryYearMonth = this.getSummaryYearMonth(summary);
      if (summaryYearMonth !== yearMonth) continue;
      const userId = this.toNumber(summary.user_id);
      if (!userId) continue;
      monthlyRecordMap.set(userId, summary);
    }

    const grouped = new Map<number, { display_name: string; total_work_hours: number; total_wage: number; allVerified: boolean; allPaid: boolean }>();

    for (const row of this.dailySummaries()) {
      if (this.getDailyWageType(row) === 'monthly') continue;
      const userId = this.toNumber(row.user_id);
      if (!userId) continue;

      if (!grouped.has(userId)) {
        grouped.set(userId, {
          display_name: String(row.display_name || ''),
          total_work_hours: 0,
          total_wage: 0,
          allVerified: true,
          allPaid: true,
        });
      }

      const group = grouped.get(userId)!;
      group.total_work_hours += this.toNumber(row.work_hours);
      group.total_wage += this.toNumber(row.total_wage);
      group.allVerified = group.allVerified && !!row.is_verified;
      group.allPaid = group.allPaid && !!row.is_paid;
      if (!group.display_name && row.display_name) {
        group.display_name = String(row.display_name);
      }
    }

    const overrides = this.monthlySalaryOverrides();

    return Array.from(grouped.entries()).map(([userId, group]) => {
      const monthlyRecord = monthlyRecordMap.get(userId);
      const overrideKey = `${userId}-${yearMonth}`;
      const override = overrides.get(overrideKey) || {};

      const isClosed = !!(override as any).is_closed || !!monthlyRecord?.is_closed;
      const isFullyVerified = !!(override as any).is_fully_verified
        || !!monthlyRecord?.is_fully_verified
        || !!monthlyRecord?.is_closed
        || !!monthlyRecord?.is_paid
        || group.allVerified;

      const isFullyPaid = !!(override as any).is_fully_paid
        || !!monthlyRecord?.is_fully_paid
        || !!monthlyRecord?.is_paid
        || group.allPaid;

      const entryId = (override as any).entry_id ?? (monthlyRecord?.entry_id ?? null);
      return {
        id: monthlyRecord?.id,
        user_id: userId,
        display_name: group.display_name,
        year: this.selectedYear,
        month: this.selectedMonth,
        year_month: yearMonth,
        wage_type: 'hourly',
        total_work_hours: group.total_work_hours,
        total_wage: group.total_wage,
        missing_records: this.toNumber(monthlyRecord?.missing_records) || (missingMap.get(userId) || 0),
        is_closed: isClosed,
        is_fully_verified: isFullyVerified,
        is_paid: isFullyPaid,
        is_fully_paid: isFullyPaid,
        entry_id: entryId,
      } as MonthlySummaryRow;
    }).sort((a, b) => this.toNumber(a.user_id) - this.toNumber(b.user_id));
  }

  monthlySalarySummaries(): MonthlySummaryRow[] {
    const missingMap = this.getMissingRecordsByUser();
    return this.monthlySummaryRecords()
      .filter(summary => String(summary.wage_type || '').toLowerCase() === 'monthly')
      .map(summary => ({
        ...summary,
        missing_records: this.toNumber(summary.missing_records) || (missingMap.get(this.toNumber(summary.user_id)) || 0),
      }));
  }

  getReleaseStatus(summary: MonthlySummaryRow): 'released' | 'partial' | 'unreleased' {
    if (summary.is_paid || summary.is_fully_paid) return 'released';
    if (summary.entry_id) return 'partial';
    return 'unreleased';
  }

  getReleaseStatusLabel(summary: MonthlySummaryRow): string {
    const status = this.getReleaseStatus(summary);
    if (status === 'released') return '已發放';
    if (status === 'partial') return '部分發放';
    return '未發放';
  }

  canReleaseMonthlySalary(summary: MonthlySummaryRow): boolean {
    // Only allow when: verified (closed) AND not fully paid AND no prior entry.
    const isVerified = !!summary.is_fully_verified || !!summary.is_closed;
    const alreadyHasEntry = !!summary.entry_id;
    const isPaid = !!summary.is_paid || !!summary.is_fully_paid;
    return isVerified && !alreadyHasEntry && !isPaid;
  }

  openCreateClockRecord(): void {
    this.openDailyForm();
  }

  async saveMonthlyDetail(row: MonthlyDetailRow): Promise<void> {
    const rowId = this.requireId(row.id, '缺少打卡記錄 ID，無法儲存');
    if (!rowId) return;

    try {
      let clockInTime = this.combineDateTime(row.work_date || '', row.clock_in_time_input || '');
      let clockOutTime = this.combineDateTime(row.work_date || '', row.clock_out_time_input || '');

      if (clockInTime && clockOutTime) {
        const clockInDate = new Date(clockInTime).getTime();
        const clockOutDate = new Date(clockOutTime).getTime();
        if (clockOutDate < clockInDate) {
          const [year, month, day] = String(row.work_date || '').split('-').map(Number);
          if (year && month && day) {
            const nextDay = new Date(year, month - 1, day + 1);
            const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
            clockOutTime = this.combineDateTime(nextDayStr, row.clock_out_time_input || '');
          }
        }
      }

      const baseWage = this.toNumber(row.base_wage);
      const newWorkHours = this.calculateWorkHours(clockInTime, clockOutTime);
      const newTotalWage = this.calculateWage(newWorkHours, baseWage);
      const regularHours = Math.min(newWorkHours, 8);
      const overtimeHours = Math.max(newWorkHours - 8, 0);
      const regularWage = regularHours * baseWage;
      const overtimeWage = overtimeHours * baseWage * 1.34;

      const response = await this.apiService.updateDailySummary(rowId, {
        clock_in_time: clockInTime,
        clock_out_time: clockOutTime,
        work_hours: newWorkHours,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        base_wage: baseWage,
        multiplier: this.toNumber(row.multiplier) || 1,
        regular_wage: regularWage,
        overtime_wage: overtimeWage,
        special_bonus: this.toNumber(row.special_bonus),
        total_wage: newTotalWage,
        notes: row.notes || '',
      });

      if (response.success) {
        row.work_hours = newWorkHours;
        row.total_wage = newTotalWage;
        row.clock_in_time = clockInTime || undefined;
        row.clock_out_time = clockOutTime || undefined;
        this.monthlyDetailsRows.set([...this.monthlyDetailsRows()]);
        await this.loadDailySummaries();
        await this.loadMonthlySummaries();
        alert('儲存成功');
      } else {
        alert('儲存失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('儲存失敗: ' + (error?.message || '未知錯誤'));
      console.error('Error saving monthly detail row:', error);
    }
  }

  async deleteMonthlyDetail(row: MonthlyDetailRow): Promise<void> {
    await this.deleteDailyRecord(row);
  }

  isRowSelected(rowId: number | undefined): boolean {
    if (!rowId) return false;
    return this.selectedRows().some(selected => selected.id === rowId);
  }

  toggleRowSelection(rowId: number | undefined, checked: boolean): void {
    if (!rowId) return;

    const row = this.monthlyDetailsRows().find(item => item.id === rowId);
    if (!row) return;

    const current = this.selectedRows();
    if (checked) {
      if (!current.some(selected => selected.id === rowId)) {
        this.selectedRows.set([...current, row]);
      }
    } else {
      this.selectedRows.set(current.filter(selected => selected.id !== rowId));
    }
  }

  toggleSelectAll(checked: boolean): void {
    const rows = this.monthlyDetailsRows();
    this.selectedRows.set(checked ? [...rows] : []);
  }

  async batchVerifyRecords(): Promise<void> {
    const rows = this.selectedRows();
    for (const row of rows) {
      await this.verifyMonthlyDetail(row);
    }
  }

  async batchReleaseRecords(): Promise<void> {
    const rows = this.selectedRows();
    for (const row of rows) {
      await this.releaseMonthlyDetail(row);
    }
  }

  updateMonthlyDetailDisplay(): void {
    this.monthlyDetailsRows.set([...this.monthlyDetailsRows()]);
  }

  calculateTotalSalary(): number {
    const detail = this.payablesDetails();
    if (!detail?.monthly_summary) return 0;
    return detail.monthly_summary.reduce((sum: number, row: any) => sum + this.toNumber(row.total_salary), 0);
  }

  calculateTotalPaid(): number {
    const detail = this.payablesDetails();
    if (!detail?.monthly_summary) return 0;
    return detail.monthly_summary.reduce((sum: number, row: any) => sum + this.toNumber(row.paid_amount), 0);
  }

  async downloadLaborReport(summary: MonthlySummaryRow, event?: Event): Promise<void> {
    event?.stopPropagation();
    const key = `${summary.user_id}-${summary.year_month}`;
    const downloading = new Set(this.downloadingReports());
    if (downloading.has(key)) return;

    downloading.add(key);
    this.downloadingReports.set(downloading);

    try {
      const response = await this.apiService.downloadLaborReport(summary.user_id || 0, summary.year_month || '');
      const blob = response.body as Blob;
      if (!blob) throw new Error('下載內容為空');

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;

      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      let fileName = `${summary.display_name || summary.user_id}${summary.year_month}.zip`;

      if (filenameStarMatch?.[1]) {
        try {
          fileName = decodeURIComponent(filenameStarMatch[1]);
        } catch {
          fileName = filenameStarMatch[1];
        }
      } else if (filenameMatch?.[1]) {
        fileName = filenameMatch[1];
      }

      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('downloadLaborReport error:', error);
      alert('下載勞報單失敗');
    } finally {
      const next = new Set(this.downloadingReports());
      next.delete(key);
      this.downloadingReports.set(next);
    }
  }

  openSpecialForm(special?: any): void {
    this.editingSpecial.set(special || null);
    this.specialFormVisible.set(true);
  }

  closeSpecialForm(): void {
    this.specialFormVisible.set(false);
    this.editingSpecial.set(null);
  }

  async loadSpecialDates(): Promise<void> {
    this.specialLoading.set(true);
    this.specialError.set('');
    try {
      let response = await this.apiService.getSpecialDates({ year: this.selectedYear });

      if (response.success && response.data && response.data.length === 0) {
        const fallbackResponse = await this.apiService.getSpecialDates();
        if (fallbackResponse.success && fallbackResponse.data && fallbackResponse.data.length > 0) {
          const latestDate = fallbackResponse.data[0]?.date;
          if (latestDate) {
            const date = new Date(latestDate);
            if (!Number.isNaN(date.getTime())) {
              this.selectedYear = date.getFullYear();
            }
          }
          response = fallbackResponse;
        }
      }

      if (response.success && response.data) {
        this.specialDates.set(response.data as any[]);
      } else {
        this.specialDates.set([]);
        this.specialError.set(response.error || '讀取特殊日失敗');
      }
    } catch (error: any) {
      this.specialError.set(error?.message || '讀取特殊日失敗');
      this.specialDates.set([]);
    } finally {
      this.specialLoading.set(false);
    }
  }

  async saveSpecialDate(payload: any): Promise<void> {
    try {
      const editing = this.editingSpecial();
      const response = editing?.id
        ? await this.apiService.updateSpecialDate(editing.id, payload)
        : await this.apiService.createSpecialDate(payload);

      if (response.success) {
        this.closeSpecialForm();
        await this.loadSpecialDates();
      } else {
        alert(response.error || '儲存特殊日失敗');
      }
    } catch (error: any) {
      alert(error?.message || '儲存特殊日失敗');
    }
  }

  async deleteSpecialDate(id: number): Promise<void> {
    if (!confirm('確定要刪除此特殊日嗎？')) return;
    try {
      const response = await this.apiService.deleteSpecialDate(id);
      if (response.success) {
        await this.loadSpecialDates();
      } else {
        alert(response.error || '刪除特殊日失敗');
      }
    } catch (error: any) {
      alert(error?.message || '刪除特殊日失敗');
    }
  }

  getMonthLabel(): string {
    return `${this.selectedYear}年${this.selectedMonth}月`;
  }

  // === 應付薪資/付款 Modal ===

  /**
   * 載入應付薪資總計
   */
  async loadPayablesSummary(): Promise<void> {
    this.payablesLoading.set(true);
    this.payablesError.set('');

    try {
      const response = await this.apiService.getPayrollPayablesSummary();

      if (response.success && response.data) {
        const payablesData = response.data as any;
        this.payablesSummary.set({
          total_payable: payablesData?.total_payable || 0,
          employees: payablesData?.employees || [],
        });
      } else {
        this.payablesError.set(response.error || '讀取資料失敗');
      }
    } catch (error: any) {
      this.payablesError.set(error?.message || '讀取失敗');
      console.error('Error loading payables summary:', error);
    } finally {
      this.payablesLoading.set(false);
    }
  }

  /**
   * 開啟應付薪資明細 Modal
   * @param employee 員工資料
   */
  async openPayablesDetail(employee: PayableEmployee): Promise<void> {
    this.payablesDetailModalVisible.set(true);
    await this.loadPayablesDetails(employee.employee_id);
  }

  
  openPayablesPaymentModal(employee: PayableEmployee): void {
    this.payingEmployee.set(employee);
    this.payablesPaymentForm.patchValue({ pay_amount: 0, remark: '' });
    this.payablesPaymentModalVisible.set(true);
  }

  closePayablesPaymentModal(): void {
    this.payablesPaymentModalVisible.set(false);
    this.payingEmployee.set(null);
    this.payablesPaymentForm.reset({ pay_amount: 0, remark: '' });
    this.payablesPaymentSubmitting.set(false);
  }

  async submitPayablesPayment(): Promise<void> {
    const employee = this.getPayingEmployee();
    if (!employee) return;

    const rawAmount = this.getPayablesPaymentForm().get('pay_amount')?.value;
    const payAmount = Number(rawAmount);
    if (Number.isNaN(payAmount)) {
      alert('請輸入正確的付款金額');
      return;
    }
    if (payAmount <= 0) {
      alert('付款金額必須大於 0');
      return;
    }
    if (payAmount > employee.total_payable) {
      alert('付款金額不可超過應付總額');
      return;
    }
    const confirmed = confirm(`確定要付款給 ${employee.employee_name} 金額 ${this.formatCurrency(payAmount)} 嗎？`);
    if (!confirmed) return;

    const payRemark = String(this.getPayablesPaymentForm().get('remark')?.value || '').trim();
    this.payablesPaymentSubmitting.set(true);
    try {
      const response = await this.apiService.payPayrollPayables({
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        pay_amount: payAmount,
        remark: payRemark || undefined,
      });
      if (response.success) {
        alert('付款成功');
        const currentDetail = this.getPayablesDetails();
        const shouldReloadDetail =
          this.getPayablesDetailModalVisible() &&
          currentDetail?.employee_id === employee.employee_id;
        this.closePayablesPaymentModal();
        await this.loadPayablesSummary();
        if (shouldReloadDetail) {
          await this.loadPayablesDetails(employee.employee_id);
        }
      } else {
        alert('付款失敗：' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('付款失敗：' + (error?.message || '未知錯誤'));
      console.error('Error paying payroll payables:', error);
    } finally {
      this.payablesPaymentSubmitting.set(false);
    }
  }

  
  async loadPayablesDetails(employeeId: number): Promise<void> {
    this.payablesDetailsLoading.set(true);

    try {
      const response = await this.apiService.getPayrollPayablesDetails(employeeId);


      if (response.success && response.data) {
        this.payablesDetails.set(response.data);
      } else {
        alert('載入明細失敗：' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      alert('載入明細失敗：' + (error?.message || '未知錯誤'));
      console.error('載入明細失敗:', error);
    } finally {
      this.payablesDetailsLoading.set(false);
    }
  }

  
  /**
   * 關閉應付明細 Modal
   */
  closePayablesDetailModal(): void {
    this.payablesDetailModalVisible.set(false);
    this.payablesDetails.set(null);
  }
}



