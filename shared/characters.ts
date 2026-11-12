// Nhân vật trên bản đồ và hiệu ứng quà (mục 9 SPEC, giai đoạn 4d). Hàm thuần, có test; server và overlay dùng chung.

/** Kiểu nhân vật có ảnh (assets/game/chars/<kiểu>_…). */
export type CharLook = 'danphu_nam' | 'danphu_nu' | 'thomoc' | 'thone' | 'tusi';

/** Kiểu nhân vật của người xem. Chú tiểu (tusi) chỉ dùng cho dân phu NPC không tên (quyết định 19, mục 16). */
export const VIEWER_LOOKS = ['danphu_nam', 'danphu_nu', 'thomoc', 'thone'] as const satisfies readonly CharLook[];
export type ViewerLook = (typeof VIEWER_LOOKS)[number];

/** Băm FNV-1a 32 bit (không dấu). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Giới tính và kiểu nhân vật: ngẫu nhiên nhưng cố định theo platformId (mục 9). */
export function lookFor(id: string): ViewerLook {
  return VIEWER_LOOKS[hash32(`look:${id}`) % VIEWER_LOOKS.length]!;
}

/** Hiệu ứng theo giá trị một lần tặng (mục 9): gạch, bó gỗ, xe trâu, voi, đúc chuông, tượng ở ô ghi danh. */
export const GIFT_EFFECTS = ['brick', 'logs', 'cart', 'elephant', 'bell', 'statue'] as const;
export type GiftEffect = (typeof GIFT_EFFECTS)[number];

const ICON_EFFECT: Record<string, GiftEffect> = {
  'items/brick': 'brick',
  'items/logs': 'logs',
  'items/buffalo_cart': 'cart',
  'items/elephant': 'elephant',
  'items/bell': 'bell',
  'items/guardian': 'statue',
};

export interface EffectTier {
  minCoins: number;
  icon?: string | undefined;
  effect?: GiftEffect | undefined;
}

/** Hiệu ứng của một mức quà: ghi rõ `effect`, hoặc suy từ ảnh vật phẩm, hoặc theo thứ tự mức. */
export function tierEffect(tiers: readonly EffectTier[], index: number): GiftEffect {
  const t = tiers[index];
  if (t?.effect) return t.effect;
  if (t?.icon && ICON_EFFECT[t.icon]) return ICON_EFFECT[t.icon]!;
  return GIFT_EFFECTS[Math.max(0, Math.min(GIFT_EFFECTS.length - 1, index))]!;
}

/** Mức quà (chỉ số trong danh sách) của một lần tặng `coins` xu. */
export function tierIndex(tiers: readonly EffectTier[], coins: number): number {
  let k = 0;
  tiers.forEach((t, i) => {
    if (coins >= t.minCoins) k = i;
  });
  return k;
}

export function giftEffect(tiers: readonly EffectTier[], coins: number): GiftEffect {
  return tierEffect(tiers, tierIndex(tiers, coins));
}

/** Số xu thấp nhất để có tượng ghi danh (null nếu không mức nào đặt tượng). */
export function statueMinCoins(tiers: readonly EffectTier[]): number | null {
  for (let i = 0; i < tiers.length; i++) if (tierEffect(tiers, i) === 'statue') return tiers[i]!.minCoins;
  return null;
}

/** Danh hiệu theo tổng công tích lũy (mục 9, quyết định 7): mức cao nhất đã đạt, chưa đạt mức nào thì null. */
export function titleFor(points: number, titles: readonly { minPoints: number; label: string }[]): string | null {
  let best: { minPoints: number; label: string } | null = null;
  for (const t of titles) if (points >= t.minPoints && (!best || t.minPoints >= best.minPoints)) best = t;
  return best?.label ?? null;
}

/** Tên trên đầu nhân vật: cắt bớt nếu dài hơn `max` ký tự (mục 9: 14), thêm dấu "…". Đếm theo ký tự thật (emoji = 1). */
export function shortName(name: string, max = 14): string {
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  return `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}
