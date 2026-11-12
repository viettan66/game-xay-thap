// Bia ghi danh (mục 10): trồi lên kèm bụi đá và bóng đổ dưới chân; tiêu đề (kho thoại ceremony_title); top 10 người góp:
// top 3 màu vàng đồng kèm huy chương, hạng 4–10 màu nâu đỏ sẫm khắc chìm; dòng cuối "…và N thiện hữu khác".
// Cỡ chữ không nhỏ hơn 32px. Vẽ ở lớp màn hình (chữ không bị thu nhỏ theo camera). Thiếu ảnh bia thì vẽ khối đá tạm.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { shortName } from '../../../shared/characters.js';
import type { SteleInfo } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { FONT_BODY, FONT_TITLE } from '../theme.js';
import { compactPoints, STELE_IMG, STELE_MIN_FONT, steleProgress, type SteleBox } from './layout.js';

const INK = 0x5e2a1a; // nâu đỏ sẫm
const GOLD = 0x9a6812; // vàng đồng
const LIGHT = 0xfff4dc;
const MEDALS = ['ui/medal_gold', 'ui/medal_silver', 'ui/medal_bronze'];

/** Chữ khắc chìm: một lớp sáng lệch xuống dưới, lớp chữ chính lên trên. */
function engraved(text: string, size: number, fill: number, font = FONT_BODY, weight: '600' | '700' = '700'): Container {
  const c = new Container();
  const style = { fontFamily: font, fontSize: size, fontWeight: weight, fill } as const;
  const hi = new Text({ text, style: { ...style, fill: LIGHT } });
  hi.alpha = 0.6;
  hi.position.set(0, 1.5);
  const main = new Text({ text, style });
  c.addChild(hi, main);
  return c;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  r: number;
}

export class SteleView {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Container();
  private readonly clip = new Graphics();
  private readonly dust = new Graphics();
  private art: Art | null = null;
  private box: SteleBox | null = null;
  private t = 0;
  private dur = 0;
  private puffs: Puff[] = [];
  private lastP = 0;

  constructor() {
    this.body.mask = this.clip;
    this.container.addChild(this.shadow, this.body, this.clip, this.dust);
    this.container.visible = false;
  }

  setArt(art: Art): void {
    this.art = art;
  }

  /** Đang hiện (0–1), để các khung giao diện mờ đi. */
  get shown(): number {
    return this.dur > 0 ? steleProgress(this.t, this.dur) : 0;
  }

  get active(): boolean {
    return this.dur > 0 && this.t < this.dur;
  }

