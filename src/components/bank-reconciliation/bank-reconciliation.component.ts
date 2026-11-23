import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  BankAccountSummary,
  BankLedgerCandidate,
  BankLoanGroup,
  BankStatementImport,
  BankStatementPreview,
  BankTransaction,
} from '../../services/api.service';

/**
 * 銀行對帳：上傳台灣銀行「存摺歷史明細查詢」CSV → 預覽 → 匯入，系統自動把金額相同、日期相近的流水帳對應起來。
 * 其餘交易可人工對應一筆或多筆流水帳（例如貸款扣款＝利息＋本金），或標記為不需入帳並寫原因。
 * 這個頁面不會新增、修改或刪除流水帳。
 */
interface UploadItem {
  id: number;
  file: File;
  status: 'previewing' | 'ready' | 'blocked' | 'error' | 'importing' | 'imported';
  preview?: BankStatementPreview;
  error?: string;
  result?: string;
}

const PAGE_SIZE = 50;

@Component({
  selector: 'app-bank-reconciliation',
  templateUrl: './bank-reconciliation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BankReconciliationComponent {
  private api = inject(ApiService);

  readonly statusLabels: Record<string, string> = { unmatched: '未處理', matched: '已對應', ignored: '不需入帳' };
  readonly ignoreReasons = ['提現繳貸款', '帳戶間轉帳', '營收撥款（已在銷貨收入）', '存款利息'];

  // 上傳
  uploads = signal<UploadItem[]>([]);
  isImporting = signal(false);
  uploadMessage = signal<string | null>(null);
  readyCount = computed(() => this.uploads().filter((u) => u.status === 'ready').length);
  private nextId = 1;

  // 列表
  transactions = signal<BankTransaction[]>([]);
  accounts = signal<BankAccountSummary[]>([]);
  imports = signal<BankStatementImport[]>([]);
  isLoading = signal(false);
  listError = signal<string | null>(null);
  filterAccount = signal('');
  filterStatus = signal('unmatched');
  filterFrom = signal('');
  filterTo = signal('');
  filterKeyword = signal('');
  page = signal(1);
  isAutoMatching = signal(false);
  actionMessage = signal<string | null>(null);

  filtered = computed(() => {
    const kw = this.filterKeyword().trim().toLowerCase();
    if (!kw) return this.transactions();
    return this.transactions().filter((t) =>
      [t.summary, t.memo, t.counterparty, t.note, t.withdrawal, t.deposit, ...t.entries.map((e) => `${e.subjectName} ${e.description ?? ''}`)]
        .some((v) => (v ?? '').toLowerCase().includes(kw))
    );
  });
  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  pageRows = computed(() => {
    const p = Math.min(this.page(), this.totalPages());
    return this.filtered().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });

  // 處理視窗
  editing = signal<BankTransaction | null>(null);
  candidates = signal<BankLedgerCandidate[]>([]);
  loanGroup = signal<BankLoanGroup | null>(null);
  selectedEntryIds = signal<Set<number>>(new Set());
  ignoreNote = signal('');
  isSaving = signal(false);
  modalError = signal<string | null>(null);
  candidateLoading = signal(false);
  selectedTotal = computed(() => {
    const ids = this.selectedEntryIds();
    const cents = this.candidates().filter((c) => ids.has(c.entry_id)).reduce((sum, c) => sum + Math.round(Math.abs(Number(c.amount)) * 100), 0);
    return cents / 100;
  });
  /** 比對基準：一般交易＝這筆金額；台銀貸款扣款＝同月全部扣款合計（兩個帳戶） */
  editingAmount = computed(() => {
    const g = this.loanGroup();
    if (g) return Number(g.total);
    const t = this.editing();
    return t ? Math.max(Math.abs(Number(t.withdrawal)), Math.abs(Number(t.deposit))) : 0;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.listError.set(null);
    try {
      const res = await this.api.getBankReconciliation({
        account: this.filterAccount(),
        status: this.filterStatus(),
        from: this.filterFrom(),
        to: this.filterTo(),
      });
      if (!res.success || !res.data) throw new Error(res.error || '讀取失敗');
      this.transactions.set(res.data.transactions);
      this.accounts.set(res.data.accounts);
      this.imports.set(res.data.imports);
      this.page.set(1);
    } catch (e) {
      this.listError.set(this.errorText(e));
    } finally {
      this.isLoading.set(false);
    }
  }

  setFilter(kind: 'account' | 'status' | 'from' | 'to', value: string): void {
    ({ account: this.filterAccount, status: this.filterStatus, from: this.filterFrom, to: this.filterTo })[kind].set(value);
    void this.load();
  }

  // ---------- 上傳 ----------
  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 20);
    input.value = '';
    if (files.length === 0) return;
    this.uploadMessage.set(null);
    const items: UploadItem[] = files.map((file) => ({ id: this.nextId++, file, status: 'previewing' }));
    this.uploads.set(items);
    for (const item of items) {
      try {
        const res = await this.api.previewBankStatement(item.file);
        if (!res.success || !res.data) throw new Error(res.error || '預覽失敗');
        const blocked = res.data.alreadyImported || res.data.newRowCount === 0;
        this.patchUpload(item.id, {
          status: blocked ? 'blocked' : 'ready',
          preview: res.data,
          error: res.data.alreadyImported ? '這個檔案已經匯入過' : res.data.newRowCount === 0 ? '沒有新的交易' : undefined,
        });
      } catch (e) {
        this.patchUpload(item.id, { status: 'error', error: this.errorText(e) });
      }
    }
  }

  async importAll(): Promise<void> {
    this.isImporting.set(true);
    let total = 0;
    let matched = 0;
    let ignored = 0;
    for (const item of this.uploads().filter((u) => u.status === 'ready')) {
      this.patchUpload(item.id, { status: 'importing' });
      try {
        const res = await this.api.importBankStatement(item.file);
        if (!res.success || !res.data) throw new Error(res.error || '匯入失敗');
        total += res.data.newRowCount;
        matched += res.data.autoMatched;
        ignored += res.data.autoIgnored;
        this.patchUpload(item.id, {
          status: 'imported',
          result: `新增 ${res.data.newRowCount} 筆，自動對應 ${res.data.autoMatched} 筆` + (res.data.autoIgnored ? `，自動略過 ${res.data.autoIgnored} 筆` : ''),
        });
      } catch (e) {
        this.patchUpload(item.id, { status: 'error', error: this.errorText(e) });
      }
    }
    this.isImporting.set(false);
    this.uploadMessage.set(`匯入完成：新增 ${total} 筆交易，自動對應 ${matched} 筆` + (ignored ? `，個人帳戶非貸款交易自動略過 ${ignored} 筆` : '') + '。');
    await this.load();
  }

  clearUploads(): void {
    this.uploads.set([]);
    this.uploadMessage.set(null);
  }

  private patchUpload(id: number, patch: Partial<UploadItem>): void {
    this.uploads.update((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  // ---------- 自動配對 ----------
  async runAutoMatch(): Promise<void> {
    this.isAutoMatching.set(true);
    this.actionMessage.set(null);
    try {
      const res = await this.api.autoMatchBankTransactions(this.filterAccount() || null);
      if (!res.success || !res.data) throw new Error(res.error || '自動對應失敗');
      this.actionMessage.set(`自動對應了 ${res.data.matched} 筆` + (res.data.ignored ? `，自動略過 ${res.data.ignored} 筆` : '') + '。');
      await this.load();
    } catch (e) {
      this.actionMessage.set(this.errorText(e));
    } finally {
      this.isAutoMatching.set(false);
    }
  }

  // ---------- 處理視窗 ----------
  async openEditor(t: BankTransaction): Promise<void> {
    this.editing.set(t);
    this.selectedEntryIds.set(new Set(t.entries.map((e) => e.entryId)));
    this.ignoreNote.set(t.note ?? '');
    this.modalError.set(null);
    this.candidates.set([]);
    this.loanGroup.set(null);
    this.candidateLoading.set(true);
    try {
      const res = await this.api.getBankLedgerCandidates(t.txn_id);
      if (!res.success || !res.data) throw new Error(res.error || '讀取候選流水帳失敗');
      this.candidates.set(res.data.candidates);
      this.loanGroup.set(res.data.loanGroup);
      // 貸款扣款還沒對應時，預設勾選同月台銀利息＋本金
      if (res.data.loanGroup && t.entries.length === 0) {
        this.selectedEntryIds.set(new Set(res.data.candidates.map((x) => x.entry_id)));
      }
    } catch (e) {
      this.modalError.set(this.errorText(e));
    } finally {
      this.candidateLoading.set(false);
    }
  }

  closeEditor(): void {
    this.editing.set(null);
  }

  toggleEntry(id: number): void {
    this.selectedEntryIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async save(action: 'link' | 'ignore' | 'reset'): Promise<void> {
    const t = this.editing();
    if (!t) return;
    this.isSaving.set(true);
    this.modalError.set(null);
    try {
      const res = await this.api.updateBankTransaction({
        txnId: t.txn_id,
        action,
        entryIds: action === 'link' ? [...this.selectedEntryIds()] : undefined,
        note: action === 'ignore' ? this.ignoreNote() : undefined,
      });
      if (!res.success) throw new Error(res.error || '儲存失敗');
      this.editing.set(null);
      await this.load();
    } catch (e) {
      this.modalError.set(this.errorText(e));
    } finally {
      this.isSaving.set(false);
    }
  }

  amountOf(t: BankTransaction): number {
    return Number(t.withdrawal) !== 0 ? -Number(t.withdrawal) : Number(t.deposit);
  }

  private errorText(e: unknown): string {
    const err = e as { error?: { error?: string }; message?: string };
    return err?.error?.error || err?.message || '發生錯誤';
  }
}
