import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface FuturePlan {
  id: number;
  title: string;
  content: string;
  ownerEmployeeId: number;
  ownerEmployeeName: string;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeOption {
  id: number;
  name: string;
  position?: string;
}

@Component({
  selector: 'app-future-plans',
  templateUrl: './future-plans.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FuturePlansComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  isModalOpen = signal(false);
  loading = signal(false);
  processing = signal(false);
  generatingTopic = signal(false);

  plans = signal<FuturePlan[]>([]);
  employees = signal<EmployeeOption[]>([]);
  editingPlan = signal<FuturePlan | null>(null);
  selectedPlan = signal<FuturePlan | null>(null);
  planToDelete = signal<FuturePlan | null>(null);

  textFilter = signal('');
  ownerFilter = signal('');

  @ViewChild('contentArea') contentAreaRef?: ElementRef<HTMLElement>;

  planForm = this.fb.group({
    title: ['', Validators.required],
    content: ['', Validators.required],
    ownerEmployeeId: ['', Validators.required],
  });

  constructor() {
    this.loadData();
  }

  private filterEmployeesToManagementTeam(employees: any[]): any[] {
    const list = Array.isArray(employees) ? employees : [];
    const hasAnyPosition = list.some(emp => String(emp?.position || '').trim().length > 0);
    if (!hasAnyPosition) {
      return list;
    }

    return list.filter(emp => String(emp?.position || '').trim() === '經營團隊');
  }

  private syncContentEditor(): void {
    const contentValue = this.planForm.get('content')?.value || '';
    if (this.contentAreaRef?.nativeElement) {
      this.contentAreaRef.nativeElement.innerHTML = String(contentValue);
    }
  }

  onContentEditorInput(editor: HTMLElement): void {
    this.planForm.patchValue({ content: editor.innerHTML || '' });
    this.planForm.get('content')?.markAsDirty();
    this.planForm.get('content')?.updateValueAndValidity();
  }

  applyTextFormat(type: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered', editor: HTMLElement): void {
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      bullet: 'insertUnorderedList',
      numbered: 'insertOrderedList',
    } as const;

    editor.focus();
    document.execCommand(commandMap[type], false);
    this.onContentEditorInput(editor);
  }

  private stripHtml(html: string): string {
    return String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<\s*li\s*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [plansRes, employeeRes] = await Promise.all([
        this.apiService.getCollaborationFuturePlans(),
        this.apiService.getEmployeeInfo(),
      ]);

      if (employeeRes.success && employeeRes.data) {
        const team = this.filterEmployeesToManagementTeam(employeeRes.data as any[]);
        this.employees.set(
          team.map((emp: any) => ({
            id: Number(emp.id),
            name: emp.employee_name,
            position: emp.position,
          }))
        );
      }

      if (!plansRes.success || !plansRes.data) {
        throw new Error(plansRes.error || '載入未來計畫失敗');
      }

      this.plans.set((plansRes.data as any[]).map((row: any) => ({
        id: Number(row.id),
        title: row.title || '',
        content: row.content || '',
        ownerEmployeeId: Number(row.ownerEmployeeId),
        ownerEmployeeName: row.ownerEmployeeName || '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })));
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '載入未來計畫失敗');
    } finally {
      this.loading.set(false);
    }
  }

  sortedPlans = computed(() => {
    return this.plans()
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  filteredPlans = computed(() => {
    const keyword = this.textFilter().trim().toLowerCase();
    const ownerId = this.ownerFilter();

    return this.sortedPlans().filter(plan => {
      const matchesOwner = !ownerId || String(plan.ownerEmployeeId) === ownerId;
      if (!matchesOwner) return false;

      if (!keyword) return true;

      const plainContent = this.stripHtml(plan.content).toLowerCase();
      return plan.title.toLowerCase().includes(keyword) || plainContent.includes(keyword);
    });
  });

  openModal(plan: FuturePlan | null = null): void {
    this.editingPlan.set(plan);
    if (plan) {
      this.planForm.patchValue({
        title: plan.title,
        content: plan.content,
        ownerEmployeeId: String(plan.ownerEmployeeId),
      });
    } else {
      this.planForm.reset({
        title: '',
        content: '',
        ownerEmployeeId: '',
      });
    }

    this.isModalOpen.set(true);
    setTimeout(() => this.syncContentEditor(), 0);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingPlan.set(null);
  }

  openDetail(plan: FuturePlan): void {
    this.selectedPlan.set(plan);
  }

  closeDetail(): void {
    this.selectedPlan.set(null);
  }

  async generatePlanTopic(): Promise<void> {
    if (this.generatingTopic()) return;

    const contentFromForm = String(this.planForm.get('content')?.value || '');
    const contentHtml = this.contentAreaRef?.nativeElement?.innerHTML || contentFromForm;

    this.planForm.patchValue({ content: contentHtml }, { emitEvent: false });

    const contentText = this.stripHtml(contentHtml);
    if (contentText.length < 5) {
      alert('請先輸入內容');
      return;
    }

    this.generatingTopic.set(true);
    try {
      const response = await this.apiService.generateCollaborationFuturePlanTopic({
        content: contentText,
        maxLen: 30,
      });

      if (!response.success || !response.data?.topic) {
        throw new Error(response.error || 'AI 產出主題失敗');
      }

      this.planForm.patchValue({ title: String(response.data.topic).trim() });
      this.planForm.get('title')?.markAsDirty();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'AI 產出主題失敗');
    } finally {
      this.generatingTopic.set(false);
      this.syncContentEditor();
    }
  }

  async handleSubmit(): Promise<void> {
    if (this.planForm.invalid) return;

    const formValue = this.planForm.value;
    const ownerEmployeeId = Number(formValue.ownerEmployeeId);
    if (!Number.isFinite(ownerEmployeeId) || ownerEmployeeId <= 0) {
      alert('請選擇有效負責人');
      return;
    }

    const payload = {
      title: String(formValue.title || '').trim(),
      content: String(formValue.content || '').trim(),
      ownerEmployeeId,
    };

    this.processing.set(true);
    try {
      const editing = this.editingPlan();
      if (editing) {
        const res = await this.apiService.updateCollaborationFuturePlan({ id: editing.id, ...payload });
        if (!res.success) throw new Error(res.error || '更新未來計畫失敗');
      } else {
        const res = await this.apiService.createCollaborationFuturePlan(payload);
        if (!res.success) throw new Error(res.error || '新增未來計畫失敗');
      }

      await this.loadData();
      this.closeModal();
    } catch (error: any) {
      alert(error?.message || '儲存失敗');
    } finally {
      this.processing.set(false);
    }
  }

  resetFilters(): void {
    this.textFilter.set('');
    this.ownerFilter.set('');
  }

  requestDelete(plan: FuturePlan): void {
    this.planToDelete.set(plan);
  }

  async confirmDelete(): Promise<void> {
    if (!this.planToDelete()) return;

    this.processing.set(true);
    try {
      const idToDelete = this.planToDelete()!.id;
      const res = await this.apiService.deleteCollaborationFuturePlan(idToDelete);
      if (!res.success) throw new Error(res.error || '刪除失敗');

      await this.loadData();
      this.cancelDelete();
    } catch (error: any) {
      alert(error?.message || '刪除失敗');
    } finally {
      this.processing.set(false);
    }
  }

  cancelDelete(): void {
    this.planToDelete.set(null);
  }
}
