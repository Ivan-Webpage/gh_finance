import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators, FormArray } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface Shareholder {
  id: string;
  name: string;
}

interface ProgressRecord {
  id: string;
  weeklyId: number;
  category: string;
  goal: string;
  progress: string;
  assigneeId: string;
  lastUpdated: string;
}

interface MeetingProgress {
  id: string;
  date: string;
  topic: string;
  attendeeIds: number[];
  meetingNotes: string;
  actionItems: string;
  metaRecordId: number | null;
  records: ProgressRecord[];
}


@Component({
  selector: 'app-shareholder-records',
  templateUrl: './shareholder-records.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShareholderRecordsComponent {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);
  private readonly now = new Date();
  readonly currentYear = this.now.getFullYear();
  readonly currentMonth = this.now.getMonth() + 1;

  isRecordModalOpen = signal(false);
  isShareholderModalOpen = signal(false);
  isMeetingModalOpen = signal(false);

  editingRecord = signal<{ record: ProgressRecord | null, meetingId: string } | null>(null);
  editingMeeting = signal<MeetingProgress | null>(null);
  openMeetingId = signal<string | null>(null);

  yearFilter = signal(String(this.currentYear));
  monthFilter = signal(String(this.currentMonth).padStart(2, '0'));
  categoryFilter = signal('');
  assigneeFilter = signal('');
  loading = signal(false);
  processing = signal(false);
  generatingTopic = signal(false);

  shareholders = signal<Shareholder[]>([]);
  meetingProgresses = signal<MeetingProgress[]>([]);
  recordCategories = ['店內', '財務', '活動', '行銷', '系統', '會員', '加盟'];
  @ViewChild('meetingNotesArea') meetingNotesAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('meetingActionItemsArea') meetingActionItemsAreaRef?: ElementRef<HTMLElement>;
  @ViewChild('recordProgressArea') recordProgressAreaRef?: ElementRef<HTMLElement>;

  private isNumericId(id: string): boolean {
    return /^\d+$/.test(String(id));
  }

  employeeShareholders = computed(() => this.shareholders().filter(s => this.isNumericId(s.id)));

  private getErrorMessage(error: any, fallback: string): string {
    return (
      error?.error?.error ||
      error?.error?.message ||
      error?.message ||
      fallback
    );
  }

  constructor() {
    this.loadData();
  }

  private formatDateTime(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).replace(/\//g, '-');
  }

  private parseCategory(summary?: string | null): { category: string; progress: string } {
    const text = String(summary || '').replace(/^\uFEFF/, '');
    const trimmed = text.trimStart();
    const match = trimmed.match(/^\[(.+?)\]\s*([\s\S]*)$/);
    if (match) {
      const category = match[1];
      const progress = this.stripLeadingBracketPrefixes(match[2] || '');
      return { category, progress };
    }
    return { category: '其他', progress: this.stripLeadingBracketPrefixes(trimmed) };
  }

  private buildSummary(category: string, progress: string): string {
    // Category is stored in its own DB field now; do not embed it in progress summary.
    // Also strip any historical "[分類]" prefixes to prevent them from reappearing.
    return this.stripLeadingBracketPrefixes(progress).trim();
  }

  private stripLeadingBracketPrefixes(progress: string): string {
    let text = String(progress || '').replace(/^\uFEFF/, '');

    while (true) {
      const trimmed = text.trimStart();
      const match = trimmed.match(/^\[[^\]]+\]\s*/);
      if (!match) return trimmed;
      text = trimmed.slice(match[0].length);
    }
  }

  private stripSameCategoryPrefix(category: string, progress: string): string {
    const prefix = `[${category}]`;
    let text = String(progress || '');

    // Remove repeated leading prefixes that match the current category.
    // This prevents "[系統]" from being appended on each save.
    while (text.trimStart().startsWith(prefix)) {
      text = text.trimStart().slice(prefix.length);
    }

    return text.trimStart();
  }

  private parseMeetingBlockers(blockers?: string | null): { attendeeIds: number[]; actionItems: string } {
    const text = String(blockers || '');
    const attendeeLine = text.match(/ATTENDEES:([^\n]*)/);
    const actionMatch = text.match(/ACTION_ITEMS:\n([\s\S]*)$/);

    const attendeeIds = (attendeeLine?.[1] || '')
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => Number.isFinite(v) && v > 0);

    return {
      attendeeIds,
      actionItems: (actionMatch?.[1] || '').trim(),
    };
  }

  private buildMeetingBlockers(attendeeIds: number[], actionItems: string): string {
    return `ATTENDEES:${attendeeIds.join(',')}\nACTION_ITEMS:\n${actionItems || ''}`.trim();
  }

  onMeetingEditorInput(controlName: 'meetingNotes' | 'actionItems', editor: HTMLElement): void {
    this.meetingForm.patchValue({ [controlName]: editor.innerHTML || '' });
  }

  private syncMeetingEditorContents(): void {
    const notesValue = this.meetingForm.get('meetingNotes')?.value || '';
    const actionItemsValue = this.meetingForm.get('actionItems')?.value || '';

    if (this.meetingNotesAreaRef?.nativeElement) {
      this.meetingNotesAreaRef.nativeElement.innerHTML = String(notesValue);
    }
    if (this.meetingActionItemsAreaRef?.nativeElement) {
      this.meetingActionItemsAreaRef.nativeElement.innerHTML = String(actionItemsValue);
    }
  }

  applyMeetingTextFormat(controlName: 'meetingNotes' | 'actionItems', type: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered', editor: HTMLElement): void {
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      bullet: 'insertUnorderedList',
      numbered: 'insertOrderedList',
    } as const;

    editor.focus();
    document.execCommand(commandMap[type], false);
    this.onMeetingEditorInput(controlName, editor);
  }

  private syncRecordEditorContents(): void {
    const progressValue = this.recordForm.get('progress')?.value || '';
    if (this.recordProgressAreaRef?.nativeElement) {
      this.recordProgressAreaRef.nativeElement.innerHTML = String(progressValue);
    }
  }

  onRecordEditorInput(editor: HTMLElement): void {
    this.recordForm.patchValue({ progress: editor.innerHTML || '' });
    this.recordForm.get('progress')?.markAsDirty();
    this.recordForm.get('progress')?.updateValueAndValidity();
  }

  applyRecordTextFormat(type: 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered', editor: HTMLElement): void {
    const commandMap = {
      bold: 'bold',
      italic: 'italic',
      underline: 'underline',
      bullet: 'insertUnorderedList',
      numbered: 'insertOrderedList',
    } as const;

    editor.focus();
    document.execCommand(commandMap[type], false);
    this.onRecordEditorInput(editor);
  }

  async generateMeetingTopic(): Promise<void> {
    if (this.generatingTopic()) return;

    const meetingNotesHtmlFromForm = String(this.meetingForm.get('meetingNotes')?.value || '');
    const actionItemsHtmlFromForm = String(this.meetingForm.get('actionItems')?.value || '');

    // Contenteditable can lose DOM content after async state changes in some browsers.
    // Prefer the live editor HTML as source of truth, then sync back into the form.
    const meetingNotesHtml = this.meetingNotesAreaRef?.nativeElement?.innerHTML || meetingNotesHtmlFromForm;
    const actionItemsHtml = this.meetingActionItemsAreaRef?.nativeElement?.innerHTML || actionItemsHtmlFromForm;

    this.meetingForm.patchValue(
      {
        meetingNotes: meetingNotesHtml,
        actionItems: actionItemsHtml,
      },
      { emitEvent: false }
    );
    const meetingNotesText = this.stripHtml(meetingNotesHtml);
    const actionItemsText = this.stripHtml(actionItemsHtml);
    const mergedText = `${meetingNotesText}\n${actionItemsText}`.trim();

    if (mergedText.length < 5) {
      alert('請先輸入會議記錄或行動事項');
      return;
    }

    this.generatingTopic.set(true);
    try {
      const res = await this.apiService.generateCollaborationMeetingTopic({
        meetingNotes: meetingNotesText,
        actionItems: actionItemsText,
        maxLen: 30,
      });

      if (!res?.success) {
        throw new Error((res as any)?.error || '產生會議主題失敗');
      }

      const topic = String((res as any)?.data?.topic || '').trim();
      if (!topic) {
        throw new Error('Google AI 未回傳主題');
      }

      this.meetingForm.patchValue({ topic });
      this.meetingForm.get('topic')?.markAsDirty();
    } catch (error: any) {
      console.error(error);
      alert(this.getErrorMessage(error, '產生會議主題失敗'));
    } finally {
      this.generatingTopic.set(false);
      // Restore editor contents (defensive against DOM resets)
      this.syncMeetingEditorContents();
    }
  }

  private buildTopicFromCandidates(candidates: string[], maxLen: number): string {
    const items = (candidates || [])
      .map(v => this.normalizeText(v))
      .filter(Boolean);

    let out = '';
    for (const item of items) {
      const next = out ? `${out}、${item}` : item;
      if (next.length > maxLen) continue;
      out = next;
    }

    if (out.length > maxLen) out = out.slice(0, maxLen);
    return out;
  }

  private extractTopicPhrases(textWithNewlines: string): string[] {
    const raw = String(textWithNewlines || '').replace(/\r\n/g, '\n');

    // 依「行」抽重點：你的輸入通常就是一行一件事
    const lines = raw
      .split('\n')
      .map(v => String(v || '').trim())
      .map(v => v.replace(/^[-*•\d.\s]+/g, '').trim())
      .filter(Boolean)
      .filter(v => !/^會議記錄\*?:?$/.test(v))
      .filter(v => !/^行動事項\*?:?$/.test(v));

    const candidates = lines
      .map(l => this.cleanTopicPhrase(l))
      .filter(Boolean)
      .filter(p => !this.looksLikeTimeOnly(p));

    // 去重：避免同一主題被多次選到
    const picked: string[] = [];
    const pickedTokens: Array<Set<string>> = [];

    const scored = candidates
      .map(p => ({ p, score: this.scoreTopicPhrase(p) }))
      .sort((a, b) => b.score - a.score);

    for (const { p } of scored) {
      const tokens = new Set(this.tokenizeForTopic(p));
      if (tokens.size === 0) continue;

      const isDup = pickedTokens.some(prev => {
        let overlap = 0;
        for (const t of tokens) {
          if (prev.has(t)) {
            overlap++;
            if (overlap >= 1) return true;
          }
        }
        return false;
      });

      if (isDup) continue;
      picked.push(p);
      pickedTokens.push(tokens);
      if (picked.length >= 8) break;
    }

    return picked;
  }

  private cleanTopicPhrase(line: string): string {
    let text = String(line || '').trim();
    if (!text) return '';

    // 移除常見時間前綴，避免「下禮拜一/這禮拜」被當成主題
    text = text.replace(/^(今天|本週|這週|這周|本周|本禮拜|這禮拜|這禮拜一|這禮拜二|這禮拜三|這禮拜四|這禮拜五|這禮拜六|這禮拜日|下週|下周|下週一|下周一|下週二|下周二|下週三|下周三|下週四|下周四|下週五|下周五|下週六|下周六|下週日|下周日|下禮拜|下禮拜一|下禮拜二|下禮拜三|下禮拜四|下禮拜五|下禮拜六|下禮拜日|禮拜[一二三四五六日天]|星期[一二三四五六日天]|這幾天)\s*/g, '');

    // 去掉一些口語開頭
    text = text.replace(/^把\s*/g, '');
    text = text.replace(/^還有\s*/g, '');
    text = text.replace(/^有一個人\s*/g, '');
    text = text.replace(/^有跟\s*/g, '');
    text = text.replace(/這幾天/g, '');

    // 清理標點與多餘空白
    text = text
      .replace(/[~～]+/g, '')
      .replace(/[，。；：]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 太長就稍微收斂，避免主題塞不下
    if (text.length > 16) {
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        const compact = parts.join('');
        text = compact.length > 16 ? compact.slice(0, 16) : compact;
      } else {
        text = text.slice(0, 16);
      }
    }

    return text;
  }

  private looksLikeTimeOnly(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return true;
    if (/^(下|這|本)?(週|周|禮拜)(一|二|三|四|五|六|日|天)?$/.test(t)) return true;
    if (/^(星期|禮拜)[一二三四五六日天]$/.test(t)) return true;
    if (/^(今天|明天|後天)$/.test(t)) return true;
    if (/^下禮$/.test(t)) return true;
    return false;
  }

  private tokenizeForTopic(text: string): string[] {
    const cleaned = this.normalizeText(
      String(text || '')
        .replace(/[，。；：、】【（）()「」『』《》<>]/g, ' ')
        .replace(/[!！?？、]/g, ' ')
    );

    const stop = new Set([
      '的', '了', '和', '是', '在', '與', '及', '或', '也', '有', '會', '要', '到', '為', '就', '不',
      '這', '那', '我們', '你們', '他們', '以及', '並', '但', '如果', '因為', '所以', '而且', '還有',
      '可以', '需要', '可能', '目前', '已經', '正在', '將',
      '會議', '記錄', '行動', '事項', '進度', '討論', '確認', '追蹤',
      '今天', '本週', '本周', '這週', '這周', '下週', '下周', '禮拜', '下禮拜', '這禮拜', '星期', '這幾天',
    ]);

    const tokens: string[] = [];
    for (const token of cleaned.match(/[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]{2,}/g) || []) {
      const t = token.toLowerCase();
      if (stop.has(t) || stop.has(token)) continue;
      if (this.looksLikeTimeOnly(token)) continue;
      if (/(下|這|本)?(週|周|禮拜)(一|二|三|四|五|六|日|天)?/.test(token)) continue;
      if (/^\d+$/.test(token)) continue;
      tokens.push(token);
      if (tokens.length >= 6) break;
    }
    return tokens;
  }

  private scoreTopicPhrase(phrase: string): number {
    const p = String(phrase || '').trim();
    if (!p) return -999;
    if (this.looksLikeTimeOnly(p)) return -50;

    let score = 0;
    const len = p.length;
    score += Math.min(8, Math.max(0, len - 4));

    if (/[0-9]/.test(p)) score += 4;
    if (/(萬|千|元|%)/.test(p)) score += 2;
    if (/[a-zA-Z]{2,}/.test(p)) score += 3;

    if (/(投資|發票|禮盒|蛋糕|配方|鋁管|轉運|面試|群發|方案|系統|電商|聚餐|卡聚|棒球|調酒|包場|Tread|Threads)/i.test(p)) {
      score += 3;
    }

    if (/^(已經|還是|如果|考慮)/.test(p)) score -= 1;
    return score;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<\s*li\s*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  private normalizeText(text: string): string {
    return String(text || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private extractKeywords(text: string): string[] {
    const cleaned = this.normalizeText(
      text
        .replace(/[，。；：、】【（）()「」『』《》<>]/g, ' ')
        .replace(/[!！?？、]/g, ' ')
    );

    const stopwords = new Set([
      '的', '了', '和', '是', '在', '與', '及', '或', '也', '有', '會', '要', '到', '為', '就', '不',
      '這', '那', '我們', '你們', '他們', '以及', '並', '但', '如果', '因為', '所以', '而且', '還有',
      '可以', '需要', '可能', '目前', '已經', '正在', '將',
      '會議', '記錄', '行動', '事項', '今天', '本週', '本周', '這週', '這周', '下週', '下周', '進度', '討論', '確認', '追蹤',
      // 避免時間詞淹沒真正主題
      '禮拜', '星期', '下禮拜', '這禮拜', '這幾天', '下禮'
    ]);

    const freq: Record<string, number> = {};

    // 英數 token
    for (const token of cleaned.match(/[a-zA-Z0-9]{2,}/g) || []) {
      const key = token.toLowerCase();
      freq[key] = (freq[key] || 0) + 1;
    }

    // 中文：先抓出連續片段，若片段很長再切成 2-4 字 ngram
    const cjkSegments = cleaned.match(/[\u4e00-\u9fff]{2,}/g) || [];
    let ngramBudget = 250;
    for (const seg of cjkSegments) {
      if (stopwords.has(seg)) continue;
      if (seg.length <= 6) {
        if (!stopwords.has(seg)) freq[seg] = (freq[seg] || 0) + 1;
        continue;
      }

      // 長片段切 ngram 讓關鍵字更聚焦
      const maxLen = Math.min(seg.length, 20);
      const s = seg.slice(0, maxLen);
      for (let i = 0; i < s.length && ngramBudget > 0; i++) {
        for (const len of [4, 3, 2]) {
          if (i + len > s.length) continue;
          const gram = s.slice(i, i + len);
          if (stopwords.has(gram)) continue;
          freq[gram] = (freq[gram] || 0) + 1;
          ngramBudget--;
          if (ngramBudget <= 0) break;
        }
      }
    }

    return Object.entries(freq)
      .filter(([w]) => w.length >= 2 && !stopwords.has(w))
      .filter(([w]) => !this.looksLikeTimeOnly(w))
      .filter(([w]) => !/(下|這|本)?(週|周|禮拜)(一|二|三|四|五|六|日|天)?/.test(w))
      .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))
      .map(([w]) => w)
      .slice(0, 12);
  }

  private getWeekEndDate(weekStartDate: string): string {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
  }

  private filterEmployeesToManagementTeam(employees: any[]): any[] {
    const list = Array.isArray(employees) ? employees : [];
    const hasAnyPosition = list.some(emp => String(emp?.position || '').trim().length > 0);
    if (!hasAnyPosition) {
      return list;
    }

    return list.filter(emp => String(emp?.position || '').trim() === '經營團隊');
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    try {
      const [employeeRes, weeklyRes] = await Promise.all([
        this.apiService.getEmployeeInfo(),
        this.apiService.getCollaborationWeeklyProgress(),
      ]);

      if (employeeRes.success && employeeRes.data) {
        const employees = this.filterEmployeesToManagementTeam(employeeRes.data as any[]);
        this.shareholders.set(employees.map((emp: any) => ({
          id: String(emp.id),
          name: emp.employee_name,
        })));
      }

      if (weeklyRes.success && weeklyRes.data) {
        const rows = weeklyRes.data as any[];
        const meetingMap = new Map<string, MeetingProgress>();

        rows.forEach((row: any) => {
          const date = row.weekStartDate ? String(row.weekStartDate).split('T')[0] : '';
          const parsed = this.parseCategory(row.progressSummary);
          const resolvedCategory = (row.category || parsed.category) as string;
          const resolvedProgress = parsed.progress;

          if (!meetingMap.has(date)) {
            meetingMap.set(date, {
              id: date,
              date,
              topic: '',
              attendeeIds: [],
              meetingNotes: '',
              actionItems: '',
              metaRecordId: null,
              records: [],
            });
          }

          const meeting = meetingMap.get(date)!;

          if (resolvedCategory === '會議紀錄') {
            const meetingBlockers = this.parseMeetingBlockers(row.blockers);
            meeting.topic = row.nextWeekPlan || '';
            meeting.meetingNotes = resolvedProgress || '';
            meeting.actionItems = meetingBlockers.actionItems;
            meeting.attendeeIds = meetingBlockers.attendeeIds;
            meeting.metaRecordId = Number(row.id);
            return;
          }

          const record: ProgressRecord = {
            id: String(row.id),
            weeklyId: Number(row.id),
            category: resolvedCategory,
            goal: row.nextWeekPlan || '',
            progress: resolvedProgress,
            assigneeId: String(row.ownerEmployeeId),
            lastUpdated: this.formatDateTime(row.updatedAt || row.createdAt),
          };

          meeting.records.push(record);
        });

        this.meetingProgresses.set(Array.from(meetingMap.values()));
      }
    } catch (error: any) {
      console.error(error);
      alert(this.getErrorMessage(error, '載入每周進度失敗'));
    } finally {
      this.loading.set(false);
    }
  }

  categories = computed(() => {
    const allRecords = this.meetingProgresses().flatMap(m => m.records);
    return [...new Set(allRecords.map(r => r.category))].sort();
  });

  sortedMeetings = computed(() => {
    return this.meetingProgresses().slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  availableYears = computed(() => {
    const years = this.meetingProgresses()
      .map(meeting => Number(String(meeting.date || '').slice(0, 4)))
      .filter(year => Number.isFinite(year));

    const baseYear = this.currentYear;
    const rangeYears = Array.from({ length: 5 }, (_, index) => baseYear - 2 + index);

    return [...new Set([...years, ...rangeYears])].sort((a, b) => b - a);
  });

  filteredMeetings = computed(() => {
    const year = this.yearFilter();
    const month = this.monthFilter();
    const cat = this.categoryFilter();
    const assigneeId = this.assigneeFilter();
    const meetings = this.sortedMeetings();

    if (!year && !month && !cat && !assigneeId) {
      return meetings;
    }

    const selectedYear = year ? Number(year) : null;
    const selectedMonth = month ? Number(month) : null;

    return meetings
      .filter(meeting => {
        if (!selectedYear && !selectedMonth) return true;

        const meetingDate = new Date(meeting.date);
        if (Number.isNaN(meetingDate.getTime())) return false;

        const meetingYear = meetingDate.getFullYear();
        const meetingMonth = meetingDate.getMonth() + 1;

        if (selectedYear !== null && meetingYear !== selectedYear) return false;
        if (selectedMonth !== null && meetingMonth !== selectedMonth) return false;
        return true;
      })
      .map(meeting => ({
        ...meeting,
        records: meeting.records
          .filter(r => !cat || r.category === cat)
          .filter(r => !assigneeId || r.assigneeId === assigneeId)
      }))
      .filter(meeting => meeting.records.length > 0);
  });

  getShareholderName(id: string): string {
    return this.shareholders().find(s => s.id === id)?.name || '未知';
  }

  getShareholderAvatarUrl(id: string): string {
    const name = this.getShareholderName(id);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&font-size=0.5`;
  }
  
  getCategoryClass(category: string): string {
    const colors: { [key: string]: string } = {
      '店內': 'bg-purple-100 text-purple-800',
      '財務': 'bg-blue-100 text-blue-800',
      '活動': 'bg-yellow-100 text-yellow-800',
      '行銷': 'bg-pink-100 text-pink-800',
      '系統': 'bg-indigo-100 text-indigo-800',
      '會員': 'bg-cyan-100 text-cyan-800',
      '加盟': 'bg-red-100 text-red-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  }

  toggleMeeting(id: string): void {
    this.openMeetingId.update(current => (current === id ? null : id));
  }

  // --- Meeting Management ---
  meetingForm = this.fb.group({
    date: ['', Validators.required],
    topic: ['', Validators.required],
    attendees: [([] as number[]), Validators.required],
    meetingNotes: ['', Validators.required],
    actionItems: ['', Validators.required],
  });

  isMeetingAttendeeSelected(employeeId: number): boolean {
    const selected = this.meetingForm.get('attendees')?.value as number[] | null;
    return Array.isArray(selected) && selected.includes(employeeId);
  }

  toggleMeetingAttendee(employeeId: number, checked: boolean): void {
    const selected = (this.meetingForm.get('attendees')?.value as number[] | null) || [];
    const unique = new Set(selected);

    if (checked) {
      unique.add(employeeId);
    } else {
      unique.delete(employeeId);
    }

    this.meetingForm.patchValue({ attendees: Array.from(unique) });
    this.meetingForm.get('attendees')?.markAsDirty();
    this.meetingForm.get('attendees')?.updateValueAndValidity();
  }

  openMeetingModal(meeting: MeetingProgress | null = null): void {
    this.editingMeeting.set(meeting);
    if (meeting) {
      this.meetingForm.patchValue({
        date: meeting.date,
        topic: meeting.topic,
        attendees: meeting.attendeeIds,
        meetingNotes: meeting.meetingNotes,
        actionItems: meeting.actionItems,
      });
    } else {
      this.meetingForm.reset({
        date: new Date().toISOString().split('T')[0],
        topic: '',
        attendees: [],
        meetingNotes: '',
        actionItems: '',
      });
    }
    this.isMeetingModalOpen.set(true);
    setTimeout(() => this.syncMeetingEditorContents(), 0);
  }

  closeMeetingModal(): void {
    this.isMeetingModalOpen.set(false);
  }

  async handleMeetingSubmit(): Promise<void> {
    if (this.meetingForm.invalid) return;
    const formValue = this.meetingForm.value;
    const editing = this.editingMeeting();
    const attendeeIds = ((formValue.attendees || []) as number[])
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0);

    const employeeList = this.employeeShareholders();
    const fallbackOwner = Number(employeeList[0]?.id || 0);
    const ownerEmployeeId = attendeeIds[0] || fallbackOwner;
    if (!Number.isFinite(ownerEmployeeId) || ownerEmployeeId <= 0) {
      alert('查無可用人員，請先建立人員資料');
      return;
    }

    this.processing.set(true);
    try {
      if (editing) {
        if (editing.metaRecordId) {
          await this.apiService.updateCollaborationWeeklyProgress({
            id: editing.metaRecordId,
            ownerEmployeeId,
            weekStartDate: formValue.date!,
            weekEndDate: this.getWeekEndDate(formValue.date!),
            category: '會議紀錄',
            progressSummary: this.buildSummary('會議紀錄', formValue.meetingNotes || ''),
            blockers: this.buildMeetingBlockers(attendeeIds, formValue.actionItems || ''),
            nextWeekPlan: formValue.topic || '',
            completionRate: 0,
          });
        } else {
          await this.apiService.createCollaborationWeeklyProgress({
            ownerEmployeeId,
            weekStartDate: formValue.date!,
            weekEndDate: this.getWeekEndDate(formValue.date!),
            category: '會議紀錄',
            progressSummary: this.buildSummary('會議紀錄', formValue.meetingNotes || ''),
            blockers: this.buildMeetingBlockers(attendeeIds, formValue.actionItems || ''),
            nextWeekPlan: formValue.topic || '',
            completionRate: 0,
          });
        }

        for (const record of editing.records) {
          await this.apiService.updateCollaborationWeeklyProgress({
            id: record.weeklyId,
            weekStartDate: formValue.date!,
            weekEndDate: this.getWeekEndDate(formValue.date!),
          });
        }
        await this.loadData();
      } else {
        const exists = this.meetingProgresses().some(m => m.date === formValue.date);
        if (!exists) {
          await this.apiService.createCollaborationWeeklyProgress({
            ownerEmployeeId,
            weekStartDate: formValue.date!,
            weekEndDate: this.getWeekEndDate(formValue.date!),
            category: '會議紀錄',
            progressSummary: this.buildSummary('會議紀錄', formValue.meetingNotes || ''),
            blockers: this.buildMeetingBlockers(attendeeIds, formValue.actionItems || ''),
            nextWeekPlan: formValue.topic || '',
            completionRate: 0,
          });

          await this.loadData();
          this.openMeetingId.set(formValue.date!);
        }
      }
    } catch (error: any) {
      alert(this.getErrorMessage(error, '儲存日期失敗'));
    } finally {
      this.processing.set(false);
    }
    this.closeMeetingModal();
  }

  // --- Record Management ---
  recordForm = this.fb.group({
    category: ['', Validators.required],
    goal: ['', Validators.required],
    progress: ['', Validators.required],
    assigneeId: ['', Validators.required]
  });

  openRecordModal(meetingId: string, record: ProgressRecord | null = null): void {
    if (record) {
      this.editingRecord.set({ record, meetingId });
      this.recordForm.patchValue(record);
    } else {
      this.editingRecord.set({ record: null, meetingId });
      this.recordForm.reset({ assigneeId: '' });
    }
    this.isRecordModalOpen.set(true);
    setTimeout(() => this.syncRecordEditorContents(), 0);
  }

  closeRecordModal(): void {
    this.isRecordModalOpen.set(false);
    this.editingRecord.set(null);
  }

  async handleRecordFormSubmit(): Promise<void> {
    if (this.recordForm.invalid) return;
    const editingCtx = this.editingRecord();
    if (!editingCtx) return;

    const { record: editingRecord, meetingId } = editingCtx;
    const formValue = this.recordForm.value;

    const recordData = {
      category: formValue.category!,
      goal: formValue.goal!,
      progress: this.stripLeadingBracketPrefixes(formValue.progress || ''),
      assigneeId: formValue.assigneeId!,
      lastUpdated: new Date().toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-')
    };

    const ownerEmployeeId = Number(recordData.assigneeId);
    if (!Number.isFinite(ownerEmployeeId) || ownerEmployeeId <= 0) {
      alert('負責人必須為有效員工');
      return;
    }

    this.processing.set(true);
    try {
      if (editingRecord) {
        await this.apiService.updateCollaborationWeeklyProgress({
          id: Number(editingRecord.id),
          ownerEmployeeId,
          weekStartDate: meetingId,
          weekEndDate: this.getWeekEndDate(meetingId),
          category: recordData.category,
          progressSummary: this.buildSummary(recordData.category, recordData.progress),
          nextWeekPlan: recordData.goal,
        });
      } else {
        await this.apiService.createCollaborationWeeklyProgress({
          ownerEmployeeId,
          weekStartDate: meetingId,
          weekEndDate: this.getWeekEndDate(meetingId),
          category: recordData.category,
          progressSummary: this.buildSummary(recordData.category, recordData.progress),
          nextWeekPlan: recordData.goal,
          completionRate: 0,
        });
      }

      await this.loadData();
      this.openMeetingId.set(meetingId);
      this.closeRecordModal();
    } catch (error: any) {
      alert(this.getErrorMessage(error, '儲存進度失敗'));
    } finally {
      this.processing.set(false);
    }
  }

  resetFilters(): void {
    this.yearFilter.set(String(this.currentYear));
    this.monthFilter.set(String(this.currentMonth).padStart(2, '0'));
    this.categoryFilter.set('');
    this.assigneeFilter.set('');
  }

  // --- Deletion Handling ---
  meetingToDelete = signal<MeetingProgress | null>(null);
  recordToDelete = signal<{ meetingId: string, record: ProgressRecord } | null>(null);

  requestDeleteMeeting(meeting: MeetingProgress): void {
    this.meetingToDelete.set(meeting);
  }

  async confirmDeleteMeeting(): Promise<void> {
    if (!this.meetingToDelete()) return;
    this.processing.set(true);
    try {
      const meeting = this.meetingToDelete()!;
      for (const record of meeting.records) {
        await this.apiService.deleteCollaborationWeeklyProgress(record.weeklyId);
      }
      await this.loadData();
      this.cancelDeleteMeeting();
    } catch (error: any) {
      alert(this.getErrorMessage(error, '刪除失敗'));
    } finally {
      this.processing.set(false);
    }
  }

  cancelDeleteMeeting(): void {
    this.meetingToDelete.set(null);
  }

  requestDeleteRecord(meetingId: string, record: ProgressRecord): void {
    this.recordToDelete.set({ meetingId, record });
  }

  async confirmDeleteRecord(): Promise<void> {
    if (!this.recordToDelete()) return;
    this.processing.set(true);
    try {
      const { meetingId, record } = this.recordToDelete()!;
      await this.apiService.deleteCollaborationWeeklyProgress(record.weeklyId);
      await this.loadData();
      this.openMeetingId.set(meetingId);
      this.cancelDeleteRecord();
    } catch (error: any) {
      alert(this.getErrorMessage(error, '刪除失敗'));
    } finally {
      this.processing.set(false);
    }
  }

  cancelDeleteRecord(): void {
    this.recordToDelete.set(null);
  }
  
  // --- Shareholder Management ---
  shareholderForm = this.fb.group({ shareholders: this.fb.array([]) });
  get shareholderControls() { return (this.shareholderForm.get('shareholders') as FormArray).controls; }

  openShareholderModal(): void {
    const shareholdersArray = this.shareholderForm.get('shareholders') as FormArray;
    shareholdersArray.clear();
    const shareholderFGs = this.shareholders().map(s => this.fb.group({ id: [s.id], name: [s.name, Validators.required] }));
    shareholderFGs.forEach(fg => shareholdersArray.push(fg));
    this.isShareholderModalOpen.set(true);
  }

  closeShareholderModal(): void { this.isShareholderModalOpen.set(false); }
  addShareholder(): void { (this.shareholderForm.get('shareholders') as FormArray).push(this.fb.group({ id: [`sh${Date.now()}`], name: ['', Validators.required] })); }
  removeShareholder(index: number): void { (this.shareholderForm.get('shareholders') as FormArray).removeAt(index); }
  saveShareholders(): void {
    if (this.shareholderForm.invalid) return;
    this.shareholders.set(this.shareholderForm.value.shareholders as Shareholder[]);
    this.closeShareholderModal();
  }
}
