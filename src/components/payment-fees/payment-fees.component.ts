import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  PaymentFeeCoverageCell,
  PaymentFeeCoverageMonth,
  PaymentFeeEntry,
  PaymentFeeImport,
  PaymentFeeImportResult,
  PaymentFeePlatform,
  PaymentFeePreview,
} from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/**
 * 手續費對帳：上傳 Line Pay／街口／悠遊付官方報表 → 預覽 → 確認後寫入「營業費用／金流手續費」流水帳。
 * 每平台每月一筆【實際】分錄；不做任何估算，還沒匯入的月份由「每月對帳狀態」提醒。
 */
@Component({
  selector: 'app-payment-fees',
  templateUrl: './payment-fees.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PaymentFeesComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  readonly platforms: Array<{ value: PaymentFeePlatform; hint: string }> = [
    { value: 'Line Pay', hint: 'LINE Pay 商家後台 → 請款明細，下載 CSV（檔名像 1ICF_…_CAPTURE.csv）' },
    { value: '街口', hint: '街口商家後台 → 店家發票手續費月報表，下載 .xlsx' },
    { value: '悠遊付', hint: '悠遊付商家後台 → 手續費列表，搜尋後匯出 .xlsx' },
  ];
  readonly sourceLabels: Record<string, string> = { actual: '實際（報表）', manual: '人工記帳' };

  canEdit = computed(() => this.auth.hasPermission('edit_ledger') || this.auth.hasRole('super_admin'));

  // 上傳
  platform = signal<PaymentFeePlatform>('Line Pay');
  file = signal<File | null>(null);
  preview = signal<PaymentFeePreview | null>(null);
  isPreviewing = signal(false);
  isImporting = signal(false);
  uploadError = signal<string | null>(null);
  importResult = signal<PaymentFeeImportResult | null>(null);

  platformHint = computed(() => this.platforms.find((p) => p.value === this.platform())?.hint ?? '');
  canImport = computed(() => {
    const p = this.preview();
    return !!p && !p.duplicateFile && p.newRecords > 0 && !this.isImporting();
  });

  // 列表
  entries = signal<PaymentFeeEntry[]>([]);
  imports = signal<PaymentFeeImport[]>([]);
  isLoading = signal(false);
  listError = signal<string | null>(null);
  filterFrom = signal('');
  filterTo = signal('');
  filterPlatform = signal('');
  filterSource = signal('');
  filterKeyword = signal('');

  displayedEntries = computed(() => {
    const kw = this.filterKeyword().trim().toLowerCase();
    if (!kw) return this.entries();
    return this.entries().filter((e) => (e.description || '').toLowerCase().includes(kw));
  });
  displayedTotal = computed(() => this.displayedEntries().reduce((sum, e) => sum + Number(e.amount || 0), 0));

  // 每月對帳狀態
  readonly coveragePlatforms = ['信用卡', 'Line Pay', '街口', '悠遊付'];
  coverage = signal<PaymentFeeCoverageMonth[]>([]);
  coverageError = signal<string | null>(null);
  coverageLoaded = signal(false);
  onlyIncomplete = signal(true);
  readonly currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()).slice(0, 7);

  private isPending(cell: PaymentFeeCoverageCell): boolean {
    return cell.status === 'missing' || cell.status === 'partial';
  }
  /** 已結束的月份裡，還沒匯入（或只匯入部分）的 平台×月份 數（信用卡尚未支援匯入，不算） */
  pendingCount = computed(() =>
    this.coverage()
      .filter((m) => m.month < this.currentMonth)
      .reduce((n, m) => n + m.cells.filter((c) => this.isPending(c)).length, 0)
  );
  displayedCoverage = computed(() =>
    this.onlyIncomplete()
      ? this.coverage().filter((m) => m.month < this.currentMonth && m.cells.some((c) => this.isPending(c)))
      : this.coverage()
  );

  constructor() {
    this.loadList();
    this.loadCoverage();
  }

  async loadCoverage(): Promise<void> {
    this.coverageError.set(null);
    try {
      const res = await this.api.getPaymentFeeCoverage();
      if (res.success && res.data) {
        this.coverage.set(res.data);
        this.coverageLoaded.set(true);
      }
      else this.coverageError.set(res.error || '載入對帳狀態失敗');
    } catch (error: any) {
      this.coverageError.set(error?.error?.error || '載入對帳狀態失敗');
    }
  }

  cellOf(month: PaymentFeeCoverageMonth, platform: string): PaymentFeeCoverageCell | undefined {
    return month.cells.find((c) => c.platform === platform);
  }

  statusLabel(cell: PaymentFeeCoverageCell, month: string): string {
    if (month >= this.currentMonth && cell.status !== 'no_sales' && cell.status !== 'imported') return '本月進行中';
    return { no_sales: '無交易', imported: '已匯入', partial: '部分匯入', missing: '未匯入', not_supported: '尚未支援' }[cell.status];
  }

  statusClass(cell: PaymentFeeCoverageCell, month: string): string {
    if (month >= this.currentMonth && cell.status !== 'no_sales' && cell.status !== 'imported') return 'bg-gray-100 text-gray-600';
    return {
      no_sales: 'text-gray-400',
      imported: 'bg-green-100 text-green-800',
      partial: 'bg-amber-100 text-amber-800',
      missing: 'bg-red-100 text-red-700',
      not_supported: 'bg-gray-100 text-gray-600',
    }[cell.status];
  }

  async loadList(): Promise<void> {
    this.isLoading.set(true);
    this.listError.set(null);
    try {
      const res = await this.api.getPaymentFees({
        from: this.filterFrom(),
        to: this.filterTo(),
        platform: this.filterPlatform(),
        source: this.filterSource(),
      });
      if (res.success && res.data) {
        this.entries.set(res.data.entries);
        this.imports.set(res.data.imports);
      } else {
        this.listError.set(res.error || '載入失敗');
      }
    } catch (error: any) {
      this.listError.set(error?.error?.error || '載入失敗，請稍後再試');
    } finally {
      this.isLoading.set(false);
    }
  }

  resetFilters(): void {
    this.filterFrom.set('');
    this.filterTo.set('');
    this.filterPlatform.set('');
    this.filterSource.set('');
    this.filterKeyword.set('');
    this.loadList();
  }

  onPlatformChange(value: PaymentFeePlatform): void {
    this.platform.set(value);
    this.clearUpload();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    this.preview.set(null);
    this.importResult.set(null);
    this.uploadError.set(null);
    if (this.file()) this.runPreview();
  }

  clearUpload(): void {
    this.file.set(null);
    this.preview.set(null);
    this.uploadError.set(null);
    const input = document.getElementById('payment-fee-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async runPreview(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.isPreviewing.set(true);
    this.uploadError.set(null);
    try {
      const res = await this.api.previewPaymentFeeReport(file, this.platform());
      if (res.success && res.data) {
        this.preview.set(res.data);
      } else {
        this.uploadError.set(res.error || '解析失敗');
      }
    } catch (error: any) {
      this.uploadError.set(error?.error?.error || '解析失敗，請確認檔案與平台是否相符');
    } finally {
      this.isPreviewing.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const file = this.file();
    const preview = this.preview();
    if (!file || !preview) return;
    const msg = `確定匯入 ${preview.platform} ${preview.newRecords} 筆手續費（${this.money(preview.newFee)}）？`;
    if (!confirm(msg)) return;

    this.isImporting.set(true);
    this.uploadError.set(null);
    try {
      const res = await this.api.importPaymentFeeReport(file, preview.platform);
      if (res.success && res.data) {
        this.importResult.set(res.data);
        this.clearUpload();
        await Promise.all([this.loadList(), this.loadCoverage()]);
      } else {
        this.uploadError.set(res.error || '匯入失敗');
      }
    } catch (error: any) {
      this.uploadError.set(error?.error?.error || '匯入失敗，請稍後再試');
    } finally {
      this.isImporting.set(false);
    }
  }

  money(value: string | number | null | undefined, digits = 0): string {
    const n = Number(value ?? 0);
    return n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  percent(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
  }
}
