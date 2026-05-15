import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface Decision {
  id: number;
  date: string;
  title: string;
  background: string;
  content: string;
  rationale: string;
  finalDecision: string;
  stakeholders: string;
  attendeeIds: number[];
}

interface EmployeeOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-decision-log',
  templateUrl: './decision-log.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DecisionLogComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  isModalOpen = signal(false);
  editingDecision = signal<Decision | null>(null);
  decisionToDelete = signal<Decision | null>(null);
  loading = signal(false);
  processing = signal(false);

  decisions = signal<Decision[]>([]);
  employees = signal<EmployeeOption[]>([]);
  @ViewChild('backgroundArea') backgroundAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('contentArea') contentAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('rationaleArea') rationaleAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('finalDecisionArea') finalDecisionAreaRef?: ElementRef<HTMLElement>;

  constructor() {
    this.loadDecisions();
  }

  private parseContent(content: string): { background: string; content: string; rationale: string; finalDecision: string } {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return {
          background: parsed.background || '',
          content: parsed.content || parsed.decision || '',
          rationale: parsed.rationale || '',
          finalDecision: parsed.finalDecision || parsed.decision || '',
        };
      }
    } catch {
      // ignore
    }
    return { background: '', content: content || '', rationale: '', finalDecision: '' };
  }

  private stringifyContent(background: string, content: string, rationale: string, finalDecision: string): string {
    return JSON.stringify({ background, content, rationale, finalDecision });
  }

  onEditorInput(controlName: 'background' | 'content' | 'rationale' | 'finalDecision', editor: HTMLElement): void {
    this.decisionForm.patchValue({ [controlName]: editor.innerHTML || '' });
  }

  private syncEditorContents(): void {
    const backgroundValue = this.decisionForm.get('background')?.value || '';
    const contentValue = this.decisionForm.get('content')?.value || '';
    const rationaleValue = this.decisionForm.get('rationale')?.value || '';
    const finalDecisionValue = this.decisionForm.get('finalDecision')?.value || '';

    if (this.backgroundAreaRef?.nativeElement) {
      this.backgroundAreaRef.nativeElement.innerHTML = String(backgroundValue);
    }
    if (this.contentAreaRef?.nativeElement) {
      this.contentAreaRef.nativeElement.innerHTML = String(contentValue);
    }
    if (this.rationaleAreaRef?.nativeElement) {
      this.rationaleAreaRef.nativeElement.innerHTML = String(rationaleValue);
    }
    if (this.finalDecisionAreaRef?.nativeElement) {
      this.finalDecisionAreaRef.nativeElement.innerHTML = String(finalDecisionValue);
    }
  }

  applyTextFormat(controlName: 'background' | 'content' | 'rationale' | 'finalDecision', type: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered', editor: HTMLElement): void {
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      bullet: 'insertUnorderedList',
      numbered: 'insertOrderedList',
    } as const;

    editor.focus();
    document.execCommand(commandMap[type], false);
    this.onEditorInput(controlName, editor);
  }

  isStakeholderSelected(employeeId: number): boolean {
    const selected = this.decisionForm.get('stakeholders')?.value as number[] | null;
    return Array.isArray(selected) && selected.includes(employeeId);
  }

  toggleStakeholder(employeeId: number, checked: boolean): void {
    const selected = (this.decisionForm.get('stakeholders')?.value as number[] | null) || [];
    const unique = new Set(selected);

    if (checked) {
      unique.add(employeeId);
    } else {
      unique.delete(employeeId);
    }

    this.decisionForm.patchValue({ stakeholders: Array.from(unique) });
    this.decisionForm.get('stakeholders')?.markAsDirty();
    this.decisionForm.get('stakeholders')?.updateValueAndValidity();
  }

  async loadDecisions(): Promise<void> {
    this.loading.set(true);
    try {
      const [announceRes, employeeRes] = await Promise.all([
        this.apiService.getCollaborationAnnouncements(),
        this.apiService.getEmployeeInfo(),
      ]);

      if (employeeRes.success && employeeRes.data) {
        this.employees.set((employeeRes.data as any[]).map((emp: any) => ({
          id: Number(emp.id),
          name: emp.employee_name,
        })));
      }

      const response = announceRes;
      if (!response.success || !response.data) {
        throw new Error(response.error || '載入重大事項失敗');
      }

      const mapped: Decision[] = (response.data as any[]).map((item: any) => {
        const contentFields = this.parseContent(item.content || '');
        const attendeeIds = (item.attendees || []).map((a: any) => Number(a.attendeeEmployeeId)).filter((v: number) => Number.isFinite(v));
        const stakeholders = (item.attendees || []).map((a: any) => a.attendeeEmployeeName || String(a.attendeeEmployeeId)).join(', ');

        return {
          id: Number(item.id),
          date: item.announcedAt ? String(item.announcedAt).split('T')[0] : '',
          title: item.title || '',
          background: contentFields.background,
          content: contentFields.content,
          rationale: contentFields.rationale,
          finalDecision: contentFields.finalDecision,
          stakeholders,
          attendeeIds,
        };
      });

      this.decisions.set(mapped);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '載入重大事項失敗');
    } finally {
      this.loading.set(false);
    }
  }

  sortedDecisions = computed(() => {
    return this.decisions().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  decisionForm = this.fb.group({
    date: ['', Validators.required],
    title: ['', Validators.required],
    stakeholders: [([] as number[]), Validators.required],
    background: ['', Validators.required],
    content: ['', Validators.required],
    rationale: ['', Validators.required],
    finalDecision: ['', Validators.required],
  });
  
  openModal(decision: Decision | null = null): void {
    this.editingDecision.set(decision);
    if (decision) {
      this.decisionForm.patchValue({
        date: decision.date,
        title: decision.title,
        stakeholders: decision.attendeeIds,
        background: decision.background,
        content: decision.content,
        rationale: decision.rationale,
        finalDecision: decision.finalDecision,
      });
    } else {
      this.decisionForm.reset({ date: new Date().toISOString().split('T')[0] });
    }
    this.isModalOpen.set(true);
    setTimeout(() => this.syncEditorContents(), 0);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingDecision.set(null);
  }

  async handleFormSubmit(): Promise<void> {
    if (this.decisionForm.invalid) {
      return;
    }

    const formValue = this.decisionForm.value;
    const editing = this.editingDecision();

    const attendeeIds = ((formValue.stakeholders || []) as number[])
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0);

    const payload = {
      title: formValue.title!,
      content: this.stringifyContent(formValue.background!, formValue.content!, formValue.rationale!, formValue.finalDecision!),
      announcedAt: formValue.date!,
      attendeeEmployeeIds: attendeeIds,
    };

    this.processing.set(true);
    try {
      if (editing) {
        const response = await this.apiService.updateCollaborationAnnouncement({ id: editing.id, ...payload });
        if (!response.success) throw new Error(response.error || '更新失敗');
      } else {
        const response = await this.apiService.createCollaborationAnnouncement(payload);
        if (!response.success) throw new Error(response.error || '新增失敗');
      }

      await this.loadDecisions();
      this.closeModal();
    } catch (error: any) {
      alert(error?.message || '儲存失敗');
    } finally {
      this.processing.set(false);
    }
  }

  requestDelete(decision: Decision): void {
    this.decisionToDelete.set(decision);
  }

  async confirmDelete(): Promise<void> {
    if (!this.decisionToDelete()) return;
    this.processing.set(true);
    try {
      const idToDelete = this.decisionToDelete()!.id;
      const response = await this.apiService.deleteCollaborationAnnouncement(idToDelete);
      if (!response.success) throw new Error(response.error || '刪除失敗');
      await this.loadDecisions();
      this.cancelDelete();
    } catch (error: any) {
      alert(error?.message || '刪除失敗');
    } finally {
      this.processing.set(false);
    }
  }

  cancelDelete(): void {
    this.decisionToDelete.set(null);
  }
}
