import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, InvoiceAssignmentEntry, InvoiceAssignmentStatus } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

type MemberCategory = 'cigar' | 'exCigar' | 'shareholder' | 'regular';

interface MemberOption {
  id: string;
  name: string;
  displayName: string;
  memberNo: number | null;
  category: MemberCategory;
}

// 未標註發票指派：把 iChef 結帳時沒掛會員的發票，人工補登給會員（含股東），
// 讓「顧客管理」的累積消費統計反映真實消費。後端直接改寫 pos.invoices.raw_member_info
// （帶 manual_assigned 標記，可撤銷），見 /api/customers/invoice-assignments。
// 也能更正 iChef 綁錯會員的發票（「iChef 綁錯更正」頁籤），後端會保存原本的會員資料，撤銷時還原。
// 有股東回饋且該月尚未核銷的發票後端一律擋下；已核銷的只改消費歸屬，不影響股東回饋金。
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

  status = signal<InvoiceAssignmentStatus>('unassigned');
  currentMemberUuid = signal('');
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

  members = signal<MemberOption[]>([]);
  selectedMemberUuid = signal('');
  selectedInvoiceUuids = signal<Set<string>>(new Set());

  readonly memberGroups: { category: MemberCategory; label: string }[] = [
    { category: 'cigar', label: '雪茄會員' },
    { category: 'exCigar', label: '前雪茄會員' },
    { category: 'shareholder', label: '股東' },
    { category: 'regular', label: '一般顧客' },
  ];

  membersByCategory = computed(() => {
    const groups = new Map<MemberCategory, MemberOption[]>();
    for (const member of this.members()) {
      const list = groups.get(member.category) ?? [];
      list.push(member);
      groups.set(member.category, list);
    }
    return groups;
  });

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
    const selectable = list.filter(inv => !inv.rebateLocked);
    return selectable.length > 0 && selectable.every(inv => selected.has(inv.invoiceUuid));
  });

  constructor() {
    this.loadMembers();
    this.loadInvoices();
  }

  async loadMembers(): Promise<void> {
    try {
      const response = await this.apiService.getCustomers({ limit: 1000 });
      if (!response?.success || !Array.isArray(response.data)) return;
      const options: MemberOption[] = response.data.map(
        (c: { id: string; name: string; memberNo?: number | null }) => {
          const name = c.name || '';
          // 分類規則與顧客管理（customer-analysis）一致
          const category: MemberCategory = /ex雪茄會員/i.test(name)
            ? 'exCigar'
            : name.includes('雪茄')
              ? 'cigar'
              : name.includes('股東')
                ? 'shareholder'
                : 'regular';
          const displayName = name
            .replace(/ex雪茄會員\s*/gi, '')
            .replace(/雪茄會員\s*/g, '')
            .replace(/雪茄\s*/g, '')
            .replace(/股東\s*/g, '')
            .replace(/^[\s\-－_]+/, '')
            .trim() || name;
          return { id: c.id, name, displayName, memberNo: c.memberNo ?? null, category };
        }
      );
      // 有編號的依編號排，其餘依名稱排
      options.sort((a, b) => {
        if (a.memberNo != null && b.memberNo != null) return a.memberNo - b.memberNo;
        if (a.memberNo != null) return -1;
        if (b.memberNo != null) return 1;
        return a.displayName.localeCompare(b.displayName, 'zh-Hant');
      });
      this.members.set(options);
    } catch (error) {
      console.error('Failed to load members:', error);
      this.errorMessage.set('載入會員清單失敗');
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
        currentMember: this.status() !== 'unassigned' ? this.currentMemberUuid() || undefined : undefined,
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

  switchStatus(status: InvoiceAssignmentStatus): void {
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
    this.currentMemberUuid.set('');
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
    if (invoice.rebateLocked) return;
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
      this.selectedInvoiceUuids.set(
        new Set(this.invoices().filter(inv => !inv.rebateLocked).map(inv => inv.invoiceUuid))
      );
    }
  }

  // 同桌分帳的發票共用同一個 cg_uuid，一次把本頁同桌的發票都勾起來
  selectSameGroup(invoice: InvoiceAssignmentEntry): void {
    if (!invoice.cgUuid) return;
    const next = new Set(this.selectedInvoiceUuids());
    for (const inv of this.invoices()) {
      if (inv.cgUuid === invoice.cgUuid && !inv.rebateLocked) next.add(inv.invoiceUuid);
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
    const selected = this.invoices().filter(inv => this.selectedInvoiceUuids().has(inv.invoiceUuid));
    const fromNames = Array.from(new Set(selected.map(inv => inv.assignedMemberName).filter(Boolean)));
    const correctionNote = this.status() === 'tagged' && fromNames.length > 0
      ? `\n原本綁定：${fromNames.join('、')}（只改消費歸屬，股東回饋金不變）`
      : '';
    if (!confirm(`確定要把 ${invoiceUuids.length} 張發票（合計 $${this.formatAmount(this.selectedAmount())}）指派給「${member.name}」嗎？${correctionNote}`)) {
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
          (skipped > 0 ? `，${skipped} 張略過（已經是這位會員，或股東回饋該月尚未核銷）` : '')
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
    if (!confirm(`確定要撤銷 ${invoiceUuids.length} 張發票的人工指派嗎？原本沒掛會員的會回到「未指派」，iChef 綁定過的會還原成原本的會員。`)) {
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
