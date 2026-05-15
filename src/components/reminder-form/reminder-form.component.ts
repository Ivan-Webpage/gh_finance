import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-reminder-form',
  templateUrl: './reminder-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ReminderFormComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);

  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  createdId = signal<string | null>(null);

  date = signal(this.formatDate(new Date()));
  time = signal('');
  category = signal('');
  event = signal('');
  status = signal<'pending' | 'active' | 'cancelled'>('pending');

  async save(): Promise<void> {
    if (this.isSaving() || this.createdId()) return;

    const payload = {
      date: this.date(),
      time: this.time().trim() || undefined,
      category: this.category().trim() || undefined,
      event: this.event().trim(),
      status: this.status(),
    };

    if (!payload.date) {
      this.errorMessage.set('日期為必填');
      return;
    }

    if (!payload.event) {
      this.errorMessage.set('事件為必填');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.createReminder(payload);
      if (!response.success) {
        this.errorMessage.set(response.error || '新增失敗');
        return;
      }

      const reminderId = response.data?.id;
      if (reminderId) {
        this.createdId.set(reminderId);
      }

      if (response.data?.googleSyncStatus === 'failed') {
        this.errorMessage.set(`新增成功，但 Google Calendar 同步失敗：${response.data.googleSyncError || '未知錯誤'}`);
        return;
      }

      await this.router.navigate(['/reminders']);
    } catch (error: any) {
      this.errorMessage.set(error?.error?.error || error?.message || '新增失敗');
    } finally {
      this.isSaving.set(false);
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
