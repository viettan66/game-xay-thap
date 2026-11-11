// Mức quà theo số xu một lần tặng (mục 9, 14.6): tên vật phẩm hiện ở {gift}, nhóm thoại cảm ơn, ảnh vật phẩm.

import type { GameConfig } from '../config/schema.js';

export type GiftTier = GameConfig['gifts']['tiers'][number];

export function giftTier(cfg: Pick<GameConfig, 'gifts'>, coins: number): GiftTier {
  const tiers = cfg.gifts.tiers;
  return [...tiers].reverse().find((t) => coins >= t.minCoins) ?? tiers[0]!;
}

/** Tên vật phẩm cho {gift}; có tên tiếng Việt của quà gốc (giftDisplayNames) thì nhắc thêm. */
export function giftLabel(cfg: Pick<GameConfig, 'gifts'>, coins: number, giftId: string): string {
  const t = giftTier(cfg, coins);
  const display = cfg.gifts.displayNames[giftId];
  return display ? `${t.name} (${display})` : t.name;
}
