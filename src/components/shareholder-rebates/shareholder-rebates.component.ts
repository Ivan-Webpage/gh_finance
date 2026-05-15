import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  CUSTOM_ELEMENTS_SCHEMA,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

// ========== 型別定義 ==========
interface MonthlySummaryRow {
  due_month: string;
  employee_id: number;
  employee_name: string;
  phone: string;
  transaction_count: number;
  total_rebate: number;
  verified_amount: number;
  released_amount: number;
  is_verified?: boolean;
  is_released?: boolean;
  entry_id?: number;
}

interface MonthlyDetailRow {
  record_id: number;
  checkout_at: string;
  invoice_no: string;
  invoice_amount: number;
  discount_amount: number;
  discount_note: string;
  rebate_rate: number;
  rebate_amount: number;
  remark?: string;
}

interface MonthlyStatsData {
  transaction_count: number;
  total_rebate: number;
  verified_count: number;
  released_count: number;
}

interface PayableEmployee {
  employee_id: number;
  employee_name: string;
  phone: string;
  total_payable: number;
  pending_amount: number;
  paid_amount: number;
  latest_month: string;
}

interface PayablesDetailRow {
  payable_id: number;
  due_month: string;
  rebate_amount: number;
  actual_paid: number;
  pending_balance: number;
  status: string;
}

interface GLAccountLite {
  gl_account_id: number;
  parent_account_id: number | null;
  account_name: string;
}

