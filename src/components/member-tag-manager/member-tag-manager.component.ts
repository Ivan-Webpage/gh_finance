import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import type { MemberTag, MemberTagColor } from '../../models/financial.model';
import { MEMBER_TAG_COLOR_OPTIONS, memberTagClass } from '../../utils/member-tags';

/**
 * 顧客管理「會員分類標籤」分頁：新增／修改／刪除／排序標籤。
 * 只有超級管理員、經營管理者看得到（由顧客管理頁面判斷，後端 API 也會擋）。
 */
@Component({
  selector: 'app-member-tag-manager',
  templateUrl: './member-tag-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MemberTagManagerComponent {
  private apiService = inject(ApiService);

  /** 標籤有異動（新增／改名／改色／刪除／排序）時通知顧客管理重新載入 */
  changed = output<void>();

  readonly colorOptions = MEMBER_TAG_COLOR_OPTIONS;
  readonly tagClass = memberTagClass;

  tags = signal<MemberTag[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  isSaving = signal(false);

  newName = signal('');
  newColor = signal<MemberTagColor>('blue');
  newDescription = signal('');

  editingId = signal<number | null>(null);
  editName = signal('');
  editColor = signal<MemberTagColor>('gray');
  editDescription = signal('');

  constructor() {
    this.loadTags();
  }

  async loadTags(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.apiService.getMemberTags();
      if (response.success && response.data) {
        this.tags.set(response.data);
      } else {
        this.errorMessage.set(response.error || '無法取得標籤');
      }
    } catch (error) {
      console.error('Error loading member tags:', error);
      this.errorMessage.set('載入標籤失敗，請稍後重試');
    } finally {
      this.isLoading.set(false);
    }
  }

  async createTag(): Promise<void> {
    const name = this.newName().trim().replace(/^#+/, '').trim();
    if (!name) {
      alert('請輸入標籤名稱');
      return;
    }
    this.isSaving.set(true);
    try {
      const response = await this.apiService.createMemberTag({
        name,
        color: this.newColor(),
        description: this.newDescription().trim() || null,
      });
      if (response.success && response.data) {
        this.tags.update(list => [...list, response.data!]);
        this.newName.set('');
        this.newDescription.set('');
        this.changed.emit();
      }
    } catch (error: any) {
      alert(error?.error?.error || '新增標籤失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  startEdit(tag: MemberTag): void {
    this.editingId.set(tag.id);
    this.editName.set(tag.name);
    this.editColor.set(tag.color);
    this.editDescription.set(tag.description ?? '');
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  async saveEdit(tag: MemberTag): Promise<void> {
    const name = this.editName().trim().replace(/^#+/, '').trim();
    if (!name) {
      alert('請輸入標籤名稱');
      return;
    }
    this.isSaving.set(true);
    try {
      const response = await this.apiService.updateMemberTag(tag.id, {
        name,
        color: this.editColor(),
        description: this.editDescription().trim() || null,
      });
      if (response.success && response.data) {
        this.tags.update(list => list.map(t => (t.id === tag.id ? response.data! : t)));
        this.editingId.set(null);
        this.changed.emit();
      }
    } catch (error: any) {
      alert(error?.error?.error || '儲存失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteTag(tag: MemberTag): Promise<void> {
    const message = tag.memberCount > 0
      ? `確定刪除「#${tag.name}」？目前有 ${tag.memberCount} 位會員貼了這個標籤，會一起移除，無法復原。`
      : `確定刪除「#${tag.name}」？`;
    if (!confirm(message)) return;

    this.isSaving.set(true);
    try {
      const response = await this.apiService.deleteMemberTag(tag.id);
      if (response.success) {
        this.tags.update(list => list.filter(t => t.id !== tag.id));
        this.changed.emit();
      }
    } catch (error: any) {
      alert(error?.error?.error || '刪除失敗，請稍後再試');
    } finally {
      this.isSaving.set(false);
    }
  }

  /** 跟上／下一個標籤交換排序（兩筆都重新寫 sort_order，避免原本數字相同時交換無效） */
  async move(index: number, direction: -1 | 1): Promise<void> {
    const list = [...this.tags()];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];

    this.isSaving.set(true);
    try {
      const updates = list
        .map((tag, i) => ({ tag, sortOrder: (i + 1) * 10 }))
        .filter(({ tag, sortOrder }) => tag.sortOrder !== sortOrder);
      await Promise.all(updates.map(({ tag, sortOrder }) => this.apiService.updateMemberTag(tag.id, { sortOrder })));
      this.tags.set(list.map((tag, i) => ({ ...tag, sortOrder: (i + 1) * 10 })));
      this.changed.emit();
    } catch (error: any) {
      alert(error?.error?.error || '調整順序失敗，請稍後再試');
      await this.loadTags();
    } finally {
      this.isSaving.set(false);
    }
  }
}
