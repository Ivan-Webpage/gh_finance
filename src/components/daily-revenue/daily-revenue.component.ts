import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DailyRevenueReport, MonthlyRevenueResponse, LedgerEntry } from '../../models/financial.model';

declare var Chart: any;

interface DailyReportRow {
  day: number;
  date: string;
  isDayOff: boolean;
  totalDailyRevenue: number;
  dailyAchievementRate: number;
  cancelledInvoiceCount: number;
  shortAmount: number;
  recordCount: number;
}

/**
 * 從分類帳導入的當前月份詳細交易明細
 * 表示單筆營業收入入帳記錄
 */
interface LedgerDetailRow {
  transactionDate: string;
  description: string;
  subjectName: string;
  debitAmount: number;
  creditAmount: number;
  glAccountName: string;
}

/**
 * 月度營收目標（從資料庫載入）
 */
interface MonthlyTargetData {
  targetId: number;
  targetMonth: string;
  monthlyRevenueTarget: number;
  eventRevenueTarget: number;
  totalTarget: number;
  dailyAvgTarget: number;
  remark?: string;
}

@Component({
  selector: 'app-daily-revenue',
  templateUrl: './daily-revenue.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyRevenueComponent {
  private apiService = inject(ApiService);
  private router = inject(Router);

  private parseLocalDate(dateString: string): Date | null {
    if (!dateString) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  private isMonday(dateString: string): boolean {
    const date = this.parseLocalDate(dateString);
    if (!date) return false;
    return date.getDay() === 1;
  }

  private normalizeLedgerText(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
      const bytes = new Uint8Array(Array.from(raw).map(char => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
      if (/[\u4e00-\u9fff]/.test(decoded)) {
        return decoded;
      }
    } catch {
      // noop
    }

    return raw;
  }

  private isSalesIncomeSubject(subject: string): boolean {
    const normalizedSubject = this.normalizeLedgerText(subject);
    return normalizedSubject === '銷貨收入';
  }

  // --- 每月目標數據 (來自資料庫) ---
  private monthlyTargetData = signal<MonthlyTargetData | null>(null);

  // --- 靜態目標 (備援用，當資料庫無資料時使用) ---
  private monthlyRevenueTarget = 280000;

  // --- 篩選狀態 ---
  availableYears = signal<number[]>([2024, 2025, 2026]);
  availableMonths = signal<number[]>(Array.from({ length: 12 }, (_, i) => i + 1));
  selectedYear = signal<number>(new Date().getFullYear());
  selectedMonth = signal<number>(new Date().getMonth() + 1);
  
  // --- 數據狀態 ---
  private monthlyData = signal<MonthlyRevenueResponse | null>(null);
  
  /** 從分類帳載入的當前月份交易明細 */
  ledgerDetails = signal<LedgerDetailRow[]>([]);
  
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  
  // --- 圖表狀態 ---
  private dailyChart: any;
  @ViewChild('dailyRevenueChart') set dailyRevenueChartRef(el: ElementRef | undefined) {
    this.destroyChart();
    // 當元素存在且有圖表數據時才初始化，此處排除 ledgerDetails 的依賴，因為圖表數據已整合分類帳
    if (el && this.chartData().length > 0) {
      this.createChart(el);
    }
  }

  // --- 報表數據計算 ---
  reportData = computed<DailyReportRow[]>(() => {
    const data = this.monthlyData();
    if (!data) return [];
    
    const targetData = this.monthlyTargetData();
    const monthlyRevenueTarget = targetData?.monthlyRevenueTarget || this.monthlyRevenueTarget;
    
    const workingDays = data.dailyReports.filter(d => d.totalRevenue > 0).length;
    const dailyAverageTarget = workingDays > 0 ? monthlyRevenueTarget / workingDays : 0;

    return data.dailyReports.map(d => ({
      day: d.day,
      date: d.date,
      isDayOff: d.totalRevenue === 0 && d.recordCount === 0,
      totalDailyRevenue: d.totalRevenue,
      dailyAchievementRate: dailyAverageTarget > 0 ? (d.totalRevenue / dailyAverageTarget) * 100 : 0,
      cancelledInvoiceCount: d.cancelledInvoiceCount,
      shortAmount: d.shortAmount,
      recordCount: d.recordCount,
    }));
  });

  /**
   * 從分類帳資料計算每日營收
   * 將 ledgerDetails 依日期分組，計算每日營業收入總合
   */
  dailyRevenueFromLedger = computed<Map<string, number>>(() => {
    const ledger = this.ledgerDetails();
    const revenueMap = new Map<string, number>();

    ledger.forEach((entry) => {
      let dateStr = entry.transactionDate;
      if (!dateStr) return;
      
      // 確保日期格式為 yyyy-MM-dd
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } else {
          console.warn('無效的交易日期:', entry.transactionDate);
          return;
        }
      }
      
      // 判斷金額欄位（優先取借方 DebitAmount，若無則取貸方 CreditAmount）
      const amount = Number(entry.debitAmount) > 0 ? Number(entry.debitAmount) : Number(entry.creditAmount);
      const currentAmount = revenueMap.get(dateStr) || 0;
      revenueMap.set(dateStr, currentAmount + amount);
    });

    return revenueMap;
  });

  /**
   * 計算圖表數據（以分類帳為準）
   */
  chartData = computed<DailyReportRow[]>(() => {
    const revenueMap = this.dailyRevenueFromLedger();
    const year = this.selectedYear();
    const month = this.selectedMonth();
    
    const targetData = this.monthlyTargetData();
    const monthlyRevenueTarget = targetData?.monthlyRevenueTarget || this.monthlyRevenueTarget;
    const lastDay = new Date(year, month, 0).getDate();
    
    const workingDays = Array.from(revenueMap.values()).filter(v => v > 0).length;
    const dailyAverageTarget = workingDays > 0 ? monthlyRevenueTarget / workingDays : 0;
    
    const chartRows: DailyReportRow[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const totalRevenue = revenueMap.get(dateStr) || 0;
      
      chartRows.push({
        day: day,
        date: dateStr,
        isDayOff: totalRevenue === 0,
        totalDailyRevenue: totalRevenue,
        dailyAchievementRate: dailyAverageTarget > 0 ? (totalRevenue / dailyAverageTarget) * 100 : 0,
        cancelledInvoiceCount: 0,
        shortAmount: 0,
        recordCount: totalRevenue > 0 ? 1 : 0,
      });
    }
    return chartRows;
  });

  // --- 摘要指標 ---
  summary = computed(() => {
    const data = this.chartData();
    const targetData = this.monthlyTargetData();
    const ledgerData = this.ledgerDetails();
    
    const monthlyRevenueTarget = targetData?.monthlyRevenueTarget || this.monthlyRevenueTarget;
    const dailyAverageTarget = targetData?.dailyAvgTarget || 0;
    
    // 本月累計營收 = 分類帳明細中所有入帳金額總和
    const cumulativeMonthlyRevenue = ledgerData.reduce((sum, entry) => {
      const amount = Number(entry.debitAmount) > 0 ? Number(entry.debitAmount) : Number(entry.creditAmount);
      return sum + amount;
    }, 0);
    
    const targetDeficit = cumulativeMonthlyRevenue - monthlyRevenueTarget;
    const monthlyTargetAchievementRate = monthlyRevenueTarget > 0 ? (cumulativeMonthlyRevenue / monthlyRevenueTarget) * 100 : 0;

    return {
      monthlyRevenueTarget: monthlyRevenueTarget,
      dailyAverageTarget: dailyAverageTarget,
      targetDeficit,
      cumulativeMonthlyRevenue,
      monthlyTargetAchievementRate,
      totalCancelledInvoices: data.reduce((sum, day) => sum + day.cancelledInvoiceCount, 0),
      totalShortAmount: data.reduce((sum, day) => sum + day.shortAmount, 0),
    };
  });

  constructor() {
    this.loadData();
  }

  /**
   * 載入當前月份的所有數據
   */
  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const year = this.selectedYear();
      const month = this.selectedMonth();

      const yearStr = String(year);
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${yearStr}-${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      
      const [monthlyRevenueData, monthlyTargetsResponse, ledgerResponse] = await Promise.all([
        this.apiService.getMonthlyRevenue(year, month),
        this.apiService.getMonthlyTargets({
          startMonth: `${yearStr}-${monthStr}`,
          endMonth: `${yearStr}-${monthStr}`
        }),
        this.apiService.getLedgerEntries({
          startDate: startDate,
          endDate: endDate,
          subjectNameExact: '銷貨收入',
          sortBy: 'entry_date',
          sortOrder: 'asc',
        })
      ]);

      this.monthlyData.set(monthlyRevenueData);

      if (monthlyTargetsResponse.success && monthlyTargetsResponse.data?.length > 0) {
        this.monthlyTargetData.set(monthlyTargetsResponse.data[0]);
      } else {
        console.warn('查無本月營收目標設定，使用系統預設值');
        this.monthlyTargetData.set(null);
      }

      if (ledgerResponse.success && ledgerResponse.data) {
        const revenueEntries = ledgerResponse.data.filter(entry =>
          this.isSalesIncomeSubject(entry.subject_name || '')
        );
        this.ledgerDetails.set(revenueEntries.map(entry => ({
          transactionDate: entry.entry_date || '',
          description: entry.description || '',
          subjectName: this.normalizeLedgerText(entry.subject_name || ''),
          debitAmount: entry.amount && entry.amount > 0 ? entry.amount : 0,
          creditAmount: entry.amount && entry.amount < 0 ? Math.abs(entry.amount) : 0,
          glAccountName: this.normalizeLedgerText(entry.account_name || ''),
        })));
      } else {
        this.ledgerDetails.set([]);
      }
    } catch (error) {
      console.error('載入每日營收數據時發生異常:', error);
      const errorMsg = error instanceof Error ? error.message : '載入營收數據失敗，請稍後再試';
      this.errorMessage.set(errorMsg);
    } finally {
      this.isLoading.set(false);
    }
  }

  applyFilter(): void {
    this.loadData();
  }

  resetFilter(): void {
    this.selectedYear.set(new Date().getFullYear());
    this.selectedMonth.set(new Date().getMonth() + 1);
    this.loadData();
  }

  navigateToDetail(date: string): void {
    this.router.navigate(['/daily-revenue', date]);
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  formatAmount(value: number): string {
    if (value === null || value === undefined) return '';
    const integerValue = Math.trunc(Number(value) || 0);
    return integerValue.toLocaleString('zh-TW', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  private getWeekdayChar(dayOfWeek: number): string {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return weekdays[dayOfWeek % 7];
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    let dateObj: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number);
      dateObj = new Date(year, month - 1, day);
    } else {
      dateObj = new Date(dateString);
    }
    if (isNaN(dateObj.getTime())) return dateString;
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekdayChar = this.getWeekdayChar(dateObj.getDay());
    return `${year}-${month}-${day}(${weekdayChar})`;
  }

  isClosedDay(dateString: string, hasAmount: boolean): boolean {
    if (hasAmount) return false; // 有營收記錄則不視為公休日
    if (!dateString) return false;
    // 判斷是否為週一（通常為公休日）
    return this.isMonday(dateString);
  }

  private createChart(chartRef: ElementRef): void {
    const data = this.chartData();
    const summary = this.summary();
    const labels = data.map(d => d.day);
    const revenueData = data.map(d => d.totalDailyRevenue);

    const normalPointColor = '#4f46e5';
    const mondayPointColor = '#dc2626';
    const pointColors = data.map(d => (this.isMonday(d.date) ? mondayPointColor : normalPointColor));

    const datasets = [
      {
        label: '每日營收',
        data: revenueData,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
      },
      {
        label: '每日平均目標',
        data: data.map(() => summary.dailyAverageTarget),
        borderColor: '#f97316',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      }
    ];

    const ctx = chartRef.nativeElement.getContext('2d');
    this.dailyChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { callback: (val: number) => this.formatCurrency(val) } },
          x: { title: { display: true, text: '日期' } }
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

  private destroyChart(): void {
    if (this.dailyChart) {
      this.dailyChart.destroy();
      this.dailyChart = null;
    }
  }
}