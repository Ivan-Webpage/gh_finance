import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import {
  EventEntry,
  ReminderEntry,
  ReminderStatus,
  ShiftAiImportAnalysisResult,
  ShiftAiImportedScheduleDraft,
  ShiftAiImportedUnavailabilityDraft,
  ShiftScheduleEntry,
  ShiftUnavailabilityEntry,
} from '../../models/financial.model';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';

interface SpecialDateEntry {
  id?: number | string;
  date: string;
  name?: string;
  multiplier?: number;
}

const TITLE_OPTIONS = ['股東', '員工', '經營團隊'] as const;
type TitleOption = typeof TITLE_OPTIONS[number];

interface EmployeeOption {
  id: number;
  name: string;
  title: string;
  scheduleName?: string;
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

function parseTimeToMinutes(value: string): number {
  const [h, m] = String(value || '00:00').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function getDurationHours(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const normalizedEnd = end <= start ? end + 24 * 60 : end;
  return Math.max(0, normalizedEnd - start) / 60;
}

@Component({
  selector: 'app-shift-schedule',
  templateUrl: './shift-schedule.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, CalendarViewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShiftScheduleComponent {
  private apiService = inject(ApiService);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  employees = signal<EmployeeOption[]>([]);
  schedules = signal<ShiftScheduleEntry[]>([]);
  unavailability = signal<ShiftUnavailabilityEntry[]>([]);
  specialDates = signal<SpecialDateEntry[]>([]);

  isAddingSchedule = signal(false);
  isAddingUnavailability = signal(false);
  scheduleSubmitMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  unavailableSubmitMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  calendarEvents = signal<EventEntry[]>([]);
  calendarYearMonth = signal(this.formatYearMonth(new Date()));

  calendarFilters = signal<CalendarFilterState>({
    events: true,
    reminders: true,
    specialDates: true,
    schedules: true,
    unavailable: true,
  });

  readonly titleOptions = TITLE_OPTIONS;

  scheduleSelectedTitle = signal<TitleOption>('員工');
  unavailableSelectedTitle = signal<TitleOption>('員工');

  filteredScheduleEmployees = computed(() =>
    this.employees().filter(e => (e.title || '員工') === this.scheduleSelectedTitle())
  );

  filteredUnavailableEmployees = computed(() =>
    this.employees().filter(e => (e.title || '員工') === this.unavailableSelectedTitle())
  );

  selectedEmployeeId = '';
  scheduleDate = normalizeCalendarDate(new Date().toISOString());
  scheduleStartTime = '09:00';
  scheduleEndTime = '18:00';
  scheduleEmployeeType: 'full-time' | 'part-time' = 'part-time';
  scheduleEstimatedRate = 200;
  scheduleNotes = '';

  unavailableEmployeeId = '';
  unavailableDate = normalizeCalendarDate(new Date().toISOString());
  unavailableAllDay = false;
  unavailableStartTime = '09:00';
  unavailableEndTime = '12:00';
  unavailableReason = '';

  aiImportModalOpen = signal(false);
  aiImportState = signal<'upload' | 'analyzing' | 'review' | 'importing'>('upload');
  aiImportFile = signal<File | null>(null);
  aiImportError = signal<string | null>(null);
  aiImportWarnings = signal<string[]>([]);
  aiScheduleDrafts = signal<ShiftAiImportedScheduleDraft[]>([]);
  aiUnavailableDrafts = signal<ShiftAiImportedUnavailabilityDraft[]>([]);
  aiImportDetectedMonth = signal<string>('');
  aiRawAnalysis = signal<ShiftAiImportAnalysisResult | null>(null);

  // Inline edit state
  editingScheduleId = signal<string | null>(null);
  editingUnavailableId = signal<string | null>(null);
  scheduleEditBuffer: Record<string, any> = {};
  unavailableEditBuffer: Record<string, any> = {};

  constructor() {
    this.loadAll();
  }

  filteredCalendarEvents = computed(() => {
    const filters = this.calendarFilters();
    const all = this.calendarEvents();

    return all.filter(event => {
      const id = String(event.id || '');
      if (id.startsWith('reminder-')) return filters.reminders;
      if (id.startsWith('special-date-')) return filters.specialDates;
      if (id.startsWith('shift-')) return filters.schedules;
      if (id.startsWith('unavailable-')) return filters.unavailable;
      return filters.events;
    });
  });

  selectedMonthSchedules = computed(() => {
    const ym = this.calendarYearMonth();
    return this.schedules().filter(item => normalizeCalendarDate(item.date).slice(0, 7) === ym);
  });

  totalScheduledHours = computed(() => {
    return this.selectedMonthSchedules().reduce((sum, item) => {
      return sum + getDurationHours(item.start_time, item.end_time);
    }, 0);
  });

  estimatedWage = computed(() => {
    return this.selectedMonthSchedules().reduce((sum, item) => {
      const duration = getDurationHours(item.start_time, item.end_time);
      const rate = Number(item.estimated_hourly_rate || 0);
      return sum + duration * rate;
    }, 0);
  });

  hasAiDrafts = computed(() => this.aiScheduleDrafts().length > 0 || this.aiUnavailableDrafts().length > 0);

  onCalendarMonthChange(yearMonth: string): void {
    this.calendarYearMonth.set(String(yearMonth || '').trim());
  }

  strId(val: any): string {
    return String(val ?? '');
  }

  setCalendarFilter(key: keyof CalendarFilterState, checked: boolean): void {
    this.calendarFilters.update(prev => ({ ...prev, [key]: checked }));
  }

  onScheduleTitleChange(title: TitleOption): void {
    this.scheduleSelectedTitle.set(title);
    const employees = this.employees().filter(e => (e.title || '員工') === title);
    this.selectedEmployeeId = employees.length > 0 ? String(employees[0].id) : '';
  }

  onUnavailableTitleChange(title: TitleOption): void {
    this.unavailableSelectedTitle.set(title);
    const employees = this.employees().filter(e => (e.title || '員工') === title);
    this.unavailableEmployeeId = employees.length > 0 ? String(employees[0].id) : '';
  }

  openAiImportModal(): void {
    this.aiImportModalOpen.set(true);
    this.aiImportState.set('upload');
    this.aiImportError.set(null);
    this.aiImportWarnings.set([]);
    this.aiImportFile.set(null);
    this.aiScheduleDrafts.set([]);
    this.aiUnavailableDrafts.set([]);
    this.aiImportDetectedMonth.set('');
    this.aiRawAnalysis.set(null);
  }

  closeAiImportModal(): void {
    this.aiImportModalOpen.set(false);
    this.aiImportState.set('upload');
    this.aiImportError.set(null);
    this.aiImportWarnings.set([]);
    this.aiImportFile.set(null);
    this.aiScheduleDrafts.set([]);
    this.aiUnavailableDrafts.set([]);
    this.aiImportDetectedMonth.set('');
    this.aiRawAnalysis.set(null);
  }

  onAiImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) {
      this.aiImportFile.set(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.aiImportError.set('僅支援圖片檔案格式');
      this.aiImportFile.set(null);
      input.value = '';
      return;
    }

    this.aiImportError.set(null);
    this.aiImportFile.set(file);
  }

  async analyzeAiImport(): Promise<void> {
    const file = this.aiImportFile();
    if (!file) {
      this.aiImportError.set('請先選擇圖片檔案');
      return;
    }

    this.aiImportState.set('analyzing');
    this.aiImportError.set(null);
    this.aiImportWarnings.set([]);

    try {
      const imageBase64 = await this.readFileAsBase64(file);
      const response = await this.apiService.analyzeHandwrittenShiftSchedule({
        filename: file.name,
        mimeType: file.type || 'image/jpeg',
        imageBase64,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'AI 分析失敗');
      }

      this.applyAiAnalysisResult(response.data);
      this.aiImportState.set('review');
    } catch (error: any) {
      this.aiImportError.set(error?.error?.error || error?.message || 'AI 分析失敗');
      this.aiImportState.set('upload');
    }
  }

  removeAiScheduleRow(index: number): void {
    this.aiScheduleDrafts.update(rows => rows.filter((_, i) => i !== index));
  }

  removeAiUnavailableRow(index: number): void {
    this.aiUnavailableDrafts.update(rows => rows.filter((_, i) => i !== index));
  }

  onAiScheduleEmployeeChange(row: ShiftAiImportedScheduleDraft, employeeIdValue: string): void {
    const employeeId = Number(employeeIdValue);
    const employee = this.employees().find(item => item.id === employeeId);
    row.employee_id = Number.isFinite(employeeId) ? employeeId : null;
    row.employee_name = employee?.name || '';
    row.matched = !!employee;
    this.aiScheduleDrafts.update(rows => [...rows]);
  }

  onAiUnavailableEmployeeChange(row: ShiftAiImportedUnavailabilityDraft, employeeIdValue: string): void {
    const employeeId = Number(employeeIdValue);
    const employee = this.employees().find(item => item.id === employeeId);
    row.employee_id = Number.isFinite(employeeId) ? employeeId : null;
    row.employee_name = employee?.name || '';
    row.matched = !!employee;
    this.aiUnavailableDrafts.update(rows => [...rows]);
  }

  async confirmAiImport(): Promise<void> {
    if (!this.hasAiDrafts()) {
      this.aiImportError.set('沒有可匯入的資料');
      return;
    }

    this.aiImportState.set('importing');
    this.aiImportError.set(null);

    let scheduleSuccess = 0;
    let scheduleFailed = 0;
    let unavailableSuccess = 0;
    let unavailableFailed = 0;

    for (const row of this.aiScheduleDrafts().filter(item => item.enabled !== false)) {
      if (!row.employee_name || !row.date || !row.start_time || !row.end_time) {
        scheduleFailed += 1;
        continue;
      }

      const response = await this.apiService.createShiftSchedule({
        employee_id: row.employee_id ?? null,
        employee_name: row.employee_name,
        employee_type: row.employee_type || 'part-time',
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time,
        estimated_hourly_rate: row.estimated_hourly_rate ?? this.getSpecialDateHourlyRate(row.date, 200),
        notes: row.notes || '',
      });

      if (response.success) scheduleSuccess += 1;
      else scheduleFailed += 1;
    }

    for (const row of this.aiUnavailableDrafts().filter(item => item.enabled !== false)) {
      if (!row.employee_name || !row.date) {
        unavailableFailed += 1;
        continue;
      }

      const response = await this.apiService.createShiftUnavailability({
        employee_id: row.employee_id ?? null,
        employee_name: row.employee_name,
        date: row.date,
        is_all_day: row.is_all_day,
        start_time: row.is_all_day ? null : (row.start_time || null),
        end_time: row.is_all_day ? null : (row.end_time || null),
        reason: row.reason || '',
      });

      if (response.success) unavailableSuccess += 1;
      else unavailableFailed += 1;
    }

    await this.loadSchedulesAndCalendar();
    this.closeAiImportModal();
    alert(`AI 匯入完成：班表成功 ${scheduleSuccess} 筆、失敗 ${scheduleFailed} 筆；不可上班成功 ${unavailableSuccess} 筆、失敗 ${unavailableFailed} 筆`);
  }

  async addSchedule(): Promise<void> {
    const employee = this.getSelectedEmployee(this.selectedEmployeeId);
    if (!employee) {
      this.scheduleSubmitMessage.set({ type: 'error', text: '請先選擇員工' });
      return;
    }

    if (!this.scheduleDate || !this.scheduleStartTime || !this.scheduleEndTime) {
      this.scheduleSubmitMessage.set({ type: 'error', text: '請填寫完整班表時間' });
      return;
    }

    this.isAddingSchedule.set(true);
    this.scheduleSubmitMessage.set({ type: 'success', text: '正在新增班表，請稍候...' });

    const response = await this.apiService.createShiftSchedule({
      employee_id: employee.id,
      employee_name: employee.name,
      employee_type: this.scheduleEmployeeType,
      date: this.scheduleDate,
      start_time: this.scheduleStartTime,
      end_time: this.scheduleEndTime,
      estimated_hourly_rate: this.scheduleEstimatedRate,
      notes: this.scheduleNotes,
    });

    this.isAddingSchedule.set(false);

    if (!response.success) {
      this.scheduleSubmitMessage.set({ type: 'error', text: response.error || '新增班表失敗' });
      return;
    }

    this.scheduleSubmitMessage.set({ type: 'success', text: '班表已成功新增！' });
    this.scheduleNotes = '';
    await this.loadSchedulesAndCalendar();
    setTimeout(() => this.scheduleSubmitMessage.set(null), 3000);
  }

  async addUnavailability(): Promise<void> {
    const employee = this.getSelectedEmployee(this.unavailableEmployeeId);
    if (!employee) {
      this.unavailableSubmitMessage.set({ type: 'error', text: '請先選擇員工' });
      return;
    }

    if (!this.unavailableDate) {
      this.unavailableSubmitMessage.set({ type: 'error', text: '請選擇日期' });
      return;
    }

    this.isAddingUnavailability.set(true);
    this.unavailableSubmitMessage.set({ type: 'success', text: '正在新增不可上班時段，請稍候...' });

    const response = await this.apiService.createShiftUnavailability({
      employee_id: employee.id,
      employee_name: employee.name,
      date: this.unavailableDate,
      is_all_day: this.unavailableAllDay,
      start_time: this.unavailableAllDay ? null : this.unavailableStartTime,
      end_time: this.unavailableAllDay ? null : this.unavailableEndTime,
      reason: this.unavailableReason,
    });

    this.isAddingUnavailability.set(false);

    if (!response.success) {
      this.unavailableSubmitMessage.set({ type: 'error', text: response.error || '新增不可上班時段失敗' });
      return;
    }

    this.unavailableSubmitMessage.set({ type: 'success', text: '不可上班時段已成功新增！' });
    this.unavailableReason = '';
    await this.loadSchedulesAndCalendar();
    setTimeout(() => this.unavailableSubmitMessage.set(null), 3000);
  }

  startEditSchedule(item: ShiftScheduleEntry): void {
    this.scheduleEditBuffer = { ...item };
    this.editingScheduleId.set(String(item.id));
  }

  cancelEditSchedule(): void {
    this.editingScheduleId.set(null);
    this.scheduleEditBuffer = {};
  }

  async saveEditSchedule(): Promise<void> {
    const id = Number(this.editingScheduleId());
    if (!Number.isFinite(id)) return;

    const response = await this.apiService.updateShiftSchedule(id, {
      employee_name: this.scheduleEditBuffer['employee_name'],
      employee_type: this.scheduleEditBuffer['employee_type'],
      date: this.scheduleEditBuffer['date'],
      start_time: this.scheduleEditBuffer['start_time'],
      end_time: this.scheduleEditBuffer['end_time'],
      estimated_hourly_rate: this.scheduleEditBuffer['estimated_hourly_rate'],
      notes: this.scheduleEditBuffer['notes'],
    });

    if (!response.success) {
      alert(response.error || '儲存班表失敗');
      return;
    }

    this.editingScheduleId.set(null);
    this.scheduleEditBuffer = {};
    await this.loadSchedulesAndCalendar();
  }

  startEditUnavailable(item: ShiftUnavailabilityEntry): void {
    this.unavailableEditBuffer = { ...item };
    this.editingUnavailableId.set(String(item.id));
  }

  cancelEditUnavailable(): void {
    this.editingUnavailableId.set(null);
    this.unavailableEditBuffer = {};
  }

  async saveEditUnavailable(): Promise<void> {
    const id = Number(this.editingUnavailableId());
    if (!Number.isFinite(id)) return;

    const isAllDay = Boolean(this.unavailableEditBuffer['is_all_day']);
    const response = await this.apiService.updateShiftUnavailability(id, {
      employee_name: this.unavailableEditBuffer['employee_name'],
      date: this.unavailableEditBuffer['date'],
      is_all_day: isAllDay,
      start_time: isAllDay ? null : (this.unavailableEditBuffer['start_time'] || null),
      end_time: isAllDay ? null : (this.unavailableEditBuffer['end_time'] || null),
      reason: this.unavailableEditBuffer['reason'],
    });

    if (!response.success) {
      alert(response.error || '儲存不可上班設定失敗');
      return;
    }

    this.editingUnavailableId.set(null);
    this.unavailableEditBuffer = {};
    await this.loadSchedulesAndCalendar();
  }

  async removeSchedule(item: ShiftScheduleEntry): Promise<void> {
    const id = Number(item.id);
    if (!Number.isFinite(id)) return;
    if (!confirm(`確定刪除 ${item.employee_name} 的班表？`)) return;

    const response = await this.apiService.deleteShiftSchedule(id);
    if (!response.success) {
      alert(response.error || '刪除班表失敗');
      return;
    }

    await this.loadSchedulesAndCalendar();
  }

  async removeUnavailability(item: ShiftUnavailabilityEntry): Promise<void> {
    const id = Number(item.id);
    if (!Number.isFinite(id)) return;
    if (!confirm(`確定刪除 ${item.employee_name} 的不可上班設定？`)) return;

    const response = await this.apiService.deleteShiftUnavailability(id);
    if (!response.success) {
      alert(response.error || '刪除不可上班設定失敗');
      return;
    }

    await this.loadSchedulesAndCalendar();
  }

  private async loadAll(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await Promise.all([this.loadEmployees(), this.loadSchedulesAndCalendar()]);
    } catch (error: any) {
      this.errorMessage.set(error?.message || '載入排班資料失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadEmployees(): Promise<void> {
    const response = await this.apiService.getEmployeeInfo();
    if (!response.success || !Array.isArray(response.data)) {
      return;
    }

    const options = response.data
      .map((row: any) => ({
        id: Number(row.id),
        name: String(row.employee_name || '').trim(),
        title: String(row.position || '員工').trim(),
        scheduleName: String(row.schedule_name || '').trim(),
      }))
      .filter((row: EmployeeOption) => Number.isFinite(row.id) && !!row.name);

    this.employees.set(options);

    const defaultTitle: TitleOption = '員工';
    const scheduleEmployees = options.filter(e => (e.title || '員工') === defaultTitle);
    const unavailableEmployees = options.filter(e => (e.title || '員工') === defaultTitle);

    if (!this.selectedEmployeeId) {
      this.selectedEmployeeId = scheduleEmployees.length > 0 ? String(scheduleEmployees[0].id) : (options.length > 0 ? String(options[0].id) : '');
    }
    if (!this.unavailableEmployeeId) {
      this.unavailableEmployeeId = unavailableEmployees.length > 0 ? String(unavailableEmployees[0].id) : (options.length > 0 ? String(options[0].id) : '');
    }
  }

  private async loadSchedulesAndCalendar(): Promise<void> {
    const [eventsResponse, remindersResponse, specialDatesResponse, schedulesResponse, unavailabilityResponse] = await Promise.all([
      this.apiService.getAllEvents({ sortBy: 'date', sortOrder: 'asc' }),
      this.apiService.getReminders({ limit: 2000 }),
      this.apiService.getSpecialDates({ is_active: true }),
      this.apiService.getShiftSchedules({ is_active: true }),
      this.apiService.getShiftUnavailability({ is_active: true }),
    ]);

    const events = eventsResponse.success && eventsResponse.data ? eventsResponse.data : [];
    const reminders = remindersResponse.success && remindersResponse.data ? remindersResponse.data : [];
    const specialDates = specialDatesResponse.success && specialDatesResponse.data ? specialDatesResponse.data : [];
    const schedules = schedulesResponse.success && schedulesResponse.data ? schedulesResponse.data : [];
    const unavailability = unavailabilityResponse.success && unavailabilityResponse.data ? unavailabilityResponse.data : [];

    this.schedules.set(schedules);
    this.unavailability.set(unavailability);
    this.specialDates.set(specialDates);

    this.calendarEvents.set([
      ...events,
      ...this.mapRemindersToCalendarEvents(reminders),
      ...this.mapSpecialDatesToCalendarEvents(specialDates),
      ...this.mapSchedulesToCalendarEvents(schedules),
      ...this.mapUnavailabilityToCalendarEvents(unavailability),
    ]);

    const firstError = [
      eventsResponse.success ? null : eventsResponse.error || '載入活動失敗',
      remindersResponse.success ? null : remindersResponse.error || '載入提醒失敗',
      specialDatesResponse.success ? null : specialDatesResponse.error || '載入特殊工作日失敗',
      schedulesResponse.success ? null : schedulesResponse.error || '載入排班失敗',
      unavailabilityResponse.success ? null : unavailabilityResponse.error || '載入不可上班時段失敗',
    ].find(Boolean);

    this.errorMessage.set((firstError as string) || null);
  }

  private getSelectedEmployee(employeeId: string): EmployeeOption | undefined {
    const targetId = Number(employeeId);
    if (!Number.isFinite(targetId)) return undefined;
    return this.employees().find(item => item.id === targetId);
  }

  private getSpecialDateHourlyRate(date: string, defaultRate: number): number {
    const specialDate = this.specialDates().find(sd => normalizeCalendarDate(sd.date) === normalizeCalendarDate(date));
    if (specialDate && Number.isFinite(Number(specialDate.multiplier))) {
      return Math.round(defaultRate * Number(specialDate.multiplier));
    }
    return defaultRate;
  }

  private applyAiAnalysisResult(result: ShiftAiImportAnalysisResult): void {
    const DEFAULT_RATE = 200;
    this.aiRawAnalysis.set(JSON.parse(JSON.stringify(result || null)));
    this.aiScheduleDrafts.set((result.schedules || []).map(item => ({
      ...item,
      employee_type: item.employee_type || 'part-time',
      enabled: item.enabled !== false,
      estimated_hourly_rate: this.getSpecialDateHourlyRate(item.date, DEFAULT_RATE),
    })));
    this.aiUnavailableDrafts.set((result.unavailability || []).map(item => ({
      ...item,
      is_all_day: item.is_all_day !== false,
      enabled: item.enabled !== false,
    })));
    this.aiImportWarnings.set(Array.isArray(result.warnings) ? result.warnings : []);
    this.aiImportDetectedMonth.set(result.year && result.month ? `${result.year}-${String(result.month).padStart(2, '0')}` : '');
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        const base64 = value.includes(',') ? value.split(',')[1] : value;
        if (!base64) {
          reject(new Error('圖片讀取失敗'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('圖片讀取失敗'));
      reader.readAsDataURL(file);
    });
  }

  private formatYearMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private mapRemindersToCalendarEvents(reminders: ReminderEntry[]): EventEntry[] {
    return (reminders || []).map(r => ({
      id: `reminder-${r.id}`,
      type: (r.category || '事項提醒') as any,
      status: ((r.status as ReminderStatus) || 'pending') as any,
      useSpace: '',
      date: normalizeCalendarDate(r.date),
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
      name: `[排班]${item.employee_name}${item.start_time}~${item.end_time}`,
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
}
