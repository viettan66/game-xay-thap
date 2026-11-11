// Nguyên tắc ngôn ngữ của kho thoại (mục 0, 9C SPEC). Hàm thuần, dùng cho test kho thoại mặc định,
// kiểm tra khi đọc dialogues.json và (giai đoạn 4b) cảnh báo trên trang Kho thoại.

/** Biến được dùng trong câu thoại (mục 9C). */
export const DIALOGUE_VARS = [
  'name',
  'names',
  'n',
  'gift',
  'material',
  'item',
  'stage',
  'ritual',
  'itemIndex',
  'itemTotal',
  'percent',
  'count',
  'target',
  'reward',
] as const;

/** Cấm ở mọi nhóm: lời hứa phước báu, may mắn, bình an; cách xưng của nhà sư thật. */
export const BANNED_PHRASES = [
  'công đức vô lượng',
  'phước báu',
  'tích phúc',
  'tiêu tai giải nạn',
  'cầu an',
  'hồi hướng',
  'gieo duyên lành',
  'bần tăng',
  'bần đạo',
  'may mắn',
  'bình an',
  'phù hộ',
  'độ trì',
];

/** Dùng hạn chế: chỉ trong các nhóm liệt kê (nhóm bắt đầu bằng "event_" là thoại sự kiện lịch, mục 14.11). */
export const RESTRICTED_PHRASES: Record<string, string[]> = {
  'a di đà phật': ['session_start', 'session_end', 'stage_ritual', 'item_complete', 'event_*'],
  'tùy hỷ': ['stage_ritual', 'item_complete'],
};

/** Nhóm gắn với quà (gift_*, và chữ thông báo quà toast_*) KHÔNG chứa bất kỳ từ ngữ tôn giáo nào. */
export const GIFT_RELIGIOUS_WORDS = ['a di đà', 'phật', 'tùy hỷ', 'công đức', 'hoan hỷ', 'chùa', 'thí chủ', 'cúng', 'dâng', 'phước', 'phúc'];

const norm = (s: string) => s.normalize('NFC').toLowerCase();

/** Có chứa cụm từ (so cả từ, không phân biệt hoa thường). */
export function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${norm(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const p = ` ${norm(phrase).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  return t.includes(p);
}

function groupAllowed(group: string, allowed: string[]): boolean {
  return allowed.some((a) => (a.endsWith('*') ? group.startsWith(a.slice(0, -1)) : group === a));
}

/** Các biến {x} trong câu. */
export function varsOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

/** Các nhóm game đang dùng (giai đoạn 4b). Live thật mà nhóm không có câu đã duyệt thì lúc đó im lặng. */
export const USED_GROUPS = [
  'session_start',
  'greet_single',
  'greet_group',
  'gift_small',
  'gift_medium',
  'gift_large',
  'gift_huge',
  'gift_thanks_group',
  'progress',
  'item_complete',
  'stage_ritual',
  'idle_story',
  'idle_howto',
  'session_end',
  'toast_gift',
  'goal_text',
  'goal_reached',
  'piece_burst',
];

/** Nhóm đang dùng mà chưa có câu nào vừa bật vừa đã duyệt (cảnh báo trước khi live thật, mục 9C). */
export function unverifiedGroups(groups: Record<string, { lines: { enabled: boolean; verified: boolean }[] }>): string[] {
  return USED_GROUPS.filter((g) => !(groups[g]?.lines ?? []).some((l) => l.enabled && l.verified));
}

/** Lỗi ngôn ngữ của một câu trong nhóm (rỗng = đạt). */
export function lineProblems(group: string, text: string): string[] {
  const out: string[] = [];
  for (const p of BANNED_PHRASES) if (containsPhrase(text, p)) out.push(`có cụm từ cấm "${p}"`);
  for (const [p, groups] of Object.entries(RESTRICTED_PHRASES)) {
    if (containsPhrase(text, p) && !groupAllowed(group, groups)) out.push(`"${p}" chỉ được dùng trong nhóm ${groups.join(', ')}`);
  }
  if (group.startsWith('gift_') || group.startsWith('toast_')) {
    for (const w of GIFT_RELIGIOUS_WORDS) if (containsPhrase(text, w)) out.push(`nhóm quà không được có từ tôn giáo "${w}"`);
  }
  for (const v of varsOf(text)) if (!(DIALOGUE_VARS as readonly string[]).includes(v)) out.push(`biến không hợp lệ {${v}}`);
  return out;
}
