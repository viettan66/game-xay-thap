// Bảng xếp hạng bên phải, luân phiên mỗi boardRotateSec giây (mặc định 15):
// Top phiên này → Top tổng → Bia ghi danh tầng hiện tại (mục 8). Dữ liệu thật từ DB.

import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Board, OverlayState } from '../../../shared/protocol.js';
import { avatarHue, formatPoints, nextBoardIndex, truncateToWidth, type Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

const MAX_ROWS = 10;
const ROW_H = 62;
const TITLE_H = 66;

const nameStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 24, fontWeight: '600', fill: C.ink });
const pointStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: C.red });

class RowView {
  readonly c = new Container();
  private readonly rank = new Graphics();
  private readonly rankText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: C.ink } });
  private readonly avatar = new Graphics();
  private readonly initial = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0xffffff } });
  private readonly name = new Text({ text: '', style: nameStyle });
  private readonly points = new Text({ text: '', style: pointStyle });

  constructor(private readonly width: number) {
    this.rankText.anchor.set(0.5);
    this.rankText.position.set(24, ROW_H / 2);
    this.initial.anchor.set(0.5);
    this.initial.position.set(70, ROW_H / 2);
    this.name.position.set(100, 6);
    this.points.position.set(100, 34);
    this.c.addChild(this.rank, this.rankText, this.avatar, this.initial, this.name, this.points);
  }

  set(row: Board['rows'][number] | undefined, unit: string): void {
    this.c.visible = !!row;
    if (!row) return;
    const medal = row.rank <= 3 ? C.medals[row.rank - 1]! : null;
    this.rank.clear();
    if (medal !== null) this.rank.circle(24, ROW_H / 2, 18).fill(medal).stroke({ width: 2, color: C.brown });
    this.rankText.text = String(row.rank);
    // Avatar tạm: vòng tròn màu có chữ cái đầu. Ảnh avatar thật có từ giai đoạn 6.
    this.avatar.clear().circle(70, ROW_H / 2, 22).fill({ color: hslToHex(avatarHue(row.platformId), 0.45, 0.45) });
    this.initial.text = Array.from(row.nickname.trim())[0]?.toUpperCase() ?? '?';
    const maxName = this.width - 100 - 14;
    this.name.text = truncateToWidth(row.nickname, maxName, (s) => CanvasTextMetrics.measureText(s, nameStyle).width);
    this.points.text = `${formatPoints(row.points)} ${unit}`;
  }
}

export class BoardPanel {
  readonly container = new Container();
  private readonly content = new Container();
  private readonly bg = new Graphics();
  private readonly title: Text;
  private readonly rows: RowView[] = [];
  private boards: Board[] = [];
  private unit = '';
  private index = 0;
  private elapsed = 0;
  private rotateSec = 15;
  private fade: 'none' | 'out' | 'in' = 'none';

  constructor(private readonly r: Rect) {
    this.title = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: 30, fontWeight: '700', fill: C.goldLight } });
    this.title.anchor.set(0.5);
    this.title.position.set(r.x + r.w / 2, r.y + TITLE_H / 2);
    const rowsFit = Math.min(MAX_ROWS, Math.floor((r.h - TITLE_H - 8) / ROW_H));
    for (let i = 0; i < rowsFit; i++) {
      const row = new RowView(r.w - 12);
      row.c.position.set(r.x + 6, r.y + TITLE_H + 4 + i * ROW_H);
      this.rows.push(row);
      this.content.addChild(row.c);
    }
    this.content.addChild(this.title);
    this.container.addChild(this.bg, this.content);
    this.drawBg(0);
  }

  update(state: OverlayState): void {
    this.boards = state.boards;
    this.unit = state.labels.pointUnit;
    this.rotateSec = state.layout.boardRotateSec;
    // Bảng đang hiện mà trống thì chuyển ngay sang bảng có dữ liệu.
    if (!this.boards[this.index]?.rows.length) this.index = nextBoardIndex(this.boards, this.index);
    this.render();
  }

  tick(dtSec: number): void {
    if (this.boards.length === 0) return;
    if (this.fade === 'out') {
      this.content.alpha = Math.max(0, this.content.alpha - dtSec * 4);
      if (this.content.alpha === 0) {
        this.index = nextBoardIndex(this.boards, this.index);
        this.render();
        this.fade = 'in';
      }
      return;
    }
    if (this.fade === 'in') {
      this.content.alpha = Math.min(1, this.content.alpha + dtSec * 4);
      if (this.content.alpha === 1) this.fade = 'none';
      return;
    }
    this.elapsed += dtSec;
    if (this.elapsed >= this.rotateSec) {
      this.elapsed = 0;
      if (nextBoardIndex(this.boards, this.index) !== this.index) this.fade = 'out';
    }
  }

  private render(): void {
    const b = this.boards[this.index];
    if (!b) return;
    this.title.text = b.title;
    this.rows.forEach((row, i) => row.set(b.rows[i], this.unit));
    this.drawBg(Math.min(this.rows.length, b.rows.length));
    // Chưa ai góp công thì ẩn hẳn bảng.
    this.container.visible = b.rows.length > 0;
  }

  /** Khung co theo số dòng, để không che tháp nhiều hơn cần thiết. */
  private drawBg(rowCount: number): void {
    const r = this.r;
    const h = TITLE_H + rowCount * ROW_H + 12;
    this.bg
      .clear()
      .roundRect(r.x, r.y, r.w, h, 22)
      .fill({ color: C.parchment, alpha: 0.9 })
      .stroke({ width: 4, color: C.gold })
      .roundRect(r.x, r.y, r.w, TITLE_H, 22)
      .fill({ color: C.red });
  }
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
