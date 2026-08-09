import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { OffBookInvoice, FinancialPlanTask, FinancialPlanTaskStatus } from '../../models/financial.model';

type OffBookFinanceTab = 'invoices' | 'plan';

interface OwnerOption {
  id: number;
  name: string;
}

const PLAN_TASK_STATUSES: FinancialPlanTaskStatus[] = ['未開始', '進行中', '已完成', '延遲'];
const YEAR_OPTIONS = [2024, 2025, 2026, 2027];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

@Component({
  selector: 'app-off-book-finance',
  templateUrl: './off-book-finance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class OffBookFinanceComponent implements OnInit {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  planTaskStatuses = PLAN_TASK_STATUSES;
  yearOptions = YEAR_OPTIONS;
  monthOptions = MONTH_OPTIONS;
  activeTab = signal<OffBookFinanceTab>('invoices');

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  filterYear = signal<number>(new Date().getFullYear());
  filterMonth = signal<number>(new Date().getMonth() + 1);
  searchTerm = signal('');

  // --- 外帳發票 ---
  invoices = signal<OffBookInvoice[]>([]);
  invoiceForm = this.fb.group({
    invoice_name: ['', Validators.required],
    amount: [null as number | null, Validators.required],
    invoice_date: ['', Validators.required],
  });
  invoiceSaving = signal(false);

  filteredInvoices = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const all = this.invoices();
    if (!term) return all;
    return all.filter(i => i.invoice_name.toLowerCase().includes(term));
  });

  invoiceTotal = computed(() => this.filteredInvoices().reduce((sum, i) => sum + (Number(i.amount) || 0), 0));

  // --- 財務規劃任務 ---
  planTasks = signal<FinancialPlanTask[]>([]);
  owners = signal<OwnerOption[]>([]);

  filteredPlanTasks = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const all = this.planTasks();
    if (!term) return all;
    return all.filter(t => (t.task_content || '').toLowerCase().includes(term));
  });

  planEstimatedTotal = computed(() => this.filteredPlanTasks().reduce((sum, t) => sum + (Number(t.estimated_amount) || 0), 0));
  planActualTotal = computed(() => this.filteredPlanTasks().reduce((sum, t) => sum + (Number(t.actual_amount) || 0), 0));

  ngOnInit(): void {
    this.loadOwners();
    this.loadData();
  }

  async loadOwners(): Promise<void> {
    try {
      const response = await this.apiService.getEmployeeInfo();
      if (response.success && response.data) {
        this.owners.set(
          (response.data as any[])
            .filter(e => e.position === '經營團隊')
            .map(e => ({ id: Number(e.id), name: e.employee_name }))
        );
      }
    } catch (error) {
      console.error('Error loading owners:', error);
    }
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = { year: this.filterYear(), month: this.filterMonth() };

    try {
      if (this.activeTab() === 'invoices') {
        const response = await this.apiService.getOffBookInvoices(params);
        if (response.success && response.data) {
          this.invoices.set(response.data);
        } else {
          this.errorMessage.set(response.error || '載入外帳發票資料失敗');
        }
      } else {
        const response = await this.apiService.getFinancialPlanTasks(params);
        if (response.success && response.data) {
          this.planTasks.set(response.data);
        } else {
          this.errorMessage.set(response.error || '載入財務規劃資料失敗');
        }
      }
    } catch (error) {
      console.error('Error loading off-book finance data:', error);
      this.errorMessage.set(this.activeTab() === 'invoices' ? '載入外帳發票資料失敗，請稍後重試' : '載入財務規劃資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  changeTab(tab: OffBookFinanceTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.loadData();
  }

  onFilterChange(): void {
    this.loadData();
  }

  // --- 外帳發票 ---

  async submitInvoice(): Promise<void> {
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      this.errorMessage.set('請先確認必填欄位已正確填寫');
      return;
    }

    this.invoiceSaving.set(true);
    this.errorMessage.set(null);

    try {
      const value = this.invoiceForm.value;
      const response = await this.apiService.createOffBookInvoice({
        invoice_name: value.invoice_name || '',
        amount: Number(value.amount),
        invoice_date: value.invoice_date || '',
      });

      if (response.success) {
        this.invoiceForm.reset();
        await this.loadData();
      } else {
        this.errorMessage.set(response.error || '新增外帳發票失敗');
      }
    } catch (error) {
      console.error('Error creating off-book invoice:', error);
      this.errorMessage.set('新增外帳發票失敗，請稍後重試');
    } finally {
      this.invoiceSaving.set(false);
    }
  }

  async deleteInvoice(invoice: OffBookInvoice): Promise<void> {
    if (!confirm(`確定要刪除發票「${invoice.invoice_name}」嗎？`)) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.deleteOffBookInvoice(invoice.invoice_id);
      if (response.success) {
        await this.loadData();
      } else {
        this.errorMessage.set(response.error || '刪除外帳發票失敗');
      }
    } catch (error) {
      console.error('Error deleting off-book invoice:', error);
      this.errorMessage.set('刪除外帳發票失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- 財務規劃任務 ---

  async addPlanTask(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.createFinancialPlanTask({});
      if (response.success && response.data) {
        this.planTasks.update(tasks => [...tasks, response.data as FinancialPlanTask]);
      } else {
        this.errorMessage.set(response.error || '新增任務失敗');
      }
    } catch (error) {
      console.error('Error creating financial plan task:', error);
      this.errorMessage.set('新增任務失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  async savePlanTask(task: FinancialPlanTask): Promise<void> {
    if (!task.planned_complete_date) {
      this.errorMessage.set('預計完成日期為必填，請選擇日期');
      return;
    }

    this.errorMessage.set(null);

    try {
      const response = await this.apiService.updateFinancialPlanTask({
        task_id: task.task_id,
        period_label: task.period_label,
        task_content: task.task_content,
        status: task.status,
        owner_employee_id: task.owner_employee_id,
        planned_complete_date: task.planned_complete_date,
        actual_complete_date: task.actual_complete_date,
        estimated_amount: task.estimated_amount,
        actual_amount: task.actual_amount,
        remark: task.remark,
      });

      if (response.success && response.data) {
        this.planTasks.update(tasks => tasks.map(t => (t.task_id === task.task_id ? (response.data as FinancialPlanTask) : t)));
      } else {
        this.errorMessage.set(response.error || '更新任務失敗');
      }
    } catch (error) {
      console.error('Error updating financial plan task:', error);
      this.errorMessage.set('更新任務失敗，請稍後重試');
    }
  }

  onOwnerChange(task: FinancialPlanTask, value: string): void {
    task.owner_employee_id = value ? Number(value) : null;
    this.savePlanTask(task);
  }

  async deletePlanTask(task: FinancialPlanTask): Promise<void> {
    if (!confirm(`確定要刪除任務「${task.task_content || '未命名任務'}」嗎？`)) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.deleteFinancialPlanTask(task.task_id);
      if (response.success) {
        this.planTasks.update(tasks => tasks.filter(t => t.task_id !== task.task_id));
      } else {
        this.errorMessage.set(response.error || '刪除任務失敗');
      }
    } catch (error) {
      console.error('Error deleting financial plan task:', error);
      this.errorMessage.set('刪除任務失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
