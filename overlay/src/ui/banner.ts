// Banner trên giữa: "Tầng 27/100", tên giai đoạn, thanh 5 bước, % của tầng (mục 8).
// Khung vẽ tạm; giai đoạn 3 thay bằng ui/banner.png, ui/step_*.png, ui/progress_*.png.

import { Container, Graphics, Text } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import { bannerTitle, type Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

const STEPS = 5;

export class Banner {
  readonly container = new Container();
  private readonly steps = new Graphics();
  private readonly bar = new Graphics();
  private readonly title: Text;
  private readonly stageText: Text;
  private readonly pctText: Text;
  private stage = 1;
  private completed = false;
  private shownPct = 0;
  private targetPct = 0;
  private pulse = 0;
  private hasState = false;

  constructor(private readonly r: Rect) {
    const frame = new Graphics()
      .roundRect(r.x, r.y, r.w, r.h, 26)
      .fill({ color: C.redDark, alpha: 0.92 })
      .stroke({ width: 5, color: C.gold })
      .roundRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20, 18)
      .stroke({ width: 2, color: C.goldLight, alpha: 0.6 });
    this.title = new Text({
      text: '',
      style: { fontFamily: FONT_TITLE, fontSize: 52, fontWeight: '700', fill: C.goldLight, stroke: { color: C.redDark, width: 4 } },
    });
    this.title.anchor.set(0.5, 0);
    this.title.position.set(r.x + r.w / 2, r.y + 12);
    this.stageText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '600', fill: C.cream } });
    this.stageText.anchor.set(0.5, 0);
    this.stageText.position.set(r.x + r.w / 2, r.y + 78);
    this.pctText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 36, fontWeight: '700', fill: C.goldLight } });
    this.pctText.anchor.set(1, 0.5);
    this.pctText.position.set(r.x + r.w - 34, r.y + 138);
    this.container.addChild(frame, this.bar, this.steps, this.title, this.stageText, this.pctText);
  }

  update(state: OverlayState): void {
    const t = state.tower;
    this.title.text = bannerTitle(t.floor, t.floorName, t.totalFloors);
    this.stageText.text = t.stageName;
    this.stage = t.stage;
    this.completed = t.completed;
    this.targetPct = t.percent;
    // Lần đầu mở overlay thì hiện đúng % ngay, không chạy từ 0 lên.
    if (!this.hasState) this.shownPct = t.percent;
    this.hasState = true;
    this.drawSteps();
  }

  tick(dtSec: number): void {
    this.pulse += dtSec;
    if (Math.abs(this.targetPct - this.shownPct) > 0.05) {
      // Tầng mới (% giảm) thì nhảy ngay, % tăng thì chạy mượt.
      this.shownPct =
        this.targetPct < this.shownPct ? this.targetPct : this.shownPct + (this.targetPct - this.shownPct) * Math.min(1, dtSec * 4);
    }
    this.pctText.text = `${Math.round(this.shownPct)}%`;
    this.drawBar();
    this.drawSteps();
  }

  private drawSteps(): void {
    const r = this.r;
    const cy = r.y + 138;
    const gap = 66;
    const x0 = r.x + 52;
    const g = this.steps.clear();
    g.moveTo(x0, cy).lineTo(x0 + gap * (STEPS - 1), cy).stroke({ width: 6, color: C.gold, alpha: 0.7 });
    for (let i = 1; i <= STEPS; i++) {
      const x = x0 + gap * (i - 1);
      const done = this.completed || i < this.stage;
      const current = !this.completed && i === this.stage;
      if (current) {
        const glow = 0.35 + 0.25 * Math.sin(this.pulse * 4);
        g.circle(x, cy, 24).fill({ color: C.goldLight, alpha: glow });
      }
      g.circle(x, cy, 16).fill(done || current ? C.gold : 0x3b0d07).stroke({ width: 3, color: C.goldLight });
      if (done) {
        g.moveTo(x - 7, cy).lineTo(x - 2, cy + 6).lineTo(x + 8, cy - 6).stroke({ width: 4, color: C.redDark });
      }
    }
  }

  private drawBar(): void {
    const r = this.r;
    const x = r.x + 30;
    const w = r.w - 60;
    const y = r.y + r.h - 22;
    this.bar
      .clear()
      .roundRect(x, y, w, 10, 5)
      .fill({ color: 0x000000, alpha: 0.35 })
      .roundRect(x, y, Math.max(10, (w * this.shownPct) / 100), 10, 5)
      .fill(C.gold);
  }
}
