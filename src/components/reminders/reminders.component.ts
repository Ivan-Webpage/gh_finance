import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { ApiService } from '../../services/api.service';
import type { EventEntry, ReminderEntry, ReminderStatus } from '../../models/financial.model';

interface MonthRange {
  startDate: string;
  endDate: string;
}

@Component({
  selector: 'app-reminders',
  templateUrl: './reminders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, CalendarViewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RemindersComponent {
  private apiService = inject(ApiService);

  calendarLoading = signal(false);
  calendarErrorMessage = signal<string | null>(null);

  remindersLoading = signal(false);
  remindersErrorMessage = signal<string | null>(null);

  @ViewChild(CalendarViewComponent) private calendarView?: CalendarViewComponent;

  readonly month = signal<string>(this.formatYearMonth(new Date()));
  private loadingMonth = signal<string | null>(null);
  private lastLoadedMonth = signal<string | null>(null);

  private monthEvents = signal<EventEntry[]>([]);
  private monthReminders = signal<ReminderEntry[]>([]);

  reminders = computed<ReminderEntry[]>(() => {
    return [...this.monthReminders()].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || '').localeCompare(b.time || '');
    });
  });

  calendarItems = computed<EventEntry[]>(() => {
    const remindersAsEvents: EventEntry[] = this.monthReminders().map(r => ({
      id: `reminder-${r.id}`,
      type: r.category || '事項提醒',
      status: (r.status as ReminderStatus) || 'active',
      date: r.date,
      time: r.time || '',
      name: `[提醒]${r.event}`,
      organizer: '',
      attendees: '',
      estimatedRevenue: 0,
      deposit: null,
      actualRevenue: 0,
      notes: '',
    }));

    return [...this.monthEvents(), ...remindersAsEvents];
  });

  // ===== 年月篩選器（跟日曆的上一月／下一月同步） =====
  readonly monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  selectedYear = computed(() => parseInt(this.month().split('-')[0], 10));
  selectedMonth = computed(() => parseInt(this.month().split('-')[1], 10));

  yearOptions = computed(() => {
    const thisYear = new Date().getFullYear();
    const years = new Set<number>();
    for (let y = thisYear - 3; y <= thisYear + 2; y++) years.add(y);
    years.add(this.selectedYear());
    return Array.from(years).sort((a, b) => a - b);
  });

  isCurrentMonth = computed(() => this.month() === this.formatYearMonth(new Date()));

  // ===== 編輯事項 =====
  editingReminder = signal<ReminderEntry | null>(null);
  editDate = signal('');
  editTime = signal('');
  editCategory = signal('');
  editEvent = signal('');
  editStatus = signal<'pending' | 'active' | 'cancelled'>('pending');
  editSaving = signal(false);
  editErrorMessage = signal<string | null>(null);

  constructor() {
    void this.loadMonth(this.month());
  }

  selectYearMonth(year: number, month: number): void {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    if (this.calendarView) {
      // 日曆切換後會發出 monthChange，再由 onMonthChange 載入資料
      this.calendarView.goToMonth(yearMonth);
    } else {
      void this.onMonthChange(yearMonth);
    }
  }

  goToCurrentMonth(): void {
    const now = new Date();
    this.selectYearMonth(now.getFullYear(), now.getMonth() + 1);
  }

  openEdit(item: ReminderEntry): void {
    this.editingReminder.set(item);
    this.editDate.set(item.date);
    this.editTime.set(item.time || '');
    this.editCategory.set(item.category || '');
    this.editEvent.set(item.event);
    const status = item.status;
    this.editStatus.set(status === 'active' || status === 'cancelled' ? status : 'pending');
    this.editErrorMessage.set(null);
  }

  closeEdit(): void {
    if (this.editSaving()) return;
    this.editingReminder.set(null);
  }

  async saveEdit(): Promise<void> {
    const target = this.editingReminder();
    if (!target || this.editSaving()) return;

    const payload = {
      id: target.id,
      date: this.editDate(),
      time: this.editTime().trim() || undefined,
      category: this.editCategory().trim() || undefined,
      event: this.editEvent().trim(),
      status: this.editStatus(),
    };

    if (!payload.date) {
      this.editErrorMessage.set('日期為必填');
      return;
    }
    if (!payload.event) {
      this.editErrorMessage.set('事件為必填');
      return;
    }

    this.editSaving.set(true);
    this.editErrorMessage.set(null);
    try {
      const response = await this.apiService.updateReminder(payload);
      if (!response.success) {
        this.editErrorMessage.set(response.error || '修改失敗');
        return;
      }

      // 日期可能被改到別的月份，直接重新載入目前月份，列表與日曆一起更新
      await this.loadMonth(this.month());

      if (response.data?.googleSyncStatus === 'failed') {
        this.editErrorMessage.set(`修改成功，但 Google Calendar 同步失敗：${response.data.googleSyncError || '未知錯誤'}`);
        return;
      }

      this.editingReminder.set(null);
    } catch (error: any) {
      this.editErrorMessage.set(error?.error?.error || error?.message || '修改失敗');
    } finally {
      this.editSaving.set(false);
    }
  }

  async onMonthChange(yearMonth: string): Promise<void> {
    this.month.set(yearMonth);
    if (this.loadingMonth() === yearMonth) {
      return;
    }
    if (this.lastLoadedMonth() === yearMonth) {
      return;
    }
    await this.loadMonth(yearMonth);
  }

  async loadMonth(yearMonth: string): Promise<void> {
    this.loadingMonth.set(yearMonth);
    const { startDate, endDate } = this.getMonthRange(yearMonth);

    this.calendarLoading.set(true);
    this.remindersLoading.set(true);
    this.calendarErrorMessage.set(null);
    this.remindersErrorMessage.set(null);

    try {
      const [eventsResponse, remindersResponse] = await Promise.all([
        this.fetchAllEventsInRange(startDate, endDate),
        this.apiService.getReminders({ startDate, endDate }),
      ]);

      if (!eventsResponse.success) {
        this.calendarErrorMessage.set(eventsResponse.error || '載入活動失敗');
        this.monthEvents.set([]);
      } else {
        this.monthEvents.set(eventsResponse.data || []);
      }

      if (!remindersResponse.success) {
        this.remindersErrorMessage.set(remindersResponse.error || '載入事項提醒失敗');
        this.monthReminders.set([]);
      } else {
        this.monthReminders.set(remindersResponse.data || []);
      }
    } catch (error: any) {
      const message = error?.error?.error || error?.message || '載入失敗';
      this.calendarErrorMessage.set(message);
      this.remindersErrorMessage.set(message);
      this.monthEvents.set([]);
      this.monthReminders.set([]);
    } finally {
      this.calendarLoading.set(false);
      this.remindersLoading.set(false);
      this.loadingMonth.set(null);
    }

    this.lastLoadedMonth.set(yearMonth);
  }

  private async fetchAllEventsInRange(startDate: string, endDate: string): Promise<any> {
    const limit = 200;
    const safeMaxPages = 200;

    let page = 1;
    const allEvents: EventEntry[] = [];

    while (page <= safeMaxPages) {
      const response = await this.apiService.getEvents({
        startDate,
        endDate,
        page,
        limit,
        sortBy: 'date',
        sortOrder: 'asc',
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

  formatDateForDisplay(dateString: string): string {
    const [y, m, d] = dateString.split('-').map(part => parseInt(part, 10));
    if (!y || !m || !d) return dateString;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  formatReminderStatus(status?: string | null): string {
    if (!status) return '';
    if (status === 'active') return '進行中';
    if (status === 'pending') return '待確定';
    if (status === 'cancelled') return '取消';
    return status;
  }

  private formatYearMonth(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private getMonthRange(yearMonth: string): MonthRange {
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    return {
      startDate: this.formatDate(firstDay),
      endDate: this.formatDate(lastDay),
    };
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
