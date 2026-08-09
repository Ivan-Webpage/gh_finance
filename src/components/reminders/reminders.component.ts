import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, RouterLink, CalendarViewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RemindersComponent {
  private apiService = inject(ApiService);

  calendarLoading = signal(false);
  calendarErrorMessage = signal<string | null>(null);

  remindersLoading = signal(false);
  remindersErrorMessage = signal<string | null>(null);

  private month = signal<string>(this.formatYearMonth(new Date()));
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

  constructor() {
    void this.loadMonth(this.month());
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
