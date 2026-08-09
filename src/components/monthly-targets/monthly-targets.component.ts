import { Component, inject, signal, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface MonthlyTarget {
  targetId: number;
  targetMonth: string;
  monthlyRevenueTarget: number;
  eventRevenueTarget: number;
  totalTarget: number;
  dailyAvgTarget: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  updatedEditor: string | null;
}

@Component({
  selector: 'app-monthly-targets',
  templateUrl: './monthly-targets.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MonthlyTargetsComponent implements OnInit {
  apiService = inject(ApiService);

  // 目標列表數據
  targets = signal<MonthlyTarget[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // 表單相關狀態
  showForm = signal(false);
  isEditing = signal(false);
  formData = signal({
    targetId: null as number | null,
    targetMonth: '',
    monthlyRevenueTarget: 0,
    eventRevenueTarget: 0,
    remark: '',
  });
  formError = signal<string | null>(null);
  isSaving = signal(false);

  // 成功訊息提示
  successMessage = signal<string | null>(null);
  
  ngOnInit() {
    this.loadTargets();
  }

  /**
   * 載入所有月份業績目標
   */
  async loadTargets(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const response = await this.apiService.getMonthlyTargets();
      
      if (response.success) {
        this.targets.set(response.data || []);
      } else {
        throw new Error(response.error || '載入失敗');
      }
    } catch (error) {
      console.error('載入月份業績目標時發生錯誤:', error);
      const errorMsg = error instanceof Error ? error.message : '載入資料失敗，請稍後再試';
      this.error.set(errorMsg);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 開啟新增表單
   */
  openAddForm(): void {
    this.isEditing.set(false);
    this.formData.set({
      targetId: null,
      targetMonth: '',
      monthlyRevenueTarget: 0,
      eventRevenueTarget: 0,
      remark: '',
    });
    this.formError.set(null);
    this.showForm.set(true);
  }

  /**
   * 開啟編輯表單
   */
  openEditForm(target: MonthlyTarget): void {
    this.isEditing.set(true);
    this.formData.set({
      targetId: target.targetId,
      targetMonth: target.targetMonth.substring(0, 7), // YYYY-MM-DD -> YYYY-MM
      monthlyRevenueTarget: target.monthlyRevenueTarget,
      eventRevenueTarget: target.eventRevenueTarget,
      remark: target.remark || '',
    });
    this.formError.set(null);
    this.showForm.set(true);
  }

  /**
   * 關閉表單
   */
  closeForm(): void {
    this.showForm.set(false);
    this.formError.set(null);
    this.formData.set({
      targetId: null,
      targetMonth: '',
      monthlyRevenueTarget: 0,
      eventRevenueTarget: 0,
      remark: '',
    });
  }

  /**
   * 驗證表單內容
   */
  validateForm(): string | null {
    const data = this.formData();

    if (!data.targetMonth) {
      return '請選擇月份';
    }

    if (data.monthlyRevenueTarget < 0) {
      return '月營收目標不能為負數';
    }

    if (data.eventRevenueTarget < 0) {
      return '活動營收目標不能為負數';
    }

    return null;
  }

  /**
   * 提交表單 (新增或更新)
   */
  async submitForm(): Promise<void> {
    const validationError = this.validateForm();
    if (validationError) {
      this.formError.set(validationError);
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);
    this.successMessage.set(null);

    try {
      const data = this.formData();
      const payload = {
        targetMonth: `${data.targetMonth}-01`, // YYYY-MM -> YYYY-MM-DD
        monthlyRevenueTarget: data.monthlyRevenueTarget,
        eventRevenueTarget: data.eventRevenueTarget,
        remark: data.remark || null,
      };

      let response;
      if (this.isEditing() && data.targetId) {
        // 更新
        response = await this.apiService.updateMonthlyTarget({
          targetId: data.targetId,
          ...payload,
        });
        this.successMessage.set('更新成功！');
      } else {
        // 新增
        response = await this.apiService.createMonthlyTarget(payload);
        this.successMessage.set('新增成功！');
      }

      if (response.success) {
        // 重新載入數據
        await this.loadTargets();
        // 關閉表單
        this.closeForm();
        // 3秒後清除成功訊息
        setTimeout(() => this.successMessage.set(null), 3000);
      } else {
        throw new Error(response.error || '操作失敗');
      }
    } catch (error: any) {
      console.error('提交表單失敗:', error);
      let errorMsg = error instanceof Error ? error.message : '操作失敗，請稍後再試';
      
      // 處理重複月份的錯誤
      if (error.message?.includes('exists')) {
        errorMsg = '該月份的業績目標已經存在，請直接編輯該月份資料';
      }
      
      this.formError.set(errorMsg);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * 刪除目標
   */
  async deleteTarget(target: MonthlyTarget): Promise<void> {
    const confirmed = confirm(`確定要刪除 ${this.formatMonth(target.targetMonth)} 的業績目標嗎？`);
    if (!confirmed) return;

    this.isLoading.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    try {
      const response = await this.apiService.deleteMonthlyTarget(target.targetId);
      
      if (response.success) {
        this.successMessage.set('刪除成功！');
        // 重新載入數據
        await this.loadTargets();
        setTimeout(() => this.successMessage.set(null), 3000);
      } else {
        throw new Error(response.error || '刪除失敗');
      }
    } catch (error) {
      console.error('刪除失敗:', error);
      const errorMsg = error instanceof Error ? error.message : '刪除失敗，請稍後再試';
      this.error.set(errorMsg);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 格式化月份顯示
   */
  formatMonth(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}年${month}月`;
  }

  /**
   * 格式化金額顯示
   */
  formatCurrency(value: number): string {
    if (value === null || value === undefined) return 'NT$0';
    return `NT$${value.toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  }

  /**
   * 更新表單欄位 (用於模板雙向綁定)
   */
  updateTargetMonth(value: string): void {
    this.formData.update(d => ({ ...d, targetMonth: value }));
  }

  updateMonthlyRevenueTarget(value: string): void {
    this.formData.update(d => ({ ...d, monthlyRevenueTarget: +value }));
  }

  updateEventRevenueTarget(value: string): void {
    this.formData.update(d => ({ ...d, eventRevenueTarget: +value }));
  }

  updateRemark(value: string): void {
    this.formData.update(d => ({ ...d, remark: value }));
  }
}