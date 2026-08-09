import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, afterNextRender, computed, effect, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { TarakouExternalInventory, TarakouExternalOperation, TarakouShareholderPurchase, TarakouWhiskySalesData } from '../../models/financial.model';
import { Chart } from 'chart.js/auto';

const EXTERNAL_OPERATIONS: TarakouExternalOperation[] = ['廠商入倉', '銀河提貨', '廠商客戶提貨', '客人內用', '客人外帶'];
const YEAR_OPTIONS = [2021, 2022, 2023, 2024, 2025, 2026, 2027];
const WAREHOUSE_UNIT_COST = 1050;

interface ExternalFormState {
  id: number | null;
  inventory_date: string;
  operation: TarakouExternalOperation;
  quantity: number | null;
  unit_price: number | null;
  note: string;
}

function emptyExternalForm(): ExternalFormState {
  return { id: null, inventory_date: '', operation: '廠商入倉', quantity: null, unit_price: 0, note: '' };
}

interface ShareholderFormState {
  id: number | null;
  purchase_date: string;
  quantity: number | null;
  unit_price: number | null;
  is_tax_included: boolean;
  purchaser: string;
  is_settled: boolean;
  is_delivered: boolean;
}

function emptyShareholderForm(): ShareholderFormState {
  return {
    id: null, purchase_date: '', quantity: null, unit_price: null,
    is_tax_included: true, purchaser: '', is_settled: false, is_delivered: false,
  };
}

