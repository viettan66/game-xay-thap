// Giao diện overlay mới (mục 8 SPEC, R4): chữ do code vẽ, nền mờ chỉnh được độ đậm (hud.opacity).
// - ProgressPanel: góc trên phải. Dòng 1 hạng mục, dòng 2 giai đoạn + thanh tiến độ liên tục + phần trăm,
//   dòng nhỏ toàn công trình, hàng chấm các giai đoạn (khi hạng mục có ≤ 10 giai đoạn).
// - CompactBoard: bảng xếp hạng thu gọn top 5, luân phiên, tự dời chỗ để không che hạng mục đang xây.
// - EventBox: giờ vàng (đếm ngược), sự kiện lịch, tổng hệ số.
// Mọi chữ lấy từ state (config), không viết cứng.

import { CanvasTextMetrics, Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import type { Board, EventLine, ProgressView } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { BOARD_SIZE, EVENT_LINE_H, formatCountdown } from '../hudLayout.js';
import { formatPoints, nextBoardIndex, truncateToWidth, type Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

const PANEL_BG = 0x1d130b;

/** Nền khung: chữ nhật bo góc, nền tối mờ theo độ đậm, viền vàng mảnh. */
function drawPanel(g: Graphics, w: number, h: number, opacity: number): void {
  g.clear()
    .roundRect(0, 0, w, h, 14)
    .fill({ color: PANEL_BG, alpha: opacity })
    .stroke({ width: 2, color: C.gold, alpha: Math.min(1, 0.35 + opacity * 0.6) });
}

/** Đặt chữ cho vừa bề rộng: thu nhỏ cỡ chữ (không dưới minSize), vẫn dài thì cắt "…". */
function setFit(t: Text, s: string, maxW: number, size?: number, minSize?: number): void {
  const style = t.style as TextStyle;
  if (size !== undefined) {
    style.fontSize = size;
    const min = minSize ?? size;
    while (Number(style.fontSize) > min && CanvasTextMetrics.measureText(s, style).width > maxW) style.fontSize = Number(style.fontSize) - 1;
  }
  t.text = truncateToWidth(s, maxW, (x) => CanvasTextMetrics.measureText(x, style).width);
}

const shadow = { color: 0x000000, alpha: 0.6, blur: 3, distance: 1, angle: Math.PI / 2 };

// ---------- Thanh tiến độ ----------

export class ProgressPanel {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly line1 = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: 25, fontWeight: '700', fill: C.goldLight, dropShadow: shadow } });
  private readonly line2 = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '600', fill: C.cream, dropShadow: shadow } });
  private readonly bar = new Graphics();
  private readonly pct = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '700', fill: C.goldLight } });
  private readonly line3 = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '400', fill: C.cream } });
  private readonly dots = new Graphics();
  private shown = 0;
  private target = 0;
  private key = '';
  private stageCount = 0;
  private stageIdx = 0;
  private completed = false;
  private pulse = 0;
  private opacity = 0.78;

  constructor(private readonly r: Rect) {
    this.container.position.set(r.x, r.y);
    this.line1.position.set(16, 10);
    this.line2.position.set(16, 46);
    this.pct.anchor.set(1, 0.5);
    this.line3.alpha = 0.85;
    this.line3.position.set(16, 104);
    this.container.addChild(this.bg, this.line1, this.line2, this.bar, this.pct, this.line3, this.dots);
  }

  update(p: ProgressView, opacity: number): void {
    const w = this.r.w;
    setFit(this.line1, p.lines.item, w - 32, 25, 19);
    setFit(this.line2, p.lines.stage, w - 32, 21, 17);
    this.line2.visible = !p.completed;
    this.line3.text = p.lines.project;
    const key = `${p.item.id}:${p.stage.number}`;
    // Sang giai đoạn mới: thanh bắt đầu lại từ 0 (không chạy lùi).
    if (key !== this.key) this.shown = 0;
    this.key = key;
    this.target = p.completed ? 100 : p.percent;
    this.completed = p.completed;
    this.stageCount = p.stage.count;
    this.stageIdx = p.stage.number - 1;
    this.opacity = opacity;
    const withDots = !p.completed && p.stage.count <= 10;
    this.dots.visible = withDots;
    drawPanel(this.bg, w, withDots ? this.r.h : this.r.h - 22, opacity);
  }

  tick(dt: number): void {
    this.shown += (this.target - this.shown) * Math.min(1, dt * 3);
    if (Math.abs(this.target - this.shown) < 0.05) this.shown = this.target;
    const x = 16;
    const y = this.completed ? 50 : 76;
    const w = this.r.w - 32 - 64;
    const h = 18;
    const f = Math.max(0, Math.min(1, this.shown / 100));
    this.bar
      .clear()
      .roundRect(x, y, w, h, h / 2)
      .fill({ color: 0x000000, alpha: 0.45 })
      .stroke({ width: 1.5, color: C.gold, alpha: 0.8 });
    if (f > 0) this.bar.roundRect(x + 2, y + 2, Math.max(h - 4, (w - 4) * f), h - 4, (h - 4) / 2).fill(C.gold);
    this.pct.text = `${Math.floor(this.shown)}%`;
    this.pct.position.set(this.r.w - 16, y + h / 2);
    this.line3.y = y + h + 8;
    if (this.dots.visible) {
      this.pulse += dt;
      const g = this.dots.clear();
      const cy = this.line3.y + 38;
      for (let i = 0; i < this.stageCount; i++) {
        const cx = 22 + i * 22;
        if (i < this.stageIdx) g.circle(cx, cy, 6).fill(C.gold);
        else if (i === this.stageIdx) {
          const a = 0.55 + 0.45 * Math.sin(this.pulse * 4);
          g.circle(cx, cy, 7).fill({ color: C.goldLight, alpha: a }).stroke({ width: 1.5, color: C.gold });
        } else g.circle(cx, cy, 5).stroke({ width: 1.5, color: C.cream, alpha: 0.6 });
      }
    }
  }
}