@Component({
  selector: 'app-shareholder-rebates',
  templateUrl: './shareholder-rebates.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShareholderRebatesComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  isViewer = computed(() => this.authService.hasRole('viewer'));

  // 頁籤切換
  activeTab = signal<'monthly' | 'payables'>('monthly');

  // ========== 時間篩選器 ==========
  currentDate = new Date();
  previousMonth = this.getPreviousMonth();
  selectedYear = signal<number>(this.previousMonth.year);
  selectedMonth = signal<number>(this.previousMonth.month);

  // ========== 每月回饋金狀態 ==========
  monthlySummaries = signal<MonthlySummaryRow[]>([]);
  monthlyLoading = signal<boolean>(false);
  monthlyError = signal<string>('');

  monthlyStats = signal<MonthlyStatsData>({
    transaction_count: 0,
    total_rebate: 0,
    verified_count: 0,
    released_count: 0,
  });

  monthlyDetailModalVisible = signal<boolean>(false);
  currentMonthlySummary = signal<MonthlySummaryRow | null>(null);
  monthlyDetails = signal<MonthlyDetailRow[]>([]);
  monthlyDetailLoading = signal<boolean>(false);
  addDetailVisible = signal<boolean>(false);
  detailSavingIds = signal<number[]>([]);
  detailDeletingIds = signal<number[]>([]);
  detailSaveError = signal<string>('');
  addDetailError = signal<string>('');
  addDetailSaving = signal<boolean>(false);
  newDetailCheckoutAt = '';
  newDetailInvoiceNo = '';
  newDetailDiscountAmount = '';
  newDetailInvoiceAmount = '';
  newDetailRebateRate = '';
  newDetailDiscountNote = '';
  monthlyDetailsTotal = computed(() => {
    return this.monthlyDetails().reduce((sum, detail) => sum + Number(detail.rebate_amount || 0), 0);
  });

  // ========== 發放 Modal 狀態 ==========
  releaseModalVisible = signal<boolean>(false);
  releasingMonthlySummary = signal<MonthlySummaryRow | null>(null);
  releaseAmount = '';
  releasing = signal<boolean>(false);
  releaseError = signal<string>('');

  // ========== 勞報單下載狀態 ==========
  downloadingReports = signal<Set<string>>(new Set());

  // ========== 流水帳編輯 Modal ==========
  ledgerEditModalVisible = signal<boolean>(false);
  editingLedgerEntryId = signal<number | null>(null);
  ledgerEditLoading = signal<boolean>(false);
  ledgerEditSaving = signal<boolean>(false);
  ledgerEditError = signal<string>('');
  ledgerGlAccounts = signal<GLAccountLite[]>([]);
  ledgerFormItemGroup = signal<string>('');
  ledgerEditForm = this.fb.group({
    entry_date: ['', Validators.required],
    item_group: ['', Validators.required],
    subject_name: ['', Validators.required],
    amount: ['', Validators.required],
    invoice_no: [''],
    description: [''],
  });
  ledgerTopLevelAccounts = computed(() => {
    return this.ledgerGlAccounts()
      .filter(account => account.parent_account_id === null)
      .sort((a, b) => a.gl_account_id - b.gl_account_id);
  });
  ledgerSubAccounts = computed(() => {
    const selectedItem = this.ledgerFormItemGroup();
    if (!selectedItem) {
      return [] as GLAccountLite[];
    }

    const parent = this.ledgerGlAccounts().find(
      account => account.parent_account_id === null && account.account_name === selectedItem
    );

    if (!parent) {
      return [] as GLAccountLite[];
    }

    return this.ledgerGlAccounts()
      .filter(account => account.parent_account_id === parent.gl_account_id)
      .sort((a, b) => a.gl_account_id - b.gl_account_id);
  });

  // ========== 應付回饋金狀態 ==========
  payablesSummary = signal<{ total_payable: number; employees: PayableEmployee[] }>({
    total_payable: 0,
    employees: [],
  });
  pendingPayablesTotal = computed(() => {
    return this.payablesSummary().employees.reduce((sum, employee) => sum + Number(employee.pending_amount || 0), 0);
  });
  payablesLoading = signal<boolean>(false);
  payablesError = signal<string>('');

  payablesDetailModalVisible = signal<boolean>(false);
  currentPayableEmployee = signal<PayableEmployee | null>(null);
  payablesDetails = signal<PayablesDetailRow[]>([]);
  payablesDetailLoading = signal<boolean>(false);
  payablesPayModalVisible = signal<boolean>(false);
  payingPayableEmployee = signal<PayableEmployee | null>(null);
  payablesPayAmount = '';
  payablesPayRemark = '';
  payingPayables = signal<boolean>(false);
  payablesPayError = signal<string>('');
  payablesDetailsRebateAmount = computed(() => {
    return this.payablesDetails().reduce((sum, detail) => sum + Number(detail.rebate_amount || 0), 0);
  });
  payablesDetailsActualPaid = computed(() => {
    return this.payablesDetails().reduce((sum, detail) => sum + Number(detail.actual_paid || 0), 0);
  });
  payablesDetailsPendingBalance = computed(() => {
    return this.payablesDetails().reduce((sum, detail) => sum + Number(detail.pending_balance || 0), 0);
  });

  // ========== 支付成功提醒 Modal 狀態 ==========
  paymentSuccessModalVisible = signal<boolean>(false);
  paymentSuccessData = signal<{
    employee_name: string;
    employee_id: number;
    pay_amount: number;
    remaining_amount: number;
    latest_month: string;
  } | null>(null);
  downloadingPaymentReport = signal<boolean>(false);
  downloadingPayablesLaborReport = signal<boolean>(false);

  constructor() {
    // 監聽 activeTab 變化，自動載入相應的資料
    effect(() => {
      const tab = this.activeTab();
      if (tab === 'monthly') {
        this.loadMonthlySummary();
      } else if (tab === 'payables') {
        this.loadPayablesSummary();
      }
    });

    this.ledgerEditForm.get('item_group')?.valueChanges.subscribe(value => {
      this.ledgerFormItemGroup.set(value || '');
      const currentSubject = this.ledgerEditForm.get('subject_name')?.value || '';
      if (currentSubject && !this.ledgerSubAccounts().some(account => account.account_name === currentSubject)) {
        this.ledgerEditForm.patchValue({ subject_name: '' }, { emitEvent: false });
      }
    });
  }

  // ========== 每月回饋金方法 ==========

  async loadMonthlySummary(): Promise<void> {
    this.monthlyLoading.set(true);
    this.monthlyError.set('');

    try {
      const response = await this.apiService.getShareholderMonthlySummary({
        year: this.selectedYear(),
        month: this.selectedMonth(),
      });

      if (response.success && response.data) {
        this.monthlySummaries.set(response.data);
      } else {
        this.monthlyError.set(response.error || '載入資料失敗');
      }

      const statsResponse = await this.apiService.getShareholderMonthlyStats({
        year: this.selectedYear(),
        month: this.selectedMonth(),
      });

      if (statsResponse.success && statsResponse.data) {
        this.monthlyStats.set(statsResponse.data);
      }
    } catch (error: any) {
      this.monthlyError.set(error?.message || '載入失敗');
      console.error('Error loading monthly summary:', error);
    } finally {
      this.monthlyLoading.set(false);
    }
  }

  async openMonthlyDetail(summary: MonthlySummaryRow): Promise<void> {
    this.currentMonthlySummary.set(summary);
    this.monthlyDetailModalVisible.set(true);
    this.monthlyDetailLoading.set(true);
    this.addDetailVisible.set(false);

    try {
      const response = await this.apiService.getShareholderMonthlyDetail(summary.employee_id, {
        year: this.selectedYear(),
        month: this.selectedMonth(),
      });

      if (response.success && response.data) {
        const sortedDetails = [...response.data].sort((a, b) => {
          const timeA = new Date(a.checkout_at).getTime();
          const timeB = new Date(b.checkout_at).getTime();
          return timeA - timeB;
        });
        this.monthlyDetails.set(sortedDetails);
      }
    } catch (error: any) {
      console.error('Error loading monthly details:', error);
    } finally {
      this.monthlyDetailLoading.set(false);
    }
  }

  closeMonthlyDetail(): void {
    this.monthlyDetailModalVisible.set(false);
    this.currentMonthlySummary.set(null);
    this.monthlyDetails.set([]);
    this.addDetailVisible.set(false);
  }

  openAddDetail(): void {
    this.newDetailCheckoutAt = this.formatDateTimeLocal(new Date());
    this.newDetailInvoiceNo = '';
    this.newDetailDiscountAmount = '';
    this.newDetailInvoiceAmount = '';
    this.newDetailRebateRate = '';
    this.newDetailDiscountNote = '';
    this.addDetailError.set('');
    this.addDetailSaving.set(false);
    this.addDetailVisible.set(true);
  }

  closeAddDetail(): void {
    this.addDetailVisible.set(false);
  }

  async submitAddDetail(): Promise<void> {
    const checkoutAtRaw = this.newDetailCheckoutAt;
    const invoiceNo = this.newDetailInvoiceNo.trim();
    const discountAmount = Number(String(this.newDetailDiscountAmount).replace(/,/g, ''));
    const invoiceAmount = Number(String(this.newDetailInvoiceAmount).replace(/,/g, ''));
    const rebateRate = Number(this.newDetailRebateRate);

    if (!checkoutAtRaw) {
      this.addDetailError.set('請填寫結帳時間');
      return;
    }

    if (Number.isNaN(invoiceAmount)) {
      this.addDetailError.set('請填寫有效的發票金額');
      return;
    }

    this.addDetailError.set('');
    this.addDetailSaving.set(true);

    const checkoutAt = new Date(checkoutAtRaw).toISOString();
    const normalizedDiscount = Number.isNaN(discountAmount) ? 0 : discountAmount;
    const normalizedRate = Number.isNaN(rebateRate) ? 0 : rebateRate;

    const payload = {
      employee_id: this.currentMonthlySummary()?.employee_id || 0,
      checkout_at: checkoutAt,
      invoice_no: invoiceNo || null,
      invoice_amount: invoiceAmount,
      taxable_amount: invoiceAmount,
      discount_amount: normalizedDiscount,
      discount_note: this.newDetailDiscountNote.trim() || '無',
      rebate_rate: normalizedRate,
      rebate_amount: this.roundTo2(invoiceAmount * (normalizedRate / 100)),
    };

    try {
      if (!payload.employee_id) {
        this.addDetailError.set('找不到員工資料，無法新增');
        return;
      }

      const response = await this.apiService.createShareholderRebateRecord(payload);
      if (response.success && response.data) {
        const summary = this.currentMonthlySummary();
        if (summary) {
          await this.openMonthlyDetail(summary);
        }
        this.addDetailVisible.set(false);
      } else {
        this.addDetailError.set(response.error || '新增失敗');
      }
    } catch (error: any) {
      this.addDetailError.set(error?.message || '新增失敗');
      console.error('Error creating rebate detail:', error);
    } finally {
      this.addDetailSaving.set(false);
    }
  }

  updateDetailRebateRate(detail: MonthlyDetailRow, value: string | number): void {
    const rate = Number(value);
    const invoiceAmount = Number(detail.invoice_amount || 0);
    const normalizedRate = Number.isNaN(rate) ? 0 : rate;

    detail.rebate_rate = normalizedRate;
    detail.rebate_amount = this.roundTo2(invoiceAmount * (normalizedRate / 100));
    this.monthlyDetails.set([...this.monthlyDetails()]);
  }

  updateDetailInvoiceAmount(detail: MonthlyDetailRow, value: string | number): void {
    const amount = Number(value);
    const normalizedAmount = Number.isNaN(amount) ? 0 : amount;
    const rebateRate = Number(detail.rebate_rate || 0);

    detail.invoice_amount = normalizedAmount;
    detail.rebate_amount = this.roundTo2(normalizedAmount * (rebateRate / 100));
    this.monthlyDetails.set([...this.monthlyDetails()]);
  }

  updateDetailRemark(detail: MonthlyDetailRow, value: string): void {
    detail.remark = value;
    this.monthlyDetails.set([...this.monthlyDetails()]);
  }

  isDetailSaving(recordId: number): boolean {
    return this.detailSavingIds().includes(recordId);
  }

  isDetailDeleting(recordId: number): boolean {
    return this.detailDeletingIds().includes(recordId);
  }

  async saveDetailRebate(detail: MonthlyDetailRow): Promise<void> {
    if (!detail.record_id || detail.record_id < 0) {
      return;
    }

    const rebateRate = Number(detail.rebate_rate || 0);
    const rebateAmount = Number(detail.rebate_amount || 0);
    const invoiceAmount = Number(detail.invoice_amount || 0);

    if (Number.isNaN(rebateRate) || rebateRate < 0 || rebateRate > 100) {
      this.detailSaveError.set('回饋% 必須介於 0 到 100');
      return;
    }

    if (Number.isNaN(invoiceAmount) || invoiceAmount < 0) {
      this.detailSaveError.set('發票金額必須為正數');
      return;
    }

    this.detailSaveError.set('');
    this.detailSavingIds.set([...this.detailSavingIds(), detail.record_id]);

    try {
      const response = await this.apiService.updateShareholderRebateRecord(detail.record_id, {
        rebate_rate: rebateRate,
        rebate_amount: rebateAmount,
        invoice_amount: invoiceAmount,
        remark: detail.remark || null,
      });

      if (response.success && response.data) {
        const updated = response.data;
        const next = this.monthlyDetails().map((row) =>
          row.record_id === detail.record_id
            ? {
                ...row,
                rebate_rate: Number(updated.rebate_rate ?? row.rebate_rate),
                rebate_amount: Number(updated.rebate_amount ?? row.rebate_amount),
                invoice_amount: Number(updated.invoice_amount ?? row.invoice_amount),
                remark: updated.remark ?? row.remark,
              }
            : row
        );
        this.monthlyDetails.set(next);
      } else {
        this.detailSaveError.set(response.error || '儲存失敗');
      }
    } catch (error: any) {
      this.detailSaveError.set(error?.message || '儲存失敗');
      console.error('Error saving rebate detail:', error);
    } finally {
      this.detailSavingIds.set(this.detailSavingIds().filter((id) => id !== detail.record_id));
    }
  }

  async deleteDetail(detail: MonthlyDetailRow): Promise<void> {
    if (!detail.record_id) {
      return;
    }

    const confirmed = window.confirm('確定要刪除這筆回饋金細項嗎？');
    if (!confirmed) {
      return;
    }

    if (detail.record_id < 0) {
      this.monthlyDetails.set(this.monthlyDetails().filter((row) => row.record_id !== detail.record_id));
      return;
    }

    this.detailSaveError.set('');
    this.detailDeletingIds.set([...this.detailDeletingIds(), detail.record_id]);

    try {
      const response = await this.apiService.deleteShareholderRebateRecord(detail.record_id);

      if (response.success) {
        const summary = this.currentMonthlySummary();
        if (summary) {
          await this.openMonthlyDetail(summary);
        } else {
          this.monthlyDetails.set(this.monthlyDetails().filter((row) => row.record_id !== detail.record_id));
        }
      } else {
        this.detailSaveError.set(response.error || '刪除失敗');
      }
    } catch (error: any) {
      this.detailSaveError.set(error?.message || '刪除失敗');
      console.error('Error deleting rebate detail:', error);
    } finally {
      this.detailDeletingIds.set(this.detailDeletingIds().filter((id) => id !== detail.record_id));
    }
  }

  onMonthChange(): void {
    if (this.activeTab() === 'monthly') {
      this.loadMonthlySummary();
    }
  }

  // ========== 應付回饋金方法 ==========

  async loadPayablesSummary(): Promise<void> {
    this.payablesLoading.set(true);
    this.payablesError.set('');

    try {
      const response = await this.apiService.getShareholderPayablesSummary();

      if (response.success && response.data) {
        this.payablesSummary.set({
          total_payable: response.data.total_payable || 0,
          employees: response.data.employees || [],
        });
      } else {
        this.payablesError.set(response.error || '載入資料失敗');
      }
    } catch (error: any) {
      this.payablesError.set(error?.message || '載入失敗');
      console.error('Error loading payables summary:', error);
    } finally {
      this.payablesLoading.set(false);
    }
  }

  async openPayablesDetail(employee: PayableEmployee): Promise<void> {
    this.currentPayableEmployee.set(employee);
    this.payablesDetailModalVisible.set(true);
    this.payablesDetailLoading.set(true);

    try {
      const response = await this.apiService.getShareholderPayablesDetail(employee.employee_id);

      if (response.success && response.data) {
        this.payablesDetails.set(response.data);
      }
    } catch (error: any) {
      console.error('Error loading payables details:', error);
    } finally {
      this.payablesDetailLoading.set(false);
    }
  }

  closePayablesDetail(): void {
    this.payablesDetailModalVisible.set(false);
    this.currentPayableEmployee.set(null);
    this.payablesDetails.set([]);
  }

  openPayablesPayModal(employee: PayableEmployee): void {
    this.payingPayableEmployee.set(employee);
    this.payablesPayAmount = '0';
    this.payablesPayRemark = '';
    this.payablesPayError.set('');
    this.payingPayables.set(false);
    this.payablesPayModalVisible.set(true);
  }

  closePayablesPayModal(): void {
    this.payablesPayModalVisible.set(false);
    this.payingPayableEmployee.set(null);
    this.payablesPayAmount = '';
    this.payablesPayRemark = '';
    this.payablesPayError.set('');
  }

  async submitPayablesPayment(): Promise<void> {
    const employee = this.payingPayableEmployee();
    if (!employee) {
      return;
    }

    const maxPendingAmount = Number(employee.pending_amount || 0);
    if (maxPendingAmount <= 0) {
      this.payablesPayError.set('此股東目前無待支付回饋金');
      return;
    }

    const payAmount = Number(String(this.payablesPayAmount).replace(/,/g, ''));
    if (Number.isNaN(payAmount) || payAmount < 0) {
      this.payablesPayError.set('請輸入有效的支付金額');
      return;
    }

    if (payAmount > maxPendingAmount) {
      this.payablesPayError.set('支付金額不可大於待支付回饋金總額');
      return;
    }

    if (payAmount <= 0) {
      this.payablesPayError.set('支付金額需大於 0');
      return;
    }

    this.payablesPayError.set('');
    this.payingPayables.set(true);
    const payRemark = this.payablesPayRemark.trim();

    try {
      const response = await this.apiService.payShareholderRebatePayables({
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        pay_amount: payAmount,
        remark: payRemark || undefined,
      });

      if (response.success) {
        this.closePayablesPayModal();
        await this.loadPayablesSummary();

        // 計算剩餘待支付金額
        const remainingAmount = maxPendingAmount - payAmount;
        
        // 打開支付成功提醒模態框
        this.paymentSuccessData.set({
          employee_name: employee.employee_name,
          employee_id: employee.employee_id,
          pay_amount: payAmount,
          remaining_amount: remainingAmount,
          latest_month: employee.latest_month || '',
        });
        this.paymentSuccessModalVisible.set(true);

        const currentDetailEmployee = this.currentPayableEmployee();
        if (currentDetailEmployee && currentDetailEmployee.employee_id === employee.employee_id) {
          await this.openPayablesDetail(currentDetailEmployee);
        }
      } else {
        this.payablesPayError.set(response.error || '支付失敗');
      }
    } catch (error: any) {
      this.payablesPayError.set(error?.message || '支付失敗');
      console.error('Error paying shareholder rebate payables:', error);
    } finally {
      this.payingPayables.set(false);
    }
  }

  closePaymentSuccessModal(): void {
    this.paymentSuccessModalVisible.set(false);
    this.paymentSuccessData.set(null);
  }

  async downloadPayablesLaborReport(): Promise<void> {
    const employee = this.payingPayableEmployee();
    if (!employee) {
      return;
    }

    if (this.downloadingPayablesLaborReport()) {
      return;
    }

    const payAmount = Number(String(this.payablesPayAmount).replace(/,/g, ''));
    if (Number.isNaN(payAmount) || payAmount <= 0) {
      alert('請輸入有效的支付金額');
      return;
    }

    this.downloadingPayablesLaborReport.set(true);

    try {
      // 使用員工的最新月份來下載勞報單
      const yearMonth = employee.latest_month || `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, '0')}`;
      const response = await this.apiService.downloadLaborReportByEmployeeIdWithAmount(employee.employee_id, yearMonth, payAmount);
      const blob = response.body || new Blob();

      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      let fileName = 'labor-report.zip';

      if (filenameStarMatch?.[1]) {
        try {
          fileName = decodeURIComponent(filenameStarMatch[1]);
        } catch {
          fileName = filenameStarMatch[1];
        }
      } else if (filenameMatch?.[1]) {
        fileName = filenameMatch[1];
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error: any) {
      alert('下載勞報單失敗: ' + (error?.message || '未知錯誤'));
      console.error('Error downloading labor report:', error);
    } finally {
      this.downloadingPayablesLaborReport.set(false);
    }
  }

  async downloadPaymentLaborReport(): Promise<void> {
    const data = this.paymentSuccessData();
    if (!data) {
      return;
    }

    if (this.downloadingPaymentReport()) {
      return;
    }

    this.downloadingPaymentReport.set(true);

    try {
      // 使用員工的最新月份來下載勞報單，金額使用支付的金額
      const yearMonth = data.latest_month || `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, '0')}`;
      const response = await this.apiService.downloadLaborReportByEmployeeIdWithAmount(data.employee_id, yearMonth, data.pay_amount);
      const blob = response.body || new Blob();

      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      let fileName = 'labor-report.zip';

      if (filenameStarMatch?.[1]) {
        try {
          fileName = decodeURIComponent(filenameStarMatch[1]);
        } catch {
          fileName = filenameStarMatch[1];
        }
      } else if (filenameMatch?.[1]) {
        fileName = filenameMatch[1];
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error: any) {
      alert('下載勞報單失敗: ' + (error?.message || '未知錯誤'));
      console.error('Error downloading labor report:', error);
    } finally {
      this.downloadingPaymentReport.set(false);
    }
  }

  resetFilter(): void {
    this.selectedYear.set(new Date().getFullYear());
    this.selectedMonth.set(new Date().getMonth() + 1);
    this.onMonthChange();
  }

  // ========== 格式化方法 ==========

  formatCurrency(value: number | undefined): string {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatYearMonth(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
    });
  }

  private roundTo2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private formatDateTimeLocal(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  toNumber(value: string | number): number {
    return Number(value);
  }

  // ========== 時間工具方法 ==========
  private getPreviousMonth(): { year: number; month: number } {
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();

    if (month === 1) {
      month = 12;
      year--;
    } else {
      month--;
    }

    return { year, month };
  }

  // ========== 核對與發放方法 ==========
  async verifyMonthlyShareholder(summary: MonthlySummaryRow): Promise<void> {
    if (!confirm(`確定要核對 ${summary.employee_name} (${this.formatYearMonth(summary.due_month)}) 的回饋金嗎？`)) {
      return;
    }

    try {
      const response = await this.apiService.verifyShareholderRebate({
        employee_id: summary.employee_id,
        year: this.selectedYear(),
        month: this.selectedMonth(),
        employee_name: summary.employee_name,
        total_rebate: summary.total_rebate,
      });

      if (response.success) {
        alert('核對成功');
        // 重新載入數據
        await this.loadMonthlySummary();
      } else {
        alert('核對失敗: ' + (response.error || '未知錯誤'));
      }
    } catch (error: any) {
      console.error('Error verifying monthly rebate:', error);
      const backendError =
        (typeof error?.error === 'string' ? error.error : null) ||
        error?.error?.error ||
        error?.error?.message ||
        null;

      alert('核對失敗: ' + (backendError || error?.message || '未知錯誤'));
    }
  }

  async releaseMonthlyShareholder(summary: MonthlySummaryRow): Promise<void> {
    // 開啟發放確認 Modal
    this.openReleaseModal(summary);
  }

  // ========== 狀態判斷輔助方法 ==========
  isMonthlyVerified(summary: MonthlySummaryRow): boolean {
    // 基於 is_verified 字段判斷；若後端未提供，退回使用 verified_amount 判斷
    if (summary.is_verified === true) return true;
    if (summary.is_verified === false) return false;
    return Number(summary.verified_amount || 0) > 0;
  }

  isMonthlyReleased(summary: MonthlySummaryRow): boolean {
    // 僅依後端回傳的已發放狀態判斷，避免「部分發放」被誤判為已發放
    return summary.is_released === true;
  }

  getMonthlyReleaseStatus(summary: MonthlySummaryRow): 'unreleased' | 'partial' | 'released' {
    const totalRebate = Number(summary.total_rebate || 0);
    const releasedAmount = Number(summary.released_amount || 0);

    if (totalRebate <= 0) {
      return 'unreleased';
    }

    if (releasedAmount <= 0) {
      return 'unreleased';
    }

    if (releasedAmount >= totalRebate) {
      return 'released';
    }

    return 'partial';
  }

  getMonthlyReleaseStatusLabel(summary: MonthlySummaryRow): string {
    const status = this.getMonthlyReleaseStatus(summary);
    if (status === 'released') {
      return '已發放';
    }
    if (status === 'partial') {
      return '部分發放';
    }
    return '未發放';
  }

  getMonthlyRemainingReleasableAmount(summary: MonthlySummaryRow): number {
    const totalRebate = Number(summary.total_rebate || 0);
    const releasedAmount = Number(summary.released_amount || 0);
    if (Number.isNaN(totalRebate) || totalRebate <= 0) return 0;
    if (Number.isNaN(releasedAmount) || releasedAmount <= 0) return totalRebate;
    return Math.max(0, totalRebate - releasedAmount);
  }

  isMonthlyReleaseProcessed(summary: MonthlySummaryRow): boolean {
    return summary.entry_id !== undefined && summary.entry_id !== null;
  }

  // ========== 發放 Modal 方法 ==========
  openReleaseModal(summary: MonthlySummaryRow): void {
    this.releasingMonthlySummary.set(summary);
    this.releaseAmount = String(this.getMonthlyRemainingReleasableAmount(summary));
    this.releaseError.set('');
    this.releasing.set(false);
    this.releaseModalVisible.set(true);
  }

  closeReleaseModal(): void {
    this.releaseModalVisible.set(false);
    this.releasingMonthlySummary.set(null);
    this.releaseAmount = '';
    this.releaseError.set('');
  }

  async submitRelease(): Promise<void> {
    const summary = this.releasingMonthlySummary();
    if (!summary) return;

    const remaining = this.getMonthlyRemainingReleasableAmount(summary);
    if (remaining <= 0) {
      this.releaseError.set('此筆回饋金已無可發放餘額');
      return;
    }

    const amount = Number(String(this.releaseAmount).replace(/,/g, ''));
    if (Number.isNaN(amount) || amount < 0) {
      this.releaseError.set('請輸入有效的發放金額');
      return;
    }

    if (amount > remaining) {
      this.releaseError.set(`發放金額不可大於可發放餘額 (${this.formatCurrency(remaining)})`);
      return;
    }

    this.releaseError.set('');
    this.releasing.set(true);

    try {
      const response = await this.apiService.releaseShareholderRebate({
        employee_id: summary.employee_id,
        year: this.selectedYear(),
        month: this.selectedMonth(),
        employee_name: summary.employee_name,
        total_rebate: summary.total_rebate,
        release_amount: amount,
      });

      if (response.success) {
        this.closeReleaseModal();
        await this.loadMonthlySummary();
      } else {
        this.releaseError.set(response.error || '發放失敗');
      }
    } catch (error: any) {
      this.releaseError.set(error?.message || '發放失敗');
      console.error('Error releasing rebate:', error);
    } finally {
      this.releasing.set(false);
    }
  }

  // ========== 勞報單下載 ==========
  async downloadLaborReport(summary: MonthlySummaryRow, event: Event): Promise<void> {
    event.stopPropagation();
    
    const key = `${summary.employee_id}-${this.selectedYear()}-${this.selectedMonth()}`;
    
    if (this.downloadingReports().has(key)) {
      return;
    }

    const currentSet = new Set(this.downloadingReports());
    currentSet.add(key);
    this.downloadingReports.set(currentSet);

    try {
      const yearMonth = `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, '0')}`;
      const response = await this.apiService.downloadLaborReportByEmployeeId(summary.employee_id, yearMonth);
      const blob = response.body || new Blob();

      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
      let fileName = 'labor-report.zip';

      if (filenameStarMatch?.[1]) {
        try {
          fileName = decodeURIComponent(filenameStarMatch[1]);
        } catch {
          fileName = filenameStarMatch[1];
        }
      } else if (filenameMatch?.[1]) {
        fileName = filenameMatch[1];
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error: any) {
      alert('下載勞報單失敗: ' + (error?.message || '未知錯誤'));
      console.error('Error downloading labor report:', error);
    } finally {
      const currentSet = new Set(this.downloadingReports());
      currentSet.delete(key);
      this.downloadingReports.set(currentSet);
    }
  }

  isDownloadingReport(summary: MonthlySummaryRow): boolean {
    const key = `${summary.employee_id}-${this.selectedYear()}-${this.selectedMonth()}`;
    return this.downloadingReports().has(key);
  }

  // ========== 流水帳編輯方法 ==========
  async openLedgerEditModal(entryId: number | string | null | undefined): Promise<void> {
    const normalizedEntryId = Number(entryId);
    if (Number.isNaN(normalizedEntryId) || normalizedEntryId <= 0) {
      return;
    }

    this.ledgerEditModalVisible.set(true);
    this.editingLedgerEntryId.set(normalizedEntryId);
    this.ledgerEditLoading.set(true);
    this.ledgerEditSaving.set(false);
    this.ledgerEditError.set('');

    try {
      await this.ensureLedgerGlAccountsLoaded();

      const response = await this.apiService.getLedgerEntries({
        entryId: normalizedEntryId,
        page: 1,
        limit: 1,
      });

      if (!response.success || !response.data || response.data.length === 0) {
        this.ledgerEditError.set(response.error || '查無此流水帳資料');
        return;
      }

      const tx = response.data[0];
      this.ledgerEditForm.patchValue({
        entry_date: this.normalizeDateInput(tx.entry_date),
        item_group: tx.item_group || '',
        subject_name: tx.subject_name || '',
        amount: tx.amount !== null && tx.amount !== undefined ? String(tx.amount) : '',
        invoice_no: tx.invoice_no || '',
        description: tx.description || '',
      });
    } catch (error: any) {
      this.ledgerEditError.set(error?.message || '載入流水帳資料失敗');
      console.error('Error opening ledger edit modal:', error);
    } finally {
      this.ledgerEditLoading.set(false);
    }
  }

  closeLedgerEditModal(): void {
    this.ledgerEditModalVisible.set(false);
    this.editingLedgerEntryId.set(null);
    this.ledgerEditLoading.set(false);
    this.ledgerEditSaving.set(false);
    this.ledgerEditError.set('');
    this.ledgerEditForm.reset({
      entry_date: '',
      item_group: '',
      subject_name: '',
      amount: '',
      invoice_no: '',
      description: '',
    });
    this.ledgerFormItemGroup.set('');
  }

  async submitLedgerEdit(): Promise<void> {
    const entryId = this.editingLedgerEntryId();
    if (!entryId) {
      this.ledgerEditError.set('缺少流水帳 ID');
      return;
    }

    if (this.ledgerEditForm.invalid) {
      this.ledgerEditForm.markAllAsTouched();
      this.ledgerEditError.set('請填寫必要欄位');
      return;
    }

    const formValue = this.ledgerEditForm.value;
    const amount = Number(formValue.amount);
    if (Number.isNaN(amount)) {
      this.ledgerEditError.set('金額格式不正確');
      return;
    }

    let glAccountId: number | null = null;
    if (formValue.item_group && formValue.subject_name) {
      const matched = this.ledgerSubAccounts().find(account => account.account_name === formValue.subject_name);
      glAccountId = matched?.gl_account_id || null;
    }

    this.ledgerEditSaving.set(true);
    this.ledgerEditError.set('');

    try {
      const response = await this.apiService.updateLedgerEntry({
        entry_id: entryId,
        entry_date: formValue.entry_date || undefined,
        item_group: formValue.item_group || undefined,
        subject_name: formValue.subject_name || undefined,
        amount,
        invoice_no: formValue.invoice_no || undefined,
        description: formValue.description || undefined,
        gl_account_id: glAccountId || undefined,
      });

      if (response.success) {
        this.closeLedgerEditModal();
        await this.loadMonthlySummary();
      } else {
        this.ledgerEditError.set(response.error || '修改流水帳失敗');
      }
    } catch (error: any) {
      this.ledgerEditError.set(error?.message || '修改流水帳失敗');
      console.error('Error saving ledger edit:', error);
    } finally {
      this.ledgerEditSaving.set(false);
    }
  }

  isLedgerEditInvalid(controlName: string): boolean {
    const control = this.ledgerEditForm.get(controlName);
    return !!control && control.invalid && control.touched;
  }

  private async ensureLedgerGlAccountsLoaded(): Promise<void> {
    if (this.ledgerGlAccounts().length > 0) {
      return;
    }

    const response = await this.apiService.getGLAccounts();
    if (response.success && response.data) {
      this.ledgerGlAccounts.set(
        response.data.map(account => ({
          gl_account_id: account.gl_account_id,
          parent_account_id: account.parent_account_id,
          account_name: account.account_name,
        }))
      );
    }
  }

  private normalizeDateInput(dateValue: string | null | undefined): string {
    if (!dateValue) {
      return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
