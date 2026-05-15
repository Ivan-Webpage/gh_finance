import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { Vendor, CigarCost, WineCost } from '../../models/financial.model';

type SortDirection = 'asc' | 'desc';
type ProductCostView = 'cigars' | 'wines';

@Component({
  selector: 'app-product-cost',
  templateUrl: './product-cost.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProductCostComponent implements OnInit {
  private dataService = inject(DataService);
  private fb = inject(FormBuilder);

  // --- View State ---
  activeView = signal<ProductCostView>('wines');
  isModalOpen = signal(false);
  isSubmitting = signal(false);
  submitError = signal<string | null>(null);
  Math = Math;

  // --- Data & State ---
  allVendors = signal<Vendor[]>([]);
  
  // Cigars
  allCigarCosts = signal<CigarCost[]>([]);
  editingCigarCost = signal<CigarCost | null>(null);
  
  // Wines
  allWineCosts = signal<WineCost[]>([]);
  editingWineCost = signal<WineCost | null>(null);

  // --- Forms ---
  cigarCostForm = this.fb.group({
    id: [''],
    brand: ['', Validators.required],
    productName: ['', Validators.required],
    size: ['', Validators.required],
    quantityPerBox: [null as number | null, [Validators.required, Validators.min(1)]],
    lishengCost: [null as number | null, [Validators.required, Validators.min(0)]],
    baijiaCost: [null as number | null, [Validators.required, Validators.min(0)]],
    sellingPrice: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  wineCostForm = this.fb.group({
    id: [''],
    vendor: ['', Validators.required],
    productName: ['', Validators.required],
    type: ['', Validators.required],
    cost: [null as number | null, [Validators.required, Validators.min(0)]],
    sellingPrice: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  // --- Cigar State ---
  cigarSearchTerm = signal('');
  cigarSelectedBrand = signal('');
  cigarSortColumn = signal<keyof CigarCost>('brand');
  cigarSortDirection = signal<SortDirection>('asc');
  cigarCurrentPage = signal(1);
  cigarPageSize = 10;

  // --- Wine State ---
  wineSearchTerm = signal('');
  wineSelectedVendor = signal('');
  wineSelectedType = signal('');
  wineSortColumn = signal<keyof WineCost>('vendor');
  wineSortDirection = signal<SortDirection>('asc');
  wineCurrentPage = signal(1);
  winePageSize = 10;

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.allCigarCosts.set(await this.dataService.getCigarCosts());
      this.allWineCosts.set(await this.dataService.getWineCosts());
      this.allVendors.set(this.dataService.getVendors());
    } catch (error) {
      console.error('Error loading product cost data:', error);
      // Fallback to empty data
      this.allCigarCosts.set([]);
      this.allWineCosts.set([]);
      this.allVendors.set(this.dataService.getVendors());
    }
  }

  changeView(view: ProductCostView): void {
    this.activeView.set(view);
  }

  // --- Computed Properties ---
  
  // Cigars
  cigarBrands = computed(() => [...new Set<string>(this.allCigarCosts().map(c => c.brand))].sort());
  filteredCigars = computed(() => this.filterAndSort(this.allCigarCosts(), this.cigarSearchTerm(), { brand: this.cigarSelectedBrand() }, ['productName', 'brand'], this.cigarSortColumn(), this.cigarSortDirection()));
  paginatedCigars = computed(() => this.paginate(this.filteredCigars(), this.cigarCurrentPage(), this.cigarPageSize));
  cigarTotalPages = computed(() => Math.ceil(this.filteredCigars().length / this.cigarPageSize));

  // Wines
  wineVendors = computed(() => [...new Set<string>(this.allWineCosts().map(c => c.vendor))].sort());
  wineTypes = computed(() => [...new Set<string>(this.allWineCosts().map(c => c.type))].sort());
  filteredWines = computed(() => this.filterAndSort(this.allWineCosts(), this.wineSearchTerm(), { vendor: this.wineSelectedVendor(), type: this.wineSelectedType() }, ['productName', 'vendor', 'type'], this.wineSortColumn(), this.wineSortDirection()));
  paginatedWines = computed(() => this.paginate(this.filteredWines(), this.wineCurrentPage(), this.winePageSize));
  wineTotalPages = computed(() => Math.ceil(this.filteredWines().length / this.winePageSize));
  
  // --- Generic Helpers ---

  private filterAndSort<T extends object>(
    data: T[], 
    term: string, 
    filters: Record<string, string>, 
    searchKeys: (keyof T)[],
    sortCol: keyof T | null, 
    sortDir: SortDirection
  ): T[] {
    const lowerTerm = term.toLowerCase();
    
    let filtered = data.filter(item => {
      const matchesFilters = Object.entries(filters).every(([key, value]) => !value || item[key as keyof T] === value);
      if (!matchesFilters) return false;

      if (!lowerTerm) return true;
      return searchKeys.some(key => String(item[key]).toLowerCase().includes(lowerTerm));
    });

    if (sortCol) {
      filtered = [...filtered].sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        if (valA! < valB!) return sortDir === 'asc' ? -1 : 1;
        if (valA! > valB!) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }
  
  private paginate<T>(data: T[], page: number, pageSize: number): T[] {
    const startIndex = (page - 1) * pageSize;
    return data.slice(startIndex, startIndex + pageSize);
  }

  // --- Modal & Form Handling ---

  openModal(item: CigarCost | WineCost | null = null): void {
    this.submitError.set(null);
    const view = this.activeView();
    if (view === 'cigars') {
      this.editingCigarCost.set(item as CigarCost | null);
      this.cigarCostForm.reset();
      if (item) this.cigarCostForm.patchValue(item);
    } else if (view === 'wines') {
      this.editingWineCost.set(item as WineCost | null);
      this.wineCostForm.reset();
      if (item) this.wineCostForm.patchValue(item);
    }
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.submitError.set(null);
    this.isModalOpen.set(false);
  }
  
  async handleFormSubmit(): Promise<void> {
    const view = this.activeView();

    const activeForm = view === 'cigars' ? this.cigarCostForm : this.wineCostForm;
    if (activeForm.invalid) {
      activeForm.markAllAsTouched();
      this.submitError.set('請先完成必填欄位再儲存。');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      if (view === 'cigars') await this.handleCigarSubmit();
      else if (view === 'wines') await this.handleWineSubmit();
      await this.loadData();
      this.closeModal();
    } catch (error) {
      console.error('Form submission error:', error);
      this.submitError.set(error instanceof Error ? error.message : '儲存失敗，請稍後再試。');
    } finally {
      this.isSubmitting.set(false);
    }
  }
  
  private async handleCigarSubmit(): Promise<void> {
    if (this.cigarCostForm.invalid) return;
    const itemData = this.cigarCostForm.value;
    if (this.editingCigarCost()) {
      await this.dataService.updateCigarCost({ ...itemData, id: this.editingCigarCost()!.id } as CigarCost);
    } else {
      await this.dataService.addCigarCost(itemData as Omit<CigarCost, 'id'>);
    }
  }

  private async handleWineSubmit(): Promise<void> {
    if (this.wineCostForm.invalid) return;
    const itemData = this.wineCostForm.value;
    if (this.editingWineCost()) {
      await this.dataService.updateWineCost({ ...itemData, id: this.editingWineCost()!.id } as WineCost);
    } else {
      await this.dataService.addWineCost(itemData as Omit<WineCost, 'id'>);
    }
  }

  deleteItem(id: string): void {
    if (!confirm('您確定要刪除此項商品嗎？此操作無法復原。')) return;

    const view = this.activeView();
    if (view === 'cigars') this.dataService.deleteCigarCost(id);
    else if (view === 'wines') this.dataService.deleteWineCost(id);
    this.loadData();
  }
  
  // --- UI Methods ---

  sortData(column: keyof CigarCost | keyof WineCost): void {
    const view = this.activeView();
    const sortSignal = view === 'cigars' ? this.cigarSortColumn : this.wineSortColumn;
    const directionSignal = view === 'cigars' ? this.cigarSortDirection : this.wineSortDirection;
    
    if (sortSignal() === column) {
      directionSignal.update(dir => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      (sortSignal as any).set(column);
      directionSignal.set('asc');
    }
  }
  
  resetFilters(view: ProductCostView): void {
    if (view === 'cigars') {
      this.cigarSearchTerm.set('');
      this.cigarSelectedBrand.set('');
    } else if (view === 'wines') {
      this.wineSearchTerm.set('');
      this.wineSelectedVendor.set('');
      this.wineSelectedType.set('');
    }
    this.goToPage(1, view);
  }
  
  applyFilters(view: ProductCostView): void {
    this.goToPage(1, view);
  }

  goToPage(page: number, view: ProductCostView): void {
    const pageSignal = view === 'cigars' ? this.cigarCurrentPage : this.wineCurrentPage;
    const totalPages = view === 'cigars' ? this.cigarTotalPages() : this.wineTotalPages();
    if (page >= 1 && page <= totalPages) {
      pageSignal.set(page);
    }
  }
  
  // --- Formatters & Calculators ---
  getVendorName(vendorId: string): string { return this.allVendors().find(v => v.id === vendorId)?.name || 'N/A'; }
  calculateItemCost(price: number, quantity: number): number { return (!price || !quantity) ? 0 : price / quantity; }
  calculateMargin(cost: number, sellingPrice: number): number { return (!cost || !sellingPrice) ? 0 : ((sellingPrice - cost) / sellingPrice) * 100; }
  formatCurrency(value: number): string { return value?.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }) || ''; }
}
