import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { TargetGoal, TargetGoalStatus, TargetGoalType, User } from '../../models/financial.model';

interface GoalSettingRow extends TargetGoal {
  ownerEmployeeId: number;
  keyResults: Array<{
    id: number;
    resultName: string;
    resultType: 'numeric' | 'boolean';
    unit: string;
    targetValue: number | null;
    currentValue: number | null;
    isAchieved: boolean | null;
    achievementRate: number;
  }>;
  achievementRate: number;
}

@Component({
  selector: 'app-goal-setting',
  templateUrl: './goal-setting.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class GoalSettingComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  private toDateSortValue(date: string | undefined, fallback: number): number {
    if (!date) return fallback;
    const t = new Date(date).getTime();
    return Number.isFinite(t) ? t : fallback;
  }

  private filterEmployeesToManagementTeam(employees: any[]): any[] {
    const list = Array.isArray(employees) ? employees : [];
    const hasAnyPosition = list.some(emp => String(emp?.position || '').trim().length > 0);
    if (!hasAnyPosition) {
      return list;
    }

    return list.filter(emp => String(emp?.position || '').trim() === '經營團隊');
  }

  // --- State Signals ---
  isModalOpen = signal(false);
  editingGoal = signal<GoalSettingRow | null>(null);
  goalToDelete = signal<GoalSettingRow | null>(null);
  editingProgressId = signal<string | null>(null);
  krCurrentDraft = signal<Record<number, string>>({});
  loading = signal(false);
  processing = signal(false);
  
  // --- Filter Signals ---
  statusFilter = signal<TargetGoalStatus | ''>('');
  typeFilter = signal<TargetGoalType | ''>('');
  assigneeFilter = signal<string>('');

  // --- Data ---
  allGoals = signal<GoalSettingRow[]>([]);
  users = signal<User[]>([]);
  goalTypes: TargetGoalType[] = ['店內', '財務', '活動', '行銷', '系統', '會員', '加盟'];
  goalStatuses: TargetGoalStatus[] = ['進行中', '已達成', '未達成'];

  // --- Form ---
  goalForm = this.fb.group({
    title: ['', Validators.required],
    type: ['店內' as TargetGoalType, Validators.required],
    period: ['monthly' as 'monthly' | 'yearly', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    assigneeId: ['', Validators.required],
    keyResults: this.fb.array([]),
  });

  get keyResults(): FormArray {
    return this.goalForm.get('keyResults') as FormArray;
  }

  constructor() {
    this.loadData();
  }

  private toUiStatus(status?: string): TargetGoalStatus {
    if (status === 'completed') return '已達成';
    if (status === 'cancelled') return '未達成';
    return '進行中';
  }

  private toDbStatus(status: TargetGoalStatus): string {
    if (status === '已達成') return 'completed';
    if (status === '未達成') return 'cancelled';
    return 'in_progress';
  }

  private parseGoalType(goalDescription?: string | null): TargetGoalType {
    const matched = String(goalDescription || '').match(/^類型:(.+)$/);
    const value = matched?.[1] as TargetGoalType | undefined;
    if (value && this.goalTypes.includes(value)) {
      return value;
    }
    return '店內';
  }

  private getPeriod(startDate?: string, endDate?: string): 'monthly' | 'yearly' {
    if (!startDate || !endDate) return 'monthly';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days > 180 ? 'yearly' : 'monthly';
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [employeeRes, goalRes] = await Promise.all([
        this.apiService.getEmployeeInfo(),
        this.apiService.getCollaborationGoals({ includeKeyResults: true }),
      ]);

      if (employeeRes.success && employeeRes.data) {
        const employees = this.filterEmployeesToManagementTeam(employeeRes.data as any[]);
        const mappedUsers: User[] = employees.map((emp: any) => ({
          id: String(emp.id),
          name: emp.employee_name,
          email: emp.email || '',
          role: '營運',
          status: emp.is_active ? '啟用' : '停用',
          lastLogin: '',
        }));
        this.users.set(mappedUsers);
      }

      if (goalRes.success && goalRes.data) {
        const mappedGoals: GoalSettingRow[] = (goalRes.data as any[]).map((g: any) => {
          const keyResults = (Array.isArray(g.keyResults) ? g.keyResults : [])
            .filter((kr: any) => kr.resultName !== '__AUTO_PROGRESS__')
            .map((kr: any) => ({
              id: Number(kr.id),
              resultName: kr.resultName || '',
              resultType: kr.resultType === 'boolean' ? 'boolean' : 'numeric',
              unit: kr.unit || '',
              targetValue: kr.targetValue !== null ? Number(kr.targetValue) : null,
              currentValue: kr.currentValue !== null ? Number(kr.currentValue) : null,
              isAchieved: kr.isAchieved ?? null,
              achievementRate: Number(kr.achievementRate || 0),
            }));

          const totalTarget = keyResults
            .filter((kr: any) => kr.resultType === 'numeric')
            .reduce((sum: number, kr: any) => sum + Number(kr.targetValue || 0), 0);
          const totalCurrent = keyResults
            .filter((kr: any) => kr.resultType === 'numeric')
            .reduce((sum: number, kr: any) => sum + Number(kr.currentValue || 0), 0);
          const primaryUnit = keyResults[0]?.unit || '';
          const type = this.parseGoalType(g.goalDescription);

          return {
            id: String(g.id),
            title: g.goalName || '',
            type,
            targetValue: totalTarget,
            currentValue: totalCurrent,
            startDate: g.startDate ? String(g.startDate).split('T')[0] : new Date().toISOString().split('T')[0],
            endDate: g.dueDate ? String(g.dueDate).split('T')[0] : new Date().toISOString().split('T')[0],
            status: this.toUiStatus(g.status),
            unit: primaryUnit,
            assigneeId: g.ownerEmployeeId ? String(g.ownerEmployeeId) : undefined,
            period: this.getPeriod(g.startDate, g.dueDate),
            ownerEmployeeId: Number(g.ownerEmployeeId),
            keyResults,
            achievementRate: Number(g.achievementRate || 0),
          };
        });

        this.allGoals.set(mappedGoals);
      }
    } catch (error) {
      console.error('Error loading collaboration goals:', error);
      alert('載入資料失敗');
    } finally {
      this.loading.set(false);
    }
  }

  // --- Computed ---
  private baseFilteredGoals = computed(() => {
    const status = this.statusFilter();
    const type = this.typeFilter();
    const assignee = this.assigneeFilter();

    return this.allGoals()
      .filter(g => !status || g.status === status)
      .filter(g => !type || g.type === type)
      .filter(g => !assignee || assignee === 'all' || g.assigneeId === assignee)
      // Sort tasks by due date ascending (earliest first)
      .sort((a, b) => {
        const aEnd = this.toDateSortValue(a.endDate, Number.POSITIVE_INFINITY);
        const bEnd = this.toDateSortValue(b.endDate, Number.POSITIVE_INFINITY);
        if (aEnd !== bEnd) return aEnd - bEnd;

        const aStart = this.toDateSortValue(a.startDate, 0);
        const bStart = this.toDateSortValue(b.startDate, 0);
        if (aStart !== bStart) return aStart - bStart;

        return String(a.id).localeCompare(String(b.id));
      });
  });

  goalsByAssignee = computed(() => {
    const goals = this.baseFilteredGoals();
    const userOrder = new Map(this.users().map((u, index) => [u.id, index] as const));

    type Group = {
      assigneeKey: string;
      assigneeId?: string;
      name: string;
      avatarUrl: string;
      goals: GoalSettingRow[];
    };

    const groups = new Map<string, Group>();
    for (const goal of goals) {
      const key = goal.assigneeId || '__unassigned__';
      if (!groups.has(key)) {
        const name = this.getAssigneeName(goal.assigneeId);
        groups.set(key, {
          assigneeKey: key,
          assigneeId: goal.assigneeId,
          name,
          avatarUrl: this.getAssigneeAvatarUrl(goal.assigneeId),
          goals: [],
        });
      }
      groups.get(key)!.goals.push(goal);
    }

    return Array.from(groups.values())
      .map(g => ({ ...g, goals: [...g.goals].sort((a, b) => this.toDateSortValue(a.endDate, Number.POSITIVE_INFINITY) - this.toDateSortValue(b.endDate, Number.POSITIVE_INFINITY)) }))
      .sort((a, b) => {
        const aIdx = a.assigneeId ? (userOrder.get(a.assigneeId) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
        const bIdx = b.assigneeId ? (userOrder.get(b.assigneeId) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.name.localeCompare(b.name, 'zh-Hant');
      });
  });

  monthlyGoals = computed(() => {
    return this.baseFilteredGoals().filter(g => g.period === 'monthly');
  });

  yearlyGoals = computed(() => {
    return this.baseFilteredGoals().filter(g => g.period === 'yearly');
  });


  resetFilters(): void {
    this.statusFilter.set('');
    this.typeFilter.set('');
    this.assigneeFilter.set('');
  }

  // --- Modal & Form Handling ---
  openModal(goal: GoalSettingRow | null = null): void {
    this.editingGoal.set(goal);
    this.keyResults.clear();

    if (goal) {
      this.goalForm.patchValue({
        title: goal.title,
        type: goal.type,
        period: goal.period,
        startDate: goal.startDate,
        endDate: goal.endDate,
        assigneeId: goal.assigneeId || '',
      });
      goal.keyResults.forEach(kr => this.addKeyResult({
        id: String(kr.id),
        title: kr.resultName,
        setTarget: kr.resultType === 'numeric',
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
        unit: kr.unit,
        isAchieved: kr.isAchieved,
      }));
    } else {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      const defaultAssignee = this.users()[0]?.id || '';
      this.goalForm.reset({
        title: '',
        type: '店內',
        period: 'monthly',
        startDate: firstDay,
        endDate: lastDay,
        assigneeId: defaultAssignee,
      });
      this.addKeyResult();
    }
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  addKeyResult(value?: {
    id?: string;
    title?: string;
    setTarget?: boolean;
    currentValue?: number | null;
    targetValue?: number | null;
    unit?: string;
    isAchieved?: boolean | null;
  }): void {
    this.keyResults.push(this.fb.group({
      id: [value?.id || ''],
      title: [value?.title || '', Validators.required],
      setTarget: [value?.setTarget ?? false],
      currentValue: [value?.currentValue ?? 0],
      targetValue: [value?.targetValue ?? 1],
      unit: [value?.unit || '是否'],
      isAchieved: [value?.isAchieved ?? false],
    }));
  }

  onToggleSetTarget(index: number): void {
    const group = this.keyResults.at(index);
    const setTarget = Boolean(group.get('setTarget')?.value);
    if (!setTarget) {
      group.patchValue({ currentValue: 0, targetValue: 1, unit: '是否', isAchieved: false }, { emitEvent: false });
    }
  }

  removeKeyResult(index: number): void {
    this.keyResults.removeAt(index);
  }

  async handleFormSubmit(): Promise<void> {
    if (this.goalForm.invalid) return;

    const formValue = this.goalForm.value;
    const editing = this.editingGoal();
    const keyResults = (formValue.keyResults || []) as Array<{
      id?: string;
      title?: string;
      setTarget?: boolean;
      currentValue?: number;
      targetValue?: number;
      unit?: string;
      isAchieved?: boolean;
    }>;

    if (keyResults.length === 0) {
      alert('請至少新增一筆關鍵成果');
      return;
    }

    for (const kr of keyResults) {
      if (kr.setTarget) {
        if (kr.currentValue === undefined || kr.targetValue === undefined || Number(kr.targetValue) <= 0 || !String(kr.unit || '').trim()) {
          alert('有勾選「設定目標值」的關鍵成果，請完整填寫目前進度、目標值與單位');
          return;
        }
      }
    }

    const achievedCount = keyResults.filter(kr => {
      if (!kr.setTarget) {
        return Boolean(kr.isAchieved);
      }
      return Number(kr.currentValue || 0) >= Number(kr.targetValue || 0);
    }).length;
    const uiStatus: TargetGoalStatus = achievedCount === keyResults.length ? '已達成' : '進行中';

    const payload = {
      goalName: formValue.title!,
      goalDescription: formValue.type ? `類型:${formValue.type}` : null,
      ownerEmployeeId: Number(formValue.assigneeId!),
      startDate: formValue.startDate!,
      dueDate: formValue.endDate!,
      status: this.toDbStatus(uiStatus),
    };

    this.processing.set(true);
    try {
      let goalId = 0;

      if (editing) {
        const updateRes = await this.apiService.updateCollaborationGoal({ id: Number(editing.id), ...payload });
        if (!updateRes.success) throw new Error(updateRes.error || '更新失敗');
        goalId = Number(editing.id);
      } else {
        const createRes = await this.apiService.createCollaborationGoal(payload);
        if (!createRes.success || !createRes.data?.id) throw new Error(createRes.error || '新增失敗');
        goalId = Number(createRes.data.id);
      }

      const originalIds = new Set(
        (editing?.keyResults || [])
          .map(kr => Number(kr.id))
          .filter(id => Number.isFinite(id) && id > 0)
      );
      const keptIds = new Set<number>();

      for (const kr of keyResults) {
        const setTarget = Boolean(kr.setTarget);
        const targetValue = setTarget ? Number(kr.targetValue || 0) : 1;
        const currentValue = setTarget ? Number(kr.currentValue || 0) : 0;
        const isAchieved = setTarget ? null : Number(currentValue) >= Number(targetValue);
        const status = setTarget
          ? (Number(currentValue || 0) >= Number(targetValue || 0) ? 'completed' : 'in_progress')
          : (Number(currentValue) >= Number(targetValue) ? 'completed' : 'in_progress');

        const numericId = Number(kr.id || 0);
        if (numericId) {
          keptIds.add(numericId);
          await this.apiService.updateCollaborationKeyResult({
            id: numericId,
            resultName: kr.title || '',
            resultType: setTarget ? 'numeric' : 'boolean',
            unit: setTarget ? (kr.unit || '') : '是否',
            targetValue,
            currentValue,
            isAchieved,
            status,
          });
        } else {
          await this.apiService.createCollaborationKeyResult({
            goalId,
            resultName: kr.title || '',
            resultType: setTarget ? 'numeric' : 'boolean',
            unit: setTarget ? (kr.unit || '') : '是否',
            targetValue,
            currentValue,
            isAchieved,
            status,
          });
        }
      }

      for (const oldId of originalIds) {
        if (!keptIds.has(oldId)) {
          await this.apiService.deleteCollaborationKeyResult(oldId);
        }
      }

      await this.loadData();
      this.closeModal();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '儲存失敗');
    } finally {
      this.processing.set(false);
    }
  }
  
  // --- Inline Progress Editing ---
  startEditingProgress(): void {}
  finishEditingProgress(): void {}

  // --- Deletion ---
  requestDelete(goal: GoalSettingRow): void {
    this.goalToDelete.set(goal);
  }

  async confirmDelete(): Promise<void> {
    if (!this.goalToDelete()) return;
    this.processing.set(true);
    try {
      await this.apiService.deleteCollaborationGoal(Number(this.goalToDelete()!.id));
      await this.loadData();
      this.cancelDelete();
    } catch (error: any) {
      alert(error?.message || '刪除失敗');
    } finally {
      this.processing.set(false);
    }
  }
  cancelDelete(): void {
    this.goalToDelete.set(null);
  }

  // --- UI Helpers ---
  getProgressBarWidth(goal: TargetGoal): number {
    return Math.max(0, Math.min(100, (goal as GoalSettingRow).achievementRate || 0));
  }
  
  getAssigneeName(assigneeId?: string): string {
    if (!assigneeId) return '未指定';
    return this.users().find(u => u.id === assigneeId)?.name || '未知使用者';
  }

  getAssigneeAvatarUrl(assigneeId?: string): string {
    const name = this.getAssigneeName(assigneeId);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&font-size=0.5`;
  }

  getDaysLeft(endDate: string): { days: number, label: string } {
    const end = new Date(endDate);
    const now = new Date();
    // Reset time part to compare dates only
    end.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { days: Math.abs(diffDays), label: '已逾期' };
    }
    return { days: diffDays, label: '天剩餘' };
  }

  getDaysLeftClass(days: number, label: string): string {
    if (label === '已逾期') return 'text-red-500';
    if (days <= 7) return 'text-yellow-600';
    return 'text-gray-500';
  }
  
  getTypeClass(type: TargetGoalType): string {
    switch (type) {
      case '店內': return 'bg-blue-100 text-blue-800';
      case '財務': return 'bg-green-100 text-green-800';
      case '活動': return 'bg-purple-100 text-purple-800';
      case '行銷': return 'bg-pink-100 text-pink-800';
      case '系統': return 'bg-slate-100 text-slate-800';
      case '會員': return 'bg-amber-100 text-amber-800';
      case '加盟': return 'bg-cyan-100 text-cyan-800';
    }
  }

  getStatusClass(status: TargetGoalStatus): string {
    switch (status) {
      case '進行中': return 'bg-blue-100 text-blue-800';
      case '已達成': return 'bg-green-100 text-green-800';
      case '未達成': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  formatNumber(value: number): string {
    return value.toLocaleString('en-US');
  }

  getKrCurrentDraft(kr: GoalSettingRow['keyResults'][number]): string {
    const drafts = this.krCurrentDraft();
    const existing = drafts[kr.id];
    if (existing !== undefined) {
      return existing;
    }
    return String(kr.currentValue ?? 0);
  }

  setKrCurrentDraft(krId: number, value: string): void {
    this.krCurrentDraft.update(prev => ({ ...prev, [krId]: value }));
  }

  getKrProgress(kr: GoalSettingRow['keyResults'][number]): number {
    if (!this.isKrWithTarget(kr)) {
      return this.isKrChecked(kr) ? 100 : 0;
    }

    const target = Number(kr.targetValue || 0);
    if (target <= 0) return 0;
    return Math.max(0, Math.min(100, (Number(kr.currentValue || 0) / target) * 100));
  }

  isKrWithTarget(kr: GoalSettingRow['keyResults'][number]): boolean {
    return kr.resultType === 'numeric' && kr.targetValue !== null;
  }

  isKrChecked(kr: GoalSettingRow['keyResults'][number]): boolean {
    if (this.isKrWithTarget(kr)) {
      return Number(kr.currentValue || 0) >= Number(kr.targetValue || 0);
    }
    return Number(kr.currentValue || 0) >= Number(kr.targetValue || 1) || Boolean(kr.isAchieved);
  }

  async toggleKrCheckbox(krId: number, checked: boolean): Promise<void> {
    this.processing.set(true);
    try {
      const response = await this.apiService.updateCollaborationKeyResult({
        id: krId,
        resultType: 'boolean',
        targetValue: 1,
        currentValue: checked ? 1 : 0,
        isAchieved: checked,
        status: checked ? 'completed' : 'in_progress',
      });

      if (!response.success) {
        throw new Error(response.error || '更新關鍵成果狀態失敗');
      }

      await this.loadData();
    } catch (error: any) {
      alert(error?.message || '更新關鍵成果狀態失敗');
    } finally {
      this.processing.set(false);
    }
  }

  async confirmKrCurrentValue(kr: GoalSettingRow['keyResults'][number]): Promise<void> {
    if (!this.isKrWithTarget(kr)) return;

    const rawValue = this.getKrCurrentDraft(kr).trim();
    const nextCurrentValue = Number(rawValue);

    if (!Number.isFinite(nextCurrentValue) || nextCurrentValue < 0) {
      alert('請輸入有效的目前進度數字');
      return;
    }

    this.processing.set(true);
    try {
      const targetValue = Number(kr.targetValue || 0);
      const response = await this.apiService.updateCollaborationKeyResult({
        id: kr.id,
        resultType: 'numeric',
        currentValue: nextCurrentValue,
        targetValue,
        status: nextCurrentValue >= targetValue ? 'completed' : 'in_progress',
      });

      if (!response.success) {
        throw new Error(response.error || '更新目前進度失敗');
      }

      await this.loadData();
    } catch (error: any) {
      alert(error?.message || '更新目前進度失敗');
    } finally {
      this.processing.set(false);
    }
  }
}
