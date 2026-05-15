import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import {
  EventEntry,
  ReminderEntry,
  ReminderStatus,
  ShiftScheduleEntry,
  ShiftUnavailabilityEntry,
} from '../../models/financial.model';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';

interface MonthSummary {
  estimatedRevenue: number;
  actualRevenue: number;
  achievementRate: number;
}

type SortDirection = 'asc' | 'desc';
type EventView = 'list' | 'calendar';
type EventSortColumn = 'date' | 'type' | 'time' | 'name' | 'organizer' | 'attendees' | 'estimatedRevenue' | 'deposit' | 'actualRevenue' | 'notes';

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
  selector: 'app-events',
  templateUrl: './events.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, CalendarViewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EventsComponent {
  apiService = inject(ApiService);
  router = inject(Router);

  allEvents = signal<EventEntry[]>([]);
  calendarEvents = signal<EventEntry[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  searchTerm = signal('');
  activeView = signal<EventView>('list');
  calendarLoading = signal(false);
  calendarErrorMessage = signal<string | null>(null);
  calendarFilters = signal<CalendarFilterState>({
    events: true,
    reminders: true,
    specialDates: true,
    schedules: true,
    unavailable: true,
  });
  
  // Date range filtering
  selectedStartDate = signal('');
  selectedEndDate = signal('');
  private appliedFilters = signal<{ startDate: string; endDate: string }>({ startDate: '', endDate: '' });

  // Pagination
  currentPage = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);
  totalPages = signal(0);
  Math = Math;

  // Sorting
  sortColumn = signal<EventSortColumn>('date');
  sortDirection = signal<SortDirection>('desc');

  filteredEvents = computed(() => this.allEvents());
  
  paginatedEvents = computed(() => this.filteredEvents());

  eventsSummary = computed<MonthSummary>(() => {
    const source = this.activeView() === 'calendar' ? this.filteredCalendarEvents() : this.filteredEvents();
    const activeEvents = source.filter(event =>
        event.status === 'active'
    );

    const estimatedRevenue = activeEvents.reduce((sum, e) => sum + Number(e.estimatedRevenue || 0), 0);
    const actualRevenue = activeEvents.reduce((sum, e) => sum + Number(e.actualRevenue || 0), 0);
    const achievementRate = estimatedRevenue > 0 ? (actualRevenue / estimatedRevenue) * 100 : 0;
    
    return { estimatedRevenue, actualRevenue, achievementRate };
  });

  constructor() {
    this.initializeMonthDateRange();
    this.applyFilter();
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

  setCalendarFilter(key: keyof CalendarFilterState, checked: boolean): void {
    this.calendarFilters.update(prev => ({ ...prev, [key]: checked }));
  }

  private async loadCalendarEvents(): Promise<void> {
    this.calendarLoading.set(true);
    this.calendarErrorMessage.set(null);

    try {
      const [eventsResponse, remindersResponse, specialDatesResponse, schedulesResponse, unavailabilityResponse] = await Promise.all([
        this.apiService.getAllEvents({
          search: this.searchTerm(),
          sortBy: 'date',
          sortOrder: 'asc',
        }),
        this.apiService.getReminders({
          search: this.searchTerm(),
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
      const specialDateEvents = this.mapSpecialDatesToCalendarEvents(specialDates, this.searchTerm());
      const scheduleEvents = this.mapSchedulesToCalendarEvents(schedules, this.searchTerm());
      const unavailabilityEvents = this.mapUnavailabilityToCalendarEvents(unavailability, this.searchTerm());

      this.calendarEvents.set([
        ...events,
        ...reminderEvents,
        ...specialDateEvents,
        ...scheduleEvents,
        ...unavailabilityEvents,
      ]);

      if (!eventsResponse.success) {
        this.calendarErrorMessage.set(eventsResponse.error || '載入活動日曆失敗');
      } else if (!remindersResponse.success) {
        this.calendarErrorMessage.set(remindersResponse.error || '載入事項提醒失敗');
      } else if (!specialDatesResponse.success) {
        this.calendarErrorMessage.set(specialDatesResponse.error || '載入特殊工作日失敗');
      } else if (!schedulesResponse.success) {
        this.calendarErrorMessage.set(schedulesResponse.error || '載入排班失敗');
      } else if (!unavailabilityResponse.success) {
        this.calendarErrorMessage.set(unavailabilityResponse.error || '載入不可上班時段失敗');
      }
    } catch (error: any) {
      console.error('Failed to load calendar events:', error);
      this.calendarEvents.set([]);
      this.calendarErrorMessage.set(error?.error?.error || '載入活動日曆失敗');
    } finally {
      this.calendarLoading.set(false);
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

  private mapSpecialDatesToCalendarEvents(specialDates: SpecialDateEntry[], searchTerm: string): EventEntry[] {
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

    return (specialDates || [])
      .filter(item => {
        if (!normalizedSearch) return true;
        const label = `${item.name || ''} 特殊工作日`;
        return label.toLowerCase().includes(normalizedSearch);
      })
      .map(item => ({
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

  private mapSchedulesToCalendarEvents(items: ShiftScheduleEntry[], searchTerm: string): EventEntry[] {
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

    return (items || [])
      .filter(item => {
        if (!normalizedSearch) return true;
        const label = `${item.employee_name} 排班 ${item.employee_type}`;
        return label.toLowerCase().includes(normalizedSearch);
      })
      .map(item => ({
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

  private mapUnavailabilityToCalendarEvents(items: ShiftUnavailabilityEntry[], searchTerm: string): EventEntry[] {
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

    return (items || [])
      .filter(item => {
        if (!normalizedSearch) return true;
        const label = `${item.employee_name} 不可上班 ${item.reason || ''}`;
        return label.toLowerCase().includes(normalizedSearch);
      })
      .map(item => ({
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

  private initializeMonthDateRange(): void {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    this.selectedStartDate.set(this.formatDateForInput(startDate));
    this.selectedEndDate.set(this.formatDateForInput(endDate));
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async loadEvents(page = this.currentPage()): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.getEvents({
        startDate: this.appliedFilters().startDate,
        endDate: this.appliedFilters().endDate,
        search: this.searchTerm(),
        page,
        limit: this.pageSize(),
        sortBy: this.sortColumn(),
        sortOrder: this.sortDirection(),
      });

      if (response.success && response.data) {
        this.allEvents.set(response.data);
        this.currentPage.set(response.pagination?.page || page);
        this.totalItems.set(response.pagination?.total || response.data.length);
        this.totalPages.set(response.pagination?.totalPages || 0);
      } else {
        this.allEvents.set([]);
        this.totalItems.set(0);
        this.totalPages.set(0);
        this.errorMessage.set(response.error || '載入活動資料失敗');
      }
    } catch (error: any) {
      console.error('Failed to load events:', error);
      this.allEvents.set([]);
      this.totalItems.set(0);
      this.totalPages.set(0);
      this.errorMessage.set(error?.error?.error || '載入活動資料失敗，請稍後再試');
    } finally {
      this.isLoading.set(false);
    }
  }

  applyFilter(): void {
    if (!this.selectedStartDate() || !this.selectedEndDate()) {
      this.errorMessage.set('請選擇完整的起訖日期');
      return;
    }

    if (this.selectedStartDate() > this.selectedEndDate()) {
      this.errorMessage.set('開始日期不可晚於結束日期');
      return;
    }

    this.appliedFilters.set({
      startDate: this.selectedStartDate(),
      endDate: this.selectedEndDate(),
    });
    this.loadEvents(1);
  }

  resetFilter(): void {
    this.initializeMonthDateRange();
    this.searchTerm.set('');
    this.applyFilter();
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    if (this.activeView() === 'calendar') {
      this.loadCalendarEvents();
      return;
    }
    this.loadEvents(1);
  }

  sortData(column: EventSortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update(dir => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.loadEvents(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.loadEvents(page);
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  editEvent(event: EventEntry): void {
    this.router.navigate(['/events/edit', event.id]);
  }
  
  formatDateForDisplay(dateStr: string): string {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return `${month}/${day} (${dayOfWeek})`;
  }
  
  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }

  setView(view: EventView): void {
    this.activeView.set(view);

    if (view === 'calendar' && this.calendarEvents().length === 0 && !this.calendarLoading()) {
      this.loadCalendarEvents();
    }
  }
}