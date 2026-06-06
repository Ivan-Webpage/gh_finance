import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
// FIX: Import `ParamMap` for explicit typing.
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { EventEntry, EventStatus } from '../../models/financial.model';
import { filter, map, tap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-event-form',
  templateUrl: './event-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class EventFormComponent {
  private fb = inject(FormBuilder);
  private apiService = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  isViewer = computed(() => this.authService.hasRole('viewer'));

  isEditMode = signal(false);
  eventId = signal<string | null>(null);
  submitted = signal(false);
  isSaving = signal(false);

  readonly eventTypeOptions = ['外客', '股東介紹', '店內活動', '股東會', '外燴'];
  readonly useSpaceOptions = ['D1', '外燴', 'A區', 'BC區', '全場包'];

  eventForm = this.fb.group({
    type: [''],
    status: ['active' as EventStatus],
    useSpace: ['D1'],
    date: ['', Validators.required],
    time: [''],
    name: ['', Validators.required],
    organizer: [''],
    attendees: [''],
    estimatedRevenue: [null as number | null, [Validators.min(0)]],
    deposit: [null as number | null],
    actualRevenue: [null as number | null, [Validators.min(0)]],
    notes: ['']
  });
  
  constructor() {
    this.route.paramMap.pipe(
      // FIX: Explicitly type `params` to resolve type inference issue.
      map((params: ParamMap) => params.get('id')),
      tap(id => {
        this.isEditMode.set(!!id);
        this.eventId.set(id);
      }),
      filter((id): id is string => !!id),
      tap(async (id) => {
        try {
          const response = await this.apiService.getEventById(id);
          if (response.success && response.data) {
            this.eventForm.patchValue(response.data);
          } else {
            alert('找不到活動！');
            this.router.navigate(['/events']);
          }
        } catch {
          alert('找不到活動！');
          this.router.navigate(['/events']);
        }
      })
    ).subscribe();
  }

  isInvalid(controlName: string): boolean {
    // The `get` method is the standard and correct way to access a control by a dynamic string name.
    const control = this.eventForm.get(controlName);
    return !!control && control.invalid && (control.touched || this.submitted());
  }

  async onSubmit(): Promise<void> {
    if (this.isSaving()) {
      return;
    }

    this.submitted.set(true);
    if (this.eventForm.invalid) {
      alert('請檢查表單，僅活動名稱與日期為必填。');
      return;
    }

    this.isSaving.set(true);

    const formValue = this.eventForm.getRawValue();
    const eventData: Omit<EventEntry, 'id'> = {
      ...formValue,
      type: formValue.type || '',
      status: (formValue.status || 'active') as EventStatus,
      useSpace: formValue.useSpace || 'D1',
      date: formValue.date || '',
      name: formValue.name || '',
      attendees: formValue.attendees || '',
      estimatedRevenue: formValue.estimatedRevenue ?? 0,
      actualRevenue: formValue.actualRevenue ?? 0,
      deposit: formValue.deposit ?? undefined, // Ensure undefined if null
      organizer: formValue.organizer || undefined,
      time: formValue.time || undefined,
      notes: formValue.notes || undefined,
    };

    try {
      if (this.isEditMode() && this.eventId()) {
        const updateResponse = await this.apiService.updateEvent(this.eventId()!, {
          type: formValue.type || undefined,
          status: formValue.status || 'active',
          useSpace: formValue.useSpace || 'D1',
          date: formValue.date || '',
          time: formValue.time || undefined,
          name: formValue.name || '',
          organizer: formValue.organizer || undefined,
          attendees: formValue.attendees || undefined,
          estimatedRevenue: formValue.estimatedRevenue,
          deposit: formValue.deposit,
          actualRevenue: formValue.actualRevenue,
          notes: formValue.notes || undefined,
        });

        if (!updateResponse.success) {
          alert(updateResponse.error || '活動更新失敗，請稍後再試。');
          return;
        }

        alert('活動已成功更新！');
      } else {
        const response = await this.apiService.createEvent({
          type: formValue.type || undefined,
          status: formValue.status || 'active',
          useSpace: formValue.useSpace || 'D1',
          date: formValue.date || '',
          time: formValue.time || undefined,
          name: formValue.name || '',
          organizer: formValue.organizer || undefined,
          attendees: formValue.attendees || undefined,
          estimatedRevenue: formValue.estimatedRevenue,
          deposit: formValue.deposit,
          actualRevenue: formValue.actualRevenue,
          notes: formValue.notes || undefined,
        });

        if (!response.success) {
          alert(response.error || '活動新增失敗，請稍後再試。');
          return;
        }

        alert('活動已成功新增！');
      }

      this.router.navigate(['/events']);
    } catch (error: any) {
      console.error('Create event failed:', error);
      const message =
        error?.error?.error ||
        error?.message ||
        '活動新增失敗，請檢查網路或稍後再試。';
      alert(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  async onDelete(): Promise<void> {
    if (this.isEditMode() && this.eventId() && confirm('您確定要刪除此活動嗎？此操作無法復原。')) {
      try {
        const response = await this.apiService.deleteEvent(this.eventId()!);
        if (!response.success) {
          alert(response.error || '活動刪除失敗，請稍後再試。');
          return;
        }
      } catch {
        alert('活動刪除失敗，請稍後再試。');
        return;
      }

      alert('活動已刪除。');
      this.router.navigate(['/events']);
    }
  }

  onCancel(): void {
    this.router.navigate(['/events']);
  }
}