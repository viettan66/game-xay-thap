// Thông báo quà (mục 8, bảng 9A SPEC): quyết định quà nào bật thông báo lớn (khoảng 4 giây, kèm avatar, tên,
// ảnh vật phẩm), quà nào chỉ hiện "+công" kèm tên. Overlay giữ hàng đợi, quà lớn ưu tiên.
// - Vắng, vừa: mọi quà. Quà nhỏ liên tiếp của cùng một người (trong mergeSec giây) được gộp vào thông báo trước.
// - Đông: quà từ dongMinCoins xu; quà nhỏ hơn chỉ hiện "+công".
// - Rất đông: quà thuộc top ratdongTopPercent% giá trị trong windowSec giây gần nhất, tối thiểu ratdongMinCoins xu.

import type { CrowdTier, ServerMessage } from '../../shared/protocol.js';
import { fillTemplate } from '../../shared/project.js';
import type { GameConfig } from '../config/schema.js';
import type { DialogueSelector } from '../dialogue/selector.js';
import { giftLabel, giftTier } from '../game/gifts.js';

export type ToastMessage = Extract<ServerMessage, { type: 'toast' }>;

export interface ToastDeps {
  config: () => GameConfig;
  tier: () => CrowdTier;
  selector: Pick<DialogueSelector, 'pick'>;
  verifiedOnly: () => boolean;
  send: (m: ToastMessage) => void;
  now: () => number;
}

/** Ngưỡng "top p%" của các giá trị (giá trị nhỏ nhất vẫn lọt top). */
export function topThreshold(values: number[], percent: number): number {
  if (!values.length) return Infinity;
  const s = [...values].sort((a, b) => b - a);
  const k = Math.max(0, Math.ceil((s.length * percent) / 100) - 1);
  return s[Math.min(k, s.length - 1)]!;
}

export class GiftToasts {
  private recent: { ts: number; coins: number }[] = [];
  private last = new Map<string, { id: string; ts: number; coins: number; points: number; small: boolean }>();
  private seq = 0;

  constructor(private readonly d: ToastDeps) {}

  /** name: tên đã lọc. */
  onGift(platformId: string, name: string, coins: number, points: number, giftId: string): ToastMessage | null {
    const cfg = this.d.config();
    const t = cfg.toast;
    const now = this.d.now();
    const tier = this.d.tier();
    this.recent.push({ ts: now, coins });
    this.recent = this.recent.filter((r) => now - r.ts <= t.windowSec * 1000);

    let big: boolean;
    if (tier === 'vang' || tier === 'vua') big = true;
    else if (tier === 'dong') big = coins >= t.dongMinCoins;
    else big = coins >= t.ratdongMinCoins && coins >= topThreshold(this.recent.map((r) => r.coins), t.ratdongTopPercent);

    if (!big) {
      const msg: ToastMessage = {
        type: 'toast',
        id: `p${++this.seq}`,
        kind: 'plus',
        platformId,
        name,
        text: fillTemplate(cfg.labels.plusPoints, { points: points.toLocaleString('vi-VN'), unit: cfg.labels.pointUnitLabel, name }),
        icon: null,
        coins,
        verified: true,
      };
      this.d.send(msg);
      return msg;
    }

    // Quà nhỏ liên tiếp của cùng người: gộp vào thông báo trước (cùng id, overlay thay nội dung).
    const prev = this.last.get(platformId);
    const small = coins <= t.smallMaxCoins;
    const merge = small && prev?.small && now - prev.ts <= t.mergeSec * 1000;
    const total = merge ? prev!.coins + coins : coins;
    const id = merge ? prev!.id : `t${++this.seq}`;
    this.last.set(platformId, { id, ts: now, coins: total, points: (merge ? prev!.points : 0) + points, small });

    const picked = this.d.selector.pick('toast_gift', {
      tier,
      vars: { name, gift: giftLabel(cfg, total, giftId) },
      verifiedOnly: this.d.verifiedOnly(),
      now,
      ignoreCooldown: true,
    });
    if (!picked) return null;
    const msg: ToastMessage = {
      type: 'toast',
      id,
      kind: 'big',
      platformId,
      name,
      text: picked.text,
      icon: giftTier(cfg, total).icon ?? null,
      coins: total,
      verified: picked.verified,
    };
    this.d.send(msg);
    return msg;
  }
}
