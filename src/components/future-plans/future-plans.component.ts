import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { FuturePlan } from '../../models/financial.model';

interface OwnerOption {
  id: number;
  name: string;
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

  plans = signal<FuturePlan[]>([]);
  owners = signal<OwnerOption[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  keyword = signal('');
  ownerFilter = signal<number | null>(null);

  isModalOpen = signal(false);
  editingPlan = signal<FuturePlan | null>(null);
  isSaving = signal(false);
  isGeneratingTopic = signal(false);

  @ViewChild('contentArea') contentAreaRef?: ElementRef<HTMLElement>;

  planForm = this.fb.group({
    title: ['', Validators.required],
    content: ['', Validators.required],
    ownerEmployeeId: [null as number | null, Validators.required],
  });

  constructor() {
    this.loadOwners();
    this.loadPlans();
  }

  async loadOwners(): Promise<void> {
    try {
      const response = await this.apiService.getEmployeeInfo();
      if (response.success && response.data) {
        this.owners.set(
          (response.data as any[])
            .filter(e => e.position === '經營團隊')
            .map(e => ({ id: Number(e.id), name: e.employee_name }))
        );
      }
    } catch (error) {
      console.error('Error loading owners:', error);
    }
  }

  async loadPlans(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.apiService.getFuturePlans({
        keyword: this.keyword() || undefined,
        ownerEmployeeId: this.ownerFilter() || undefined,
      });
      if (response.success && response.data) {
        this.plans.set(response.data);
      } else {
        this.errorMessage.set(response.error || '載入未來計畫失敗');
      }
    } catch (error) {
      console.error('Error loading future plans:', error);
      this.errorMessage.set('載入未來計畫失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  applyFilters(): void {
    this.loadPlans();
  }

  resetFilters(): void {
    this.keyword.set('');
    this.ownerFilter.set(null);
    this.loadPlans();
  }

  onEditorInput(editor: HTMLElement): void {
    this.planForm.patchValue({ content: editor.innerHTML || '' });
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
    this.onEditorInput(editor);
  }

  private syncEditorContent(): void {
    const value = this.planForm.get('content')?.value || '';
    if (this.contentAreaRef?.nativeElement) {
      this.contentAreaRef.nativeElement.innerHTML = String(value);
    }
  }

  openModal(plan: FuturePlan | null = null): void {
    this.editingPlan.set(plan);
    if (plan) {
      this.planForm.patchValue({
        title: plan.title,
        content: plan.content,
        ownerEmployeeId: plan.ownerEmployeeId,
      });
    } else {
      this.planForm.reset({ title: '', content: '', ownerEmployeeId: null });
    }
    this.isModalOpen.set(true);
    setTimeout(() => this.syncEditorContent(), 0);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingPlan.set(null);
  }

  async generateTopic(): Promise<void> {
    const content = this.planForm.get('content')?.value || '';
    const plainText = content.replace(/<[^>]*>/g, ' ').trim();

    if (plainText.length < 5) {
      alert('請先輸入內容');
      return;
    }

    this.isGeneratingTopic.set(true);
    try {
      const response = await this.apiService.generateFuturePlanTopic({ content: plainText });
      if (response.success && response.data) {
        this.planForm.patchValue({ title: response.data.topic });
      } else {
        alert(response.error || '產出主題失敗');
      }
    } catch (error) {
      console.error('Error generating topic:', error);
      alert('產出主題失敗');
    } finally {
      this.isGeneratingTopic.set(false);
    }
  }

  async handleFormSubmit(): Promise<void> {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    const formValue = this.planForm.value;
    const editing = this.editingPlan();

    this.isSaving.set(true);
    try {
      const payload = {
        title: formValue.title!,
        content: formValue.content!,
        ownerEmployeeId: Number(formValue.ownerEmployeeId),
      };

      const response = editing
        ? await this.apiService.updateFuturePlan({ id: editing.id, ...payload })
        : await this.apiService.createFuturePlan(payload);

      if (!response.success) {
        throw new Error(response.error || (editing ? '更新未來計畫失敗' : '新增未來計畫失敗'));
      }

      await this.loadPlans();
      this.closeModal();
    } catch (error: any) {
      alert(error?.message || (editing ? '更新未來計畫失敗' : '新增未來計畫失敗'));
    } finally {
      this.isSaving.set(false);
    }
  }

  async deletePlan(plan: FuturePlan, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`您確定要刪除計畫「${plan.title}」嗎？`)) return;

    try {
      const response = await this.apiService.deleteFuturePlan(plan.id);
      if (!response.success) {
        throw new Error(response.error || '刪除失敗');
      }
      await this.loadPlans();
    } catch (error: any) {
      alert(error?.message || '刪除失敗');
    }
  }

  formatDateTime(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
