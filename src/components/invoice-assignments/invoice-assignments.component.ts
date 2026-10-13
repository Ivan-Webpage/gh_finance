import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, InvoiceAssignmentEntry } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface CigarMemberOption {
  id: string;
  name: string;
  displayName: string;
  category: 'cigar' | 'exCigar';
}

// 未標註發票指派：把 iChef 結帳時沒掛會員的發票，人工補登給雪茄會員／前雪茄會員，
// 讓「顧客管理」的累積消費統計反映真實消費。後端直接改寫 pos.invoices.raw_member_info
// （帶 manual_assigned 標記，可撤銷），見 /api/customers/invoice-assignments。
@Component({
  selector: 'app-invoice-assignments',
  templateUrl: './invoice-assignments.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class InvoiceAssignmentsComponent {
  private apiService = inject(ApiService);
  private authService = inject(AuthService);

  readonly pageSize = 20;

  isViewer = computed(() => this.authService.hasRole('viewer'));

  status = signal<'unassigned' | 'manual'>('unassigned');
  startDate = signal('');
  endDate = signal('');
  minAmount = signal<number | null>(null);
  maxAmount = signal<number | null>(null);
  product = signal('');

  invoices = signal<InvoiceAssignmentEntry[]>([]);
  total = signal(0);
  totalAmount = signal(0);
  page = signal(1);
  totalPages = signal(1);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  members = signal<CigarMemberOption[]>([]);
  selectedMemberUuid = signal('');
  selectedInvoiceUuids = signal<Set<string>>(new Set());

  cigarMembers = computed(() => this.members().filter(m => m.category === 'cigar'));
  exCigarMembers = computed(() => this.members().filter(m => m.category === 'exCigar'));

  selectedCount = computed(() => this.selectedInvoiceUuids().size);
  selectedAmount = computed(() => {
    const selected = this.selectedInvoiceUuids();
    return this.invoices()
      .filter(inv => selected.has(inv.invoiceUuid))
      .reduce((sum, inv) => sum + inv.totalAmount, 0);
  });
  allOnPageSelected = computed(() => {
    const list = this.invoices();
    const selected = this.selectedInvoiceUuids();
    return list.length > 0 && list.every(inv => selected.has(inv.invoiceUuid));
  });

  constructor() {
    this.loadMembers();
    this.loadInvoices();
  }

  async loadMembers(): Promise<void> {
    try {
      const response = await this.apiService.getCustomers({ search: '雪茄', limit: 500 });
      if (!response?.success || !Array.isArray(response.data)) return;
      const options: CigarMemberOption[] = response.data
        .filter((c: { name?: string }) => (c.name || '').includes('雪茄'))
        .map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
          displayName: c.name.replace(/ex雪茄會員\s*/gi, '').replace(/雪茄會員\s*/g, '').replace(/雪茄\s*/g, '').replace(/^[\s\-－_]+/, '').trim() || c.name,
          category: /ex雪茄會員/i.test(c.name) ? 'exCigar' : 'cigar',
        }));
      options.sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hant'));
      this.members.set(options);
    } catch (error) {
      console.error('Failed to load cigar members:', error);
      this.errorMessage.set('載入雪茄會員清單失敗');
    }
  }

  async loadInvoices(page = 1): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.apiService.getInvoiceAssignments({
        status: this.status(),
        startDate: this.startDate() || undefined,
        endDate: this.endDate() || undefined,
        minAmount: this.minAmount(),
        maxAmount: this.maxAmount(),
        product: this.product().trim() || undefined,
        page,
        pageSize: this.pageSize,
      });
      if (response.success && response.data) {
        this.invoices.set(response.data.invoices);
        this.total.set(response.data.total);
        this.totalAmount.set(response.data.totalAmount);
        this.page.set(response.data.page);
        this.totalPages.set(response.data.totalPages);
      } else {
        this.invoices.set([]);
        this.errorMessage.set(response.error || '載入發票失敗');
      }
    } catch (error: any) {
      console.error('Failed to load invoice assignments:', error);
      this.invoices.set([]);
      this.errorMessage.set(error?.error?.error || '載入發票失敗，請稍後再試');
    } finally {
      this.selectedInvoiceUuids.set(new Set());
      this.isLoading.set(false);
    }
  }

  switchStatus(status: 'unassigned' | 'manual'): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.successMessage.set(null);
    this.loadInvoices(1);
  }

  applyFilters(): void {
    this.loadInvoices(1);
  }

  clearFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    this.minAmount.set(null);
    this.maxAmount.set(null);
    this.product.set('');
    this.loadInvoices(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.loadInvoices(page);
  }

  isSelected(invoice: InvoiceAssignmentEntry): boolean {
    return this.selectedInvoiceUuids().has(invoice.invoiceUuid);
  }

  toggleSelect(invoice: InvoiceAssignmentEntry): void {
    const next = new Set(this.selectedInvoiceUuids());
    if (next.has(invoice.invoiceUuid)) {
      next.delete(invoice.invoiceUuid);
    } else {
      next.add(invoice.invoiceUuid);
    }
    this.selectedInvoiceUuids.set(next);
  }

  toggleSelectAll(): void {
    if (this.allOnPageSelected()) {
      this.selectedInvoiceUuids.set(new Set());
    } else {
      this.selectedInvoiceUuids.set(new Set(this.invoices().map(inv => inv.invoiceUuid)));
    }
  }

  // 同桌分帳的發票共用同一個 cg_uuid，一次把本頁同桌的發票都勾起來
  selectSameGroup(invoice: InvoiceAssignmentEntry): void {
    if (!invoice.cgUuid) return;
    const next = new Set(this.selectedInvoiceUuids());
    for (const inv of this.invoices()) {
      if (inv.cgUuid === invoice.cgUuid) next.add(inv.invoiceUuid);
    }
    this.selectedInvoiceUuids.set(next);
  }

  async assignSelected(): Promise<void> {
    const memberUuid = this.selectedMemberUuid();
    const invoiceUuids = Array.from(this.selectedInvoiceUuids());
    const member = this.members().find(m => m.id === memberUuid);
    if (!member) {
      this.errorMessage.set('請先選擇要指派的會員');
      return;
    }
    if (invoiceUuids.length === 0) {
      this.errorMessage.set('請先勾選發票');
      return;
    }
    if (!confirm(`確定要把 ${invoiceUuids.length} 張發票（合計 $${this.formatAmount(this.selectedAmount())}）指派給「${member.name}」嗎？`)) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const response = await this.apiService.assignInvoicesToMember(invoiceUuids, memberUuid);
      if (response.success && response.data) {
        const updated = new Set(response.data.updatedInvoiceUuids);
        const removedAmount = this.invoices()
          .filter(inv => updated.has(inv.invoiceUuid))
          .reduce((sum, inv) => sum + inv.totalAmount, 0);
        this.invoices.update(list => list.filter(inv => !updated.has(inv.invoiceUuid)));
        this.total.update(n => n - updated.size);
        this.totalAmount.update(n => n - removedAmount);
        this.selectedInvoiceUuids.set(new Set());
        const skipped = response.data.skippedCount;
        this.successMessage.set(
          `已指派 ${updated.size} 張發票給「${response.data.memberName}」` +
          (skipped > 0 ? `，${skipped} 張因為已經有會員而略過` : '')
        );
        if (this.invoices().length === 0 && this.total() > 0) {
          this.loadInvoices(Math.min(this.page(), Math.max(1, Math.ceil(this.total() / this.pageSize))));
        }
      } else {
        this.errorMessage.set(response.error || '指派失敗');
      }
    } catch (error: any) {
      console.error('Failed to assign invoices:', error);
      this.errorMessage.set(error?.error?.error || '指派失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  async revertSelected(): Promise<void> {
    const invoiceUuids = Array.from(this.selectedInvoiceUuids());
    if (invoiceUuids.length === 0) {
      this.errorMessage.set('請先勾選要撤銷的發票');
      return;
    }
    if (!confirm(`確定要撤銷 ${invoiceUuids.length} 張發票的人工指派嗎？撤銷後會回到「未指派」。`)) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const response = await this.apiService.revertInvoiceAssignments(invoiceUuids);
      if (response.success && response.data) {
        const reverted = new Set(response.data.revertedInvoiceUuids);
        const removedAmount = this.invoices()
          .filter(inv => reverted.has(inv.invoiceUuid))
          .reduce((sum, inv) => sum + inv.totalAmount, 0);
        this.invoices.update(list => list.filter(inv => !reverted.has(inv.invoiceUuid)));
        this.total.update(n => n - reverted.size);
        this.totalAmount.update(n => n - removedAmount);
        this.selectedInvoiceUuids.set(new Set());
        this.successMessage.set(`已撤銷 ${reverted.size} 張發票的人工指派`);
        if (this.invoices().length === 0 && this.total() > 0) {
          this.loadInvoices(Math.min(this.page(), Math.max(1, Math.ceil(this.total() / this.pageSize))));
        }
      } else {
        this.errorMessage.set(response.error || '撤銷失敗');
      }
    } catch (error: any) {
      console.error('Failed to revert invoice assignments:', error);
      this.errorMessage.set(error?.error?.error || '撤銷失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  // localTime 已經是台北當地時間（不帶時區），直接拆字串，不做時區換算
  formatDateTime(localTime: string): string {
    const [datePart, timePart = ''] = localTime.split('T');
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${datePart}T00:00:00`).getDay()];
    return `${datePart} (${weekday}) ${timePart.slice(0, 5)}`;
  }

  formatAmount(value: number): string {
    return Math.round(value).toLocaleString('zh-TW');
  }

  itemsSummary(invoice: InvoiceAssignmentEntry): string {
    return invoice.items.map(item => item.itemName).join('、');
  }
}
