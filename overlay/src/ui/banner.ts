// Banner trên giữa: "Tầng 27/100", tên giai đoạn, % của tầng, và khung 5 bước (mục 8).
// Dùng ảnh ui/banner.png, ui/progress_frame.png, ui/progress_fill.png, ui/step_*.png; chữ do code vẽ.
// Thiếu ảnh thì vẽ khung tạm bằng code.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { bannerTitle, type Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

const STEPS = 5;
// Vùng 5 ô bên trong ảnh progress_frame.png (tỉ lệ theo bề rộng/cao ảnh), bỏ hai đầu hoa sen.
const CELLS = { x0: 0.13, x1: 0.87, y0: 0.24, y1: 0.76 };
const RING_FRAC = 0.47;
const TITLE_SIZE = 40;

function fit(tex: Texture, r: Rect): Sprite {
  const s = new Sprite(tex);
  const k = Math.min(r.w / tex.width, r.h / tex.height);
  s.scale.set(k);
  s.position.set(r.x + (r.w - tex.width * k) / 2, r.y + (r.h - tex.height * k) / 2);
  return s;
}

export class Banner {
  readonly container = new Container();
  private readonly frame = new Container();
  private readonly fill = new Container();
  private readonly fillMask = new Graphics();
  private readonly steps = new Container();
  private readonly title: Text;
  private readonly stageText: Text;
  private readonly pctText: Text;
  private stepTex: { empty: Texture | null; current: Texture | null; done: Texture | null } = { empty: null, current: null, done: null };
  private stage = 1;
  private completed = false;
  private shownPct = 0;
  private targetPct = 0;
  private pulse = 0;
  private hasState = false;
  private hasArt = false;
  private stepsKey = '';

