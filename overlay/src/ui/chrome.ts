// Các phần giao diện nhỏ: nhãn CHẾ ĐỘ THỬ / DIỄN TẬP, dải miễn trừ, huy hiệu hệ số, chấm báo mất kết nối.
// Chữ đều lấy từ server (config), không viết cứng.

import { Container, Graphics, Text } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import { formatMultiplier, type Rect } from '../layout.js';
import { C, FONT_BODY } from '../theme.js';

export class Badge {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '700', fill: 0xffffff } });

  constructor(private readonly r: Rect) {
    this.text.anchor.set(0.5);
    this.container.addChild(this.bg, this.text);
  }

  update(label: string | null): void {
    this.container.visible = !!label;
    if (!label) return;
    this.text.text = label;
    this.text.style.fontSize = 24;
    while (this.text.width > this.r.w - 20 && Number(this.text.style.fontSize) > 12) {
      this.text.style.fontSize = Number(this.text.style.fontSize) - 1;
    }
    const w = Math.min(this.r.w, this.text.width + 28);
    this.bg.clear().roundRect(this.r.x, this.r.y, w, this.r.h, this.r.h / 2).fill(C.badge).stroke({ width: 3, color: 0xffffff });
    this.text.position.set(this.r.x + w / 2, this.r.y + this.r.h / 2);
  }
}

export class Disclaimer {
  readonly container = new Container();
  private readonly text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '600', fill: 0xffffff } });

  constructor(private readonly r: Rect) {
    const bg = new Graphics().rect(r.x, r.y, r.w, r.h).fill({ color: 0x000000, alpha: 0.55 });
    this.text.anchor.set(0.5);
    this.text.position.set(r.x + r.w / 2, r.y + r.h / 2);
    this.container.addChild(bg, this.text);
  }

  update(text: string): void {
    this.text.text = text;
    this.text.style.fontSize = 24;
    while (this.text.width > this.r.w - 24 && Number(this.text.style.fontSize) > 14) {
      this.text.style.fontSize = Number(this.text.style.fontSize) - 1;
    }
  }
}

export class MultiplierChip {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '700', fill: C.redDark } });

  constructor(private readonly r: Rect) {
    this.text.anchor.set(0.5);
    this.container.addChild(this.bg, this.text);
  }

  update(m: OverlayState['multiplier']): void {
    this.container.visible = !!m;
    if (!m) return;
    this.text.text = `${m.labels.join(' · ')}  ${formatMultiplier(m.total)}`;
    const w = Math.min(this.r.w, this.text.width + 36);
    const x = this.r.x + (this.r.w - w) / 2;
    this.bg.clear().roundRect(x, this.r.y, w, this.r.h, this.r.h / 2).fill(C.goldLight).stroke({ width: 3, color: C.gold });
    this.text.position.set(this.r.x + this.r.w / 2, this.r.y + this.r.h / 2);
  }
}

/** Chấm đỏ nhỏ khi mất kết nối server (không có chữ, để không lộ thông báo kỹ thuật lên live). */
export class ConnectionDot {
  readonly container = new Graphics();

  constructor(x: number, y: number) {
    this.container.circle(x, y, 9).fill(0xe53935).stroke({ width: 2, color: 0xffffff });
    this.container.visible = false;
  }

  set(connected: boolean): void {
    this.container.visible = !connected;
  }
}
