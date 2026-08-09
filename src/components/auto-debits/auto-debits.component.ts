import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type GLAccount } from '../../services/api.service';

type CycleType = 'monthly' | 'bimonthly' | 'semiannual' | 'yearly';

interface AutoDebitFormData {
  ruleId: number | null;
  name: string;
  cycleType: CycleType;
  monthOfYear: number;
  dayOfMonth: number;
  nextRunDate: string;
  amount: number;
  itemGroup: string;
  subjectName: string;
  remark: string;
  isActive: boolean;
}

interface AutoDebitRule {
  ruleId: number;
  name: string;
  cycleType: CycleType;
  monthOfYear: number | null;
  dayOfMonth: number | null;
  nextRunDate?: string | null;
  glAccountId: number | null;
  amount: number;
  itemGroup: string;
  subjectName: string;
  remark: string | null;
  isActive: boolean;
  glAccount: { glAccountId: number; accountCode: string; accountName: string } | null;
  currentRun: {
    runId: number;
    runKey: string;
    scheduledDate: string;
    ledgerEntryId: number | null;
    isSighOff: boolean | null;
  } | null;
}

@Component({
  selector: 'app-auto-debits',
  templateUrl: './auto-debits.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AutoDebitsComponent implements OnInit {
  private apiService = inject(ApiService);

  isLoading = signal(false);
  processing = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  rules = signal<AutoDebitRule[]>([]);

  monthlyRules = computed(() => this.rules().filter(r => r.cycleType === 'monthly'));
  bimonthlyRules = computed(() => this.rules().filter(r => r.cycleType === 'bimonthly'));
  semiannualRules = computed(() => this.rules().filter(r => r.cycleType === 'semiannual'));
  yearlyRules = computed(() => this.rules().filter(r => r.cycleType === 'yearly'));

  glAccounts = signal<GLAccount[]>([]);

  // 簡化的分類映射（與流水帳頁面一致的備選）
  private itemCategoryMap: Record<string, string[]> = {
    '資產': ['現金', '銀行存款', '應收帳款', '存貨'],
    '負債': ['應付帳款', '應付薪資', '應付稅款'],
    '業主權益': ['資本', '保留盈餘'],
    '營業收入': ['銷貨收入', '其他收入'],
    '營業費用': ['人事費用', '進貨成本', '其他費用']
  };

  itemGroupOptions = computed(() => {
    const accounts = this.glAccounts();
    if (accounts.length > 0) {
      const names = accounts
        .filter(acc => acc.parent_account_id === null)
        .map(acc => acc.account_name)
        .filter(Boolean) as string[];
      const unique = [...new Set(names)].sort();
      if (unique.length > 0) return unique;
    }

    const base = Object.keys(this.itemCategoryMap);
    const fromRules = this.rules().map(r => r.itemGroup).filter(Boolean) as string[];
    return [...new Set([...base, ...fromRules])].sort();
  });

  subjectNameOptions = computed(() => {
    const selectedItemGroup = String(this.formData().itemGroup || '').trim();
    if (!selectedItemGroup) return [];

    const accounts = this.glAccounts();
    if (accounts.length > 0) {
      const parent = accounts.find(acc => acc.parent_account_id === null && acc.account_name === selectedItemGroup);
      if (parent) {
        const children = accounts
          .filter(acc => acc.parent_account_id === parent.gl_account_id)
          .map(acc => acc.account_name)
          .filter(Boolean) as string[];
        const uniqueChildren = [...new Set(children)].sort();
        if (uniqueChildren.length > 0) return uniqueChildren;
      }
    }

    const fromRules = this.rules()
      .filter(r => r.itemGroup === selectedItemGroup)
      .map(r => r.subjectName)
      .filter(Boolean) as string[];
    const uniqueFromRules = [...new Set(fromRules)].sort();
    if (uniqueFromRules.length > 0) return uniqueFromRules;

    const mapCategories = this.itemCategoryMap[selectedItemGroup] || [];
    return [...new Set(mapCategories)].sort();
  });

  constructor() {
    // 若切換 item_group 後科目不在清單中，清空科目
    effect(() => {
      const currentSubject = String(this.formData().subjectName || '').trim();
      const options = this.subjectNameOptions();
      if (currentSubject && options.length > 0 && !options.includes(currentSubject)) {
        this.patchForm('subjectName', '');
      }
    });
  }

  showForm = signal(false);
  isEditing = signal(false);

  formData = signal<AutoDebitFormData>({
    ruleId: null as number | null,
    name: '',
    cycleType: 'monthly' as CycleType,
    monthOfYear: 1,
    dayOfMonth: 1,
    nextRunDate: '',
    amount: 0,
    itemGroup: '營業費用',
    subjectName: '',
    remark: '',
    isActive: true,
  });

  patchForm(key: keyof AutoDebitFormData, value: any): void {
    this.formData.update(prev => {
      const next: any = {
        ...prev,
        [key]: value,
      };

      // If user picks nextRunDate for anchored cycles, sync dayOfMonth
      if (key === 'nextRunDate') {
        const s = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const d = new Date(`${s}T00:00:00.000Z`);
          if (Number.isFinite(d.getTime())) {
            next.dayOfMonth = d.getUTCDate();
          }
        }
      }

      return next;
    });
  }

  ngOnInit(): void {
    this.initPage();
  }

  private async initPage(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.generateDueAutoDebits(),
        this.loadGLAccounts(),
      ]);
      await this.loadRules();
    } catch (e: any) {
      this.error.set(e?.message || '載入失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadGLAccounts(): Promise<void> {
    try {
      const res = await this.apiService.getGLAccounts();
      if (res.success && res.data) {
        this.glAccounts.set(res.data);
      }
    } catch {
      // ignore; fallback to built-in map / existing rules
    }
  }


  private async loadRules(): Promise<void> {
    const res = await this.apiService.getAutoDebits();
    if (!res.success) throw new Error(res.error || '載入自動扣繳規則失敗');
    this.rules.set((res.data || []) as AutoDebitRule[]);
  }

  private async generateDueAutoDebits(): Promise<void> {
    try {
      await this.apiService.generateAutoDebits();
    } catch {
      // ignore generation errors on init, page can still be used
    }
  }

  openCreate(): void {
    this.successMessage.set(null);
    this.error.set(null);
    this.isEditing.set(false);
    this.showForm.set(true);
    this.formData.set({
      ruleId: null,
      name: '',
      cycleType: 'monthly',
      monthOfYear: 1,
      dayOfMonth: 1,
      nextRunDate: '',
      amount: 0,
      itemGroup: '營業費用',
      subjectName: '',
      remark: '',
      isActive: true,
    });
  }

  openEdit(rule: AutoDebitRule): void {
    this.successMessage.set(null);
    this.error.set(null);
    this.isEditing.set(true);
    this.showForm.set(true);
    this.formData.set({
      ruleId: rule.ruleId,
      name: rule.name,
      cycleType: rule.cycleType,
      monthOfYear: rule.monthOfYear ?? 1,
      dayOfMonth: rule.dayOfMonth ?? 1,
      nextRunDate: String(rule.nextRunDate ?? ''),
      amount: rule.amount,
      itemGroup: rule.itemGroup || '營業費用',
      subjectName: rule.subjectName || rule.name,
      remark: rule.remark || '',
      isActive: rule.isActive,
    });
  }

  cancelForm(): void {
    this.showForm.set(false);
  }

  async save(): Promise<void> {
    const f = this.formData();

    const name = String(f.name || '').trim();
    const itemGroup = String(f.itemGroup || '').trim() || '營業費用';
    const subjectName = String(f.subjectName || '').trim();
    const amount = Number(f.amount);
    const dayOfMonth = Number(f.dayOfMonth);
    const monthOfYear = Number(f.monthOfYear);

    if (!name) {
      this.error.set('請輸入名稱');
      return;
    }
    if (!itemGroup) {
      this.error.set('請選擇項目');
      return;
    }
    if (!subjectName) {
      this.error.set('請選擇科目');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      this.error.set('請輸入金額（不可為 0）');
      return;
    }
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      this.error.set('扣繳日需為 1-31');
      return;
    }
    if (f.cycleType === 'yearly' && (!Number.isFinite(monthOfYear) || monthOfYear < 1 || monthOfYear > 12)) {
      this.error.set('年份週期需選擇月份（1-12）');
      return;
    }

    this.processing.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    try {
      if (this.isEditing() && f.ruleId) {
        const res = await this.apiService.updateAutoDebit({
          ruleId: f.ruleId,
          name,
          cycleType: f.cycleType,
          monthOfYear: f.cycleType === 'yearly' ? monthOfYear : null,
          dayOfMonth,
          nextRunDate: (f.cycleType === 'bimonthly' || f.cycleType === 'semiannual') ? (String(f.nextRunDate || '').trim() || null) : null,
          amount,
          itemGroup,
          subjectName,
          remark: String(f.remark || '').trim() || null,
          isActive: Boolean(f.isActive),
        });
        if (!res.success) throw new Error(res.error || '更新失敗');
        this.successMessage.set('更新成功');
      } else {
        const res = await this.apiService.createAutoDebit({
          name,
          cycleType: f.cycleType,
          monthOfYear: f.cycleType === 'yearly' ? monthOfYear : null,
          dayOfMonth,
          nextRunDate: (f.cycleType === 'bimonthly' || f.cycleType === 'semiannual') ? (String(f.nextRunDate || '').trim() || null) : null,
          amount,
          itemGroup,
          subjectName,
          remark: String(f.remark || '').trim() || null,
          isActive: Boolean(f.isActive),
        });
        if (!res.success) throw new Error(res.error || '新增失敗');
        this.successMessage.set('新增成功');
      }

      await this.generateDueAutoDebits();
      await this.loadRules();
      this.showForm.set(false);
    } catch (e: any) {
      this.error.set(e?.message || '儲存失敗');
    } finally {
      this.processing.set(false);
    }
  }

  async disable(rule: AutoDebitRule): Promise<void> {
    if (!confirm(`確定要停用「${rule.name}」嗎？`)) return;

    this.processing.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    try {
      const res = await this.apiService.disableAutoDebit(rule.ruleId);
      if (!res.success) throw new Error(res.error || '停用失敗');
      this.successMessage.set('已停用');
      await this.loadRules();
    } catch (e: any) {
      this.error.set(e?.message || '停用失敗');
    } finally {
      this.processing.set(false);
    }
  }

  async createLedger(rule: AutoDebitRule): Promise<void> {
    if (rule.currentRun) return;
    if (!rule.isActive) return;

    const rawAmount = prompt(`建立帳務 - ${rule.name}\n請輸入本期扣繳金額`, String(rule.amount ?? ''));
    if (rawAmount === null) return;

    const amount = Number(String(rawAmount).trim());
    if (!Number.isFinite(amount) || amount === 0) {
      this.error.set('金額格式不正確（不可為 0）');
      return;
    }

    this.processing.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    try {
      const res = await this.apiService.generateAutoDebits({ ruleId: rule.ruleId, amount });
      if (!res.success) throw new Error(res.error || '建立帳務失敗');

      const createdCount = (res.data as any)?.createdCount;
      if (createdCount === 0) {
        this.successMessage.set('本期帳務已存在');
      } else {
        this.successMessage.set('已建立帳務');
      }

      await this.loadRules();
    } catch (e: any) {
      this.error.set(e?.message || '建立帳務失敗');
    } finally {
      this.processing.set(false);
    }
  }

  cycleLabel(rule: AutoDebitRule): string {
    if (rule.cycleType === 'monthly') {
      return `每月 ${rule.dayOfMonth || 1} 日`;
    }
    if (rule.cycleType === 'bimonthly') {
      return `每雙月 ${rule.dayOfMonth || 1} 日`;
    }
    if (rule.cycleType === 'semiannual') {
      return `每半年 ${rule.dayOfMonth || 1} 日`;
    }
    return `每年 ${rule.monthOfYear || 1}/${rule.dayOfMonth || 1}`;
  }

  statusLabel(rule: AutoDebitRule): { text: string; cls: string } {
    if (!rule.isActive) {
      return { text: '已停用', cls: 'bg-gray-100 text-gray-700' };
    }

    if (!rule.currentRun) {
      return { text: '尚未建立', cls: 'bg-slate-100 text-slate-700' };
    }

    const isSighOff = rule.currentRun.isSighOff;
    if (isSighOff) {
      return { text: '已核對', cls: 'bg-green-100 text-green-800' };
    }
    return { text: '待核對', cls: 'bg-amber-100 text-amber-800' };
  }

  formatAmount(value: number): string {
    return Number(value || 0).toLocaleString('en-US');
  }
}
