import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { PurchaseOrder, Vendor } from '../../models/financial.model';

type View = 'purchaseOrders' | 'vendors';

@Component({
  selector: 'app-purchasing',
  templateUrl: './purchasing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
})
export class PurchasingComponent {
  private dataService = inject(DataService);
  private fb = inject(FormBuilder);

  activeView = signal<View>('purchaseOrders');
  isModalOpen = signal(false);

  // Vendor State
  allVendors = signal<Vendor[]>([]);
  editingVendor = signal<Vendor | null>(null);
  vendorForm = this.fb.group({
    id: [''],
    category: ['', Validators.required],
    name: ['', Validators.required],
    taxId: [''],
    contactInfo: ['', Validators.required],
    restDays: [''],
  });
  // Vendor filter state
  vendorSearchTerm = signal('');
  selectedVendorCategory = signal('');

  // Purchase Order State
  allPOs = signal<PurchaseOrder[]>([]);
  editingPO = signal<PurchaseOrder | null>(null);
  poForm = this.fb.group({
    id: [''],
    poNumber: ['', Validators.required],
    vendorId: ['', Validators.required],
    date: ['', Validators.required],
    items: this.fb.array([]),
    totalAmount: [0],
  });
  // PO filter state
  poSearchTerm = signal('');
  selectedPOVendor = signal('');
  poStartDate = signal('');
  poEndDate = signal('');

  vendorCategories = computed(() => {
    const vendors = this.allVendors();
    // The type `string` is specified in the generic `Set` constructor. This is a fix for a common TypeScript type inference issue.
    const categories = [...new Set<string>(vendors.map(v => v.category))];
    return categories.sort();
  });
  
  filteredVendors = computed(() => {
    const term = this.vendorSearchTerm().toLowerCase();
    const category = this.selectedVendorCategory();
    let vendors = this.allVendors();

    if (category) {
        vendors = vendors.filter(v => v.category === category);
    }

    if (term) {
        vendors = vendors.filter(vendor => 
            vendor.name.toLowerCase().includes(term) ||
            vendor.category.toLowerCase().includes(term) ||
            vendor.contactInfo.toLowerCase().includes(term)
        );
    }
    return vendors;
  });

  filteredPOs = computed(() => {
    const term = this.poSearchTerm().toLowerCase();
    const vendorId = this.selectedPOVendor();
    const startDate = this.poStartDate();
    const endDate = this.poEndDate();
    let pos = this.allPOs();

    if (vendorId) {
        pos = pos.filter(po => po.vendorId === vendorId);
    }

    if (startDate) {
        pos = pos.filter(po => po.date >= startDate);
    }

    if (endDate) {
        pos = pos.filter(po => po.date <= endDate);
    }

    if (term) {
        pos = pos.filter(po => 
            po.poNumber.toLowerCase().includes(term) ||
            this.getVendorName(po.vendorId).toLowerCase().includes(term)
        );
    }
    return pos;
  });

  constructor() {
    this.loadData();
    this.poItems.valueChanges.subscribe(items => {
      const total = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
      this.poForm.get('totalAmount')?.setValue(total, { emitEvent: false });
    });
  }

  loadData(): void {
    this.allVendors.set(this.dataService.getVendors());
    this.allPOs.set(this.dataService.getPurchaseOrders());
  }

  changeView(view: View): void {
    this.activeView.set(view);
  }

  resetVendorFilters(): void {
    this.vendorSearchTerm.set('');
    this.selectedVendorCategory.set('');
  }

  resetPOFilters(): void {
    this.poSearchTerm.set('');
    this.selectedPOVendor.set('');
    this.poStartDate.set('');
    this.poEndDate.set('');
  }

  openModal(item: Vendor | PurchaseOrder | null = null): void {
    if (this.activeView() === 'vendors') {
      this.editingVendor.set(item as Vendor | null);
      this.vendorForm.reset();
      if (item) this.vendorForm.patchValue(item);
    } else {
      this.editingPO.set(item as PurchaseOrder | null);
      this.poForm.reset({ totalAmount: 0 });
      this.poItems.clear();
      if (item) {
        const po = item as PurchaseOrder;
        this.poForm.patchValue(po);
        po.items.forEach(i => this.addItem(i.productName, i.quantity, i.unitPrice));
      }
    }
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingVendor.set(null);
    this.editingPO.set(null);
  }

  // --- Vendor Methods ---
  handleVendorSubmit(): void {
    if (this.vendorForm.invalid) return;
    const formData = this.vendorForm.value;
    const vendorData = {
      category: formData.category,
      name: formData.name,
      taxId: formData.taxId,
      contactInfo: formData.contactInfo,
      restDays: formData.restDays,
    } as Omit<Vendor, 'id'>;

    if (this.editingVendor()) {
      this.dataService.updateVendor({ ...vendorData, id: this.editingVendor()!.id });
    } else {
      this.dataService.addVendor(vendorData);
    }
    this.loadData();
    this.closeModal();
  }

  deleteVendor(vendor: Vendor): void {
    if (confirm(`您確定要刪除廠商 "${vendor.name}" 嗎？此操作無法復原。`)) {
      this.dataService.deleteVendor(vendor.id);
      this.loadData();
    }
  }

  // --- Purchase Order Methods ---
  get poItems(): FormArray {
    return this.poForm.get('items') as FormArray;
  }

  createItem(name = '', qty = 1, price = 0) {
    const itemGroup = this.fb.group({
      productName: [name, Validators.required],
      quantity: [qty, [Validators.required, Validators.min(1)]],
      unitPrice: [price, [Validators.required, Validators.min(0)]],
      total: [qty * price],
    });

    itemGroup.get('quantity')?.valueChanges.subscribe(() => this.updateItemTotal(itemGroup));
    itemGroup.get('unitPrice')?.valueChanges.subscribe(() => this.updateItemTotal(itemGroup));
    
    return itemGroup;
  }

  updateItemTotal(itemGroup: any) {
    const qty = itemGroup.get('quantity')?.value || 0;
    const price = itemGroup.get('unitPrice')?.value || 0;
    itemGroup.get('total')?.setValue(qty * price, { emitEvent: false });
  }

  addItem(name = '', qty = 1, price = 0): void {
    this.poItems.push(this.createItem(name, qty, price));
  }

  removeItem(index: number): void {
    this.poItems.removeAt(index);
  }

  handlePOSubmit(): void {
    if (this.poForm.invalid) return;
    const formData = this.poForm.getRawValue();
    const poData = {
      poNumber: formData.poNumber,
      vendorId: formData.vendorId,
      date: formData.date,
      items: formData.items,
      totalAmount: formData.totalAmount
    } as Omit<PurchaseOrder, 'id'>;

    if (this.editingPO()) {
      this.dataService.updatePurchaseOrder({ ...poData, id: this.editingPO()!.id });
    } else {
      this.dataService.addPurchaseOrder(poData);
    }
    this.loadData();
    this.closeModal();
  }

  deletePurchaseOrder(id: string): void {
    if (confirm('確定要刪除此進貨單嗎？')) {
      this.dataService.deletePurchaseOrder(id);
      this.loadData();
    }
  }

  getVendorName(vendorId: string): string {
    return this.allVendors().find(v => v.id === vendorId)?.name || 'N/A';
  }

  formatCurrency(value: number): string {
    if (value === null || value === undefined) return '';
    return value.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
  }
}