import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { GeminiService } from '../../services/gemini.service';
import type { Customer } from '../../models/financial.model';
import { POSSale, CustomerFeedback } from '../../models/financial.model';

@Component({
  selector: 'app-customer-analysis',
  templateUrl: './customer-analysis.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerAnalysisComponent {
  apiService = inject(ApiService);
  geminiService = inject(GeminiService);
  private route = inject(ActivatedRoute);

  // --- State Signals ---
  /**
   * 所有顧客列表（從 pos.members 表加載）
   */
  customers = signal<Customer[]>([]);
  
  /**
   * 搜尋關鍵字（用於按名稱或電話過濾）
   */
  searchTerm = signal('');
  
  /**
    * 顧客分類篩選 (all, regular, cigar, exCigar, shareholder)
   */
  categoryFilter = signal<string>('all');
  
  /**
   * 當前選中的顧客
   */
  selectedCustomer = signal<Customer | null>(null);
  
  /**
   * 所選顧客的銷售記錄
   */
  customerSales = signal<POSSale[]>([]);
  
  /**
   * 所選顧客的反饋記錄
   */
  customerFeedback = signal<CustomerFeedback[]>([]);
  
  /**
   * 數據加載狀態
   */
  isLoading = signal(false);
  
  /**
   * 錯誤訊息
   */
  errorMessage = signal<string | null>(null);

  // --- Computed Properties ---
  /**
   * 根據搜尋詞和分類過濾顧客列表
   * 支持按名稱或電話號碼搜尋，以及按分類篩選
   */
  filteredCustomers = computed(() => {
    let filtered = this.customers();
    
    // 按分類篩選
    const category = this.categoryFilter();
    if (category !== 'all') {
      filtered = filtered.filter(c => this.getCustomerCategory(c) === category);
    }
    
    // 按搜尋詞篩選
    const term = this.searchTerm().toLowerCase();
    if (term) {
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(term) || 
        c.phone?.includes(term)
      );
    }
    
    return filtered;
  });

  /**
   * 計算顧客統計數據
   * 根據顧客名稱中的關鍵字分類：
   *   - 前雪茄會員：名稱包含「EX雪茄會員」（英文大小寫不敏感）
   *   - 雪茄會員：名稱包含「雪茄」
   *   - 股東：名稱包含「股東」
   *   - 一般顧客：其他
   */
  customerStats = computed(() => {
    const all = this.customers();
    const total = all.length;
    const exCigarCount = all.filter(c => this.getCustomerCategory(c) === 'exCigar').length;
    const cigarCount = all.filter(c => this.getCustomerCategory(c) === 'cigar').length;
    const shareholderCount = all.filter(c => this.getCustomerCategory(c) === 'shareholder').length;
    const regularCount = all.filter(c => this.getCustomerCategory(c) === 'regular').length;
    return { total, exCigarCount, cigarCount, regularCount, shareholderCount };
  });

  constructor() {
    this.route.queryParamMap.subscribe(params => {
      const category = String(params.get('category') || '').trim();
      if (category && ['all', 'regular', 'cigar', 'exCigar', 'shareholder'].includes(category)) {
        this.categoryFilter.set(category);
      }
    });
    this.loadCustomers();
  }

  /**
   * 從後端 API 加載顧客資料
   * 
   * 此方法會從後端的 /api/customers 端點獲取所有顧客數據。
   * 數據來源：pos.members 表格
   * 
   * 欄位對應關係：
   *   - member_uuid → id (顧客唯一識別符)
   *   - name → name (顧客名稱)
   *   - mobile → phone (行動電話)
   *   - gender → gender (性別)
   *   - birth → birthday (生日，MM/DD格式)
   *   - birth_year → birthYear (出生年份)
   *   - loyalty_points → loyaltyPoints (積分點數)
   *   - origin_store_name → originStore (原始門店名稱)
   *   - last_checkout_at → lastCheckoutAt (最後結帳時間，ISO 8601格式)
   *   - is_deleted → isDeleted (是否已刪除)
   * 
   * 錯誤處理：
   *   - API 調用失敗時會設置 errorMessage signal
   *   - console 會輸出詳細的錯誤信息用於調試
   * 
   * @async
   * @returns {Promise<void>}
   */
  async loadCustomers(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      // 調用 API 服務獲取顧客列表
      const response = await this.apiService.getCustomers();
      
      if (response.success && response.data && Array.isArray(response.data)) {
        // 直接使用後端返回的 Customer 對象（已正確映射）
        this.customers.set(response.data as Customer[]);
      } else {
        this.errorMessage.set(response.error || '無法取得顧客資料');
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      this.errorMessage.set('載入顧客資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 選擇顧客並顯示其詳細信息
   * 
   * @param customer 選中的顧客對象
   */
  selectCustomer(customer: Customer): void {
    this.selectedCustomer.set(customer);
    // TODO: 未來可實現獲取該顧客的銷售記錄和反饋
    // const sales = await this.apiService.getCustomerSales(customer.id);
    // this.customerSales.set(sales);
  }

  /**
   * 清除當前選中的顧客及其相關數據
   */
  clearSelection(): void {
    this.selectedCustomer.set(null);
    this.customerSales.set([]);
    this.customerFeedback.set([]);
  }

  /**
   * 執行購物籃分析
   * 
   * TODO: 實現購物籃分析功能，分析顧客購買商品的相關性
   * 需要獲取所有 POS 銷售記錄並使用 Gemini 服務進行 AI 分析
   */
  runBasketAnalysis() {
    // TODO: 實現購物籃分析功能
    // const allSales = await this.apiService.getPOSSales();
    // if (allSales.length > 0) {
    //   this.geminiService.analyzeShoppingBaskets(allSales);
    // }
  }

  /**
   * 根據顧客名稱中的關鍵字判斷分類
   * 
   * @param customer 顧客對象
   * @returns 顧客分類 ('exCigar' | 'cigar' | 'shareholder' | 'regular')
   */
  getCustomerCategory(customer: Customer): string {
    const name = customer.name || '';
    if (/ex雪茄會員/i.test(name)) return 'exCigar';
    if (name.includes('雪茄')) return 'cigar';
    if (name.includes('股東')) return 'shareholder';
    return 'regular';
  }

  /**
   * 移除顧客名稱中的分類關鍵字
   * 
   * @param customer 顧客對象
   * @returns 清理後的名稱
   */
  getCleanCustomerName(customer: Customer): string {
    let name = customer.name || '';
    name = name.replace(/ex雪茄會員\s*/gi, '');
    // 移除「雪茄」和「股東」關鍵字及其後的空格
    name = name.replace(/雪茄\s*/g, '').replace(/股東\s*/g, '');
    return name.trim();
  }

  /**
   * 根據顧客分類返回相應的 CSS 樣式類
   * 
   * @param customer 顧客對象
   * @returns CSS 樣式類字符串
   */
  getCustomerTypeClass(customer: Customer): string {
    const category = this.getCustomerCategory(customer);
    switch (category) {
      case 'exCigar':
        return 'bg-gray-100 text-gray-800';
      case 'cigar':
        return 'bg-purple-100 text-purple-800';
      case 'shareholder':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  }

  /**
   * 根據分類返回顯示文字
   * 
   * @param customer 顧客對象
   * @returns 顧客類型字符串
   */
  getCustomerType(customer: Customer): string {
    const category = this.getCustomerCategory(customer);
    switch (category) {
      case 'exCigar':
        return '前雪茄會員';
      case 'cigar':
        return '雪茄會員';
      case 'shareholder':
        return '股東';
      default:
        return '一般顧客';
    }
  }

  /**
   * 格式化銷售項目為字符串
   * 
   * @param items 銷售項目數組
   * @returns 用逗號分隔的項目名稱字符串
   */
  formatSaleItems(items: { name: string; price: number; quantity: number }[]): string {
    if (!items) return '';
    return items.map(i => i.name).join(', ');
  }
  
  /**
   * 格式化貨幣顯示
   * 將數字轉換為台幣格式，使用千分位分隔符
   * 
   * @param value 要格式化的數值
   * @returns 格式化後的貨幣字符串（例：NT$1,000）
   */
  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }

  /**
   * 生成星級評分的已填充星星數組
   * 
   * @param rating 評分值（0-5）
   * @returns 長度為 rating 的數組，用於模板迴圈顯示星星
   */
  getStars(rating: number): number[] {
    return Array(rating).fill(0);
  }

  /**
   * 生成星級評分的空星星數組
   * 
   * @param rating 評分值（0-5）
   * @returns 長度為 (5 - rating) 的數組，用於模板迴圈顯示空星星
   */
  getEmptyStars(rating: number): number[] {
    return Array(5 - rating).fill(0);
  }
}
