import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { LineUser } from '../../models/financial.model';

type StatusTab = 'pending' | 'linked' | 'ignored' | 'all';

interface MemberOption {
  uuid: string;
  name: string;
}

interface DraftState {
  member_uuid: string;
  note: string;
}

/**
 * LINE 用戶：GAS 轉送的 webhook 事件寫進 mkt.line_users，這裡依最後互動時間列出，
 * 人工對應到 iChef 會員。店內實際用法：請客人傳一張貼圖，最上面那一位就是他。
 */
@Component({
  selector: 'app-line-users',
  templateUrl: './line-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LineUsersComponent {
  private apiService = inject(ApiService);

  users = signal<LineUser[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  savingId = signal<string | null>(null);

  activeTab = signal<StatusTab>('pending');
  searchText = signal('');

  /** 每位 LINE 用戶在畫面上尚未儲存的下拉選單／備註 */
  drafts = signal<Record<string, DraftState>>({});

  shareholderMembers = signal<MemberOption[]>([]);
  cigarMembers = signal<MemberOption[]>([]);
  otherMembers = signal<MemberOption[]>([]);

  readonly tabs: { key: StatusTab; label: string }[] = [
    { key: 'pending', label: '待對應' },
    { key: 'linked', label: '已對應' },
    { key: 'ignored', label: '已忽略' },
    { key: 'all', label: '全部' },
  ];

  counts = computed(() => {
    const all = this.users();
    return {
      pending: all.filter(u => !u.member_uuid && !u.is_ignored).length,
      linked: all.filter(u => !!u.member_uuid).length,
      ignored: all.filter(u => u.is_ignored).length,
      all: all.length,
    } as Record<StatusTab, number>;
  });

  /** 已經對應到某個 LINE 帳號的會員 → 該 LINE userId，用來停用下拉選項 */
  linkedMemberOwners = computed(() => {
    const map = new Map<string, string>();
    for (const u of this.users()) {
      if (u.member_uuid) map.set(u.member_uuid, u.line_user_id);
    }
    return map;
  });

  visibleUsers = computed(() => {
    const tab = this.activeTab();
    const keyword = this.searchText().trim().toLowerCase();
    return this.users().filter(u => {
      if (tab === 'pending' && (u.member_uuid || u.is_ignored)) return false;
      if (tab === 'linked' && !u.member_uuid) return false;
      if (tab === 'ignored' && !u.is_ignored) return false;
      if (!keyword) return true;
      return [u.display_name, u.last_message, u.member_name, u.note]
        .some(v => (v || '').toLowerCase().includes(keyword));
    });
  });

  constructor() {
    void this.loadUsers();
    void this.loadMembers();
  }

  async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const response = await this.apiService.getLineUsers('all');
      if (response.success && Array.isArray(response.data)) {
        this.users.set(response.data);
        this.drafts.set({});
      } else {
        this.errorMessage.set(response.error || '載入 LINE 用戶失敗');
      }
    } catch (error: any) {
      this.errorMessage.set(error?.error?.error || error?.message || '載入 LINE 用戶失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadMembers(): Promise<void> {
    try {
      const response = await this.apiService.getCustomers({ limit: 1000 });
      if (!response?.success || !Array.isArray(response.data)) return;
      const members: MemberOption[] = response.data
        .filter((c: any) => c?.id && !c.isDeleted)
        .map((c: any) => ({ uuid: String(c.id).toLowerCase(), name: String(c.name || '') }))
        .sort((a: MemberOption, b: MemberOption) => a.name.localeCompare(b.name, 'zh-Hant'));
      this.shareholderMembers.set(members.filter(m => m.name.startsWith('股東')));
      this.cigarMembers.set(members.filter(m => !m.name.startsWith('股東') && m.name.includes('雪茄')));
      this.otherMembers.set(members.filter(m => !m.name.startsWith('股東') && !m.name.includes('雪茄')));
    } catch (error) {
      console.error('Error loading members:', error);
    }
  }

  draftOf(user: LineUser): DraftState {
    return this.drafts()[user.line_user_id] ?? { member_uuid: user.member_uuid ?? '', note: user.note ?? '' };
  }

  setDraft(user: LineUser, patch: Partial<DraftState>): void {
    const current = this.draftOf(user);
    this.drafts.update(d => ({ ...d, [user.line_user_id]: { ...current, ...patch } }));
  }

  isDirty(user: LineUser): boolean {
    const draft = this.drafts()[user.line_user_id];
    if (!draft) return false;
    return draft.member_uuid !== (user.member_uuid ?? '') || draft.note.trim() !== (user.note ?? '');
  }

  isTakenByOther(memberUuid: string, user: LineUser): boolean {
    const owner = this.linkedMemberOwners().get(memberUuid);
    return !!owner && owner !== user.line_user_id;
  }

  async save(user: LineUser): Promise<void> {
    const draft = this.draftOf(user);
    const payload: { line_user_id: string; member_uuid?: string | null; note?: string | null } = {
      line_user_id: user.line_user_id,
    };
    if (draft.member_uuid !== (user.member_uuid ?? '')) {
      payload.member_uuid = draft.member_uuid || null;
    }
    if (draft.note.trim() !== (user.note ?? '')) {
      payload.note = draft.note.trim() || null;
    }
    await this.update(user, payload);
  }

  async toggleIgnored(user: LineUser): Promise<void> {
    await this.update(user, { line_user_id: user.line_user_id, is_ignored: !user.is_ignored });
  }

  private async update(
    user: LineUser,
    payload: { line_user_id: string; member_uuid?: string | null; is_ignored?: boolean; note?: string | null }
  ): Promise<void> {
    this.savingId.set(user.line_user_id);
    this.errorMessage.set('');
    try {
      const response = await this.apiService.updateLineUser(payload);
      if (!response.success || !response.data) {
        this.errorMessage.set(response.error || '儲存失敗');
        return;
      }
      const updated = response.data;
      this.users.update(list => list.map(u => (u.line_user_id === updated.line_user_id ? updated : u)));
      this.drafts.update(d => {
        const next = { ...d };
        delete next[user.line_user_id];
        return next;
      });
    } catch (error: any) {
      this.errorMessage.set(error?.error?.error || error?.message || '儲存失敗');
    } finally {
      this.savingId.set(null);
    }
  }
}
