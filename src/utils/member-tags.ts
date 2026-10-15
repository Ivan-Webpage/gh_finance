import type { MemberTagColor } from '../models/financial.model';

/**
 * 可以維護會員分類標籤（新增／修改／刪除標籤、幫會員貼標籤）的角色：超級管理員、經營管理者。
 * 「經營管理者」是後台自訂角色，role_name 是系統產生的代碼。
 * 後端 backend/src/lib/member-tags.ts 有相同的清單，兩邊要一起改。
 */
export const MEMBER_TAG_EDITOR_ROLES = ['super_admin', 'role_20260201232128_a624'];

/** 顏色代碼 → 標籤樣式（寫成完整 class 字串，Tailwind 才掃得到） */
export const MEMBER_TAG_COLOR_CLASSES: Record<MemberTagColor, string> = {
  gray: 'bg-gray-100 text-gray-800',
  red: 'bg-red-100 text-red-800',
  orange: 'bg-orange-100 text-orange-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  green: 'bg-green-100 text-green-800',
  teal: 'bg-teal-100 text-teal-800',
  blue: 'bg-blue-100 text-blue-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  purple: 'bg-purple-100 text-purple-800',
  pink: 'bg-pink-100 text-pink-800',
};

export const MEMBER_TAG_COLOR_OPTIONS: { value: MemberTagColor; label: string }[] = [
  { value: 'gray', label: '灰' },
  { value: 'red', label: '紅' },
  { value: 'orange', label: '橘' },
  { value: 'yellow', label: '黃' },
  { value: 'green', label: '綠' },
  { value: 'teal', label: '青' },
  { value: 'blue', label: '藍' },
  { value: 'indigo', label: '靛' },
  { value: 'purple', label: '紫' },
  { value: 'pink', label: '粉紅' },
];

export function memberTagClass(color: string | null | undefined): string {
  return MEMBER_TAG_COLOR_CLASSES[color as MemberTagColor] ?? MEMBER_TAG_COLOR_CLASSES.gray;
}