// ---------- Bảng xếp hạng thu gọn ----------

const nameStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 21, fontWeight: '600', fill: C.cream, dropShadow: shadow });
const pointStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 19, fontWeight: '700', fill: C.goldLight });

class Row {
  readonly c = new Container();
  private readonly medal = new Container();
  private readonly rank = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 19, fontWeight: '700', fill: C.cream } });
  private readonly name = new Text({ text: '', style: nameStyle });
  private readonly points = new Text({ text: '', style: pointStyle });

  constructor(
    private readonly w: number,
    private readonly medals: (Texture | null)[],
  ) {
    const h = BOARD_SIZE.rowH;
    this.rank.anchor.set(0.5);
    this.rank.position.set(26, h / 2);
    this.name.anchor.set(0, 0.5);
    this.name.position.set(52, h / 2);
    this.points.anchor.set(1, 0.5);
    this.points.position.set(w - 14, h / 2);
    this.c.addChild(this.medal, this.rank, this.name, this.points);
  }

  set(row: Board['rows'][number] | undefined, unit: string): void {
    this.c.visible = !!row;
    if (!row) return;
    this.medal.removeChildren().forEach((c) => c.destroy());
    const h = BOARD_SIZE.rowH;
    const tex = row.rank <= 3 ? this.medals[row.rank - 1] : null;
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.scale.set(34 / tex.height);
      s.position.set(26, h / 2);
      this.medal.addChild(s);
      this.rank.visible = false;
    } else {
      if (row.rank <= 3) this.medal.addChild(new Graphics().circle(26, h / 2, 14).fill(C.medals[row.rank - 1]!));
      this.rank.visible = true;
      this.rank.style.fill = row.rank <= 3 ? C.ink : C.cream;
      this.rank.text = String(row.rank);
    }
    this.points.text = `${formatPoints(row.points)} ${unit}`;
    setFit(this.name, row.nickname, this.w - 52 - this.points.width - 26);
  }
}

