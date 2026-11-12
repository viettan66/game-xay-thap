// Tượng võ tướng đá ở ô ghi danh dọc đường vào chùa (mục 9, quyết định 15): quà từ mức "tượng" (mặc định 5.000 xu)
// được một tượng mang tên người tặng, đặt vĩnh viễn (lưu DB). Tượng thứ k (đếm từ 0) đứng ở ô k % số ô;
// nhiều tượng hơn số ô thì xoay vòng hiển thị theo lượt (mỗi honorRotateSec giây). Tượng mới: trồi lên kèm bụi, camera lia tới.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapRect } from '../../../shared/map.js';
import type { HonorSlot } from '../../../shared/paths.js';
import type { HonorInfo } from '../../../shared/protocol.js';
import type { CharArt } from './charArt.js';
import { pageOf, pagesOf, pageStatues, statueStyle } from './honorPages.js';
import { plaque, type NameTag } from './labels.js';
import type { Pt } from './spots.js';

interface SlotView {
  sprite: Sprite;
  tag: NameTag | null;
  honorId: number | null;
  /** Trồi lên: 0 → 1. */
  rise: number;
  /** Tỉ lệ dọc khi đứng hẳn. */
  baseK: number;
  dust: Graphics | null;
}

export class HonorView {
  private slots: HonorSlot[] = [];
  private views: SlotView[] = [];
  private honors: HonorInfo[] = [];
  private page = 0;
  private pageT = 0;
  private fade = 1;
  private nextPage: number | null = null;
  private known = new Set<number>();
  private loaded = false;
  /** Tượng mới đặt: báo ra ngoài để camera lia tới (khung tọa độ bản đồ). */
  onReveal: (rect: MapRect) => void = () => {};

  constructor(
    private readonly depth: Container,
    private readonly screen: Container,
    private art: CharArt | null,
  ) {}

  setArt(art: CharArt, slots: HonorSlot[]): void {
    for (const v of this.views) this.destroyView(v);
    this.art = art;
    this.slots = slots;
    this.views = slots.map((s) => {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.position.set(s.x, s.y);
      sprite.zIndex = s.y;
      sprite.visible = false;
      this.depth.addChild(sprite);
      return { sprite, tag: null, honorId: null, rise: 1, dust: null, baseK: 1 };
    });
    this.show(this.page);
  }

  private destroyView(v: SlotView): void {
    v.sprite.destroy();
    v.tag?.root.destroy({ children: true });
    v.dust?.destroy();
  }

  /** Danh sách tượng từ server. Lần đầu (mở overlay): hiện ngay lượt mới nhất; về sau tượng mới thì trồi lên. */
  setHonors(list: HonorInfo[], heightMap: number): void {
    this.heightMap = heightMap;
    const fresh = this.loaded ? list.filter((h) => !this.known.has(h.id)) : [];
    this.honors = list;
    for (const h of list) this.known.add(h.id);
    const S = this.slots.length;
    if (!S) return;
    if (!this.loaded) {
      this.loaded = true;
      const pages = pagesOf(list, S);
      this.page = pages[pages.length - 1] ?? 0;
      this.show(this.page);
      return;
    }
    const newest = fresh[fresh.length - 1];
    if (newest) {
      this.page = pageOf(newest.seq, S);
      this.pageT = 0;
      this.nextPage = null;
      this.fade = 1;
      this.show(this.page, new Set(fresh.map((h) => h.id)));
      const s = this.slots[newest.seq % S]!;
      this.onReveal({ x: s.x - heightMap * 2, y: s.y - heightMap * 2.4, w: heightMap * 4, h: heightMap * 3 });
    } else this.show(this.page);
  }

  private heightMap = 54;

  private show(page: number, reveal: Set<number> = new Set()): void {
    const S = this.slots.length;
    const list = pageStatues(this.honors, S, page);
    this.views.forEach((v, i) => {
      const item = list.find((x) => x.slot === i);
      const id = item?.honor.id ?? null;
      if (v.honorId === id && !reveal.has(id ?? -1)) return;
      v.honorId = id;
      v.tag?.root.destroy({ children: true });
      v.tag = null;
      if (!item) {
        v.sprite.visible = false;
        return;
      }
      const ok = this.art?.apply(v.sprite, `honor/statue_${statueStyle(item.honor.seq)}`, this.heightMap) ?? false;
      if (!ok) {
        v.sprite.texture = Texture.WHITE;
        v.sprite.tint = 0x8f8a80;
        v.sprite.anchor.set(0.5, 1);
        v.sprite.width = this.heightMap * 0.6;
        v.sprite.height = this.heightMap * 1.45;
        v.sprite.visible = true;
      }
      v.baseK = v.sprite.scale.y;
      v.tag = plaque(item.honor.name);
      this.screen.addChild(v.tag.root);
      v.rise = reveal.has(item.honor.id) ? 0 : 1;
    });
  }

  /** Cập nhật: xoay lượt, trồi lên, vị trí bảng tên. */
  tick(dt: number, rotateSec: number, toScreen: (x: number, y: number) => Pt, view: MapRect, fxLayer: Container): void {
    const S = this.slots.length;
    if (!S) return;
    const pages = pagesOf(this.honors, S);
    if (pages.length > 1 && this.nextPage === null) {
      this.pageT += dt;
      if (this.pageT >= rotateSec) {
        this.pageT = 0;
        const i = pages.indexOf(this.page);
        this.nextPage = pages[(i + 1) % pages.length]!;
      }
    }
    // Đổi lượt: mờ đi, đổi tượng, hiện lại.
    if (this.nextPage !== null) {
      this.fade = Math.max(0, this.fade - dt * 2);
      if (this.fade === 0) {
        this.page = this.nextPage;
        this.nextPage = null;
        this.show(this.page);
      }
    } else this.fade = Math.min(1, this.fade + dt * 2);
    this.views.forEach((v, i) => {
      const s = this.slots[i]!;
      if (v.rise < 1) {
        if (v.rise === 0) {
          v.dust = new Graphics();
          fxLayer.addChild(v.dust);
        }
        v.rise = Math.min(1, v.rise + dt / 1.4);
        if (v.dust) {
          const k = v.rise;
          v.dust.clear();
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2;
            v.dust.circle(s.x + Math.cos(a) * (14 + k * 34), s.y + Math.sin(a) * (4 + k * 8), 4 + k * 5).fill({ color: 0xd9c9a8, alpha: 0.7 * (1 - k) });
          }
          if (v.rise >= 1) {
            v.dust.destroy();
            v.dust = null;
          }
        }
      }
      // Trồi lên từ mặt đất: kéo dần từ dưới lên (nén chiều cao), sáng hơn lúc đầu.
      v.sprite.scale.y = v.baseK * (0.15 + 0.85 * easeOutBack(v.rise));
      v.sprite.alpha = this.fade * Math.min(1, 0.3 + v.rise);
      if (v.tag) {
        const p = toScreen(s.x, s.y + 4);
        v.tag.root.position.set(p.x, p.y);
        const on = s.x > view.x - 80 && s.x < view.x + view.w + 80 && s.y > view.y - 120 && s.y < view.y + view.h + 60;
        v.tag.root.visible = on;
        v.tag.root.alpha = this.fade * (v.rise >= 1 ? 1 : v.rise);
      }
    });
  }

  get count(): number {
    return this.honors.length;
  }

  clear(): void {
    for (const v of this.views) this.destroyView(v);
    this.views = [];
  }
}

const easeOutBack = (k: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
