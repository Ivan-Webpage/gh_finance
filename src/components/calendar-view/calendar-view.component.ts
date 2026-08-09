import { ChangeDetectionStrategy, Component, computed, EventEmitter, inject, input, OnInit, Output, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EventEntry, Holiday } from '../../models/financial.model';
import { HolidayService } from '../../services/holiday.service';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: EventEntry[];
  holiday?: Holiday;
}

@Component({
  selector: 'app-calendar-view',
  templateUrl: './calendar-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CalendarViewComponent {
  private holidayService = inject(HolidayService);
  private router = inject(Router);

  events = input.required<EventEntry[]>();
  enableNavigation = input<boolean>(true);

  @Output() monthChange = new EventEmitter<string>();

  currentDate = signal(new Date()); 
  private holidays = signal<Holiday[]>([]);

  calendarGrid = computed<CalendarDay[]>(() => {
    const events = this.events();
    const holidays = this.holidays();
    const currentDate = this.currentDate();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = firstDayOfMonth.getDay();
    const gridStartDate = new Date(firstDayOfMonth);
    gridStartDate.setDate(firstDayOfMonth.getDate() - startDayOfWeek);

    const grid: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStartDate);
      date.setDate(gridStartDate.getDate() + i);
      const dateString = this.formatDate(date);

      grid.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: date.getTime() === today.getTime(),
        events: events.filter(e => e.date === dateString),
        holiday: holidays.find(h => h.date === dateString),
      });
    }
    return grid;
  });

  constructor() {
    this.loadHolidays();
  }

  ngOnInit(): void {
    this.emitMonthChange();
  }
  
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatYearMonth(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private emitMonthChange(): void {
    this.monthChange.emit(this.formatYearMonth(this.currentDate()));
  }
  
  loadHolidays(): void {
    const year = this.currentDate().getFullYear();
    this.holidays.set(this.holidayService.getHolidays(year));
  }

  previousMonth(): void {
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setMonth(d.getMonth() - 1);
      return newDate;
    });
    this.loadHolidays();
    this.emitMonthChange();
  }

  nextMonth(): void {
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setMonth(d.getMonth() + 1);
      return newDate;
    });
    this.loadHolidays();
    this.emitMonthChange();
  }

  isReminderEvent(event: EventEntry): boolean {
    return String(event?.id || '').startsWith('reminder-');
  }

  isSpecialDateEvent(event: EventEntry): boolean {
    return String(event?.id || '').startsWith('special-date-');
  }

  isShiftEvent(event: EventEntry): boolean {
    return String(event?.id || '').startsWith('shift-');
  }

  isUnavailableEvent(event: EventEntry): boolean {
    return String(event?.id || '').startsWith('unavailable-');
  }

  canNavigateEvent(event: EventEntry): boolean {
    return !this.isReminderEvent(event)
      && !this.isSpecialDateEvent(event)
      && !this.isShiftEvent(event)
      && !this.isUnavailableEvent(event);
  }

  editEvent(event: EventEntry): void {
    if (!this.enableNavigation()) {
      return;
    }
    if (!this.canNavigateEvent(event)) {
      return;
    }
    this.router.navigate(['/events/edit', event.id]);
  }
}
