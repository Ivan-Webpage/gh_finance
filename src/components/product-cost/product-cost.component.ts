import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { ApiService } from '../../services/api.service';
import {
  Vendor, CigarCost, WineCost,
  Ingredient, Recipe, RecipeItem, RecipeComponentType, RecipeType, RecipeTopLevelCategory,
  ItemCostLink, ItemCostLinkProductType,
} from '../../models/financial.model';

type SortDirection = 'asc' | 'desc';
type ProductCostView = 'cigars' | 'wines' | 'ingredients' | 'recipes' | 'itemCostLinks';

interface IngredientFormState {
  id: string | null;
  vendor_id: number | null;
  ingredient_name: string;
  purchase_qty: number | null;
  purchase_unit: string;
  price: number | null;
  cost_unit: string;
  count_unit: string;
  is_active: boolean;
  remark: string;
}

function emptyIngredientForm(): IngredientFormState {
  return {
    id: null,
    vendor_id: null,
    ingredient_name: '',
    purchase_qty: null,
    purchase_unit: '',
    price: null,
    cost_unit: '',
    count_unit: '',
    is_active: true,
    remark: '',
  };
}

interface RecipeItemFormState {
  component_type: RecipeComponentType;
  component_id: number | null;
  quantity: number | null;
  unit: string;
}

interface RecipeFormState {
  id: string | null;
  name: string;
  menu_category: string;
  recipe_type: RecipeType;
  top_level_category: RecipeTopLevelCategory | '';
  yield_quantity: number | null;
  yield_unit: string;
  selling_price: number | null;
  is_active: boolean;
  remark: string;
  items: RecipeItemFormState[];
}

function emptyRecipeForm(): RecipeFormState {
  return {
    id: null,
    name: '',
    menu_category: '',
    recipe_type: 'dish',
    top_level_category: '',
    yield_quantity: 1,
    yield_unit: '',
    selling_price: null,
    is_active: true,
    remark: '',
    items: [],
  };
}

interface ItemCostLinkFormState {
  item_uuid: string;
  product_type: ItemCostLinkProductType | '';
  product_id: number | null;
  unit_divisor: number | null;
}

