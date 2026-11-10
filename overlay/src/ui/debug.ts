// Khung debug (phím D): tô màu các vùng an toàn mà nền tảng tự vẽ giao diện (mục 8 SPEC).
// Chỉ để người vận hành kiểm tra bố cục, không dùng khi live.

import { Container, Graphics, Text } from 'pixi.js';
import type { SafeArea } from '../../../shared/protocol.js';
import { STAGE_H, STAGE_W } from '../layout.js';
import { FONT_BODY } from '../theme.js';

export class SafeAreaDebug {
  readonly container = new Container();
  private key = '';

  constructor() {
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(v: boolean) {
    this.container.visible = v;
  }

  update(safe: SafeArea): void {
    const key = JSON.stringify(safe);
    if (key === this.key) return;
    this.key = key;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics()
      .rect(0, 0, STAGE_W, safe.top)
      .fill({ color: 0xff3b30, alpha: 0.35 })
      .rect(0, STAGE_H - safe.bottom, STAGE_W, safe.bottom)
      .fill({ color: 0x0a84ff, alpha: 0.35 })
      .rect(STAGE_W - safe.right, safe.top, safe.right, STAGE_H - safe.top - safe.bottom)
      .fill({ color: 0x30d158, alpha: 0.35 });
    const label = (text: string, x: number, y: number) => {
      const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 5 } } });
      t.anchor.set(0.5);
      t.position.set(x, y);
      this.container.addChild(t);
    };
    this.container.addChild(g);
    label(`${safe.top}px`, STAGE_W / 2, safe.top / 2);
    label(`${safe.bottom}px`, STAGE_W / 2, STAGE_H - safe.bottom / 2);
    label(`${safe.right}px`, STAGE_W - safe.right / 2, STAGE_H / 2);
  }
}
