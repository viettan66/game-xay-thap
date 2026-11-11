// Banner trên giữa (tạm cho giai đoạn R1, R4 sẽ chuyển thành thanh tiến độ góc trên phải theo mục 8):
//   dòng 1: "Hạng mục 7/23 · Gác chuông"; dòng 2: "Giai đoạn 5/10: Dựng cột" và % của giai đoạn;
//   thanh tiến độ liên tục của giai đoạn; dưới thanh: hàng chấm các giai đoạn (nếu ≤ 10) và "Toàn công trình 23%".
// Chữ đã được server điền từ mẫu trong config. Dùng ảnh ui/banner.png, ui/progress_frame.png, ui/progress_fill.png,
// ui/step_*.png; thiếu ảnh thì vẽ khung tạm bằng code.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import type { Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

/** Hiện hàng chấm giai đoạn khi hạng mục có tối đa ngần này giai đoạn (mục 8). */
const MAX_DOTS = 10;
// Vùng ruột thanh bên trong ảnh progress_frame.png (tỉ lệ theo bề rộng/cao ảnh), bỏ hai đầu hoa sen.
const CELLS = { x0: 0.13, x1: 0.87, y0: 0.24, y1: 0.76 };
const RING_FRAC = 0.47;
const TITLE_SIZE = 34;

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
  private readonly dots = new Container();
  private readonly title: Text;
  private readonly stageText: Text;
  private readonly pctText: Text;
  private readonly projectText: Text;
  private stepTex: { empty: Texture | null; current: Texture | null; done: Texture | null } = { empty: null, current: null, done: null };
  private stage = 1;
  private stageCount = 1;
  private completed = false;
  private itemId = '';
  private shownPct = 0;
  private targetPct = 0;
  private pulse = 0;
  private hasState = false;
  private hasArt = false;
  private dotsKey = '';

  constructor(
    private readonly r: Rect,
    private readonly pr: Rect,
    private readonly info: Rect,
  ) {
    this.title = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: TITLE_SIZE, fontWeight: '700', fill: C.redDark } });
    this.title.anchor.set(0.5);
    this.stageText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '600', fill: C.ink } });
    this.stageText.anchor.set(0.5);
    this.pctText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 26, fontWeight: '700', fill: C.red } });
    this.pctText.anchor.set(1, 0.5);
    this.projectText = new Text({
      text: '',
      style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0xffffff, stroke: { color: C.ink, width: 4 } },
    });
    this.projectText.anchor.set(1, 0.5);
    this.projectText.position.set(info.x + info.w - 6, info.y + info.h / 2);
    this.fill.mask = this.fillMask;
    this.container.addChild(this.frame, this.fill, this.fillMask, this.dots, this.title, this.stageText, this.pctText, this.projectText);
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
      this.stageText.position.set(r.x + r.w / 2 - 20, r.y + r.h * 0.74);
      this.pctText.position.set(r.x + r.w * 0.87, r.y + r.h * 0.74);
      this.title.style.fill = C.redDark;
      this.stageText.style.fill = C.ink;
      this.pctText.style.fill = C.red;
    } else {
      this.frame.addChild(
        new Graphics().roundRect(r.x, r.y, r.w, r.h, 26).fill({ color: C.redDark, alpha: 0.92 }).stroke({ width: 5, color: C.gold }),
      );
      this.title.position.set(r.x + r.w / 2, r.y + r.h * 0.34);
      this.stageText.position.set(r.x + r.w / 2 - 20, r.y + r.h * 0.72);
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
    this.dotsKey = '';
    this.fitTexts();
  }

  update(state: OverlayState): void {
    const p = state.progress;
    this.title.text = p.lines.item;
    this.stageText.text = p.lines.stage;
    this.projectText.text = p.lines.project;
    this.stage = p.stage.number;
    this.stageCount = p.stage.count;
    this.completed = p.completed;
    this.targetPct = p.percent;
    // Lần đầu mở overlay, hoặc sang hạng mục mới, thì hiện đúng % ngay, không chạy từ số cũ.
    if (!this.hasState || this.itemId !== p.item.id) this.shownPct = p.percent;
    this.itemId = p.item.id;
    this.hasState = true;
    this.fitTexts();
  }

  /** Chữ dài thì thu nhỏ cho vừa khung. */
  private fitTexts(): void {
    const shrink = (t: Text, size: number, maxW: number, min: number) => {
      t.style.fontSize = size;
      while (t.width > maxW && Number(t.style.fontSize) > min) t.style.fontSize = Number(t.style.fontSize) - 1;
    };
    shrink(this.title, TITLE_SIZE, this.r.w * (this.hasArt ? 0.72 : 0.9), 18);
    shrink(this.stageText, 24, this.r.w * (this.hasArt ? 0.6 : 0.7), 14);
  }

  tick(dtSec: number): void {
    this.pulse += dtSec;
    if (Math.abs(this.targetPct - this.shownPct) > 0.05) {
      // Giai đoạn mới (% giảm) thì nhảy ngay, % tăng thì chạy mượt.
      this.shownPct =
        this.targetPct < this.shownPct ? this.targetPct : this.shownPct + (this.targetPct - this.shownPct) * Math.min(1, dtSec * 4);
    }
    this.pctText.text = `${Math.round(this.shownPct)}%`;
    const cells = this.cellsRect();
    this.fillMask.clear().rect(cells.x, cells.y, (cells.w * this.shownPct) / 100, cells.h).fill(0xffffff);
    this.drawDots();
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

  /** Hàng chấm các giai đoạn: xong (✓), đang làm (sáng, nhấp nháy nhẹ), chưa làm. Quá 10 giai đoạn thì không hiện. */
  private drawDots(): void {
    const key = `${this.stage}|${this.stageCount}|${this.completed}|${Math.round(this.projectText.width)}`;
    if (key !== this.dotsKey) {
      this.dotsKey = key;
      this.dots.removeChildren().forEach((c) => c.destroy());
      if (this.stageCount <= MAX_DOTS) {
        // Chấm co lại cho vừa phần trống bên trái dòng "Toàn công trình …%".
        const free = this.info.w - this.projectText.width - 24;
        const step = Math.max(14, Math.min(34, free / this.stageCount));
        const size = Math.min(26, step - 6);
        const y = this.info.y + this.info.h / 2;
        for (let i = 1; i <= this.stageCount; i++) {
          const done = this.completed || i < this.stage;
          const current = !this.completed && i === this.stage;
          const tex = done ? this.stepTex.done : current ? this.stepTex.current : this.stepTex.empty;
          const x = this.info.x + 6 + size / 2 + (i - 1) * step;
          if (tex) {
            const s = new Sprite(tex);
            s.anchor.set(0.5);
            // Ảnh vòng chừa chỗ cho hào quang: phần vòng chiếm khoảng RING_FRAC bề rộng ảnh.
            s.scale.set(size / (tex.width * RING_FRAC));
            s.position.set(x, y);
            s.label = current ? 'current' : '';
            this.dots.addChild(s);
          } else {
            const g = new Graphics().circle(x, y, size / 2).fill(done || current ? C.gold : 0x3b0d07).stroke({ width: 3, color: C.goldLight });
            g.label = current ? 'current' : '';
            this.dots.addChild(g);
          }
        }
      }
    }
    const cur = this.dots.children.find((c) => c.label === 'current');
    if (cur) cur.alpha = 0.75 + 0.25 * Math.sin(this.pulse * 4);
  }

  get usesArt(): boolean {
    return this.hasArt;
  }
}
