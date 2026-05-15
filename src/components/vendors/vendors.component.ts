import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Vendor } from '../../models/financial.model';

@Component({
  selector: 'app-vendors',
  templateUrl: './vendors.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class VendorsComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  isModalOpen = signal(false);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  allVendors = signal<Vendor[]>([]);
  editingVendor = signal<Vendor | null>(null);
  vendorForm = this.fb.group({
    vendor_id: [''],
    category: ['', Validators.required],
    vendor_name: ['', Validators.required],
    tax_id: [''],
    contact_info: [''],
    rest_days: [''],
  });

  vendorSearchTerm = signal('');
  selectedVendorCategory = signal('');
  vendorTaxIdFilter = signal('');

  // Pagination
  pageSize = 20;
  currentPage = signal(1);

  vendorCategories = computed(() => {
    const vendors = this.allVendors();
    const categories = [...new Set<string>(vendors.map(v => v.category))];
    return categories.sort();
  });
  
  filteredVendors = computed(() => {
    const term = this.vendorSearchTerm().toLowerCase();
    const category = this.selectedVendorCategory();
    const taxId = this.vendorTaxIdFilter();
    let vendors = this.allVendors();

    if (category) {
        vendors = vendors.filter(v => v.category === category);
    }

    if (taxId) {
        vendors = vendors.filter(v => {
          const vendorTaxId = v.tax_id || v.taxId || '';
          return vendorTaxId.includes(taxId);
        });
    }

    if (term) {
        vendors = vendors.filter(vendor => 
            (vendor.vendor_name || vendor.name || '').toLowerCase().includes(term) ||
            (vendor.category || '').toLowerCase().includes(term) ||
            (vendor.contact_info || vendor.contactInfo || '').toLowerCase().includes(term)
        );
    }
    return vendors;
  });

  pagedVendors = computed(() => {
    const filtered = this.filteredVendors();
    const start = (this.currentPage() - 1) * this.pageSize;
    return filtered.slice(start, start + this.pageSize);
  });

  totalPages = computed(() => {
    const total = this.filteredVendors().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });

  totalRecords = computed(() => this.filteredVendors().length);

  constructor() {
    this.loadData();
  }

  /**
   * 從 API 異步加載廠商資料
   */
  async loadData(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const response = await this.apiService.getVendors();
      
      if (response.success && response.data) {
        this.allVendors.set(response.data);
      } else {
        this.errorMessage.set(response.error || '無法取得廠商資料');
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
      this.errorMessage.set('取得廠商資料失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  resetVendorFilters(): void {
    this.vendorSearchTerm.set('');
    this.selectedVendorCategory.set('');
    this.vendorTaxIdFilter.set('');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    const totalPages = this.totalPages();
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    if (nextPage !== this.currentPage()) {
      this.currentPage.set(nextPage);
    }
  }

  goToPrevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  onTaxIdInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 8);
    this.vendorTaxIdFilter.set(value);
    input.value = value;
    this.currentPage.set(1);
  }

  openModal(vendor: Vendor | null = null): void {
    this.editingVendor.set(vendor);
    this.vendorForm.reset();
    if (vendor) this.vendorForm.patchValue(vendor as any);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingVendor.set(null);
  }

  /**
   * 異步處理廠商表單提交
   * 新增或更新廠商資料到後端 API
   */
  async handleVendorSubmit(): Promise<void> {
    if (this.vendorForm.invalid) {
      this.errorMessage.set('請填寫所有必填欄位');
      return;
    }
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const formData = this.vendorForm.value;
      const vendorData = {
        vendor_id: formData.vendor_id ? Number(formData.vendor_id) : undefined,
        category: formData.category || '',
        vendor_name: formData.vendor_name || '',
        tax_id: formData.tax_id || undefined,
        contact_info: formData.contact_info || '',
        rest_days: formData.rest_days ? formData.rest_days.split(',').map((s: string) => s.trim()).filter((s: string) => s) : [],
      };

      if (this.editingVendor() && vendorData.vendor_id) {
        // 更新現有廠商
        const response = await this.apiService.updateVendor(vendorData as any);
        
        if (!response.success) {
          this.errorMessage.set(response.error || '更新廠商失敗');
          return;
        }

        // 成功更新後，直接更新前端數據
        const currentVendors = this.allVendors();
        const updatedVendors = currentVendors.map(v => {
          const vendorId = v.vendor_id || v.id;
          if (vendorId == vendorData.vendor_id) {
            // 合併後端返回的數據和表單數據
            return {
              ...v,
              vendor_id: vendorData.vendor_id,
              category: vendorData.category,
              vendor_name: vendorData.vendor_name,
              tax_id: vendorData.tax_id,
              contact_info: vendorData.contact_info,
              rest_days: vendorData.rest_days,
              ...(response.data || {})
            };
          }
          return v;
        });
        
        this.allVendors.set(updatedVendors);
        
        alert('廠商資料已成功更新');
        this.closeModal();
      } else {
        // 新增廠商（實際應該調用 createVendor，但 API 服務目前沒有）
        this.errorMessage.set('新增廠商功能尚未實作');
        console.warn('新增廠商功能需要後端支持');
      }
    } catch (error) {
      console.error('Error submitting vendor:', error);
      this.errorMessage.set('提交廠商資料失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 異步刪除廠商
   */
  async deleteVendor(vendor: Vendor): Promise<void> {
    const vendorName = vendor.vendor_name || vendor.name || '未知廠商';
    
    if (!confirm(`您確定要刪除廠商 "${vendorName}" 嗎？此操作無法復原。`)) {
      return;
    }
    
    const vendorId = vendor.vendor_id || (vendor.id as number);
    if (!vendorId) {
      this.errorMessage.set('廠商 ID 不存在，無法刪除');
      return;
    }
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const response = await this.apiService.deleteVendor(vendorId as number);
      
      if (response.success) {
        await this.loadData();
      } else {
        this.errorMessage.set(response.error || '刪除廠商失敗');
      }
    } catch (error) {
      console.error('Error deleting vendor:', error);
      this.errorMessage.set('刪除廠商失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }
}
