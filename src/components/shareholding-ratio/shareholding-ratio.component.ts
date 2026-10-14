import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface ShareholderRow {
  shareholder_id: number;
  shareholder_name: string;
  share_percentage: number;
  invested_amount: number;
  joined_at: string;
  member_uuid: string | null;
  member_name: string | null;
  /** 對應的 iChef 會員已在「LINE 用戶」頁面連結到 LINE 帳號 */
  line_linked: boolean;
  line_display_name: string | null;
  line_is_following: boolean | null;
}

interface MemberOption {
  uuid: string;
  name: string;
}

@Component({
  selector: 'app-shareholding-ratio',
  templateUrl: './shareholding-ratio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShareholdingRatioComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  shareholders = signal<ShareholderRow[]>([]);
  /** iChef 會員（下拉選單用），「股東」開頭的排前面 */
  shareholderMembers = signal<MemberOption[]>([]);
  otherMembers = signal<MemberOption[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  isModalOpen = signal<boolean>(false);
  editingShareholderId = signal<number | null>(null);

  /** 已對應給其他股東的會員（編輯中的這位股東自己的不算），下拉選單停用 */
  linkedMemberUuids = computed(() => {
    const editingId = this.editingShareholderId();
    return new Set(
      this.shareholders()
        .filter(row => row.member_uuid && row.shareholder_id !== editingId)
        .map(row => row.member_uuid as string)
    );
  });

  modalTitle = computed(() => (this.editingShareholderId() ? '編輯股東' : '新增股東'));

  totalSharePercentage = computed(() => {
    return this.shareholders().reduce((sum, row) => sum + Number(row.share_percentage || 0), 0);
  });

  totalInvestedAmount = computed(() => {
    return this.shareholders().reduce((sum, row) => sum + Number(row.invested_amount || 0), 0);
  });

  shareholderForm = this.fb.group({
    shareholder_name: ['', [Validators.required]],
    share_percentage: ['', [Validators.required]],
    invested_amount: ['', [Validators.required]],
    joined_at: ['', [Validators.required]],
    member_uuid: [''],
  });

  constructor() {
    // 初次進入頁面載入資料
    void this.loadShareholders();
    void this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    try {
      const response = await this.apiService.getCustomers({ limit: 1000 });
      if (!response?.success || !Array.isArray(response.data)) return;
      const members: MemberOption[] = response.data
        .filter((c: any) => c?.id && !c.isDeleted)
        .map((c: any) => ({ uuid: String(c.id).toLowerCase(), name: String(c.name || '') }))
        .sort((a: MemberOption, b: MemberOption) => a.name.localeCompare(b.name, 'zh-Hant'));
      this.shareholderMembers.set(members.filter(m => m.name.startsWith('股東')));
      this.otherMembers.set(members.filter(m => !m.name.startsWith('股東')));
    } catch (error) {
      console.error('Error loading members:', error);
    }
  }

  async loadShareholders(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.apiService.getShareholders();
      if (response.success && response.data) {
        this.shareholders.set(response.data);
      } else {
        this.errorMessage.set(response.error || '載入股東資料失敗');
      }
    } catch (error: any) {
      this.errorMessage.set(error?.message || '載入股東資料失敗');
      console.error('Error loading shareholders:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  openModal(): void {
    this.errorMessage.set('');
    this.shareholderForm.reset();
    this.editingShareholderId.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(row: ShareholderRow): void {
    this.errorMessage.set('');
    this.editingShareholderId.set(row.shareholder_id);

    this.shareholderForm.patchValue({
      shareholder_name: row.shareholder_name,
      share_percentage: String(row.share_percentage),
      invested_amount: String(row.invested_amount),
      joined_at: this.formatDate(row.joined_at),
      member_uuid: row.member_uuid ?? '',
    });

    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  async handleSubmit(): Promise<void> {
    if (this.shareholderForm.invalid) {
      this.shareholderForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const payload = {
        shareholder_name: String(this.shareholderForm.value.shareholder_name || '').trim(),
        share_percentage: Number(this.shareholderForm.value.share_percentage),
        invested_amount: Number(this.shareholderForm.value.invested_amount),
        joined_at: String(this.shareholderForm.value.joined_at || ''),
        member_uuid: String(this.shareholderForm.value.member_uuid || '') || null,
      };

      const editingId = this.editingShareholderId();
      const response = editingId
        ? await this.apiService.updateShareholder({ shareholder_id: editingId, ...payload })
        : await this.apiService.createShareholder(payload);

      if (response.success) {
        this.closeModal();
        await this.loadShareholders();
      } else {
        this.errorMessage.set(response.error || '新增股東失敗');
      }
    } catch (error: any) {
      this.errorMessage.set(error?.error?.error || error?.message || '儲存股東失敗');
      console.error('Error creating shareholder:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteShareholder(row: ShareholderRow): Promise<void> {
    const ok = window.confirm(`確定要刪除股東「${row.shareholder_name}」嗎？`);
    if (!ok) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.apiService.deleteShareholder(row.shareholder_id);
      if (response.success) {
        await this.loadShareholders();
      } else {
        this.errorMessage.set(response.error || '刪除股東失敗');
      }
    } catch (error: any) {
      this.errorMessage.set(error?.message || '刪除股東失敗');
      console.error('Error deleting shareholder:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  formatPercentage(value: number): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '-';
    }
    return `${Number(value)}%`;
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '-';
    }

    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  formatDate(value: string): string {
    if (!value) {
      return '-';
    }

    // joined_at 可能來自 DATE 或 TIMESTAMPTZ，這裡統一取 YYYY-MM-DD
    const datePart = String(value).slice(0, 10);
    return datePart;
  }
}
