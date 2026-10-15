import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import type {
  LinePushHistory,
  LinePushMessage,
  LinePushOverview,
  LinePushQuota,
  LinePushTestStatus,
} from '../../models/financial.model';
import { memberTagClass } from '../../utils/member-tags';
import { LineFlexPreviewComponent } from './line-flex-preview.component';

type DraftType = 'text' | 'image' | 'video' | 'flex';

/** 編輯中的一則訊息（各類型的欄位都放在一起，切換類型時不會遺失已填內容） */
interface DraftMessage {
  id: number;
  type: DraftType;
  text: string;
  originalUrl: string;
  previewUrl: string;
  altText: string;
  flexJson: string;
  uploading: boolean;
  uploadError: string | null;
}

const MAX_MESSAGES = 5;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;

const FLEX_SAMPLE = {
  type: 'bubble',
  hero: {
    type: 'image',
    url: 'https://developers-resource.landpress.line.me/fx/img/01_1_cafe.png',
    size: 'full',
    aspectRatio: '20:13',
    aspectMode: 'cover',
  },
  body: {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    contents: [
      { type: 'text', text: '活動標題', weight: 'bold', size: 'xl' },
      { type: 'text', text: '活動說明文字，可以換行。', size: 'sm', color: '#666666', wrap: true },
    ],
  },
  footer: {
    type: 'box',
    layout: 'vertical',
    contents: [
      { type: 'button', style: 'primary', color: '#1f2937', action: { type: 'uri', label: '查看詳情', uri: 'https://thegalaxyhouse.com' } },
    ],
  },
};

/** 圖片轉成 JPEG 並限制最長邊（先鋪白底，PNG 透明處才不會變黑） */
async function toJpeg(file: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('圖片轉檔失敗'))), 'image/jpeg', quality)
  );
}

/** 擷取影片接近開頭的一個畫面當預覽圖 */
function captureVideoFrame(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const cleanup = () => URL.revokeObjectURL(url);
    video.onerror = () => {
      cleanup();
      reject(new Error('瀏覽器無法讀取這個影片，請確認是 mp4'));
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error('擷取影片預覽圖失敗'));
      }, 'image/jpeg', 0.8);
    };
    video.src = url;
  });
}

