import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, StoreClosureEntry } from '../../services/api.service';

// 特殊公休日（非星期一）管理。每週一固定公休不需要登記，
// LINE@ 訂位日曆 API（/api/public/booking-calendar）會自動把週一標成公休。
@Component({
  selector: 'app-store-closures',
  templateUrl: './store-closures.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class StoreClosuresComponent {
  apiService = inject(ApiService);

  closures = signal<StoreClosureEntry[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  showPast = signal(false);

  newDate = signal('');
  newReason = signal('');

  private readonly today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

  displayedClosures = computed(() => {
    const list = this.closures();
    const filtered = this.showPast() ? list : list.filter(c => c.date >= this.today);
    // 未來的公休日由近到遠排，方便確認接下來的安排
    return [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  });

  isNewDateMonday = computed(() => {
    const date = this.newDate();
    return !!date && new Date(`${date}T00:00:00`).getDay() === 1;
  });

  constructor() {
    this.loadClosures();
  }

  async loadClosures(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.apiService.getStoreClosures();
      if (response.success && response.data) {
        this.closures.set(response.data);
      } else {
        this.closures.set([]);
        this.errorMessage.set(response.error || '載入公休日失敗');
      }
    } catch (error: any) {
      console.error('Failed to load store closures:', error);
      this.closures.set([]);
      this.errorMessage.set(error?.error?.error || '載入公休日失敗，請稍後再試');
    } finally {
      this.isLoading.set(false);
    }
  }

  async addClosure(): Promise<void> {
    const date = this.newDate();
    if (!date) {
      this.errorMessage.set('請選擇公休日期');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.apiService.createStoreClosure({ date, reason: this.newReason().trim() });
      if (response.success && response.data) {
        const created = response.data;
        this.closures.update(list => [...list, created]);
        this.newDate.set('');
        this.newReason.set('');
      } else {
        this.errorMessage.set(response.error || '新增公休日失敗');
      }
    } catch (error: any) {
      console.error('Failed to create store closure:', error);
      this.errorMessage.set(error?.error?.error || '新增公休日失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteClosure(closure: StoreClosureEntry): Promise<void> {
    if (!confirm(`確定要刪除 ${closure.date} 的公休設定嗎？`)) return;

    this.errorMessage.set(null);
    try {
      const response = await this.apiService.deleteStoreClosure(closure.id);
      if (response.success) {
        this.closures.update(list => list.filter(c => c.id !== closure.id));
      } else {
        this.errorMessage.set(response.error || '刪除公休日失敗');
      }
    } catch (error: any) {
      console.error('Failed to delete store closure:', error);
      this.errorMessage.set(error?.error?.error || '刪除公休日失敗，請稍後再試');
    }
  }

  formatDateForDisplay(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`);
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return `${dateStr} (${dayOfWeek})`;
  }
}