@Component({
  selector: 'app-product-cost',
  templateUrl: './product-cost.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProductCostComponent implements OnInit {
  private dataService = inject(DataService);
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  // --- View State ---
  activeView = signal<ProductCostView>('wines');
  isModalOpen = signal(false);
  isSubmitting = signal(false);
  submitError = signal<string | null>(null);
  Math = Math;

  // --- Data & State ---
  allVendors = signal<Vendor[]>([]);
  sortedVendors = computed(() => [...this.allVendors()].sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || '', 'zh-Hant')));

  // --- 廠商快速新增（酒水/食材表單下拉選單找不到廠商時使用） ---
  isVendorQuickAddOpen = signal(false);
  vendorQuickAddTarget = signal<'wine' | 'ingredient' | null>(null);
  vendorQuickAddName = signal('');
  vendorQuickAddCategory = signal('');
  vendorQuickAddError = signal<string | null>(null);
  vendorQuickAddSaving = signal(false);
  vendorCategoryOptions = computed(() => [...new Set(this.allVendors().map(v => v.category).filter((c): c is string => !!c))].sort());

  // Cigars
  allCigarCosts = signal<CigarCost[]>([]);
  editingCigarCost = signal<CigarCost | null>(null);

  // Wines
  allWineCosts = signal<WineCost[]>([]);
  editingWineCost = signal<WineCost | null>(null);

  // --- 食材 (Ingredients) ---
  allIngredients = signal<Ingredient[]>([]);
  ingredientSearchTerm = signal('');
  ingredientVendorFilter = signal('');
  ingredientPage = signal(1);
  ingredientPageSize = 10;
  isIngredientModalOpen = signal(false);
  ingredientForm = signal<IngredientFormState>(emptyIngredientForm());
  ingredientError = signal<string | null>(null);
  ingredientSaving = signal(false);

  ingredientVendors = computed(() => [...new Set(this.allIngredients().map(i => i.vendor).filter(Boolean))].sort());

  filteredIngredients = computed(() => {
    const term = this.ingredientSearchTerm().toLowerCase();
    const vendor = this.ingredientVendorFilter();
    let all = this.allIngredients();
    if (vendor) all = all.filter(i => i.vendor === vendor);
    if (term) {
      all = all.filter(i =>
        i.ingredientName.toLowerCase().includes(term) ||
        (i.vendor || '').toLowerCase().includes(term)
      );
    }
    return all;
  });

  ingredientTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredIngredients().length / this.ingredientPageSize)));
  pagedIngredients = computed(() => {
    const start = (this.ingredientPage() - 1) * this.ingredientPageSize;
    return this.filteredIngredients().slice(start, start + this.ingredientPageSize);
  });

  resetIngredientFilters(): void {
    this.ingredientSearchTerm.set('');
    this.ingredientVendorFilter.set('');
    this.ingredientPage.set(1);
  }

  // --- 食譜 (Recipes) ---
  allRecipes = signal<Recipe[]>([]);
  recipeSearchTerm = signal('');
  recipeTypeFilter = signal<'' | 'dish' | 'sub_recipe'>('');
  recipePage = signal(1);
  recipePageSize = 10;
  isRecipeModalOpen = signal(false);
  recipeForm = signal<RecipeFormState>(emptyRecipeForm());
  recipeError = signal<string | null>(null);
  recipeSaving = signal(false);

  filteredRecipes = computed(() => {
    const term = this.recipeSearchTerm().toLowerCase();
    const type = this.recipeTypeFilter();
    let all = this.allRecipes();
    if (type) all = all.filter(r => r.recipeType === type);
    if (term) all = all.filter(r => r.name.toLowerCase().includes(term) || (r.menuCategory || '').toLowerCase().includes(term));
    return all;
  });

  recipeTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredRecipes().length / this.recipePageSize)));
  pagedRecipes = computed(() => {
    const start = (this.recipePage() - 1) * this.recipePageSize;
    return this.filteredRecipes().slice(start, start + this.recipePageSize);
  });

  resetRecipeFilters(): void {
    this.recipeSearchTerm.set('');
    this.recipeTypeFilter.set('');
    this.recipePage.set(1);
  }

  // 食譜細項可選的「子配方」清單：任何食譜皆可當子配方，不限 recipe_type
  recipeComponentOptions = computed(() => this.allRecipes());

  // --- iChef 品項對應 (Item Cost Links) ---
  allItemCostLinks = signal<ItemCostLink[]>([]);
  itemCostLinkSearchTerm = signal('');
  itemCostLinkStatusFilter = signal<'' | 'unmapped' | 'mapped'>('');
  itemCostLinkHideDeletedInIchef = signal(true);
  itemCostLinkPage = signal(1);
  itemCostLinkPageSize = 15;
  isItemCostLinkModalOpen = signal(false);
  itemCostLinkForm = signal<ItemCostLinkFormState>({ item_uuid: '', product_type: '', product_id: null, unit_divisor: 1 });
  itemCostLinkError = signal<string | null>(null);
  itemCostLinkSaving = signal(false);
  editingItemCostLinkName = signal('');

  unmappedItemCostLinkCount = computed(() => this.allItemCostLinks().filter(l => !l.mappedProductName).length);

  deletedInIchefCount = computed(() => this.allItemCostLinks().filter(l => l.isActiveInIchef === false).length);

  filteredItemCostLinks = computed(() => {
    const term = this.itemCostLinkSearchTerm().toLowerCase();
    const status = this.itemCostLinkStatusFilter();
    let all = this.allItemCostLinks();
    if (this.itemCostLinkHideDeletedInIchef()) all = all.filter(l => l.isActiveInIchef !== false);
    if (status === 'unmapped') all = all.filter(l => !l.mappedProductName);
    if (status === 'mapped') all = all.filter(l => !!l.mappedProductName);
    if (term) {
      all = all.filter(l =>
        l.itemName.toLowerCase().includes(term) ||
        (l.categoryName || '').toLowerCase().includes(term) ||
        (l.mappedProductName || '').toLowerCase().includes(term)
      );
    }
    return all;
  });

  itemCostLinkTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredItemCostLinks().length / this.itemCostLinkPageSize)));
  pagedItemCostLinks = computed(() => {
    const start = (this.itemCostLinkPage() - 1) * this.itemCostLinkPageSize;
    return this.filteredItemCostLinks().slice(start, start + this.itemCostLinkPageSize);
  });

  resetItemCostLinkFilters(): void {
    this.itemCostLinkSearchTerm.set('');
    this.itemCostLinkStatusFilter.set('');
    this.itemCostLinkHideDeletedInIchef.set(true);
    this.itemCostLinkPage.set(1);
  }

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
    vendor_id: [null as number | null, Validators.required],
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
    await this.loadVendors();

    try {
      this.allCigarCosts.set(await this.dataService.getCigarCosts());
      this.allWineCosts.set(await this.dataService.getWineCosts());
    } catch (error) {
      console.error('Error loading product cost data:', error);
      // Fallback to empty data
      this.allCigarCosts.set([]);
      this.allWineCosts.set([]);
    }

    await Promise.all([
      this.loadIngredients(),
      this.loadRecipes(),
      this.loadItemCostLinks(),
    ]);
  }

  async loadVendors(): Promise<void> {
    try {
      const response = await this.apiService.getVendors();
      if (response.success && response.data) {
        this.allVendors.set(response.data);
      }
    } catch (error) {
      console.error('Error loading vendors:', error);
    }
  }

  vendorIdOf(vendor: Vendor): number | null {
    return vendor.vendor_id !== undefined && vendor.vendor_id !== null ? Number(vendor.vendor_id) : null;
  }

  // ========== 廠商快速新增 ==========

  openVendorQuickAdd(target: 'wine' | 'ingredient'): void {
    this.vendorQuickAddTarget.set(target);
    this.vendorQuickAddName.set('');
    this.vendorQuickAddCategory.set('');
    this.vendorQuickAddError.set(null);
    this.isVendorQuickAddOpen.set(true);
  }

  closeVendorQuickAdd(): void {
    this.isVendorQuickAddOpen.set(false);
  }

  async submitVendorQuickAdd(): Promise<void> {
    const name = this.vendorQuickAddName().trim();
    const category = this.vendorQuickAddCategory().trim();
    if (!name || !category) {
      this.vendorQuickAddError.set('請輸入廠商名稱與類別');
      return;
    }

    this.vendorQuickAddSaving.set(true);
    this.vendorQuickAddError.set(null);

    try {
      const response = await this.apiService.createVendor({ vendor_name: name, category });
      if (!response.success || !response.data) {
        this.vendorQuickAddError.set(response.error || '新增廠商失敗');
        return;
      }

      await this.loadVendors();
      const newVendorId = this.vendorIdOf(response.data);
      const target = this.vendorQuickAddTarget();
      if (target === 'wine') {
        this.wineCostForm.patchValue({ vendor_id: newVendorId });
      } else if (target === 'ingredient') {
        this.updateIngredientFormField('vendor_id', newVendorId);
      }
      this.isVendorQuickAddOpen.set(false);
    } catch (error) {
      console.error('Error creating vendor:', error);
      this.vendorQuickAddError.set('新增廠商失敗，請稍後再試');
    } finally {
      this.vendorQuickAddSaving.set(false);
    }
  }

  changeView(view: ProductCostView): void {
    this.activeView.set(view);
  }

  goToIngredientPage(page: number): void {
    this.ingredientPage.set(Math.min(Math.max(page, 1), this.ingredientTotalPages()));
  }

  goToRecipePage(page: number): void {
    this.recipePage.set(Math.min(Math.max(page, 1), this.recipeTotalPages()));
  }

  goToItemCostLinkPage(page: number): void {
    this.itemCostLinkPage.set(Math.min(Math.max(page, 1), this.itemCostLinkTotalPages()));
  }

  // ========== 食材 (Ingredients) ==========

  async loadIngredients(): Promise<void> {
    try {
      const response = await this.apiService.getIngredients();
      if (response.success && response.data) {
        this.allIngredients.set(response.data);
      } else {
        this.ingredientError.set(response.error || '讀取食材名稱失敗');
      }
    } catch (error) {
      console.error('Error loading ingredients:', error);
      this.ingredientError.set('讀取食材名稱失敗');
    }
  }

  openIngredientModal(ingredient: Ingredient | null = null): void {
    this.ingredientError.set(null);
    if (ingredient) {
      this.ingredientForm.set({
        id: ingredient.id,
        vendor_id: ingredient.vendorId,
        ingredient_name: ingredient.ingredientName,
        purchase_qty: ingredient.purchaseQty,
        purchase_unit: ingredient.purchaseUnit || '',
        price: ingredient.price,
        cost_unit: ingredient.costUnit || '',
        count_unit: ingredient.countUnit || '',
        is_active: ingredient.isActive,
        remark: ingredient.remark || '',
      });
    } else {
      this.ingredientForm.set(emptyIngredientForm());
    }
    this.isIngredientModalOpen.set(true);
  }

  closeIngredientModal(): void {
    this.isIngredientModalOpen.set(false);
  }

  updateIngredientFormField<K extends keyof IngredientFormState>(field: K, value: IngredientFormState[K]): void {
    this.ingredientForm.update(f => ({ ...f, [field]: value }));
  }

  async submitIngredient(): Promise<void> {
    const form = this.ingredientForm();
    if (!form.ingredient_name.trim() || !form.purchase_qty || form.price === null) {
      this.ingredientError.set('請先確認必填欄位已正確填寫');
      return;
    }
    if (form.purchase_qty <= 0) {
      this.ingredientError.set('數量不可為 0 或負數');
      return;
    }

    this.ingredientSaving.set(true);
    this.ingredientError.set(null);

    try {
      const selectedVendor = form.vendor_id !== null ? this.allVendors().find(v => this.vendorIdOf(v) === form.vendor_id) : null;
      const payload = {
        vendor_id: form.vendor_id,
        vendor_name_snapshot: selectedVendor?.vendor_name || null,
        ingredient_name: form.ingredient_name.trim(),
        purchase_qty: Number(form.purchase_qty),
        purchase_unit: form.purchase_unit.trim() || null,
        price: Number(form.price),
        cost_unit: form.cost_unit.trim() || null,
        count_unit: form.count_unit.trim() || null,
        is_active: form.is_active,
        remark: form.remark.trim() || null,
      };

      const response = form.id
        ? await this.apiService.updateIngredient({ ...payload, id: form.id })
        : await this.apiService.createIngredient(payload);

      if (response.success) {
        this.closeIngredientModal();
        await this.loadIngredients();
      } else {
        this.ingredientError.set(response.error || (form.id ? '更新食材失敗' : '新增食材失敗'));
      }
    } catch (error) {
      console.error('Error saving ingredient:', error);
      this.ingredientError.set(form.id ? '更新食材失敗' : '新增食材失敗');
    } finally {
      this.ingredientSaving.set(false);
    }
  }

  async deleteIngredientItem(ingredient: Ingredient): Promise<void> {
    if (!confirm(`確定要刪除食材「${ingredient.ingredientName}」嗎？`)) return;

    try {
      const response = await this.apiService.deleteIngredient(ingredient.id);
      if (response.success) {
        await this.loadIngredients();
      } else {
        this.ingredientError.set(response.error || '刪除食材失敗');
      }
    } catch (error) {
      console.error('Error deleting ingredient:', error);
      this.ingredientError.set('刪除食材失敗');
    }
  }

  // ========== 食譜 (Recipes) ==========

  async loadRecipes(): Promise<void> {
    try {
      const response = await this.apiService.getRecipes();
      if (response.success && response.data) {
        this.allRecipes.set(response.data);
      } else {
        this.recipeError.set(response.error || '讀取食譜失敗');
      }
    } catch (error) {
      console.error('Error loading recipes:', error);
      this.recipeError.set('讀取食譜失敗');
    }
  }

  openRecipeModal(recipe: Recipe | null = null): void {
    this.recipeError.set(null);
    if (recipe) {
      this.recipeForm.set({
        id: recipe.id,
        name: recipe.name,
        menu_category: recipe.menuCategory || '',
        recipe_type: recipe.recipeType,
        top_level_category: recipe.topLevelCategory || '',
        yield_quantity: recipe.yieldQuantity,
        yield_unit: recipe.yieldUnit || '',
        selling_price: recipe.sellingPrice,
        is_active: recipe.isActive,
        remark: '',
        items: recipe.items.map(i => ({
          component_type: i.componentType,
          component_id: i.componentId,
          quantity: i.quantity,
          unit: i.unit || '',
        })),
      });
    } else {
      this.recipeForm.set(emptyRecipeForm());
    }
    this.isRecipeModalOpen.set(true);
  }

  closeRecipeModal(): void {
    this.isRecipeModalOpen.set(false);
  }

  updateRecipeFormField<K extends keyof RecipeFormState>(field: K, value: RecipeFormState[K]): void {
    this.recipeForm.update(f => ({ ...f, [field]: value }));
  }

  addRecipeItem(): void {
    this.recipeForm.update(f => ({
      ...f,
      items: [...f.items, { component_type: 'ingredient', component_id: null, quantity: null, unit: '' }],
    }));
  }

  removeRecipeItem(index: number): void {
    this.recipeForm.update(f => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  updateRecipeItemField<K extends keyof RecipeItemFormState>(index: number, field: K, value: RecipeItemFormState[K]): void {
    this.recipeForm.update(f => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, [field]: value, ...(field === 'component_type' ? { component_id: null } : {}) } : item)),
    }));
  }

  componentOptionsForType(type: RecipeComponentType): { id: number; name: string; unitCost: number | null }[] {
    if (type === 'ingredient') {
      return this.allIngredients().map(i => ({ id: Number(i.id), name: i.ingredientName, unitCost: i.unitCost }));
    }
    const editingId = this.recipeForm().id;
    return this.allRecipes()
      .filter(r => String(r.id) !== editingId)
      .map(r => ({ id: Number(r.id), name: r.name, unitCost: r.unitCost }));
  }

  async submitRecipe(): Promise<void> {
    const form = this.recipeForm();
    if (!form.name.trim()) {
      this.recipeError.set('請輸入品名');
      return;
    }
    for (const item of form.items) {
      if (!item.component_id) {
        this.recipeError.set('請選擇一個商品');
        return;
      }
      if (item.quantity === null || item.quantity < 0) {
        this.recipeError.set('份量需大於等於 0');
        return;
      }
    }

    this.recipeSaving.set(true);
    this.recipeError.set(null);

    try {
      const payload = {
        name: form.name.trim(),
        menu_category: form.menu_category.trim() || null,
        recipe_type: form.recipe_type,
        top_level_category: (form.top_level_category || null) as RecipeTopLevelCategory | null,
        yield_quantity: form.yield_quantity ?? 1,
        yield_unit: form.yield_unit.trim() || null,
        selling_price: form.selling_price,
        is_active: form.is_active,
        remark: form.remark.trim() || null,
        items: form.items.map(item => ({
          component_type: item.component_type,
          component_id: Number(item.component_id),
          quantity: Number(item.quantity),
          unit: item.unit.trim() || null,
        })),
      };

      const response = form.id
        ? await this.apiService.updateRecipe({ ...payload, id: form.id })
        : await this.apiService.createRecipe(payload);

      if (response.success) {
        this.closeRecipeModal();
        await this.loadRecipes();
      } else {
        this.recipeError.set(response.error || (form.id ? '更新食譜失敗' : '新增食譜失敗'));
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      this.recipeError.set(form.id ? '更新食譜失敗' : '新增食譜失敗');
    } finally {
      this.recipeSaving.set(false);
    }
  }

  async deleteRecipeItem(recipe: Recipe): Promise<void> {
    if (!confirm(`您確定要刪除此項商品嗎？此操作無法復原。`)) return;

    try {
      const response = await this.apiService.deleteRecipe(recipe.id);
      if (response.success) {
        await this.loadRecipes();
      } else {
        this.recipeError.set(response.error || '刪除食譜失敗');
      }
    } catch (error) {
      console.error('Error deleting recipe:', error);
      this.recipeError.set('刪除食譜失敗');
    }
  }

  // ========== iChef 品項對應 (Item Cost Links) ==========

  async loadItemCostLinks(): Promise<void> {
    try {
      const response = await this.apiService.getItemCostLinks();
      if (response.success && response.data) {
        this.allItemCostLinks.set(response.data);
      } else {
        this.itemCostLinkError.set(response.error || '讀取品項對應失敗');
      }
    } catch (error) {
      console.error('Error loading item cost links:', error);
      this.itemCostLinkError.set('讀取品項對應失敗');
    }
  }

  openItemCostLinkModal(link: ItemCostLink): void {
    this.itemCostLinkError.set(null);
    this.editingItemCostLinkName.set(link.itemName);
    this.itemCostLinkForm.set({
      item_uuid: link.itemUuid,
      product_type: link.productType || '',
      product_id: link.productId,
      unit_divisor: link.unitDivisor ?? 1,
    });
    this.isItemCostLinkModalOpen.set(true);
  }

  closeItemCostLinkModal(): void {
    this.isItemCostLinkModalOpen.set(false);
  }

  updateItemCostLinkFormField<K extends keyof ItemCostLinkFormState>(field: K, value: ItemCostLinkFormState[K]): void {
    this.itemCostLinkForm.update(f => ({
      ...f,
      [field]: value,
      ...(field === 'product_type' ? { product_id: null } : {}),
    }));
  }

  productOptionsForLinkType(type: ItemCostLinkProductType | ''): { id: number; name: string }[] {
    if (type === 'wine') return this.allWineCosts().map(w => ({ id: Number(w.id), name: w.productName }));
    if (type === 'cigar') return this.allCigarCosts().map(c => ({ id: Number(c.id), name: c.productName }));
    if (type === 'recipe') return this.allRecipes().map(r => ({ id: Number(r.id), name: r.name }));
    return [];
  }

  async submitItemCostLink(): Promise<void> {
    const form = this.itemCostLinkForm();
    if (!form.product_type || !form.product_id) {
      this.itemCostLinkError.set('請選擇一個商品');
      return;
    }

    this.itemCostLinkSaving.set(true);
    this.itemCostLinkError.set(null);

    try {
      const response = await this.apiService.setItemCostLink({
        item_uuid: form.item_uuid,
        item_name_snapshot: this.editingItemCostLinkName(),
        product_type: form.product_type,
        product_id: Number(form.product_id),
        unit_divisor: form.unit_divisor ?? 1,
      });

      if (response.success) {
        this.closeItemCostLinkModal();
        await this.loadItemCostLinks();
      } else {
        this.itemCostLinkError.set(response.error || '設定對應失敗');
      }
    } catch (error) {
      console.error('Error setting item cost link:', error);
      this.itemCostLinkError.set('設定對應失敗');
    } finally {
      this.itemCostLinkSaving.set(false);
    }
  }

  async removeItemCostLink(link: ItemCostLink): Promise<void> {
    if (!confirm(`確定要移除這個對應關係嗎？移除後該品項會回到「待對應」狀態，不會影響歷史資料。`)) return;

    try {
      const response = await this.apiService.deleteItemCostLink(link.itemUuid);
      if (response.success) {
        await this.loadItemCostLinks();
      } else {
        this.itemCostLinkError.set(response.error || '移除對應失敗');
      }
    } catch (error) {
      console.error('Error removing item cost link:', error);
      this.itemCostLinkError.set('移除對應失敗，請稍後再試。');
    }
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
      const wine = item as WineCost | null;
      this.editingWineCost.set(wine);
      this.wineCostForm.reset();
      if (wine) {
        this.wineCostForm.patchValue({
          id: wine.id,
          vendor_id: wine.vendorId,
          productName: wine.productName,
          type: wine.type,
          cost: wine.cost,
          sellingPrice: wine.sellingPrice,
        });
      }
    }
    this.isModalOpen.set(true);
  }

  /**
   * 用「最近進貨價」（來自貨單明細對應，見進貨單頁面的「對應商品」）預填成本欄位，
   * 開啟編輯視窗讓使用者確認後手動儲存——不會略過使用者確認直接覆蓋成本。
   * 只給酒水用：酒水成本是「每瓶」，貨單明細的 unitPrice 通常也是每瓶，計量基準一致；
   * 食材的 price 是「一次採購 purchaseQty 個 purchaseUnit 的總價」，跟貨單的
   * 「每個進貨單位單價」計量基準不一定相同，直接套用可能會把不同基準的數字覆蓋進去，
   * 所以食材那邊刻意不做這個按鈕，只顯示參考數字。
   */
  applyLatestShipmentPriceToWine(item: WineCost): void {
    if (!item.latestShipmentPrice) return;
    this.openModal(item);
    this.wineCostForm.patchValue({ cost: item.latestShipmentPrice.unitPrice });
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
    const formValue = this.wineCostForm.value;
    const itemData = {
      vendorId: formValue.vendor_id ?? null,
      productName: formValue.productName,
      type: formValue.type,
      cost: formValue.cost,
      sellingPrice: formValue.sellingPrice,
    };
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
  formatCurrency(value: number): string { return value?.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) || ''; }
}