@Component({
  selector: 'app-line-push',
  templateUrl: './line-push.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LineFlexPreviewComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LinePushComponent {
  private apiService = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  readonly MAX_MESSAGES = MAX_MESSAGES;
  readonly Math = Math;
  readonly tagClass = memberTagClass;
  readonly typeLabels: Record<DraftType, string> = { text: '文字', image: '圖片', video: '影片', flex: 'Flex Message' };

  overview = signal<LinePushOverview | null>(null);
  overviewError = signal<string | null>(null);
  quota = signal<LinePushQuota | null>(null);
  quotaError = signal<string | null>(null);
  history = signal<LinePushHistory | null>(null);

  private nextId = 1;
  drafts = signal<DraftMessage[]>([this.newDraft('text')]);

  selectedTagIds = signal<Set<number>>(new Set());
  selectedAdminIds = signal<Set<number>>(new Set());
  showRecipientNames = signal(false);

  testStatus = signal<LinePushTestStatus | null>(null);
  isCheckingTest = signal(false);
  isTesting = signal(false);
  testMessage = signal<string | null>(null);

  showConfirm = signal(false);
  isSending = signal(false);

  // --- 訊息內容 ---

  /** 把編輯中的內容組成 LINE 訊息物件；有錯誤時 messages 為 null */
  built = computed<{ messages: LinePushMessage[] | null; errors: string[]; flexContents: (Record<string, any> | null)[] }>(() => {
    const errors: string[] = [];
    const flexContents: (Record<string, any> | null)[] = [];
    const messages: LinePushMessage[] = [];
    this.drafts().forEach((d, i) => {
      const n = `第 ${i + 1} 則`;
      flexContents.push(null);
      if (d.uploading) errors.push(`${n}還在上傳`);
      switch (d.type) {
        case 'text':
          if (!d.text.trim()) errors.push(`${n}文字是空的`);
          messages.push({ type: 'text', text: d.text });
          break;
        case 'image':
        case 'video':
          if (!/^https:\/\//i.test(d.originalUrl.trim())) errors.push(`${n}${d.type === 'image' ? '圖片' : '影片'}網址要是 https`);
          if (!/^https:\/\//i.test(d.previewUrl.trim())) errors.push(`${n}預覽圖網址要是 https`);
          messages.push({ type: d.type, originalContentUrl: d.originalUrl.trim(), previewImageUrl: d.previewUrl.trim() });
          break;
        case 'flex': {
          if (!d.altText.trim()) errors.push(`${n}要填通知文字`);
          let contents: Record<string, any> | null = null;
          try {
            const parsed = JSON.parse(d.flexJson);
            // 從 Flex Simulator 複製整包 { type: 'flex', contents } 也接受
            contents = parsed?.type === 'flex' && parsed.contents ? parsed.contents : parsed;
            if (contents?.['type'] !== 'bubble' && contents?.['type'] !== 'carousel') {
              errors.push(`${n} Flex 的 type 要是 bubble 或 carousel`);
              contents = null;
            }
          } catch {
            errors.push(`${n} Flex JSON 格式錯誤`);
          }
          flexContents[i] = contents;
          messages.push({ type: 'flex', altText: d.altText.trim(), contents: contents ?? {} });
          break;
        }
      }
    });
    return { messages: errors.length ? null : messages, errors, flexContents };
  });

  // --- 發送對象 ---

  audience = computed(() => {
    const tags = this.overview()?.tags ?? [];
    const selected = this.selectedTagIds();
    const unique = new Map<string, string>();
    let total = 0;
    for (const tag of tags) {
      if (!selected.has(tag.id)) continue;
      total += tag.reachableMembers.length;
      for (const m of tag.reachableMembers) unique.set(m.memberUuid, m.name);
    }
    return {
      tagNames: tags.filter(t => selected.has(t.id)).map(t => t.name),
      count: unique.size,
      duplicates: total - unique.size,
      names: Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    };
  });

  /** 發送後是否會超過本月額度 */
  overQuota = computed(() => {
    const q = this.quota();
    return !!q && q.limit !== null && q.used + this.audience().count > q.limit;
  });

  canSend = computed(() =>
    !!this.built().messages && !!this.testStatus() && this.audience().count > 0 && !this.isSending()
  );

  constructor() {
    this.loadOverview();
    this.loadQuota();
    this.loadHistory();

    // 內容變動後（停 400ms）查詢這份內容是否已測試過；改回原樣也會找回之前的測試
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestNo = 0;
    effect(() => {
      const messages = this.built().messages;
      clearTimeout(timer);
      this.testStatus.set(null);
      if (!messages) return;
      const current = ++requestNo;
      this.isCheckingTest.set(true);
      timer = setTimeout(async () => {
        try {
          const res = await this.apiService.getLinePushTestStatus(messages);
          if (current === requestNo) this.testStatus.set(res.data ?? null);
        } catch (error) {
          console.error('Error checking LINE push test status:', error);
        } finally {
          if (current === requestNo) this.isCheckingTest.set(false);
        }
      }, 400);
    });
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  async loadOverview(): Promise<void> {
    try {
      const res = await this.apiService.getLinePushOverview();
      if (res.success && res.data) {
        const first = !this.overview();
        this.overview.set(res.data);
        this.overviewError.set(null);
        // 預設只勾選登入者自己
        if (first && res.data.currentAdminId && res.data.admins.some(a => a.adminId === res.data!.currentAdminId)) {
          this.selectedAdminIds.set(new Set([res.data.currentAdminId]));
        }
        // 已刪除的標籤從勾選中拿掉
        const tagIds = new Set(res.data.tags.map(t => t.id));
        this.selectedTagIds.update(s => new Set([...s].filter(id => tagIds.has(id))));
      } else {
        this.overviewError.set(res.error || '無法載入發送對象');
      }
    } catch (error: any) {
      this.overviewError.set(error?.error?.error || '無法載入發送對象');
    }
  }

  async loadQuota(): Promise<void> {
    try {
      const res = await this.apiService.getLinePushQuota();
      if (res.success && res.data) {
        this.quota.set(res.data);
        this.quotaError.set(null);
      }
    } catch (error: any) {
      this.quotaError.set(error?.error?.error || '查詢 LINE 用量失敗');
    }
  }

  async loadHistory(): Promise<void> {
    try {
      const res = await this.apiService.getLinePushHistory();
      if (res.success && res.data) this.history.set(res.data);
    } catch (error) {
      console.error('Error loading LINE push history:', error);
    }
  }

  // --- 編輯訊息 ---

  private newDraft(type: DraftType): DraftMessage {
    return { id: this.nextId++, type, text: '', originalUrl: '', previewUrl: '', altText: '', flexJson: '', uploading: false, uploadError: null };
  }

  addDraft(type: DraftType): void {
    if (this.drafts().length >= MAX_MESSAGES) return;
    this.drafts.update(list => [...list, this.newDraft(type)]);
  }

  removeDraft(id: number): void {
    this.drafts.update(list => (list.length > 1 ? list.filter(d => d.id !== id) : list));
  }

  moveDraft(index: number, direction: -1 | 1): void {
    this.drafts.update(list => {
      const target = index + direction;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  updateDraft(id: number, patch: Partial<DraftMessage>): void {
    this.drafts.update(list => list.map(d => (d.id === id ? { ...d, ...patch } : d)));
  }

  insertFlexSample(id: number): void {
    const draft = this.drafts().find(d => d.id === id);
    if (draft?.flexJson.trim() && !confirm('要用範例覆蓋目前的 Flex JSON 嗎？')) return;
    this.updateDraft(id, { flexJson: JSON.stringify(FLEX_SAMPLE, null, 2), altText: draft?.altText || '活動通知' });
  }

  formatFlexJson(id: number): void {
    const draft = this.drafts().find(d => d.id === id);
    try {
      this.updateDraft(id, { flexJson: JSON.stringify(JSON.parse(draft?.flexJson ?? ''), null, 2) });
    } catch {
      alert('JSON 格式錯誤，無法整理');
    }
  }

  async onImageSelected(id: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.updateDraft(id, { uploadError: '只支援 JPEG／PNG 圖片' });
      return;
    }
    this.updateDraft(id, { uploading: true, uploadError: null });
    try {
      // 原圖最長邊 2048、預覽圖 640（LINE 預覽圖上限 1MB）
      const [original, preview] = await Promise.all([toJpeg(file, 2048, 0.88), toJpeg(file, 640, 0.8)]);
      const [o, p] = await Promise.all([
        this.apiService.uploadLinePushMedia(original, 'image', 'image.jpg'),
        this.apiService.uploadLinePushMedia(preview, 'preview', 'preview.jpg'),
      ]);
      this.updateDraft(id, { originalUrl: o.data!.url, previewUrl: p.data!.url, uploading: false });
    } catch (error: any) {
      this.updateDraft(id, { uploading: false, uploadError: error?.error?.error || error?.message || '上傳失敗' });
    }
  }

  async onVideoSelected(id: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.type !== 'video/mp4') {
      this.updateDraft(id, { uploadError: '只支援 mp4 影片' });
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      this.updateDraft(id, { uploadError: '影片超過 20MB，請放到其他地方（例如 YouTube 以外的公開空間）後貼網址' });
      return;
    }
    this.updateDraft(id, { uploading: true, uploadError: null });
    try {
      const preview = await captureVideoFrame(file);
      const [v, p] = await Promise.all([
        this.apiService.uploadLinePushMedia(file, 'video', file.name || 'video.mp4'),
        this.apiService.uploadLinePushMedia(preview, 'preview', 'preview.jpg'),
      ]);
      this.updateDraft(id, { originalUrl: v.data!.url, previewUrl: p.data!.url, uploading: false });
    } catch (error: any) {
      this.updateDraft(id, { uploading: false, uploadError: error?.error?.error || error?.message || '上傳失敗' });
    }
  }

  // --- 對象與管理員 ---

  toggleTag(tagId: number): void {
    this.selectedTagIds.update(s => {
      const next = new Set(s);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  toggleAdmin(adminId: number): void {
    this.selectedAdminIds.update(s => {
      const next = new Set(s);
      if (next.has(adminId)) next.delete(adminId);
      else next.add(adminId);
      return next;
    });
  }

  async setAdminMember(adminId: number, memberUuid: string): Promise<void> {
    try {
      await this.apiService.setLinePushAdminMember(adminId, memberUuid || null);
      await this.loadOverview();
    } catch (error: any) {
      alert(error?.error?.error || '儲存失敗');
      await this.loadOverview();
    }
  }

  // --- 測試與發送 ---

  async sendTest(): Promise<void> {
    const messages = this.built().messages;
    const adminIds = [...this.selectedAdminIds()];
    if (!messages) {
      alert(this.built().errors.join('\n'));
      return;
    }
    if (adminIds.length === 0) {
      alert('請至少勾選一位管理員');
      return;
    }
    this.isTesting.set(true);
    this.testMessage.set(null);
    try {
      const res = await this.apiService.sendLinePushTest(messages, adminIds);
      const data = res.data!;
      if (!res.success) {
        alert(`${res.error || '測試發送失敗'}\n${data.results.map(r => `${r.name}：${r.error}`).join('\n')}`);
        return;
      }
      const failed = data.results.filter(r => !r.ok);
      this.testMessage.set(
        `已發送給 ${data.results.filter(r => r.ok).map(r => r.name).join('、')}` +
          (failed.length ? `；失敗：${failed.map(r => `${r.name}（${r.error}）`).join('、')}` : '')
      );
      const status = await this.apiService.getLinePushTestStatus(messages);
      this.testStatus.set(status.data ?? null);
      this.loadQuota();
      this.loadHistory();
    } catch (error: any) {
      const body = error?.error;
      const detail = body?.data?.results?.filter((r: any) => !r.ok).map((r: any) => `${r.name}：${r.error}`).join('\n');
      alert(`${body?.error || '測試發送失敗'}${detail ? `\n${detail}` : ''}`);
    } finally {
      this.isTesting.set(false);
    }
  }

  openConfirm(): void {
    if (!this.built().messages) {
      alert(this.built().errors.join('\n'));
      return;
    }
    if (!this.testStatus()) {
      alert('這份內容還沒有測試發送給管理員，請先測試發送，確認手機上顯示正確後再正式發送。');
      return;
    }
    if (this.audience().count === 0) {
      alert('請勾選至少一個有 LINE 可發送的會員分類標籤');
      return;
    }
    this.showConfirm.set(true);
  }

  async confirmSend(): Promise<void> {
    const messages = this.built().messages;
    if (!messages) return;
    this.isSending.set(true);
    try {
      const res = await this.apiService.sendLinePush(messages, [...this.selectedTagIds()], this.audience().count);
      const d = res.data!;
      this.showConfirm.set(false);
      alert(
        d.failedCount === 0
          ? `已發送給 ${d.successCount} 位客人（紀錄 #${d.pushId}）`
          : `發送完成：成功 ${d.successCount} 位、失敗 ${d.failedCount} 位（紀錄 #${d.pushId}）`
      );
    } catch (error: any) {
      const body = error?.error;
      alert(body?.error || '發送失敗');
      if (body?.errorCode === 'RECIPIENTS_CHANGED') {
        this.showConfirm.set(false);
        await this.loadOverview();
      }
    } finally {
      this.isSending.set(false);
      this.loadQuota();
      this.loadHistory();
    }
  }

  // --- 顯示用 ---

  summarizeMessages(messages: LinePushMessage[]): string {
    return messages
      .map(m => (m.type === 'text' ? `文字：${m.text.slice(0, 20)}${m.text.length > 20 ? '…' : ''}` : m.type === 'flex' ? `Flex：${m.altText}` : this.typeLabels[m.type]))
      .join('／');
  }

  statusLabel(status: string): string {
    return ({ sending: '發送中', sent: '已發送', partial: '部分失敗', failed: '失敗' } as Record<string, string>)[status] ?? status;
  }
}