  /** Dựng bia trong `dur` giây (trồi lên, đứng, thu lại). */
  show(info: SteleInfo, box: SteleBox, dur: number): void {
    this.box = box;
    this.t = 0;
    this.dur = dur;
    this.lastP = 0;
    for (const c of this.body.removeChildren()) c.destroy({ children: true });
    const tex = this.art?.textures.get('stele/stele') ?? null;
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.scale.set(box.scale);
      s.position.set(box.cx, box.base);
      this.body.addChild(s);
    } else {
      const g = new Graphics()
        .roundRect(box.cx - box.w / 2, box.base - box.h, box.w, box.h, box.w * 0.3)
        .fill(0xe8d4b0)
        .stroke({ width: 6, color: 0xb89a6a });
      this.body.addChild(g);
    }
    this.layoutText(info, box);
    this.clip.clear().rect(box.cx - box.w / 2 - 20, box.base - box.h - 60, box.w + 40, box.h + 60).fill(0xffffff);
    this.container.visible = true;
  }

  private layoutText(info: SteleInfo, box: SteleBox): void {
    const inn = box.inner;
    let y = inn.y;
    // Tiêu đề: tối đa 2 dòng, chữ nhỏ dần nhưng không dưới 32px.
    let size = 38;
    let title: Text;
    for (;;) {
      title = new Text({
        text: info.title,
        style: { fontFamily: FONT_TITLE, fontSize: size, fontWeight: '700', fill: INK, align: 'center', wordWrap: true, wordWrapWidth: inn.w, lineHeight: size * 1.18 },
      });
      if (title.height <= size * 1.18 * 2 + 2 || size <= STELE_MIN_FONT) break;
      title.destroy();
      size -= 2;
    }
    title.anchor.set(0.5, 0);
    title.position.set(inn.x + inn.w / 2, y);
    this.body.addChild(title);
    y += title.height + 14;
    // Gạch ngang dưới tiêu đề.
    this.body.addChild(new Graphics().moveTo(inn.x + inn.w * 0.15, y - 6).lineTo(inn.x + inn.w * 0.85, y - 6).stroke({ width: 2, color: INK, alpha: 0.45 }));

    const othersH = info.others ? 46 : 0;
    const rows = info.rows;
    const rowH = rows.length ? Math.max(40, Math.min(50, (inn.y + inn.h - y - othersH) / rows.length)) : 0;
    const font = STELE_MIN_FONT;
    const rankW = 48;
    for (const r of rows) {
      const top3 = r.rank <= 3;
      const color = top3 ? GOLD : INK;
      const cy = y + rowH / 2;
      // Hạng: huy chương cho top 3, số cho hạng 4–10.
      const medal = top3 ? (this.art?.textures.get(MEDALS[r.rank - 1]!) ?? null) : null;
      if (medal) {
        const m = new Sprite(medal);
        m.anchor.set(0.5);
        m.scale.set(40 / Math.max(medal.width, medal.height));
        m.position.set(inn.x + rankW / 2 - 4, cy);
        this.body.addChild(m);
      } else {
        const rk = engraved(`${r.rank}.`, font, color);
        rk.position.set(inn.x, cy - font * 0.68);
        this.body.addChild(rk);
      }
      const pts = engraved(compactPoints(r.points), font, color, FONT_BODY, '600');
      pts.position.set(inn.x + inn.w - pts.width, cy - font * 0.68);
      this.body.addChild(pts);
      // Tên: cắt bớt cho vừa chỗ còn lại.
      const room = inn.w - rankW - 10 - pts.width - 10;
      let n = Math.min(16, Array.from(r.name).length);
      let name = engraved(shortName(r.name, n), font, color);
      while (name.width > room && n > 3) {
        name.destroy({ children: true });
        n--;
        name = engraved(shortName(r.name, n), font, color);
      }
      name.position.set(inn.x + rankW + 4, cy - font * 0.68);
      this.body.addChild(name);
      y += rowH;
    }
    if (info.others) {
      const o = engraved(info.others, font, INK, FONT_BODY, '600');
      o.position.set(inn.x + inn.w / 2 - o.width / 2, y + 6);
      this.body.addChild(o);
    }
  }

  tick(dt: number): void {
    if (!this.box || this.dur <= 0) return;
    this.t += dt;
    const b = this.box;
    const p = steleProgress(this.t, this.dur);
    // Trồi lên từ đường chân: dời xuống theo phần chưa lên, phần dưới chân bị che.
    const e = 1 - (1 - p) * (1 - p);
    this.body.y = (1 - e) * b.h;
    this.shadow.clear();
    if (p > 0) this.shadow.ellipse(b.cx, b.base + 4, b.w * 0.5, 16).fill({ color: 0x000000, alpha: 0.35 * p });
    // Bụi đá ở chân khi đang trồi lên / thu lại.
    if (Math.abs(p - this.lastP) > 0.0001 && p > 0 && p < 1) {
      for (let k = 0; k < 3; k++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.puffs.push({ x: b.cx + side * (b.w * 0.25 + Math.random() * b.w * 0.3), y: b.base - 4, vx: side * (20 + Math.random() * 50), vy: -10 - Math.random() * 30, t: 0, r: 8 + Math.random() * 10 });
      }
    }
    this.lastP = p;
    this.dust.clear();
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i]!;
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.t > 1.2) {
        this.puffs.splice(i, 1);
        continue;
      }
      this.dust.circle(q.x, q.y, q.r * (1 + q.t)).fill({ color: 0xd9c9a8, alpha: 0.55 * (1 - q.t / 1.2) });
    }
    if (this.t >= this.dur && !this.puffs.length) {
      this.dur = 0;
      this.container.visible = false;
      for (const c of this.body.removeChildren()) c.destroy({ children: true });
    }
  }

  /** Bỏ ngay (đổi ảnh, mất kết nối). */
  clear(): void {
    this.dur = 0;
    this.puffs = [];
    this.dust.clear();
    this.shadow.clear();
    this.container.visible = false;
    for (const c of this.body.removeChildren()) c.destroy({ children: true });
  }
}