  constructor(
    private readonly r: Rect,
    private readonly pr: Rect,
  ) {
    this.title = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: TITLE_SIZE, fontWeight: '700', fill: C.redDark } });
    this.title.anchor.set(0.5);
    this.stageText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '600', fill: C.ink } });
    this.stageText.anchor.set(0.5);
    this.pctText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 26, fontWeight: '700', fill: C.red } });
    this.pctText.anchor.set(1, 0.5);
    this.fill.mask = this.fillMask;
    this.container.addChild(this.frame, this.fill, this.fillMask, this.steps, this.title, this.stageText, this.pctText);
  }

  setArt(art: Art): void {
    const t = (k: string) => art.textures.get(k) ?? null;
    this.frame.removeChildren().forEach((c) => c.destroy());
    this.fill.removeChildren().forEach((c) => c.destroy());
    const banner = t('ui/banner');
    const frame = t('ui/progress_frame');
    const fillTex = t('ui/progress_fill');
    this.hasArt = !!banner;
    const { r, pr } = this;
    if (banner) {
      this.frame.addChild(fit(banner, r));
      // Vùng giấy trong ảnh banner nằm khoảng 35%–85% chiều cao.
      this.title.position.set(r.x + r.w / 2, r.y + r.h * 0.5);
      this.stageText.position.set(r.x + r.w / 2, r.y + r.h * 0.74);
      this.pctText.position.set(r.x + r.w * 0.87, r.y + r.h * 0.74);
      this.title.style.fill = C.redDark;
      this.stageText.style.fill = C.ink;
      this.pctText.style.fill = C.red;
    } else {
      this.frame.addChild(
        new Graphics().roundRect(r.x, r.y, r.w, r.h, 26).fill({ color: C.redDark, alpha: 0.92 }).stroke({ width: 5, color: C.gold }),
      );
      this.title.position.set(r.x + r.w / 2, r.y + r.h * 0.34);
      this.stageText.position.set(r.x + r.w / 2, r.y + r.h * 0.72);
      this.pctText.position.set(r.x + r.w - 30, r.y + r.h * 0.72);
      this.title.style.fill = C.goldLight;
      this.stageText.style.fill = C.cream;
      this.pctText.style.fill = C.goldLight;
    }
    const cells = this.cellsRect();
    if (frame) {
      this.frame.addChild(fit(frame, pr));
    } else {
      this.frame.addChild(new Graphics().roundRect(pr.x, pr.y, pr.w, pr.h, pr.h / 2).fill({ color: C.redDark }).stroke({ width: 4, color: C.gold }));
    }
    if (fillTex) {
      const s = new Sprite(fillTex);
      s.position.set(cells.x, cells.y);
      s.width = cells.w;
      s.height = cells.h;
      this.fill.addChild(s);
    } else {
      this.fill.addChild(new Graphics().roundRect(cells.x, cells.y, cells.w, cells.h, cells.h / 2).fill(C.gold));
    }
    this.stepTex = { empty: t('ui/step_empty'), current: t('ui/step_current'), done: t('ui/step_done') };
    this.stepsKey = '';
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
    // Chữ dài thì thu nhỏ cho vừa khung.
    this.title.style.fontSize = TITLE_SIZE;
    while (this.title.width > this.r.w * 0.66 && Number(this.title.style.fontSize) > 24) this.title.style.fontSize = Number(this.title.style.fontSize) - 2;
  }

  tick(dtSec: number): void {
    this.pulse += dtSec;
    if (Math.abs(this.targetPct - this.shownPct) > 0.05) {
      // Tầng mới (% giảm) thì nhảy ngay, % tăng thì chạy mượt.
      this.shownPct =
        this.targetPct < this.shownPct ? this.targetPct : this.shownPct + (this.targetPct - this.shownPct) * Math.min(1, dtSec * 4);
    }
    this.pctText.text = `${Math.round(this.shownPct)}%`;
    const cells = this.cellsRect();
    this.fillMask.clear().rect(cells.x, cells.y, (cells.w * this.shownPct) / 100, cells.h).fill(0xffffff);
    this.drawSteps();
  }

  private cellsRect(): Rect {
    const { pr } = this;
    return {
      x: pr.x + pr.w * CELLS.x0,
      y: pr.y + pr.h * CELLS.y0,
      w: pr.w * (CELLS.x1 - CELLS.x0),
      h: pr.h * (CELLS.y1 - CELLS.y0),
    };
  }

  /** Mỗi ô của khung 5 bước có một vòng: xong (✓), đang làm (sáng, nhấp nháy nhẹ), chưa làm. */
  private drawSteps(): void {
    const key = `${this.stage}|${this.completed}`;
    const cells = this.cellsRect();
    const size = cells.h * 1.15;
    if (key !== this.stepsKey) {
      this.stepsKey = key;
      this.steps.removeChildren().forEach((c) => c.destroy());
      for (let i = 1; i <= STEPS; i++) {
        const done = this.completed || i < this.stage;
        const current = !this.completed && i === this.stage;
        const tex = done ? this.stepTex.done : current ? this.stepTex.current : this.stepTex.empty;
        const cx = cells.x + ((i - 0.5) * cells.w) / STEPS;
        const cy = cells.y + cells.h / 2;
        if (tex) {
          const s = new Sprite(tex);
          s.anchor.set(0.5);
          // 3 ảnh vòng cùng kích thước ô (chừa chỗ cho hào quang), phần vòng chiếm khoảng RING_FRAC bề rộng ảnh.
          s.scale.set(size / (tex.width * RING_FRAC));
          s.position.set(cx, cy);
          s.label = current ? 'current' : '';
          this.steps.addChild(s);
        } else {
          const g = new Graphics().circle(cx, cy, size / 2).fill(done || current ? C.gold : 0x3b0d07).stroke({ width: 3, color: C.goldLight });
          g.label = current ? 'current' : '';
          this.steps.addChild(g);
        }
      }
    }
    const cur = this.steps.children.find((c) => c.label === 'current');
    if (cur) cur.alpha = 0.8 + 0.2 * Math.sin(this.pulse * 4);
  }

  get usesArt(): boolean {
    return this.hasArt;
  }
}
