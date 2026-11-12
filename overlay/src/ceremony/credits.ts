// Credit cuối công trình (mục 5, 14.12): sau lễ khánh thành, danh sách TẤT CẢ người góp công cuộn chậm như cuối phim, lặp lại.
// Chữ lấy từ server (tên công trình, kho thoại credits_title / credits_end, tên người góp đã lọc). Chỉ dựng chữ cho những dòng
// đang thấy, nên danh sách hàng nghìn người vẫn nhẹ.

import { Container, Graphics, Text } from 'pixi.js';
import type { CreditsInfo } from '../../../shared/protocol.js';
import { creditLines, creditsHeight, type CreditLine } from './layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

export class CreditsView {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly content = new Container();
  private readonly clip = new Graphics();
  private lines: CreditLine[] = [];
  private total = 0;
  private offset = 0;
  private readonly live = new Map<number, Text>();
  private rect = { x: 0, y: 0, w: 1, h: 1 };
  private alpha = 0;
  on = false;

  constructor() {
    this.content.mask = this.clip;
    this.container.addChild(this.bg, this.content, this.clip);
    this.container.visible = false;
  }

  setRect(r: { x: number; y: number; w: number; h: number }): void {
    this.rect = r;
    this.bg.clear().roundRect(r.x, r.y, r.w, r.h, 24).fill({ color: 0x1c0f07, alpha: 0.5 });
    this.clip.clear().rect(r.x, r.y + 10, r.w, r.h - 20).fill(0xffffff);
  }

  setData(c: CreditsInfo): void {
    this.lines = creditLines(c);
    this.total = creditsHeight(this.lines);
    for (const t of this.live.values()) t.destroy();
    this.live.clear();
    this.offset = -this.rect.h;
  }

  get hasData(): boolean {
    return this.lines.length > 0;
  }

  private make(l: CreditLine): Text {
    const style =
      l.kind === 'project'
        ? { fontFamily: FONT_TITLE, fontSize: 48, fontWeight: '700' as const, fill: C.goldLight }
        : l.kind === 'end'
          ? { fontFamily: FONT_TITLE, fontSize: 34, fontWeight: '700' as const, fill: C.goldLight }
          : l.kind === 'title'
            ? { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '600' as const, fill: C.cream }
            : { fontFamily: FONT_BODY, fontSize: 32, fontWeight: '600' as const, fill: C.cream };
    const t = new Text({ text: l.text, style: { ...style, stroke: { color: 0x1c0f07, width: 4 }, wordWrap: true, wordWrapWidth: this.rect.w - 40, align: 'center' } });
    t.anchor.set(0.5, 0.5);
    this.content.addChild(t);
    return t;
  }

  tick(dt: number, speed: number): void {
    this.alpha = this.on ? Math.min(1, this.alpha + dt) : Math.max(0, this.alpha - dt * 1.5);
    this.container.visible = this.alpha > 0 && this.lines.length > 0;
    this.container.alpha = this.alpha;
    if (!this.container.visible) return;
    this.offset += speed * dt;
    // Hết danh sách thì cuộn lại từ đầu.
    if (this.offset > this.total) this.offset = -this.rect.h;
    const r = this.rect;
    const want = new Set<number>();
    this.lines.forEach((l, i) => {
      if (l.kind === 'gap') return;
      const y = r.y + l.y - this.offset + l.h / 2;
      if (y < r.y - 60 || y > r.y + r.h + 60) return;
      want.add(i);
      const t = this.live.get(i) ?? this.make(l);
      this.live.set(i, t);
      t.position.set(r.x + r.w / 2, y);
    });
    for (const [i, t] of this.live) {
      if (want.has(i)) continue;
      t.destroy();
      this.live.delete(i);
    }
  }

  clear(): void {
    for (const t of this.live.values()) t.destroy();
    this.live.clear();
    this.lines = [];
    this.on = false;
    this.alpha = 0;
    this.container.visible = false;
  }
}
