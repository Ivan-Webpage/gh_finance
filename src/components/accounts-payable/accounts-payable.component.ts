import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import type { GLAccount } from '../../services/api.service';

interface AccountsPayableRow {
  entry_id: number;
  entry_date: string;
  creditor: string | null;
  total_amount: string | number;
  paid_amount: string | number;
  remaining_amount: string | number;
  due_date: string | null;
  description: string | null;
}

interface AccountsPayablePaymentRow {
  payment_id: number;
  entry_id: number;
  payment_date: string;
  amount: string | number;
  description: string | null;
}

interface AccountsPayableMaster {
  ap_id: number;
  entry_id: number;
  creditor: string;
  due_date: string;
  gl_account_id?: number | null;
}

@Component({
  selector: 'app-accounts-payable',
  templateUrl: './accounts-payable.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AccountsPayableComponent {
  private apiService = inject(ApiService);

  loading = signal(false);
  errorMessage = signal<string>('');

  rows = signal<AccountsPayableRow[]>([]);

  // Add payable modal
  isAddOpen = signal(false);
  addErrorMessage = signal<string>('');
  savingAdd = signal(false);
  newPayableCreditor = signal<string>('');
  newPayableEntryDate = signal<string>('');
  newPayableDueDate = signal<string>('');
  newPayableAmount = signal<number | null>(null);
  newPayableDescription = signal<string>('');

  // Detail modal
  isDetailOpen = signal(false);
  selectedEntryId = signal<number | null>(null);
  detailReadOnly = signal(false);
  paymentsLoading = signal(false);
  paymentsError = signal<string>('');
  payments = signal<AccountsPayablePaymentRow[]>([]);

  masterLoading = signal(false);
  masterError = signal<string>('');
  master = signal<AccountsPayableMaster | null>(null);
  editCreditor = signal<string>('');
  editDueDate = signal<string>('');
  savingMaster = signal(false);

  // GL Accounts (for "項目/科目" dropdowns)
  glAccounts = signal<GLAccount[]>([]);
  isLoadingGLAccounts = signal(false);
  glAccountsError = signal<string>('');
  editItemGroup = signal<string>('');
  editSubjectName = signal<string>('');

  topLevelAccountNames = computed(() => {
    const accounts = this.glAccounts();
    return accounts
      .filter(acc => acc.parent_account_id === null || acc.parent_account_id === undefined)
      .map(acc => acc.account_name)
      .filter(Boolean)
      .sort();
  });

  availableSubjectNames = computed(() => {
    const selectedItem = this.editItemGroup();
    const accounts = this.glAccounts();
    if (!selectedItem || accounts.length === 0) return [];

    const parent = accounts.find(acc => acc.account_name === selectedItem && (acc.parent_account_id === null || acc.parent_account_id === undefined));
    if (!parent) return [];

    const parentId = this.toIdNumber((parent as any).gl_account_id);
    if (!parentId) return [];

    return accounts
      .filter(acc => this.toIdNumber((acc as any).parent_account_id) === parentId)
      .map(acc => acc.account_name)
      .filter(Boolean)
      .sort();
  });

  showAddPayment = signal(false);
  newPaymentDate = signal<string>('');
  newPaymentAmount = signal<number | null>(null);
  newPaymentDescription = signal<string>('');
  savingPayment = signal(false);

  detailRow = computed(() => {
    const entryId = this.selectedEntryId();
    if (!entryId) return null;
    return this.rows().find(r => Number(r.entry_id) === Number(entryId)) || null;
  });

  unpaidRows = computed(() => {
    return this.rows().filter(r => this.toNumber(r.remaining_amount) > 0);
  });

  paidRows = computed(() => {
    return this.rows().filter(r => this.toNumber(r.remaining_amount) <= 0);
  });

  maxRepaymentAmount = computed(() => {
    const row = this.detailRow();
    if (!row) return null;
    const remaining = this.toNumber(row.remaining_amount);
    return remaining > 0 ? remaining : 0;
  });

  constructor() {
    this.loadRows();
  }

  openAddPayable(): void {
    this.addErrorMessage.set('');
    this.savingAdd.set(false);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    this.newPayableCreditor.set('');
    this.newPayableEntryDate.set(todayStr);
    this.newPayableDueDate.set(todayStr);
    this.newPayableAmount.set(null);
    this.newPayableDescription.set('');
    this.isAddOpen.set(true);
  }

  closeAddPayable(): void {
    this.isAddOpen.set(false);
    this.addErrorMessage.set('');
    this.savingAdd.set(false);
  }

  async saveNewPayable(): Promise<void> {
    if (this.savingAdd()) return;

    const creditor = (this.newPayableCreditor() || '').trim();
    const entryDate = (this.newPayableEntryDate() || '').trim();
    const dueDate = (this.newPayableDueDate() || '').trim();
    const amount = this.newPayableAmount();
    const description = (this.newPayableDescription() || '').trim();

    if (!creditor) {
      this.addErrorMessage.set('請填寫債權人');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      this.addErrorMessage.set('發生日期格式需為 YYYY-MM-DD');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      this.addErrorMessage.set('還款期限格式需為 YYYY-MM-DD');
      return;
    }

    if (amount === null || amount === undefined || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      this.addErrorMessage.set('欠款金額需為 > 0 的數字');
      return;
    }

    this.savingAdd.set(true);
    this.addErrorMessage.set('');

    let createdEntryId: number | null = null;
    let resolvedGlAccountId: number | null = null;
    try {
      try {
        const resolved = await this.apiService.resolveGLAccount('負債', '應付帳款');
        if (resolved.success && resolved.data && Number(resolved.data.glAccountId) > 0) {
          resolvedGlAccountId = Number(resolved.data.glAccountId);
        }
      } catch {
        // ignore resolve failure; still allow creating the payable
      }

      const createLedgerPayload: any = {
        entry_date: entryDate,
        item_group: '負債',
        subject_name: '應付帳款',
        amount: Number(amount),
        description: description || undefined,
      };
      if (resolvedGlAccountId) {
        createLedgerPayload.gl_account_id = resolvedGlAccountId;
      }

      const created = await this.apiService.createLedgerEntry(createLedgerPayload);
      if (!created.success || !created.data) {
        this.addErrorMessage.set(created.error || '新增應付失敗');
        return;
      }

      createdEntryId = Number((created.data as any).entry_id);
      if (!Number.isFinite(createdEntryId) || createdEntryId <= 0) {
        this.addErrorMessage.set('新增應付成功，但無法取得流水帳編號');
        return;
      }

      const masterRes = await this.apiService.updateAccountsPayableMaster({
        entryId: createdEntryId,
        creditor,
        dueDate,
        glAccountId: resolvedGlAccountId || undefined,
      });

      if (!masterRes.success) {
        alert(masterRes.error || '已新增欠款，但主檔儲存失敗（可進入明細再補）');
      }

      await this.loadRows();
      this.closeAddPayable();
    } catch (error: any) {
      console.error(error);

      if (createdEntryId) {
        await this.loadRows();
        this.closeAddPayable();
        alert(error?.message || '已新增欠款，但主檔儲存失敗（可進入明細再補）');
        return;
      }

      this.addErrorMessage.set(error?.message || '新增應付失敗');
    } finally {
      this.savingAdd.set(false);
    }
  }

  private syncItemAndSubjectFromMasterIfPossible(): void {
    // Only prefill when:
    // - master has gl_account_id
    // - gl accounts are loaded
    // - user hasn't manually selected values yet
    if (this.editItemGroup() || this.editSubjectName()) return;

    const currentMaster = this.master();
    if (!currentMaster) return;

    const glAccountId = Number((currentMaster as any).gl_account_id);
    if (!Number.isFinite(glAccountId) || glAccountId <= 0) return;

    if (this.glAccounts().length === 0) return;

    this.prefillItemAndSubjectFromGlAccountId(glAccountId);
  }

  private async ensureGLAccountsLoaded(): Promise<void> {
    if (this.glAccounts().length > 0 || this.isLoadingGLAccounts()) return;

    this.isLoadingGLAccounts.set(true);
    this.glAccountsError.set('');
    try {
      const res = await this.apiService.getGLAccounts();
      if (res.success && res.data) {
        this.glAccounts.set(res.data as any);
        this.syncItemAndSubjectFromMasterIfPossible();
      } else {
        this.glAccountsError.set(res.error || '無法加載會計科目');
      }
    } catch (error: any) {
      console.error(error);
      this.glAccountsError.set(error?.message || '加載會計科目失敗');
    } finally {
      this.isLoadingGLAccounts.set(false);
    }
  }

  onItemGroupChanged(nextValue: string): void {
    this.editItemGroup.set(nextValue || '');
    this.editSubjectName.set('');
  }

  private toIdNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private resolveSelectedGlAccountId(): number | null {
    const itemName = (this.editItemGroup() || '').trim();
    const subjectName = (this.editSubjectName() || '').trim();
    if (!itemName || !subjectName) return null;

    const accounts = this.glAccounts();
    if (accounts.length === 0) return null;

    const parent = accounts.find(acc => acc.account_name === itemName && (acc.parent_account_id === null || acc.parent_account_id === undefined));
    if (!parent) return null;

    const parentId = this.toIdNumber((parent as any).gl_account_id);
    if (!parentId) return null;

    const child = accounts.find(acc => this.toIdNumber((acc as any).parent_account_id) === parentId && acc.account_name === subjectName);
    return this.toIdNumber((child as any)?.gl_account_id);
  }

  private prefillItemAndSubjectFromGlAccountId(glAccountId: number): void {
    const accounts = this.glAccounts();
    if (accounts.length === 0) return;

    const selected = accounts.find(acc => this.toIdNumber((acc as any).gl_account_id) === glAccountId);
    if (!selected) return;

    const parentIdRaw = (selected as any).parent_account_id;
    const parentId = this.toIdNumber(parentIdRaw);
    if (parentIdRaw === null || parentIdRaw === undefined || parentId === null) {
      // top-level picked (rare): set item only
      this.editItemGroup.set(selected.account_name || '');
      this.editSubjectName.set('');
      return;
    }

    const parent = accounts.find(acc => this.toIdNumber((acc as any).gl_account_id) === parentId);
    if (!parent) return;

    this.editItemGroup.set(parent.account_name || '');
    this.editSubjectName.set(selected.account_name || '');
  }

  private toNumber(value: string | number | null | undefined): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  formatDate(value?: string | null): string {
    const raw = String(value || '');
    return raw ? raw.slice(0, 10) : '';
  }

  formatCurrency(value: string | number | null | undefined): string {
    const n = this.toNumber(value);
    return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(n);
  }

  async loadRows(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.apiService.getAccountsPayables();
      if (res.success && res.data) {
        this.rows.set(res.data as any);
      } else {
        this.errorMessage.set(res.error || '無法取得應付帳款資料');
      }
    } catch (error: any) {
      console.error(error);
      this.errorMessage.set(error?.message || '取得應付帳款資料失敗');
    } finally {
      this.loading.set(false);
    }
  }

  async openDetail(row: AccountsPayableRow, readOnly = false): Promise<void> {
    this.selectedEntryId.set(Number(row.entry_id));
    this.isDetailOpen.set(true);
    this.showAddPayment.set(false);
    this.detailReadOnly.set(readOnly);

    this.master.set(null);
    this.masterError.set('');
    this.editCreditor.set(row.creditor || '');
    this.editDueDate.set(this.formatDate(row.due_date || row.entry_date));
    this.editItemGroup.set('');
    this.editSubjectName.set('');

    // default payment date = today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    this.newPaymentDate.set(`${yyyy}-${mm}-${dd}`);
    this.newPaymentAmount.set(null);
    this.newPaymentDescription.set('');

    await Promise.all([this.ensureGLAccountsLoaded(), this.loadMaster(), this.loadPayments()]);
  }

  closeDetail(): void {
    this.isDetailOpen.set(false);
    this.selectedEntryId.set(null);
    this.detailReadOnly.set(false);
    this.payments.set([]);
    this.paymentsError.set('');
    this.paymentsLoading.set(false);

    this.master.set(null);
    this.masterError.set('');
    this.masterLoading.set(false);
    this.savingMaster.set(false);
  }

  async loadMaster(): Promise<void> {
    const entryId = this.selectedEntryId();
    if (!entryId) return;

    this.masterLoading.set(true);
    this.masterError.set('');
    try {
      const res = await this.apiService.getAccountsPayableMaster(entryId);
      if (res.success && res.data) {
        this.master.set(res.data as any);
        this.editCreditor.set(String((res.data as any).creditor || ''));
        this.editDueDate.set(this.formatDate((res.data as any).due_date));

        // Prefill "項目/科目" from gl_account_id when available.
        const glAccountId = Number((res.data as any).gl_account_id);
        if (Number.isFinite(glAccountId) && glAccountId > 0) {
          this.prefillItemAndSubjectFromGlAccountId(glAccountId);
        }

        // If GL accounts weren't loaded yet when the above ran, try again after both are ready.
        this.syncItemAndSubjectFromMasterIfPossible();
      } else {
        this.masterError.set(res.error || '無法取得應付帳款主檔');
      }
    } catch (error: any) {
      console.error(error);
      this.masterError.set(error?.message || '取得應付帳款主檔失敗');
    } finally {
      this.masterLoading.set(false);
    }
  }

  async saveMaster(): Promise<void> {
    const entryId = this.selectedEntryId();
    if (!entryId) return;

    const creditor = (this.editCreditor() || '').trim();
    const dueDate = (this.editDueDate() || '').trim();

    if (!creditor) {
      alert('請填寫債權人');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      alert('還款期限格式需為 YYYY-MM-DD');
      return;
    }

    this.savingMaster.set(true);
    this.masterError.set('');
    try {
      const payload: any = { entryId, creditor, dueDate };
      const glAccountId = this.resolveSelectedGlAccountId();
      if (glAccountId) {
        payload.glAccountId = glAccountId;
      }

      const res = await this.apiService.updateAccountsPayableMaster(payload);

      if (!res.success) {
        alert(res.error || '儲存主檔失敗');
        return;
      }

      await Promise.all([this.loadMaster(), this.loadRows()]);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '儲存主檔失敗');
    } finally {
      this.savingMaster.set(false);
    }
  }

  async loadPayments(): Promise<void> {
    const entryId = this.selectedEntryId();
    if (!entryId) return;

    this.paymentsLoading.set(true);
    this.paymentsError.set('');
    try {
      const res = await this.apiService.getAccountsPayablePayments(entryId);
      if (res.success && res.data) {
        this.payments.set(res.data as any);
      } else {
        this.paymentsError.set(res.error || '無法取得還款明細');
      }
    } catch (error: any) {
      console.error(error);
      this.paymentsError.set(error?.message || '取得還款明細失敗');
    } finally {
      this.paymentsLoading.set(false);
    }
  }

  toggleAddPayment(): void {
    if (this.detailReadOnly()) return;
    this.showAddPayment.update(v => !v);
  }

  async savePayment(): Promise<void> {
    const entryId = this.selectedEntryId();
    if (!entryId) return;

    if (this.detailReadOnly()) return;

    const paymentDate = this.newPaymentDate();
    const amount = this.newPaymentAmount();

    if (!paymentDate || amount === null || amount === undefined) {
      alert('請填寫還款日期與還款金額');
      return;
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      alert('還款金額需為 >= 0 的數字');
      return;
    }

    const maxAmount = this.maxRepaymentAmount();
    if (typeof maxAmount === 'number' && Number(amount) > maxAmount) {
      alert(`還款金額不可大於剩餘欠款（最多 ${this.formatCurrency(maxAmount)}）`);
      return;
    }

    this.savingPayment.set(true);
    try {
      const res = await this.apiService.createAccountsPayablePayment({
        entryId,
        paymentDate,
        amount: Number(amount),
        description: this.newPaymentDescription() || ''
      });

      if (!res.success) {
        alert(res.error || '新增還款失敗');
        return;
      }

      this.showAddPayment.set(false);
      this.newPaymentAmount.set(null);
      this.newPaymentDescription.set('');

      await Promise.all([this.loadPayments(), this.loadRows()]);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '新增還款失敗');
    } finally {
      this.savingPayment.set(false);
    }
  }
}
