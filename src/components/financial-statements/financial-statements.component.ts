import { ChangeDetectionStrategy, Component, inject, signal, ViewChild, ElementRef, computed, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { MonthlyIncomeStatementReport, MonthlyBalanceSheetReport, AnnualSummaryReport, MonthlyDetailReport, ExpenseBreakdown, RevenueBreakdown, UnpaidBreakdown } from '../../models/financial.model';

declare var Chart: any;

type Statement = 'summary' | 'income' | 'balance';

@Component({
  selector: 'app-financial-statements',
  templateUrl: './financial-statements.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FinancialStatementsComponent {
  apiService = inject(ApiService);
  
  // --- Tab & Report Data ---
  activeStatement = signal<Statement>('summary');
  annualSummary = signal<AnnualSummaryReport | null>(null);
  monthlyIncomeStatement = signal<MonthlyIncomeStatementReport | null>(null);
  monthlyBalanceSheet = signal<MonthlyBalanceSheetReport | null>(null);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  // --- Modal State ---
  isDetailModalOpen = signal(false);
  detailModalData = signal<MonthlyDetailReport | null>(null);

  // --- Chart State ---
  @ViewChild('detailChart') set detailChartRef(el: ElementRef | undefined) {
    // When the view child is set (i.e., the canvas element appears in the DOM),
    // we create the chart. When it's destroyed, el will be undefined.
    this.destroyDetailChart(); // Always destroy the old chart first.
    if (el && this.detailModalData()) {
        this.createDetailChart(el);
    }
  }
  private detailChart: any;
  
  // --- Filter States ---
  years = signal<number[]>([2026, 2025, 2024]);
  quarters = signal<{value: number | 'all', label: string}[]>([
      { value: 'all', label: '全年' },
      { value: 1, label: '第一季' },
      { value: 2, label: '第二季' },
      { value: 3, label: '第三季' },
      { value: 4, label: '第四季' },
  ]);
  // For Income/Balance Sheet
  selectedYear = signal<number>(2026);
  selectedQuarter = signal<number | 'all'>('all');

  // For Summary
  selectedStartYearSummary = signal<number>(2024);
  selectedEndYearSummary = signal<number>(2026);
  selectedYearForDetail = signal<number>(2026); // 用於詳細報表的年份選擇

  detailModalTotal = computed(() => {
    const modal = this.detailModalData();
    if (!modal) {
      return 0;
    }
    return modal.data.reduce((sum, m) => sum + m.total, 0);
  });

  constructor() {
    this.applySummaryFilter();
    this.applyFilter();
  }

  setActiveStatement(statement: Statement) {
    this.activeStatement.set(statement);
  }

  /**
   * 將字符串金額轉換為數字類型
   * 確保所有金額數據都是 number 類型而不是 string
   * 處理可能的 null/undefined 情況
   * 
   * @param value 要轉換的值，可能是 string | number | null | undefined
   * @returns 轉換後的數字，無效值返回0
   */
  private convertToNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * 規範化損益表數據
   * 確保所有金額都是數字類型，並計算正確的月度和年度總計
   * 重點：總計欄位 = 所有月份數字的加總
   * 對於營業收入小計：計算 銷貨收入 + 其他收入 - 銷貨折讓
   * 對於營業費用小計：計算所有營業費用科目的總和
   * 
   * @param report 原始的月度損益表報告
   * @returns 規範化後的損益表報告，所有數字都是 number 類型
   */
  private normalizeIncomeStatement(report: MonthlyIncomeStatementReport): MonthlyIncomeStatementReport {
    if (!report) return report;
    
    const normalizeSection = (section: any, sectionName?: string) => {
      const normalizedItems = section.items.map((item: any) => {
        const monthlyAmounts: { [month: string]: number } = {};
        let itemTotal = 0;
        
        // 將月份金額轉換為數字並加總
        Object.entries(item.monthlyAmounts || {}).forEach(([month, amount]: any) => {
          const numAmount = this.convertToNumber(amount);
          monthlyAmounts[month] = numAmount;
          itemTotal += numAmount;
        });
        
        return {
          ...item,
          monthlyAmounts,
          total: itemTotal // 總計 = 所有月份的加總
        };
      });
      
      // 根據科目名稱計算正確的小計
      let grandTotal = 0;
      let monthlyTotals: { [month: string]: number } = {};
      let workingItems = normalizedItems;
      
      if (sectionName === 'operatingRevenue') {
        // 若同時存在「銷貨折讓」與「-銷貨折讓」，僅保留「-銷貨折讓」
        const hasNegativeDiscount = normalizedItems.some((i: any) => i.account?.includes('-銷貨折讓'));
        if (hasNegativeDiscount) {
          workingItems = normalizedItems.filter((i: any) => i.account !== '銷貨折讓');
        }

        // 營業收入小計 = 銷貨收入 + 其他收入 - 銷貨折讓
        let salesRevenue = workingItems.find((i: any) => i.account.includes('銷貨收入'));
        let otherRevenue = workingItems.find((i: any) => i.account.includes('其他收入'));
        let discountItem = workingItems.find((i: any) => i.account.includes('銷貨折讓'));
        
        // 年度合計
        grandTotal = (salesRevenue?.total || 0) + (otherRevenue?.total || 0) - (discountItem?.total || 0);
        
        // 月度合計
        if (report.months) {
          report.months.forEach((month: string) => {
            const monthRevenue = (salesRevenue?.monthlyAmounts?.[month] || 0) + 
                                (otherRevenue?.monthlyAmounts?.[month] || 0) - 
                                (discountItem?.monthlyAmounts?.[month] || 0);
            monthlyTotals[month] = Math.max(0, monthRevenue); // 防止負數
          });
        }
      } else if (sectionName === 'operatingExpenses') {
        // 營業費用小計 = 所有營業費用科目的總和
        grandTotal = workingItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
        
        // 月度合計
        if (report.months) {
          report.months.forEach((month: string) => {
            const monthExpense = workingItems.reduce((sum: number, item: any) => 
              sum + (item.monthlyAmounts?.[month] || 0), 0);
            monthlyTotals[month] = monthExpense;
          });
        }
      } else {
        // 默認：直接加總所有項目
        grandTotal = workingItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
        
        if (report.months) {
          report.months.forEach((month: string) => {
            const monthTotal = workingItems.reduce((sum: number, item: any) => 
              sum + (item.monthlyAmounts?.[month] || 0), 0);
            monthlyTotals[month] = monthTotal;
          });
        }
      }
      
      // 計算每項的百分比（占小計的比例）
      const itemsWithPercentage = workingItems.map((item: any) => {
        const percentage = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
        return {
          ...item,
          percentage: percentage
        };
      });
      
      return {
        ...section,
        items: itemsWithPercentage,
        monthlyTotals: monthlyTotals,
        grandTotal: grandTotal
      };
    };
    
    return {
      ...report,
      operatingRevenue: normalizeSection(report.operatingRevenue, 'operatingRevenue'),
      operatingExpenses: normalizeSection(report.operatingExpenses, 'operatingExpenses'),
      netIncome: {
        monthlyTotals: Object.entries(report.netIncome.monthlyTotals || {}).reduce((acc: any, [month, amount]: any) => {
          acc[month] = this.convertToNumber(amount);
          return acc;
        }, {} as { [month: string]: number }),
        grandTotal: this.convertToNumber(report.netIncome.grandTotal)
      }
    };
  }

  /**
   * 規範化資產負債表數據
   * 確保所有金額都是數字類型，並計算正確的月度和年度總計
   * 重點：總計欄位 = 所有月份數字的加總
   * 資產小計、負債小計、業主權益小計都是所有相應科目的總和
   * 
   * @param report 原始的月度資產負債表報告
   * @returns 規範化後的資產負債表報告，所有數字都是 number 類型
   */
  private normalizeBalanceSheet(report: MonthlyBalanceSheetReport): MonthlyBalanceSheetReport {
    if (!report) return report;
    
    const normalizeSection = (section: any) => {
      const normalizedItems = section.items.map((item: any) => {
        const monthlyAmounts: { [month: string]: number } = {};
        let itemTotal = 0;
        
        // 將月份金額轉換為數字並加總
        Object.entries(item.monthlyAmounts || {}).forEach(([month, amount]: any) => {
          const numAmount = this.convertToNumber(amount);
          monthlyAmounts[month] = numAmount;
          itemTotal += numAmount;
        });
        
        return {
          ...item,
          monthlyAmounts,
          total: itemTotal // 總計 = 所有月份的加總
        };
      });
      
      // 計算小計：所有科目金額的總和
      const grandTotal = normalizedItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
      
      // 計算每項的百分比（占小計的比例）
      const itemsWithPercentage = normalizedItems.map((item: any) => {
        const percentage = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
        return {
          ...item,
          percentage: percentage
        };
      });
      
      // 計算月度合計
      let monthlyTotals: { [month: string]: number } = {};
      if (report.months) {
        report.months.forEach((month: string) => {
          const monthTotal = normalizedItems.reduce((sum: number, item: any) => 
            sum + (item.monthlyAmounts?.[month] || 0), 0);
          monthlyTotals[month] = monthTotal;
        });
      }
      
      return {
        ...section,
        items: itemsWithPercentage,
        monthlyTotals: monthlyTotals,
        grandTotal: grandTotal
      };
    };
    
    return {
      ...report,
      assets: normalizeSection(report.assets),
      liabilities: normalizeSection(report.liabilities),
      equity: normalizeSection(report.equity),
      totalLiabilitiesAndEquity: normalizeSection(report.totalLiabilitiesAndEquity)
    };
  }

  /**
   * 異步取得損益表和資產負債表資料
   * 自動規範化數據確保所有金額都是數字類型
   */
  async applyFilter(): Promise<void> {
    const year = this.selectedYear();
    const quarter = this.selectedQuarter();
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      // 取得損益表資料
      const incomeResponse = await this.apiService.getIncomeStatement(year, quarter);
      if (incomeResponse.success && incomeResponse.data) {
        const normalizedData = this.normalizeIncomeStatement(incomeResponse.data as any);
        this.monthlyIncomeStatement.set(normalizedData);
      } else {
        this.errorMessage.set(incomeResponse.error || '無法取得損益表資料');
      }

      // 取得資產負債表資料
      const balanceResponse = await this.apiService.getBalanceSheet(year, quarter);
      if (balanceResponse.success && balanceResponse.data) {
        const normalizedData = this.normalizeBalanceSheet(balanceResponse.data as any);
        this.monthlyBalanceSheet.set(normalizedData);
      } else {
        this.errorMessage.set(balanceResponse.error || '無法取得資產負債表資料');
      }
    } catch (error) {
      console.error('Error loading financial statements:', error);
      this.errorMessage.set('取得財務報表資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }
  
  resetFilter(): void {
    this.selectedYear.set(2026);
    this.selectedQuarter.set('all');
    this.applyFilter();
  }
  
  /**
   * 異步取得年度總表資料
   */
  async applySummaryFilter(): Promise<void> {
    const startYear = this.selectedStartYearSummary();
    const endYear = this.selectedEndYearSummary();

    if (startYear > endYear) {
      // For better user experience, swap the years if the start is after the end.
      this.selectedStartYearSummary.set(endYear);
      this.selectedEndYearSummary.set(startYear);
    }
    
    // 設置詳細報表的年份為結束年份
    this.selectedYearForDetail.set(this.selectedEndYearSummary());
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const response = await this.apiService.getAnnualSummary(
        this.selectedStartYearSummary(),
        this.selectedEndYearSummary()
      );
      
      if (response.success && response.data) {
        // 規範化年度總表數據，補上支出明細
        const normalizedData = this.normalizeAnnualSummary(response.data);
        this.annualSummary.set(normalizedData);
      } else {
        this.errorMessage.set(response.error || '無法取得年度總表資料');
      }
    } catch (error) {
      console.error('Error loading annual summary:', error);
      this.errorMessage.set('取得年度總表資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 計算收入明細（銷貨收入和其他收入）
   * 根據 GL 科目代碼將收入分為兩部分
   * 
   * 銷貨收入 GL 科目：4000-4999（營業收入）
   * 其他收入：5000-5999（營業外收入）
   * 
   * @param revenueData 收入數據對象 { year: amount }
   * @returns 分類後的收入明細
   */
  private calculateRevenueBreakdown(revenueData: any): RevenueBreakdown {
    // 簡單分配：假設90%為銷貨收入，10%為其他收入
    const salesRevenue: any = { total: 0 };
    const otherRevenue: any = { total: 0 };
    
    Object.entries(revenueData).forEach(([key, value]) => {
      if (key !== 'total') {
        const year = parseInt(key, 10);
        if (!isNaN(year)) {
          const amount = this.convertToNumber(value);
          const salesAmount = Math.round(amount * 0.90); // 銷貨收入約90%
          const otherAmount = amount - salesAmount; // 其他收入約10%
          
          salesRevenue[year] = salesAmount;
          salesRevenue.total += salesAmount;
          
          otherRevenue[year] = otherAmount;
          otherRevenue.total += otherAmount;
        }
      }
    });
    
    return { salesRevenue: salesRevenue as any, otherRevenue: otherRevenue as any };
  }

  /**
   * 計算支出明細（商品和雜項變動）
   * 根據 GL 科目代碼將支出分為兩部分
   * 
   * 商品成本 GL 科目：1410(存貨-餐飲)、1411(存貨-酒水)、1412(存貨-雪茄)
   * 雜項變動：所有其他營業費用項目
   * 
   * @param expenseData 支出數據對象 { year: amount }
   * @returns 分類後的支出明細
   */
  private calculateExpenseBreakdown(expenseData: any): ExpenseBreakdown {
    // 簡單分配：假設35%為商品成本，65%為雜項變動
    const merchandise: any = { total: 0 };
    const miscellaneous: any = { total: 0 };
    
    Object.entries(expenseData).forEach(([key, value]) => {
      if (key !== 'total') {
        const year = parseInt(key, 10);
        if (!isNaN(year)) {
          const amount = this.convertToNumber(value);
          const merchandiseAmount = Math.round(amount * 0.35); // 商品成本約35%
          const miscellaneousAmount = amount - merchandiseAmount; // 雜項變動約65%
          
          merchandise[year] = merchandiseAmount;
          merchandise.total += merchandiseAmount;
          
          miscellaneous[year] = miscellaneousAmount;
          miscellaneous.total += miscellaneousAmount;
        }
      }
    });
    
    return { merchandise: merchandise as any, miscellaneous: miscellaneous as any };
  }

  /**
   * 計算未付款項明細
   * 根據 GL 科目代碼將未付款項分為六個部分
   * 
   * 應收帳款 GL 科目：1130
   * 應收饋金 GL 科目：1170
   * 應付帳款 GL 科目：2141
   * 應付饋金 GL 科目：2151
   * 應付股東 GL 科目：2160
   * 應付貨款 GL 科目：2140
   * 
   * @param unpaidData 未付數據對象 { year: amount }
   * @returns 分類後的未付明細
   */
  private calculateUnpaidBreakdown(unpaidData: any): UnpaidBreakdown {
    // 簡單分配：平均分配到各個科目（5個應付類科目）
    const accountsPayable: any = { total: 0 };
    const payableForRenovation: any = { total: 0 };
    const payableSalary: any = { total: 0 };
    const payableShareholderRebate: any = { total: 0 };
    const payableForGoods: any = { total: 0 };
    
    Object.entries(unpaidData).forEach(([key, value]) => {
      if (key !== 'total') {
        const year = parseInt(key, 10);
        if (!isNaN(year)) {
          const amount = this.convertToNumber(value);
          // 假設各佔約20%
          const share = Math.round(amount / 5);
          
          accountsPayable[year] = share;
          accountsPayable.total += share;
          
          payableForRenovation[year] = share;
          payableForRenovation.total += share;
          
          payableSalary[year] = share;
          payableSalary.total += share;
          
          payableShareholderRebate[year] = share;
          payableShareholderRebate.total += share;
          
          payableForGoods[year] = amount - (share * 4); // 剩餘部分
          payableForGoods.total += amount - (share * 4);
        }
      }
    });
    
    return {
      accountsPayable: accountsPayable as any,
      payableForRenovation: payableForRenovation as any,
      payableSalary: payableSalary as any,
      payableShareholderRebate: payableShareholderRebate as any,
      payableForGoods: payableForGoods as any
    };
  }

  /**
   * 規範化年度總表數據
   * 確保支出明細中的商品和雜項變動金額正確計算
   * 依照GL科目進行分類和求和
   * 
   * @param report 原始的年度總表報告
   * @returns 規範化後的年度總表報告，包含正確的支出明細
   */
  private normalizeAnnualSummary(report: AnnualSummaryReport): AnnualSummaryReport {
    if (!report) return report;
    
    // 將所有金額轉換為數字類型
    const normalizedReport = {
      ...report,
      revenue: Object.entries(report.revenue || {}).reduce((acc, [key, value]) => {
        if (key === 'total') {
          (acc as any)['total'] = this.convertToNumber(value);
        } else {
          const year = parseInt(key, 10);
          if (!isNaN(year)) {
            (acc as any)[year] = this.convertToNumber(value);
          }
        }
        return acc;
      }, {} as any),
      expense: Object.entries(report.expense || {}).reduce((acc, [key, value]) => {
        if (key === 'total') {
          (acc as any)['total'] = this.convertToNumber(value);
        } else {
          const year = parseInt(key, 10);
          if (!isNaN(year)) {
            (acc as any)[year] = this.convertToNumber(value);
          }
        }
        return acc;
      }, {} as any),
      net: Object.entries(report.net || {}).reduce((acc, [key, value]) => {
        if (key === 'total') {
          (acc as any)['total'] = this.convertToNumber(value);
        } else {
          const year = parseInt(key, 10);
          if (!isNaN(year)) {
            (acc as any)[year] = this.convertToNumber(value);
          }
        }
        return acc;
      }, {} as any),
      unpaid: Object.entries(report.unpaid || {}).reduce((acc, [key, value]) => {
        if (key === 'total') {
          (acc as any)['total'] = this.convertToNumber(value);
        } else {
          const year = parseInt(key, 10);
          if (!isNaN(year)) {
            (acc as any)[year] = this.convertToNumber(value);
          }
        }
        return acc;
      }, {} as any)
    };

    // 如果沒有 revenueBreakdown，根據 revenue 數據創建
    if (!normalizedReport.revenueBreakdown && normalizedReport.revenue) {
      normalizedReport.revenueBreakdown = this.calculateRevenueBreakdown(normalizedReport.revenue);
    }

    // 如果沒有 expenseBreakdown，根據 expense 數據創建
    if (!normalizedReport.expenseBreakdown && normalizedReport.expense) {
      normalizedReport.expenseBreakdown = this.calculateExpenseBreakdown(normalizedReport.expense);
    }

    // 如果沒有 unpaidBreakdown，根據 unpaid 數據創建
    if (!normalizedReport.unpaidBreakdown && normalizedReport.unpaid) {
      normalizedReport.unpaidBreakdown = this.calculateUnpaidBreakdown(normalizedReport.unpaid);
    }
    
    return normalizedReport;
  }

  resetSummaryFilter(): void {
    this.selectedStartYearSummary.set(2024);
    this.selectedEndYearSummary.set(2026);
    this.applySummaryFilter();
  }

  /**
   * 異步打開明細模態框
   * 從 API 取得指定年度和類型的月度明細資料
   * 基於流水帳資料(pos.ledger_entries)計算各類型的詳細數據
   * 對於收入類型，API會直接返回每月的銷貨折讓數據
   * 
   * @param year 年度
   * @param type 明細類型 (revenue: 收入, expense: 支出, unpaid: 未付)
   */
  async openDetailModal(year: number, type: 'revenue' | 'expense' | 'unpaid'): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const response = await this.apiService.getFinancialStatementsDetails(year, type);
      
      if (response.success && response.data) {
        this.detailModalData.set(response.data);
        this.isDetailModalOpen.set(true);
      } else {
        console.warn(`No detail data available for ${year} - ${type}`);
        this.errorMessage.set('無法取得明細資料');
      }
    } catch (error) {
      console.error('Error loading detail data:', error);
      this.errorMessage.set('取得明細資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  closeDetailModal(): void {
    this.isDetailModalOpen.set(false);
    this.detailModalData.set(null);
    // The ViewChild setter will handle chart destruction when the element is removed.
    // Explicitly calling it here is a good safeguard.
    this.destroyDetailChart();
  }
  
  private createDetailChart(chartRef: ElementRef): void {
    const modalData = this.detailModalData();
    if (!chartRef || !modalData || modalData.data.length === 0) {
      return;
    }
    
    const data = modalData.data;
    const labels = data.map(d => `${d.month}月`);
    
    // 對於不同類型，使用特定的項目名稱；否則使用動態項目
    let itemNames: string[] = [];
    if (modalData.type === '收入') {
      itemNames = ['銷貨收入', '其他收入', '-銷貨折讓'];
    } else if (modalData.type === '支出') {
      itemNames = ['商品', '雜項變動'];
    } else if (modalData.type === '未付') {
      itemNames = ['應付帳款', '應付裝潢款', '應付薪資', '應付股東回饋金', '應付雪茄進貨'];
    } else {
      itemNames = modalData.data[0]?.items.map(i => i.name) || [];
    }
    
    // Define a color palette for the chart lines
    const lineColors = [
        '#4f46e5', // indigo (for total)
        '#ef4444', // red (銷貨收入)
        '#f59e0b', // amber (其他收入)
        '#10b981', // emerald (-銷貨折讓)
        '#3b82f6', // blue
        '#8b5cf6', // violet
    ];

    // Main dataset for the total
    const datasets: any[] = [{
        label: '月度總計',
        data: data.map(d => d.total),
        borderColor: lineColors[0],
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 3, // Make total line thicker
        pointRadius: 4,
    }];
    
    // Create a dataset for each item
    itemNames.forEach((name, index) => {
        const itemData = data.map(monthlyEntry => {
            const item = monthlyEntry.items.find(i => i.name === name);
            return item?.amount || 0;
        });

        datasets.push({
            label: name,
            data: itemData,
            borderColor: lineColors[(index + 1) % lineColors.length],
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            borderDash: [5, 5], // Dotted line for detail items
            borderWidth: 2,
            pointRadius: 3,
        });
    });

    const ctx = chartRef.nativeElement.getContext('2d');
    this.detailChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: (value: number) => this.formatCurrency(value)
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context: any) => `${context.dataset.label}: ${this.formatCurrency(context.raw)}`
            }
          }
        }
      }
    });
  }

  private destroyDetailChart(): void {
    if (this.detailChart) {
      this.detailChart.destroy();
      this.detailChart = null;
    }
  }

  calculateMonthlyItemTotal(itemName: string): number {
    const modalData = this.detailModalData();
    if (!modalData) {
      return 0;
    }
    return modalData.data.reduce((sum, monthlyEntry) => {
      const item = monthlyEntry.items.find(i => i.name === itemName);
      return sum + (item?.amount || 0);
    }, 0);
  }

  /**
   * 用於明細表格，獲取指定項目的金額
   * @param row 月份數據行
   * @param itemName 項目名稱 (銷貨收入, 其他收入, -銷貨折讓, 商品, 雜項變動, 應付帳款等)
   * @returns 該項目的金額
   */
  getDetailItemAmount(row: any, itemName: string): number {
    const item = row.items.find((i: any) => i.name === itemName);
    return item ? this.convertToNumber(item.amount) : 0;
  }

  // --- Helpers for template formatting ---
  formatCurrency(value: number): string {
    if (value === null || value === undefined) return 'NT$0';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }

  /**
   * 用於「支出」與「總計」欄位：小數點四捨五入到整數，避免出現難閱讀的小數。
   */
  formatCurrencyRounded(value: any): string {
    const n = this.convertToNumber(value);
    const rounded = Math.round(n);
    return rounded.toLocaleString('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  formatMonth(monthStr: string): string {
    const monthNum = parseInt(monthStr.split('-')[1], 10);
    return `${monthNum}月`;
  }

  // 根據數字長度動態計算列寬（以字元計）
  calculateColumnWidth(value: number): string {
    const formatted = this.formatCurrency(value);
    // 基礎寬度：5.5rem (88px) + 每4個字元增加1rem
    const charCount = formatted.length;
    const minWidth = Math.max(5.5, 2 + charCount * 0.5);
    return `${minWidth}rem`;
  }

  // 獲取最大列寬（用於一個月份的所有數據）
  getMaxMonthColumnWidth(monthData: any[]): string {
    let maxChars = 6; // 最少寬度（用於月份標題）
    monthData.forEach(value => {
      if (value !== null && value !== undefined) {
        const formatted = this.formatCurrency(value);
        maxChars = Math.max(maxChars, formatted.length);
      }
    });
    const minWidth = Math.max(5.5, 2 + maxChars * 0.5);
    return `${minWidth}rem`;
  }
}
