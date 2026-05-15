import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal, computed, Injector, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../services/api.service';
import { DataService } from '../../services/data.service';
import { ProductAnalysis, ProductAnalysisReport, ProductGrossMarginReport, ItemSalesSummary, CategorySalesSummary } from '../../models/financial.model';

declare var Chart: any;

interface SummaryMetrics {
  uniqueProducts: number;
  totalItemsSold: number;
  bestContributor: string;
  totalRevenue: number;
}

interface ChartData {
  name: string;
  value: number;
}

@Component({
  selector: 'app-product-analysis',
  templateUrl: './product-analysis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProductAnalysisComponent implements AfterViewInit {
  private readonly now = new Date();

  private readonly subCategoryToGroup = new Map<string, string>();

  private normalizeType(rawType: unknown): string {
    const value = String(rawType || '').trim().toLowerCase();
    if (!value) return '其他';

    // Already normalized
    if (value === '餐飲' || value === '酒水' || value === '雪茄' || value === '其他') return String(rawType);

    // Common code/name mappings
    if (value.includes('cigar') || value.includes('雪茄')) return '雪茄';
    if (
      value.includes('drink') ||
      value.includes('beverage') ||
      value.includes('alcohol') ||
      value.includes('bar') ||
      value.includes('酒') ||
      value.includes('drinks')
    ) return '酒水';
    if (
      value.includes('food') ||
      value.includes('dining') ||
      value.includes('meal') ||
      value.includes('combo') ||
      value.includes('餐')
    ) return '餐飲';
    if (value.includes('other') || value.includes('misc') || value.includes('其他')) return '其他';

    // Fallback: show as other
    return '其他';
  }

  private getNormalizedType(cat: CategorySalesSummary): string {
    const firstItem: any = (cat.items && cat.items.length > 0) ? cat.items[0] : null;
    // Prefer explicit type; if missing but categoryName looks like cigar, still classify
    const normalized = this.normalizeType(firstItem?.type);
    if (normalized !== '其他') return normalized;
    if (String(cat.categoryName || '').includes('雪茄')) return '雪茄';
    return normalized;
  }

  // 依照截圖的固定分類結構：大類順序 + 子分類順序 + 每類小計
  private readonly analysisCategoryStructure: ReadonlyArray<{ group: string; subCategories: ReadonlyArray<string> }> = [
    { group: '其他', subCategories: ['場地使用費', '活動'] },
    { group: '酒水', subCategories: ['調酒', '紅酒/白酒', '啤酒', '威士忌'] },
    { group: '餐飲', subCategories: ['主食', '炸物', '奶昔', '氣泡飲', '單點', '茶飲', '貝果/可頌', '加購', '咖啡', '甜點', '沙拉', '下午茶套餐'] },
    { group: '雪茄', subCategories: ['雪茄'] },
  ];

  constructor() {
    // 用固定子分類清單反查大類：避免後端 type 缺失時整批被歸到「其他」
    this.analysisCategoryStructure.forEach(({ group, subCategories }) => {
      subCategories.forEach(name => this.subCategoryToGroup.set(name, group));
    });
  }

  private buildStructuredSubCategories(categories: CategorySalesSummary[]): Array<{ group: string; subCategories: string[] }> {
    const groupToNames = new Map<string, Set<string>>();
    categories.forEach(cat => {
      const knownGroup = this.subCategoryToGroup.get(cat.categoryName);
      const group = knownGroup || this.getNormalizedType(cat);
      if (!groupToNames.has(group)) groupToNames.set(group, new Set());
      groupToNames.get(group)!.add(cat.categoryName);
    });

    return this.analysisCategoryStructure.map(({ group, subCategories }) => {
      const fromData = Array.from(groupToNames.get(group) || []);
      const base = [...subCategories];
      const extras = fromData
        .filter(name => !base.includes(name))
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      return { group, subCategories: [...base, ...extras] };
    });
  }

  /**
   * 切換視圖
   */
  changeView(view: 'analysis' | 'margin'): void {
    this.activeView.set(view);

    // 切到毛利頁時，分析頁的 canvas 會被移除，先銷毀避免殘留
    if (view !== 'analysis' && this.monthlyTrendChart) {
      try { this.monthlyTrendChart.destroy(); }
      catch (e) { console.warn('銷毀趨勢圖失敗', e); }
      this.monthlyTrendChart = null;
    }

    if (view === 'margin') {
      void this.applyMarginFilter();
    }
  }

  /**
   * 建立月銷售趨勢圖表（Chart.js line chart）
   */
  private createMonthlyTrendChart(chartRef: ElementRef, chartData: { labels: string[]; datasets: any[] }): any {
    if (!chartRef?.nativeElement) {
      console.error('找不到圖表 DOM 引用');
      return null;
    }

    return new Chart(chartRef.nativeElement, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: { enabled: true },
        },
        scales: {
          x: { display: true, title: { display: true, text: '月份' } },
          y: { display: true, title: { display: true, text: '銷售額' } },
        },
      },
    });
  }

  /**
   * 產生月份區間陣列（YYYY-MM），從起始年/月到結束年/月
   */
  private buildMonthRange(startYear: number, startMonth: number, endYear: number, endMonth: number): string[] {
    const months: string[] = [];
    let y = startYear;
    let m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return months;
  }

  apiService = inject(ApiService);
  dataService = inject(DataService);
  private injector = inject(Injector);

  // --- 圖表元件引用 ---
  @ViewChild('mainCategoryChart') mainCategoryChartRef!: ElementRef;
  @ViewChild('diningChart') diningChartRef!: ElementRef;
  @ViewChild('drinksChart') drinksChartRef!: ElementRef;
  private monthlyTrendChartRef?: ElementRef;
  @ViewChild('monthlyTrendChart')
  set monthlyTrendChartViewChild(ref: ElementRef | undefined) {
    this.monthlyTrendChartRef = ref;

    // canvas 是被 @if 動態產生的；等它真的出現再畫
    if (ref) {
      queueMicrotask(() => this.createMonthlyTrendChartOnly());
    }
  }

  // --- 圖表實例與顏色 ---
  private mainCategoryChart: any;
  private diningChart: any;
  private drinksChart: any;
  private monthlyTrendChart: any;
  private chartInstances: any[] = [];
  
  private colors = {
    main: ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b'],
    sub: ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']
  };

  // --- 畫面狀態 ---
  activeView = signal<'analysis' | 'margin'>('analysis');

  // --- API 分析資料狀態 ---
  productSalesData = signal<CategorySalesSummary[]>([]);
  isLoadingProductSales = signal(false);
  productSalesError = signal<string | null>(null);

  // --- 舊版資料服務狀態 ---
  report = signal<ProductAnalysisReport | null>(null);
  analysisYears = signal<number[]>(Array.from({ length: 4 }, (_, i) => this.now.getFullYear() - i));
  analysisMonths = signal<number[]>(Array.from({length: 12}, (_, i) => i + 1));
  // 預設年度與月份選擇邏輯：每年3月起為新年度
  selectedStartYear = signal<number>(new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  selectedStartMonth = signal<number>(new Date().getMonth() >= 3 ? new Date().getMonth() - 2 : new Date().getMonth() + 10);
  selectedEndYear = signal<number>(new Date().getFullYear());
  selectedEndMonth = signal<number>(new Date().getMonth() + 1);

  // --- Gross Margin State ---
  productGrossMarginReport = signal<ProductGrossMarginReport | null>(null);
  isLoadingMarginData = signal(false);
  marginDataError = signal<string | null>(null);
  marginYears = signal<number[]>(Array.from({ length: 3 }, (_, i) => this.now.getFullYear() - i));
  marginAllMonths = signal<number[]>(Array.from({ length: 12 }, (_, i) => i + 1));
  selectedMarginStartYear = signal<number>(new Date().getFullYear());
  selectedMarginStartMonth = signal<number>(1);
  selectedMarginEndYear = signal<number>(new Date().getFullYear());
  selectedMarginEndMonth = signal<number>(new Date().getMonth() + 1);

  /**
   * 月銷售資料計算與分組
   * 3. 計算每個分類在各月份的銷售金額與數量。
   * 4. 計算小計行（該大類下所有細項之總和）。
   * 5. 計算各項占比：
   * - 占比：該項銷售額 / 總銷售額 * 100%
   * - 子占比：該項銷售額 / 分類小計銷售額 * 100%
   */
  monthlySalesData = computed(() => {
    const categories = this.productSalesData();
    if (!categories || categories.length === 0) {
      return { months: [], data: [] };
    }

    const months = this.buildMonthRange(
      this.selectedStartYear(),
      this.selectedStartMonth(),
      this.selectedEndYear(),
      this.selectedEndMonth()
    );

    if (months.length === 0) {
      console.warn('查無資料，請確認查詢區間');
      return { months: [], data: [] };
    }

    const structured = this.buildStructuredSubCategories(categories);

    // 第二步：計算每個大類在各月份的小計
    const categorySubtotals: Record<string, Record<string, { sales: number; revenue: number }>> = {};
    structured.forEach(({ group, subCategories }) => {
      categorySubtotals[group] = {};
      months.forEach(month => {
        let sales = 0;
        let revenue = 0;
        subCategories.forEach(subCategoryName => {
          const subCategory = categories.find(c => c.categoryName === subCategoryName);
          if (!subCategory) return;
          const monthItems = subCategory.items.filter(item => item.reportMonth === month);
          sales += monthItems.reduce((sum, item) => sum + (item.salesNumber || 0), 0);
          revenue += monthItems.reduce((sum, item) => sum + (item.salesAmount || 0), 0);
        });
        categorySubtotals[group][month] = { sales, revenue };
      });
    });

    // 第三步：組織表格行（子分類行 + 小計）
    const data: any[] = [];
    structured.forEach(({ group, subCategories }) => {
      subCategories.forEach(subCategoryName => {
        const subCategory = categories.find(c => c.categoryName === subCategoryName);
        const monthlyData: any = {};
        months.forEach(month => {
          if (!subCategory) {
            monthlyData[month] = { sales: 0, revenue: 0, rate: 0 };
            return;
          }
          const monthItems = subCategory.items.filter(item => item.reportMonth === month);
          const sales = monthItems.reduce((sum, item) => sum + (item.salesNumber || 0), 0);
          const revenue = monthItems.reduce((sum, item) => sum + (item.salesAmount || 0), 0);
          monthlyData[month] = { sales, revenue, rate: 0 };
        });
        data.push({ category: group, item: subCategoryName, isCategory: false, monthlyData });
      });

      const subtotalMonthlyData: any = {};
      months.forEach(month => {
        const subtotal = categorySubtotals[group][month];
        subtotalMonthlyData[month] = { sales: subtotal.sales, revenue: subtotal.revenue, rate: 0 };
      });
      data.push({ category: group, item: '小計', isSubtotal: true, monthlyData: subtotalMonthlyData });
    });

    // 第四步：計算營業額佔比（每月獨立計算）
    months.forEach(month => {
      const monthTotalRevenue = data
        .filter(row => row.isSubtotal)
        .reduce((sum, row) => sum + (row.monthlyData[month]?.revenue || 0), 0);

      data.forEach(row => {
        if (!row.monthlyData[month]) return;

        if (row.isSubtotal) {
          // 小計佔比：分類小計 / 當月全體分類小計
          row.monthlyData[month].rate = monthTotalRevenue > 0
            ? (row.monthlyData[month].revenue / monthTotalRevenue) * 100
            : 0;
          return;
        }

        if (row.item && row.item !== '小計' && row.item !== '總計') {
          // 品項佔比：品項 / 該分類小計
          const categorySubtotalRevenue = (categorySubtotals[row.category]?.[month]?.revenue || 0);
          row.monthlyData[month].rate = categorySubtotalRevenue > 0
            ? (row.monthlyData[month].revenue / categorySubtotalRevenue) * 100
            : 0;
        }
      });
    });

    // 第五步：計算每列跨月份總營業額與總百分比
    const grandTotalRevenue = data
      .filter(row => row.isSubtotal)
      .reduce((sum, row) => {
        const rowRevenue = months.reduce((monthSum, month) => monthSum + (row.monthlyData[month]?.revenue || 0), 0);
        return sum + rowRevenue;
      }, 0);

    data.forEach(row => {
      const rowTotalRevenue = months.reduce((sum, month) => sum + (row.monthlyData[month]?.revenue || 0), 0);
      row.totalRevenue = rowTotalRevenue;
      row.totalRate = grandTotalRevenue > 0 ? (rowTotalRevenue / grandTotalRevenue) * 100 : 0;
    });

    // 第六步：總計行（所有分類小計的總和）
    const totalMonthlyData: any = {};
    months.forEach(month => {
      const sales = data
        .filter(row => row.isSubtotal)
        .reduce((sum, row) => sum + (row.monthlyData[month]?.sales || 0), 0);
      const revenue = data
        .filter(row => row.isSubtotal)
        .reduce((sum, row) => sum + (row.monthlyData[month]?.revenue || 0), 0);
      totalMonthlyData[month] = { sales, revenue, rate: 100 };
    });

    const totalRevenue = months.reduce((sum, month) => sum + (totalMonthlyData[month]?.revenue || 0), 0);
    data.push({ category: '總計', item: '總計', isTotal: true, monthlyData: totalMonthlyData, totalRevenue, totalRate: 100 });
    return { months, data };
  });

  summaryMetrics = computed<SummaryMetrics>(() => {
    const categories = this.productSalesData();
    if (!categories || categories.length === 0) {
      return { uniqueProducts: 0, totalItemsSold: 0, bestContributor: 'N/A', totalRevenue: 0 };
    }
    const allItems = categories.flatMap(c => c.items);
    const bestItem = allItems.length > 0 ? allItems.sort((a, b) => b.salesAmount - a.salesAmount)[0] : null;
    const totalRevenue = categories.reduce((sum, cat) => sum + cat.salesAmount, 0);
    const totalQuantity = categories.reduce((sum, cat) => sum + cat.salesNumber, 0);
    const uniqueProducts = new Set(allItems.map(item => (item as any).itemUuid || item.itemName)).size;
    return { uniqueProducts, totalItemsSold: totalQuantity, bestContributor: bestItem?.itemName || 'N/A', totalRevenue };
  });

  chartData = computed(() => {
    const categories = this.productSalesData();
    if (!categories || categories.length === 0) {
      return { main: [], dining: [], drinks: [], cigars: [], other: [] };
    }
    const structured = this.buildStructuredSubCategories(categories);

    const main = structured.map(({ group, subCategories }) => {
      const value = subCategories.reduce((sum, subCategoryName) => {
        const subCategory = categories.find(c => c.categoryName === subCategoryName);
        return sum + (subCategory?.salesAmount || 0);
      }, 0);
      return { name: group, value };
    });

    const getProductsForGroup = (groupName: string) => {
      const group = structured.find(g => g.group === groupName);
      if (!group) return [];
      return group.subCategories.map(subCategoryName => {
        const subCategory = categories.find(c => c.categoryName === subCategoryName);
        return { name: subCategoryName, value: subCategory?.salesAmount || 0 };
      });
    };
    return {
      main,
      dining: getProductsForGroup('餐飲'),
      drinks: getProductsForGroup('酒水'),
      cigars: getProductsForGroup('雪茄'),
      other: getProductsForGroup('其他'),
    };
  });

  monthlyTrendChartData = computed(() => {
    const categories = this.productSalesData();
    if (!categories || categories.length === 0) {
      console.warn('警告: 無 productSalesData');
      return { labels: [], datasets: [] };
    }
    const sortedMonths = this.buildMonthRange(this.selectedStartYear(), this.selectedStartMonth(), this.selectedEndYear(), this.selectedEndMonth());
    if (sortedMonths.length === 0) {
      console.warn('警告: sortedMonths 為空');
      return { labels: [], datasets: [] };
    }
    const labels = sortedMonths.map(m => this.formatMonth(m));
    const categoryOrder = ['餐飲', '酒水', '雪茄', '其他'];
    const categoryColors: Record<string, string> = {
      '餐飲': '#3b82f6',
      '酒水': '#8b5cf6',
      '雪茄': '#ef4444',
      '其他': '#10b981',
    };

    const structured = this.buildStructuredSubCategories(categories);
    const datasets = categoryOrder.map(groupName => {
      const group = structured.find(g => g.group === groupName);
      const subCategoryNames = group?.subCategories || [];

      const data = sortedMonths.map(month => {
        return subCategoryNames.reduce((sum, subCategoryName) => {
          const subCategory = categories.find(c => c.categoryName === subCategoryName);
          if (!subCategory) return sum;
          const monthItems = subCategory.items.filter(item => item.reportMonth === month);
          return sum + monthItems.reduce((s, item) => s + (item.salesAmount || 0), 0);
        }, 0);
      });

      const color = categoryColors[groupName] || '#999999';
      return { label: groupName, data, borderColor: color, backgroundColor: `${color}1A`, fill: true, tension: 0.4 };
    });
    return { labels, datasets };
  });

  ngAfterViewInit(): void {
    void this.applyAnalysisFilter();
  }

  async applyAnalysisFilter(): Promise<void> {
    const startMonth = `${this.selectedStartYear()}-${String(this.selectedStartMonth()).padStart(2, '0')}`;
    const endMonth = `${this.selectedEndYear()}-${String(this.selectedEndMonth()).padStart(2, '0')}`;
    if (startMonth > endMonth) {
      this.productSalesError.set('開始月份不可大於結束月份，請重新選擇區間');
      return;
    }
    this.isLoadingProductSales.set(true);
    this.productSalesError.set(null);
    try {
      const response = await this.apiService.getProductSales({ startMonth, endMonth, limit: 10000 });
      if (!response || !response.success) {
        throw new Error(`API 回傳失敗: ${response?.error || '未知錯誤'}`);
      }
      if (response.data && response.data.length > 0) {
        const groupedByCategory = new Map<string, any[]>();
        (response.data as any[]).forEach((item) => {
          const cat = item.categoryName || '未分類';
          if (!groupedByCategory.has(cat)) groupedByCategory.set(cat, []);
          groupedByCategory.get(cat)!.push(item);
        });
        const categoriesFromData: any[] = [];
        groupedByCategory.forEach((items, categoryName) => {
          const salesAmount = items.reduce((sum, item) => sum + Number(item.salesAmount || 0), 0);
          const salesNumber = items.reduce((sum, item) => sum + Number(item.salesNumber || 0), 0);
          const averagePrice = salesNumber > 0 ? salesAmount / salesNumber : 0;
          categoriesFromData.push({
            categoryName,
            categoryUuid: items[0]?.categoryUuid || '',
            reportMonth: items[0]?.reportMonth || '',
            salesAmount,
            salesNumber,
            averagePrice,
            orderRate: 0,
            salesNumberRate: 0,
            salesAmountRate: 0,
            items,
          } as CategorySalesSummary);
        });
        this.productSalesData.set(categoriesFromData);
        // 若 canvas 已存在，立即刷新圖表；否則交給 ViewChild setter 在 canvas 出現時繪製
        if (this.monthlyTrendChartRef?.nativeElement) {
          queueMicrotask(() => this.createMonthlyTrendChartOnly());
        }
      } else {
        this.productSalesError.set('查無資料，請確認查詢條件是否正確');
      }
    } catch (error) {
      console.error('查詢產品銷售資料發生錯誤', error);
      const err = error as any;
      if (err instanceof HttpErrorResponse) {
        const status = err.status;
        const apiMessage = err.error?.error || err.error?.message || err.message;
        this.productSalesError.set(`查詢失敗（HTTP ${status}）\n${apiMessage || '請檢查網路連線或 API 狀態'}`);
      } else {
        this.productSalesError.set((err?.message && String(err.message)) || '查詢失敗，請檢查網路連線或 API 狀態');
      }
    } finally {
      this.isLoadingProductSales.set(false);
    }
  }

  resetAnalysisFilter(): void {
    const now = new Date();
    this.selectedStartYear.set(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
    this.selectedStartMonth.set(now.getMonth() >= 3 ? now.getMonth() - 2 : now.getMonth() + 10);
    this.selectedEndYear.set(now.getFullYear());
    this.selectedEndMonth.set(now.getMonth() + 1);
    void this.applyAnalysisFilter();
  }

  async applyMarginFilter(): Promise<void> {
    const startMonth = `${this.selectedMarginStartYear()}-${String(this.selectedMarginStartMonth()).padStart(2, '0')}`;
    const endMonth = `${this.selectedMarginEndYear()}-${String(this.selectedMarginEndMonth()).padStart(2, '0')}`;
    if (startMonth > endMonth) {
      this.marginDataError.set('開始月份不可大於結束月份');
      return;
    }
    this.isLoadingMarginData.set(true);
    this.marginDataError.set(null);
    this.productGrossMarginReport.set(null);
    try {
      const [salesResponse, purchaseResponse] = await Promise.all([
        this.apiService.getProductSales({ startMonth, endMonth, limit: 10000 }),
        this.apiService.getPurchaseCosts({ startMonth, endMonth })
      ]);
      if (!salesResponse?.success || !purchaseResponse?.success) {
        throw new Error('撈取資料失敗');
      }

      const months = this.buildMonthRange(
        this.selectedMarginStartYear(),
        this.selectedMarginStartMonth(),
        this.selectedMarginEndYear(),
        this.selectedMarginEndMonth()
      );

      const monthToSales = new Map<string, { dining: number; drinks: number; cigars: number; venue: number }>();
      months.forEach(m => monthToSales.set(m, { dining: 0, drinks: 0, cigars: 0, venue: 0 }));

      const toGroupKey = (categoryName: unknown, rawType: unknown): 'dining' | 'drinks' | 'cigars' | 'venue' => {
        const name = String(categoryName || '').trim();
        const knownGroup = this.subCategoryToGroup.get(name);
        const groupZh = knownGroup || this.normalizeType(rawType);
        if (groupZh === '餐飲') return 'dining';
        if (groupZh === '酒水') return 'drinks';
        if (groupZh === '雪茄') return 'cigars';
        return 'venue';
      };

      const salesRows: any[] = Array.isArray(salesResponse?.data) ? salesResponse.data : [];
      salesRows.forEach((row: any) => {
        const month = String(row?.reportMonth || row?.report_month || '').trim();
        if (!month || !monthToSales.has(month)) return;
        const key = toGroupKey(row?.categoryName, row?.type);
        const amount = Number(row?.salesAmount || 0);
        const bucket = monthToSales.get(month)!;
        bucket[key] += Number.isFinite(amount) ? amount : 0;
      });

      const purchaseSummary = purchaseResponse?.data?.summary || {};
      const purchasesDining = Number(purchaseSummary?.dining || 0);
      const purchasesDrinks = Number(purchaseSummary?.drinks || 0);
      const purchasesCigars = Number(purchaseSummary?.cigars || 0);
      const purchasesVenue = Number(purchaseSummary?.venue || 0);

      const totalSalesDining = months.reduce((s, m) => s + (monthToSales.get(m)?.dining || 0), 0);
      const totalSalesDrinks = months.reduce((s, m) => s + (monthToSales.get(m)?.drinks || 0), 0);
      const totalSalesCigars = months.reduce((s, m) => s + (monthToSales.get(m)?.cigars || 0), 0);
      const totalSalesVenue = months.reduce((s, m) => s + (monthToSales.get(m)?.venue || 0), 0);

      const buildSummary = (totalPurchases: number, totalSales: number) => {
        const grossMargin = totalSales - totalPurchases;
        const grossMarginRate = totalSales > 0 ? grossMargin / totalSales : 0;
        return { totalPurchases, totalSales, grossMargin, grossMarginRate };
      };

      const summaryDining = buildSummary(purchasesDining, totalSalesDining);
      const summaryDrinks = buildSummary(purchasesDrinks, totalSalesDrinks);
      const summaryCigars = buildSummary(purchasesCigars, totalSalesCigars);
      const summaryVenue = buildSummary(purchasesVenue, totalSalesVenue);

      const totalPurchases = summaryDining.totalPurchases + summaryDrinks.totalPurchases + summaryCigars.totalPurchases + summaryVenue.totalPurchases;
      const totalSales = summaryDining.totalSales + summaryDrinks.totalSales + summaryCigars.totalSales + summaryVenue.totalSales;
      const summaryTotal = buildSummary(totalPurchases, totalSales);

      const monthlySales = months.map(month => {
        const v = monthToSales.get(month) || { dining: 0, drinks: 0, cigars: 0, venue: 0 };
        const total = v.dining + v.drinks + v.cigars + v.venue;
        return {
          month: month.replace('-', '/'),
          dining: v.dining,
          drinks: v.drinks,
          cigars: v.cigars,
          venue: v.venue,
          total,
        };
      });

      // 若整段期間完全沒有銷售資料，就維持空狀態讓 UI 顯示提示
      if (totalSales === 0 && totalPurchases === 0) {
        this.productGrossMarginReport.set(null);
        return;
      }

      this.productGrossMarginReport.set({
        summary: {
          dining: summaryDining,
          drinks: summaryDrinks,
          cigars: summaryCigars,
          venue: summaryVenue,
          total: summaryTotal,
        },
        monthlySales,
      });
    } catch (error) {
      console.error('讀取毛利資料時發生異常', error);
      this.marginDataError.set('載入失敗，請檢查權限或查詢區間');
    } finally {
      this.isLoadingMarginData.set(false);
    }
  }

  resetMarginFilter(): void {
    this.selectedMarginStartYear.set(new Date().getFullYear());
    this.selectedMarginStartMonth.set(1);
    this.selectedMarginEndYear.set(new Date().getFullYear());
    this.selectedMarginEndMonth.set(new Date().getMonth() + 1);
    void this.applyMarginFilter();
  }

  formatMonth(monthStr: string): string {
    const monthNum = parseInt(monthStr.split('-')[1], 10);
    return `${monthNum}月`;
  }

  private createMonthlyTrendChartOnly(): void {
    const chartData = this.monthlyTrendChartData();
    if (!this.monthlyTrendChartRef?.nativeElement) {
      console.error('找不到圖表 DOM 引用');
      return;
    }
    if (this.monthlyTrendChart) {
      try { this.monthlyTrendChart.destroy(); } 
      catch (e) { console.warn('銷毀舊圖表失敗', e); }
      this.monthlyTrendChart = null;
    }
    if (chartData.labels.length > 0) {
      this.monthlyTrendChart = this.createMonthlyTrendChart(this.monthlyTrendChartRef, chartData);
    } else {
      console.warn('無趨勢圖資料可顯示');
    }
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined) return 'NT$0';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }
}