@Component({
  selector: 'app-tarakou-whisky-sales',
  templateUrl: './tarakou-whisky-sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TarakouWhiskySalesComponent {
  private apiService = inject(ApiService);

  externalOperations = EXTERNAL_OPERATIONS;
  yearOptions = YEAR_OPTIONS;

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  data = signal<TarakouWhiskySalesData | null>(null);

  currentYear = new Date().getFullYear();
  startYear = signal(this.currentYear);
  endYear = signal(this.currentYear);

  totalSalesAmount = computed(() => (this.data()?.monthlySales || []).reduce((sum, m) => sum + (Number(m.salesAmount) || 0), 0));
  totalCost = computed(() => {
    const inventory = this.data()?.externalInventory || [];
    const warehouseQty = inventory
      .filter(i => i.operation === '銀河提貨')
      .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    return warehouseQty * WAREHOUSE_UNIT_COST;
  });
  currentStockQty = computed(() => Number(this.data()?.currentStockQty) || 0);

  // --- 對外庫存 ---
  isExternalModalOpen = signal(false);
  externalForm = signal<ExternalFormState>(emptyExternalForm());
  externalError = signal<string | null>(null);
  externalSaving = signal(false);

  // --- 股東購買 ---
  isShareholderModalOpen = signal(false);
  shareholderForm = signal<ShareholderFormState>(emptyShareholderForm());
  shareholderError = signal<string | null>(null);
  shareholderSaving = signal(false);

  @ViewChild('monthlyChart') monthlyChartRef!: ElementRef;
  private monthlyChart: any;

  constructor() {
    this.loadData();

    effect(() => {
      const salesData = this.data();
      if (this.monthlyChart && salesData) {
        this.monthlyChart.data.labels = salesData.monthlySales.map(d => d.month);
        this.monthlyChart.data.datasets[0].data = salesData.monthlySales.map(d => d.salesAmount);
        this.monthlyChart.update();
      }
    });

    afterNextRender(() => {
      this.createChart();
    });
  }

  private createChart(): void {
    if (!this.monthlyChartRef) return;
    const ctx = this.monthlyChartRef.nativeElement.getContext('2d');
    const salesData = this.data();
    this.monthlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: (salesData?.monthlySales || []).map(d => d.month),
        datasets: [{
          label: '太魯閣威士忌每月銷售額',
          data: (salesData?.monthlySales || []).map(d => d.salesAmount),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.12)',
          fill: true,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  async loadData(): Promise<void> {
    if (this.startYear() > this.endYear()) {
      this.errorMessage.set('起始年份不能大於結束年份');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.getTarakouWhiskySales(this.startYear(), this.endYear());
      if (response.success && response.data) {
        this.data.set(response.data);
      } else {
        this.errorMessage.set(response.error || '讀取太魯閣威士忌銷售資料失敗');
      }
    } catch (error) {
      console.error('Error loading tarakou whisky sales:', error);
      this.errorMessage.set('讀取太魯閣威士忌銷售資料失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- 對外庫存 ---

  openExternalModal(item: TarakouExternalInventory | null = null): void {
    this.externalError.set(null);
    if (item) {
      this.externalForm.set({
        id: item.id,
        inventory_date: item.inventory_date.slice(0, 10),
        operation: item.operation,
        quantity: item.quantity,
        unit_price: item.unit_price,
        note: item.note || '',
      });
    } else {
      this.externalForm.set(emptyExternalForm());
    }
    this.isExternalModalOpen.set(true);
  }

  closeExternalModal(): void {
    this.isExternalModalOpen.set(false);
  }

  updateExternalFormField<K extends keyof ExternalFormState>(field: K, value: ExternalFormState[K]): void {
    this.externalForm.update(f => ({ ...f, [field]: value }));
  }

  async submitExternal(): Promise<void> {
    const form = this.externalForm();

    if (!form.inventory_date || !form.operation) {
      this.externalError.set('請先確認日期與作業欄位已正確填寫');
      return;
    }
    if (form.quantity === null || form.quantity === 0) {
      this.externalError.set('數量為必填，且不能為 0（負數表示退貨/減少庫存）');
      return;
    }
    if (form.quantity < 0 && !form.note.trim()) {
      this.externalError.set('數量為負數時，請務必在「備註」欄位說明原因（例如：廠商回收瑕疵品）');
      return;
    }

    this.externalSaving.set(true);
    this.externalError.set(null);

    try {
      const payload = {
        inventory_date: form.inventory_date,
        operation: form.operation,
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
        note: form.note.trim() || null,
      };

      const response = form.id
        ? await this.apiService.updateTarakouExternalInventory(form.id, payload)
        : await this.apiService.createTarakouExternalInventory(payload);

      if (response.success) {
        this.closeExternalModal();
        await this.loadData();
      } else {
        this.externalError.set(response.error || '保存太魯閣威士忌資料失敗');
      }
    } catch (error) {
      console.error('Error saving external inventory:', error);
      this.externalError.set('保存太魯閣威士忌資料失敗');
    } finally {
      this.externalSaving.set(false);
    }
  }

  async deleteExternal(item: TarakouExternalInventory): Promise<void> {
    if (!confirm('確定要刪除此筆對外庫存資料嗎？')) return;

    try {
      const response = await this.apiService.deleteTarakouExternalInventory(item.id);
      if (response.success) {
        await this.loadData();
      } else {
        this.errorMessage.set(response.error || '刪除對外庫存失敗');
      }
    } catch (error) {
      console.error('Error deleting external inventory:', error);
      this.errorMessage.set('刪除對外庫存失敗');
    }
  }

  // --- 股東購買 ---

  openShareholderModal(item: TarakouShareholderPurchase | null = null): void {
    this.shareholderError.set(null);
    if (item) {
      this.shareholderForm.set({
        id: item.id,
        purchase_date: item.purchase_date.slice(0, 10),
        quantity: item.quantity,
        unit_price: item.unit_price,
        is_tax_included: item.is_tax_included,
        purchaser: item.purchaser,
        is_settled: item.is_settled,
        is_delivered: item.is_delivered,
      });
    } else {
      this.shareholderForm.set(emptyShareholderForm());
    }
    this.isShareholderModalOpen.set(true);
  }

  closeShareholderModal(): void {
    this.isShareholderModalOpen.set(false);
  }

  updateShareholderFormField<K extends keyof ShareholderFormState>(field: K, value: ShareholderFormState[K]): void {
    this.shareholderForm.update(f => ({ ...f, [field]: value }));
  }

  async submitShareholder(): Promise<void> {
    const form = this.shareholderForm();

    if (!form.purchase_date || !form.purchaser.trim() || form.quantity === null || form.quantity <= 0 || form.unit_price === null) {
      this.shareholderError.set('請先確認必填欄位已正確填寫');
      return;
    }

    this.shareholderSaving.set(true);
    this.shareholderError.set(null);

    try {
      const payload = {
        purchase_date: form.purchase_date,
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
        is_tax_included: form.is_tax_included,
        purchaser: form.purchaser.trim(),
        is_settled: form.is_settled,
        is_delivered: form.is_delivered,
      };

      const response = form.id
        ? await this.apiService.updateTarakouShareholderPurchase(form.id, payload)
        : await this.apiService.createTarakouShareholderPurchase(payload);

      if (response.success) {
        this.closeShareholderModal();
        await this.loadData();
      } else {
        this.shareholderError.set(response.error || '保存太魯閣威士忌資料失敗');
      }
    } catch (error) {
      console.error('Error saving shareholder purchase:', error);
      this.shareholderError.set('保存太魯閣威士忌資料失敗');
    } finally {
      this.shareholderSaving.set(false);
    }
  }

  async deleteShareholder(item: TarakouShareholderPurchase): Promise<void> {
    if (!confirm('確定要刪除此筆股東購買資料嗎？')) return;

    try {
      const response = await this.apiService.deleteTarakouShareholderPurchase(item.id);
      if (response.success) {
        await this.loadData();
      } else {
        this.errorMessage.set(response.error || '刪除股東購買失敗');
      }
    } catch (error) {
      console.error('Error deleting shareholder purchase:', error);
      this.errorMessage.set('刪除股東購買失敗');
    }
  }

  purchaseAmount(item: TarakouShareholderPurchase): number {
    return (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatQuantity(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