export class CompactBoard {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly body = new Container();
  private readonly title = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: 21, fontWeight: '700', fill: C.goldLight, dropShadow: shadow } });
  private rows: Row[] = [];
  private boards: Board[] = [];
  private unit = '';
  private idx = 1; // bắt đầu ở "Top tổng"
  private t = 0;
  private rotateSec = 15;
  private fade = 1;
  private switching = false;
  private moveTo: Rect | null = null;
  private moveFade = 1;
  /** Mờ đi khi camera thu toàn cảnh (mục 8). */
  dim = 1;

  constructor(private rect: Rect) {
    this.title.anchor.set(0.5, 0);
    this.title.position.set(rect.w / 2, 11);
    this.body.addChild(this.title);
    this.container.addChild(this.bg, this.body);
    this.container.position.set(rect.x, rect.y);
    this.setArt(null);
  }

  setArt(art: Art | null): void {
    for (const r of this.rows) r.c.destroy({ children: true });
    const medals = ['ui/medal_gold', 'ui/medal_silver', 'ui/medal_bronze'].map((k) => art?.textures.get(k) ?? null);
    this.rows = Array.from({ length: BOARD_SIZE.rows }, (_, i) => {
      const row = new Row(this.rect.w, medals);
      row.c.position.set(0, BOARD_SIZE.titleH + i * BOARD_SIZE.rowH);
      this.body.addChild(row.c);
      return row;
    });
    this.render();
  }

  update(boards: Board[], unit: string, opacity: number, rotateSec: number): void {
    this.boards = boards;
    this.unit = unit;
    this.rotateSec = rotateSec;
    if (this.idx >= boards.length || !boards[this.idx]?.rows.length) this.idx = nextBoardIndex(boards, this.idx);
    drawPanel(this.bg, this.rect.w, this.rect.h, opacity);
    this.render();
  }

  /** Dời bảng sang chỗ khác: mờ đi, dời, hiện lại. */
  place(r: Rect): void {
    if (r.x === this.rect.x && r.y === this.rect.y) {
      this.moveTo = null;
      return;
    }
    if (!this.moveTo || this.moveTo.x !== r.x || this.moveTo.y !== r.y) this.moveTo = r;
  }

  get slotRect(): Rect {
    return this.rect;
  }

  private render(): void {
    const b = this.boards[this.idx];
    const rows = b?.rows ?? [];
    setFit(this.title, b?.title ?? '', this.rect.w - 24, 21, 16);
    this.rows.forEach((r, i) => r.set(rows[i], this.unit));
  }

  tick(dt: number): void {
    const has = (this.boards[this.idx]?.rows.length ?? 0) > 0;
    this.t += dt;
    if (this.t >= this.rotateSec && this.boards.length > 1 && !this.switching) {
      this.t = 0;
      const next = nextBoardIndex(this.boards, this.idx);
      if (next !== this.idx) this.switching = true;
    }
    if (this.switching) {
      this.fade -= dt * 4;
      if (this.fade <= 0) {
        this.fade = 0;
        this.idx = nextBoardIndex(this.boards, this.idx);
        this.render();
        this.switching = false;
      }
    } else if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 4);
    if (this.moveTo) {
      this.moveFade -= dt * 3;
      if (this.moveFade <= 0) {
        this.rect = this.moveTo;
        this.moveTo = null;
        this.container.position.set(this.rect.x, this.rect.y);
        this.moveFade = 0;
      }
    } else if (this.moveFade < 1) this.moveFade = Math.min(1, this.moveFade + dt * 3);
    this.body.alpha = this.fade;
    this.container.alpha = (has ? 1 : 0) * this.moveFade * this.dim;
    this.container.visible = this.container.alpha > 0.01;
  }
}

// ---------- Ô sự kiện ----------

export class EventBox {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private texts: Text[] = [];
  private lines: EventLine[] = [];
  /** Lệch giữa đồng hồ server và máy chạy overlay. */
  private offset = 0;
  dim = 1;

  constructor(private readonly r: Rect) {
    this.container.addChild(this.bg);
  }

  update(lines: EventLine[], serverNow: number, opacity: number): void {
    this.offset = serverNow - Date.now();
    const same = lines.length === this.lines.length && lines.every((l, i) => l.text === this.lines[i]!.text && l.kind === this.lines[i]!.kind);
    this.lines = lines;
    if (!same) {
      for (const t of this.texts) t.destroy();
      this.texts = lines.map((l) => {
        const t = new Text({
          text: '',
          style: {
            fontFamily: FONT_BODY,
            fontSize: 21,
            fontWeight: l.kind === 'event' ? '600' : '700',
            fill: l.kind === 'golden' ? C.goldLight : l.kind === 'goal' ? 0xffc2cc : C.cream,
            dropShadow: shadow,
          },
        });
        t.anchor.set(1, 0.5);
        this.container.addChild(t);
        return t;
      });
    }
    this.layout(opacity);
  }

  private opacity = 0.78;

  private layout(opacity = this.opacity): void {
    this.opacity = opacity;
    this.container.visible = this.lines.length > 0;
    if (!this.lines.length) return;
    this.refreshText();
    const w = Math.min(this.r.w, Math.max(...this.texts.map((t) => t.width)) + 32);
    const h = this.lines.length * EVENT_LINE_H + 12;
    this.container.position.set(this.r.x + this.r.w - w, this.r.y);
    drawPanel(this.bg, w, h, opacity);
    this.texts.forEach((t, i) => t.position.set(w - 16, 6 + EVENT_LINE_H * i + EVENT_LINE_H / 2));
  }

  private refreshText(): void {
    const now = Date.now() + this.offset;
    this.lines.forEach((l, i) => {
      const t = this.texts[i];
      if (!t) return;
      const s = l.endsAt !== null ? l.text.replace(/\{time\}/g, formatCountdown(l.endsAt - now)) : l.text.replace(/\{time\}/g, '');
      if (t.text === s) return;
      t.text = s;
      // Dài quá khung thì chữ nhỏ lại (không nhỏ hơn 15).
      t.style.fontSize = 21;
      while (t.width > this.r.w - 32 && Number(t.style.fontSize) > 15) t.style.fontSize = Number(t.style.fontSize) - 1;
    });
  }

  private acc = 0;

  tick(dt: number): void {
    this.container.alpha = this.dim;
    this.acc += dt;
    if (this.acc < 0.25 || !this.lines.some((l) => l.endsAt !== null)) return;
    this.acc = 0;
    const before = this.texts.map((t) => t.width);
    this.refreshText();
    if (this.texts.some((t, i) => Math.abs(t.width - before[i]!) > 0.5)) this.layout();
  }
}
