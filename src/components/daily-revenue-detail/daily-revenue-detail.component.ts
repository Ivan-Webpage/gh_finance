import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
// FIX: Import `ParamMap` for explicit typing.
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { map, switchMap, tap } from 'rxjs/operators';
import { DataService } from '../../services/data.service';
import { DailyRevenueEntry, EventEntry } from '../../models/financial.model';

@Component({
  selector: 'app-daily-revenue-detail',
  templateUrl: './daily-revenue-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyRevenueDetailComponent {
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  date = signal<string>('');
  dailyEntry = signal<DailyRevenueEntry | null>(null);
  eventsOnDay = signal<EventEntry[]>([]);
  submitted = signal(false);

  revenueForm = this.fb.group({
    nonEventRevenue: [0, [Validators.required, Validators.min(0)]],
  });

  totalEventRevenue = computed(() => {
    return this.eventsOnDay().reduce((sum, e) => sum + e.actualRevenue, 0);
  });

  totalDailyRevenue = computed(() => {
    // FIX: Access form control value via `controls` property for better type inference.
    const nonEvent = this.revenueForm.controls.nonEventRevenue.value ?? 0;
    return nonEvent + this.totalEventRevenue();
  });

  constructor() {
    this.route.paramMap.pipe(
      // FIX: Explicitly type `params` to resolve type inference issue.
      map((params: ParamMap) => params.get('date')),
      // FIX: Explicitly type `dateParam` to resolve type inference issue.
      tap((dateParam: string | null) => {
        if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            alert('無效的日期格式');
            this.router.navigate(['/daily-revenue']);
            return;
        }
        this.date.set(dateParam);
        
        // Load data for the date
        const entry = this.dataService.getDailyRevenueEntryByDate(dateParam);
        this.dailyEntry.set(entry);
        this.revenueForm.patchValue({ nonEventRevenue: entry.nonEventRevenue });
        
        const allEvents = this.dataService.getEvents();
        this.eventsOnDay.set(allEvents.filter(e => e.date === dateParam && e.status === 'active'));
      })
    ).subscribe();
  }
  
  onSubmit(): void {
    this.submitted.set(true);
    if (this.revenueForm.invalid) {
      alert('請輸入有效的非活動營收金額。');
      return;
    }
    const nonEventRevenue = this.revenueForm.controls.nonEventRevenue.value ?? 0;
    this.dataService.updateDailyRevenueEntry(this.date(), { nonEventRevenue });
    alert('當日營收已更新！');
    this.router.navigate(['/daily-revenue']);
  }
  
  onCancel(): void {
    this.router.navigate(['/daily-revenue']);
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }
}