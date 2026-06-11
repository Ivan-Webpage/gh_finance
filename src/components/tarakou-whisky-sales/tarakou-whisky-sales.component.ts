import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

declare var Chart: any;

type TableKind = 'external' | 'shareholder';

interface MonthlySalesPoint {
  month: string;
  salesAmount: number;
}

interface ExternalInventoryRow {
  id: number;
  inventory_date: string;
  operation: '廠商入倉' | '銀河提貨' | '客人內用' | '客人外帶';
  quantity: number;
  unit_price: number;
  note: string | null;
}

interface ShareholderPurchaseRow {
  id: number;
  purchase_date: string;
  quantity: number;
  unit_price: number;
  is_tax_included: boolean;
  purchaser: string;
  is_settled: boolean;
  is_delivered: boolean;
}

@Component({
  selector: 'app-tarakou-whisky-sales',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tarakou-whisky-sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarakouWhiskySalesComponent implements AfterViewInit {
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  @ViewChild('salesChart') salesChartRef?: ElementRef<HTMLCanvasElement>;

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly modalErrorMessage = signal('');

  readonly externalRows = signal<ExternalInventoryRow[]>([]);
  readonly shareholderRows = signal<ShareholderPurchaseRow[]>([]);
  readonly monthlySales = signal<MonthlySalesPoint[]>([]);

  readonly currentYear = new Date().getFullYear();
  readonly startYear = signal(this.currentYear);
  readonly endYear = signal(this.currentYear);

  readonly availableYears = computed(() => {
    const years: number[] = [];
    for (let year = this.currentYear - 5; year <= this.currentYear + 1; year++) {
      years.push(year);
    }
    return years;
  });

  readonly totalSalesAmount = computed(() => {
    return this.monthlySales().reduce((sum, item) => sum + (Number(item.salesAmount) || 0), 0);
  });

  readonly totalCostAmount = computed(() => {
    return this.externalRows()
      .filter((row) => row.operation === '廠商入倉')
      .reduce((sum, row) => sum + (Number(row.quantity) || 0) * 1050, 0);
  });

  readonly modalOpen = signal(false);
  readonly modalTable = signal<TableKind>('external');
  readonly editingId = signal<number | null>(null);

  readonly externalOperations = ['廠商入倉', '銀河提貨'];

  readonly externalForm = this.fb.group({
    inventory_date: ['', Validators.required],
    operation: ['廠商入倉', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    unit_price: [0, [Validators.required, Validators.min(0)]],
    note: [''],
  });

  readonly shareholderForm = this.fb.group({
    purchase_date: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    unit_price: [0, [Validators.required, Validators.min(0)]],
    is_tax_included: [true],
    purchaser: ['', Validators.required],
    is_settled: [false],
    is_delivered: [false],
  });

  private chart: any = null;

  async ngAfterViewInit(): Promise<void> {
    await this.loadData();
  }

  async applyYearFilter(): Promise<void> {
    if (this.startYear() > this.endYear()) {
      this.errorMessage.set('起始年份不能大於結束年份');
      return;
    }

    await this.loadData();
  }

  openCreateExternal(): void {
    this.modalTable.set('external');
    this.editingId.set(null);
    this.modalErrorMessage.set('');
    this.externalForm.reset({
      inventory_date: this.todayDate(),
      operation: '廠商入倉',
      quantity: 1,
      unit_price: 0,
      note: '',
    });
    this.modalOpen.set(true);
  }

  openEditExternal(row: ExternalInventoryRow): void {
    this.modalTable.set('external');
    this.editingId.set(row.id);
    this.modalErrorMessage.set('');
    this.externalForm.reset({
      inventory_date: this.normalizeDate(row.inventory_date),
      operation: this.externalOperations.includes(row.operation) ? row.operation : '廠商入倉',
      quantity: row.quantity,
      unit_price: 0,
      note: row.note || '',
    });
    this.modalOpen.set(true);
  }

  openCreateShareholder(): void {
    this.modalTable.set('shareholder');
    this.editingId.set(null);
    this.modalErrorMessage.set('');
    this.shareholderForm.reset({
      purchase_date: this.todayDate(),
      quantity: 1,
      unit_price: 0,
      is_tax_included: true,
      purchaser: '',
      is_settled: false,
      is_delivered: false,
    });
    this.modalOpen.set(true);
  }

  openEditShareholder(row: ShareholderPurchaseRow): void {
    this.modalTable.set('shareholder');
    this.editingId.set(row.id);
    this.modalErrorMessage.set('');
    this.shareholderForm.reset({
      purchase_date: this.normalizeDate(row.purchase_date),
      quantity: row.quantity,
      unit_price: row.unit_price,
      is_tax_included: row.is_tax_included,
      purchaser: row.purchaser,
      is_settled: row.is_settled,
      is_delivered: row.is_delivered,
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.modalErrorMessage.set('');
  }

  onSaveButtonClick(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    void this.submitModal();
  }

  async submitModal(): Promise<void> {
    console.info('[TarakouWhiskySales] submitModal triggered', {
      table: this.modalTable(),
      editingId: this.editingId(),
    });

    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.isSaving.set(true);

    try {
      if (this.modalTable() === 'external') {
        if (this.externalForm.invalid) {
          this.externalForm.markAllAsTouched();
          this.modalErrorMessage.set('請先確認必填欄位已正確填寫');
          return;
        }

        const payload = this.externalForm.getRawValue();
        const id = this.editingId();

        if (id) {
          await this.apiService.updateTarakouExternalInventory(id, payload);
        } else {
          await this.apiService.createTarakouExternalInventory(payload);
        }
      } else {
        if (this.shareholderForm.invalid) {
          this.shareholderForm.markAllAsTouched();
          this.modalErrorMessage.set('請先確認必填欄位已正確填寫');
          return;
        }

        const payload = this.shareholderForm.getRawValue();
        const id = this.editingId();

        if (id) {
          await this.apiService.updateTarakouShareholderPurchase(id, payload);
        } else {
          await this.apiService.createTarakouShareholderPurchase(payload);
        }
      }

      this.closeModal();
      await this.loadData();
    } catch (error) {
      console.error('保存太魯閣威士忌資料失敗:', error);
      const message = this.extractApiErrorMessage(error);
      this.modalErrorMessage.set(message);
      this.errorMessage.set(message);
    } finally {
      this.isSaving.set(false);
    }
  }

  private extractApiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const backendMessage = error.error?.error || error.error?.details;
      if (backendMessage) {
        return String(backendMessage);
      }
      return `儲存失敗（${error.status || '網路錯誤'}）`;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return '儲存失敗，請稍後再試';
  }

  async deleteExternal(id: number): Promise<void> {
    const confirmed = window.confirm('確定要刪除此筆對外庫存資料嗎？');
    if (!confirmed) return;

    try {
      await this.apiService.deleteTarakouExternalInventory(id);
      await this.loadData();
    } catch (error) {
      console.error('刪除對外庫存失敗:', error);
      this.errorMessage.set('刪除失敗，請稍後再試');
    }
  }

  async deleteShareholder(id: number): Promise<void> {
    const confirmed = window.confirm('確定要刪除此筆股東購買資料嗎？');
    if (!confirmed) return;

    try {
      await this.apiService.deleteTarakouShareholderPurchase(id);
      await this.loadData();
    } catch (error) {
      console.error('刪除股東購買失敗:', error);
      this.errorMessage.set('刪除失敗，請稍後再試');
    }
  }

  getExternalTotal(row: ExternalInventoryRow): number {
    return row.quantity * row.unit_price;
  }

  getShareholderTotal(row: ShareholderPurchaseRow): number {
    return row.quantity * row.unit_price;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.apiService.getTarakouWhiskySales({
        startYear: this.startYear(),
        endYear: this.endYear(),
      });

      const data = response?.data || {};
      this.monthlySales.set((data.monthlySales || []) as MonthlySalesPoint[]);
      this.externalRows.set((data.externalInventory || []) as ExternalInventoryRow[]);
      this.shareholderRows.set((data.shareholderPurchases || []) as ShareholderPurchaseRow[]);
      this.renderChart();
    } catch (error) {
      console.error('讀取太魯閣威士忌銷售資料失敗:', error);
      this.errorMessage.set('讀取資料失敗，請稍後再試');
    } finally {
      this.isLoading.set(false);
    }
  }

  private renderChart(): void {
    if (!this.salesChartRef?.nativeElement) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const points = this.monthlySales();
    const labels = points.map((item) => item.month);
    const values = points.map((item) => item.salesAmount);

    this.chart = new Chart(this.salesChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '太魯閣威士忌每月銷售額',
            data: values,
            borderColor: '#0f766e',
            backgroundColor: 'rgba(15, 118, 110, 0.15)',
            pointBackgroundColor: '#134e4a',
            pointRadius: 3,
            tension: 0.25,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (value: any) => this.formatCurrency(Number(value)),
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context: any) => this.formatCurrency(Number(context.parsed.y || 0)),
            },
          },
        },
      },
    });
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeDate(value: string): string {
    return (value || '').slice(0, 10);
  }
}
