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
const MAX_FILES = 50;

interface UploadItem {
  id: number;
  file: File;
  status: 'previewing' | 'ready' | 'blocked' | 'error' | 'importing' | 'imported' | 'skipped';
  preview?: PaymentFeePreview;
  error?: string;
  result?: PaymentFeeImportResult;
}

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

  readonly platforms: Array<{ value: PaymentFeePlatform | 'auto'; hint: string }> = [
    { value: 'auto', hint: '系統依檔案內容自動判斷平台，可一次混選 Line Pay（CSV）、街口、悠遊付（xlsx）的報表' },
    { value: 'Line Pay', hint: 'LINE Pay 商家後台 → 請款明細，下載 CSV（檔名像 1ICF_…_CAPTURE.csv）' },
    { value: '街口', hint: '街口商家後台 → 店家發票手續費月報表，下載 .xlsx' },
    { value: '悠遊付', hint: '悠遊付商家後台 → 手續費列表，搜尋後匯出 .xlsx' },
  ];
  readonly sourceLabels: Record<string, string> = { actual: '實際（報表）', estimated: '推算（無資料）', manual: '人工記帳' };

  canEdit = computed(() => this.auth.hasPermission('edit_ledger') || this.auth.hasRole('super_admin'));

  // 上傳
  platform = signal<PaymentFeePlatform | 'auto'>('auto');
  uploads = signal<UploadItem[]>([]);
  isPreviewing = signal(false);
  isImporting = signal(false);
  uploadError = signal<string | null>(null);
  importSummary = signal<string | null>(null);

  platformHint = computed(() => this.platforms.find((p) => p.value === this.platform())?.hint ?? '');
  readyCount = computed(() => this.uploads().filter((u) => u.status === 'ready').length);
  readyFee = computed(() =>
    this.uploads().filter((u) => u.status === 'ready').reduce((sum, u) => sum + Number(u.preview?.newFee || 0), 0)
  );
  canImport = computed(() => this.readyCount() > 0 && !this.isPreviewing() && !this.isImporting());

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
    return { no_sales: '無交易', imported: '已匯入', partial: '部分匯入', missing: '未匯入', not_supported: '尚未支援', confirmed: '已確認' }[cell.status];
  }

  statusClass(cell: PaymentFeeCoverageCell, month: string): string {
    if (month >= this.currentMonth && cell.status !== 'no_sales' && cell.status !== 'imported') return 'bg-gray-100 text-gray-600';
    return {
      no_sales: 'text-gray-400',
      imported: 'bg-green-100 text-green-800',
      partial: 'bg-amber-100 text-amber-800',
      missing: 'bg-red-100 text-red-700',
      not_supported: 'bg-gray-100 text-gray-600',
      confirmed: 'bg-blue-100 text-blue-800',
    }[cell.status];
  }

  async confirmCell(month: string, cell: PaymentFeeCoverageCell): Promise<void> {
    const note = prompt(`${month} ${cell.platform}：標記為已確認（差異原因已核對）。
請輸入原因（選填）：`, '');
    if (note === null) return;
    try {
      const res = await this.api.confirmPaymentFeeMonth(cell.platform, month, note.trim() || null);
      if (!res.success) {
        alert(res.error || '標記失敗');
        return;
      }
      await this.loadCoverage();
    } catch (error: any) {
      alert(error?.error?.error || '標記失敗，請稍後再試');
    }
  }

  async unconfirmCell(month: string, cell: PaymentFeeCoverageCell): Promise<void> {
    if (!confirm(`取消 ${month} ${cell.platform} 的「已確認」標記？`)) return;
    try {
      const res = await this.api.unconfirmPaymentFeeMonth(cell.platform, month);
      if (!res.success) {
        alert(res.error || '取消失敗');
        return;
      }
      await this.loadCoverage();
    } catch (error: any) {
      alert(error?.error?.error || '取消失敗，請稍後再試');
    }
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

  onPlatformChange(value: PaymentFeePlatform | 'auto'): void {
    this.platform.set(value);
    this.clearUpload();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.importSummary.set(null);
    this.uploadError.set(null);
    if (files.length > MAX_FILES) {
      this.uploadError.set(`一次最多選 ${MAX_FILES} 個檔案`);
      input.value = '';
      return;
    }
    this.uploads.set(files.map((file, i) => ({ id: i, file, status: 'previewing' as const })));
    this.previewAll();
  }

  clearUpload(): void {
    this.uploads.set([]);
    this.uploadError.set(null);
    const input = document.getElementById('payment-fee-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  removeUpload(id: number): void {
    this.uploads.update((list) => list.filter((u) => u.id !== id));
  }

  private patchUpload(id: number, patch: Partial<UploadItem>): void {
    this.uploads.update((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  /** 逐一預覽（依序送出，避免同時打太多請求） */
  private async previewAll(): Promise<void> {
    this.isPreviewing.set(true);
    const platform = this.platform();
    for (const item of this.uploads()) {
      try {
        const res = await this.api.previewPaymentFeeReport(item.file, platform);
        if (res.success && res.data) {
          const blocked = !!res.data.duplicateFile || res.data.newRecords === 0;
          this.patchUpload(item.id, { status: blocked ? 'blocked' : 'ready', preview: res.data });
        } else {
          this.patchUpload(item.id, { status: 'error', error: res.error || '解析失敗' });
        }
      } catch (error: any) {
        this.patchUpload(item.id, { status: 'error', error: error?.error?.error || '解析失敗，請確認檔案與平台是否相符' });
      }
    }
    this.isPreviewing.set(false);
  }

  async confirmImport(): Promise<void> {
    const ready = this.uploads().filter((u) => u.status === 'ready');
    if (ready.length === 0) return;
    const fee = ready.reduce((sum, u) => sum + Number(u.preview?.newFee || 0), 0);
    if (!confirm(`確定匯入 ${ready.length} 個報表（預估新增手續費 ${this.money(fee)}）？`)) return;

    this.isImporting.set(true);
    this.uploadError.set(null);
    let inserted = 0;
    let imported = 0;
    for (const item of ready) {
      this.patchUpload(item.id, { status: 'importing' });
      try {
        const res = await this.api.importPaymentFeeReport(item.file, item.preview?.platform ?? this.platform());
        if (res.success && res.data) {
          inserted += res.data.insertedRecords;
          imported += 1;
          this.patchUpload(item.id, { status: 'imported', result: res.data });
        } else {
          this.patchUpload(item.id, { status: 'error', error: res.error || '匯入失敗' });
        }
      } catch (error: any) {
        const msg: string = error?.error?.error || '匯入失敗，請稍後再試';
        // 前面的檔案已經涵蓋這個檔案的全部資料（期間重疊）：不算錯誤
        // 或同一批選了內容相同的檔案（409：這個檔案已經匯入過）
        const skipped = (error?.status === 400 && msg.includes('都已經匯入過')) || error?.status === 409;
        this.patchUpload(item.id, { status: skipped ? 'skipped' : 'error', error: msg });
      }
    }
    this.importSummary.set(`完成：匯入 ${imported} 個檔案、新增 ${inserted} 筆手續費明細。`);
    this.isImporting.set(false);
    await Promise.all([this.loadList(), this.loadCoverage()]);
  }

  statusText(item: UploadItem): string {
    return {
      previewing: '解析中',
      ready: '可匯入',
      blocked: '不需匯入',
      error: '錯誤',
      importing: '匯入中',
      imported: '已匯入',
      skipped: '已略過',
    }[item.status];
  }

  money(value: string | number | null | undefined, digits = 0): string {
    const n = Number(value ?? 0);
    return n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  percent(value: number | null): string {
    return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
  }
}
