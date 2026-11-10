// Bảng xếp hạng bên phải, luân phiên mỗi boardRotateSec giây (mặc định 15):
// Top phiên này → Top tổng → Bia ghi danh tầng hiện tại (mục 8). Dữ liệu thật từ DB.
// Khung: ui/panel_tall.png (co giãn chiều cao theo số dòng, giữ nguyên hoa sen và góc). Top 3: ui/medal_*.png.

import { CanvasTextMetrics, Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import type { Board, OverlayState } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { avatarHue, formatPoints, nextBoardIndex, truncateToWidth, type Rect } from '../layout.js';
import { C, FONT_BODY, FONT_TITLE } from '../theme.js';

const MAX_ROWS = 10;
// Khung ảnh panel_tall.png (322×398): hoa sen + viền trên tới y≈75, góc trang trí tới y≈105, viền dưới cao ≈70.
// topHeight/bottomHeight giữ nguyên các phần đó khi kéo dài khung; chỉ phần giấy ở giữa được giãn.
const ART = { top: 110, bottom: 70, left: 36, right: 36, titleY: 100, rowsY: 124, rowH: 56, tail: 44 };
const PLAIN = { titleH: 66, rowsY: 70, rowH: 62, tail: 12 };

const nameStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 24, fontWeight: '600', fill: C.ink });
const pointStyle = new TextStyle({ fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: C.red });

class RowView {
  readonly c = new Container();
  private readonly rank = new Container();
  private readonly rankText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: C.ink } });
  private readonly avatar = new Graphics();
  private readonly initial = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0xffffff } });
  private readonly name = new Text({ text: '', style: nameStyle });
  private readonly points = new Text({ text: '', style: pointStyle });

  constructor(
    private readonly width: number,
    private readonly medals: (Texture | null)[],
    private readonly rowH: number,
  ) {
    this.rankText.anchor.set(0.5);
    this.rankText.position.set(24, this.rowH / 2);
    this.initial.anchor.set(0.5);
    this.initial.position.set(72, this.rowH / 2);
    this.name.position.set(102, 4);
    this.points.position.set(102, 31);
    this.c.addChild(this.rank, this.rankText, this.avatar, this.initial, this.name, this.points);
  }

  set(row: Board['rows'][number] | undefined, unit: string): void {
    this.c.visible = !!row;
    if (!row) return;
    this.rank.removeChildren().forEach((c) => c.destroy());
    const medal = row.rank <= 3 ? this.medals[row.rank - 1] : null;
    if (medal) {
      const s = new Sprite(medal);
      s.anchor.set(0.5);
      s.scale.set(48 / medal.height);
      s.position.set(24, this.rowH / 2);
      this.rank.addChild(s);
      this.rankText.visible = false;
    } else {
      if (row.rank <= 3) this.rank.addChild(new Graphics().circle(24, this.rowH / 2, 18).fill(C.medals[row.rank - 1]!).stroke({ width: 2, color: C.brown }));
      this.rankText.visible = true;
      this.rankText.text = String(row.rank);
    }
    // Avatar tạm: vòng tròn màu có chữ cái đầu, viền vàng. Ảnh avatar thật có từ giai đoạn 6.
    this.avatar
      .clear()
      .circle(72, this.rowH / 2, 22)
      .fill({ color: hslToHex(avatarHue(row.platformId), 0.45, 0.45) })
      .stroke({ width: 3, color: C.gold });
    this.initial.text = Array.from(row.nickname.trim())[0]?.toUpperCase() ?? '?';
    const maxName = this.width - 102 - 8;
    this.name.text = truncateToWidth(row.nickname, maxName, (s) => CanvasTextMetrics.measureText(s, nameStyle).width);
    this.points.text = `${formatPoints(row.points)} ${unit}`;
  }
}

export class BoardPanel {
  readonly container = new Container();
  private readonly content = new Container();
  private readonly bgLayer = new Container();
  private readonly title: Text;
  private rows: RowView[] = [];
  private boards: Board[] = [];
  private unit = '';
  private index = 0;
  private elapsed = 0;
  private rotateSec = 15;
  private fade: 'none' | 'out' | 'in' = 'none';
  private panel: NineSliceSprite | null = null;
  private plainBg: Graphics | null = null;

  constructor(private readonly r: Rect) {
    this.title = new Text({ text: '', style: { fontFamily: FONT_TITLE, fontSize: 30, fontWeight: '700', fill: C.goldLight } });
    this.title.anchor.set(0.5);
    this.container.addChild(this.bgLayer, this.content);
    this.setArt(null);
  }

  setArt(art: Art | null): void {
    const panelTex = art?.textures.get('ui/panel_tall') ?? null;
    const medals = ['ui/medal_gold', 'ui/medal_silver', 'ui/medal_bronze'].map((k) => art?.textures.get(k) ?? null);
    this.bgLayer.removeChildren().forEach((c) => c.destroy());
    this.panel = null;
    this.plainBg = null;
    const r = this.r;
    if (panelTex) {
      this.panel = new NineSliceSprite({
        texture: panelTex,
        leftWidth: ART.left,
        rightWidth: ART.right,
        topHeight: ART.top,
        bottomHeight: ART.bottom,
      });
      this.panel.position.set(r.x, r.y);
      this.bgLayer.addChild(this.panel);
      this.title.style.fill = C.redDark;
      this.title.position.set(r.x + r.w / 2, r.y + ART.titleY);
    } else {
      this.plainBg = new Graphics();
      this.bgLayer.addChild(this.plainBg);
      this.title.style.fill = C.goldLight;
      this.title.position.set(r.x + r.w / 2, r.y + PLAIN.titleH / 2);
    }
    for (const row of this.rows) row.c.destroy({ children: true });
    this.content.removeChildren();
    const m = this.panel ? ART : PLAIN;
    const rowsFit = Math.min(MAX_ROWS, Math.floor((r.h - m.rowsY - m.tail) / m.rowH));
    const inset = this.panel ? 20 : 6;
    this.rows = [];
    for (let i = 0; i < rowsFit; i++) {
      const row = new RowView(r.w - inset * 2, medals, m.rowH);
      row.c.position.set(r.x + inset, r.y + m.rowsY + i * m.rowH);
      this.rows.push(row);
      this.content.addChild(row.c);
    }
    this.content.addChild(this.title);
    this.render();
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
    if (!b) {
      this.container.visible = false;
      return;
    }
    this.title.text = b.title;
    this.rows.forEach((row, i) => row.set(b.rows[i], this.unit));
    const n = Math.min(this.rows.length, b.rows.length);
    const r = this.r;
    // Khung co theo số dòng, để không che tháp nhiều hơn cần thiết.
    if (this.panel) {
      this.panel.width = r.w;
      this.panel.height = Math.max(ART.top + ART.bottom, ART.rowsY + n * ART.rowH + ART.tail);
    } else if (this.plainBg) {
      this.plainBg
        .clear()
        .roundRect(r.x, r.y, r.w, PLAIN.rowsY + n * PLAIN.rowH + PLAIN.tail, 22)
        .fill({ color: C.parchment, alpha: 0.9 })
        .stroke({ width: 4, color: C.gold })
        .roundRect(r.x, r.y, r.w, PLAIN.titleH, 22)
        .fill({ color: C.red });
    }
    // Chưa ai góp công thì ẩn hẳn bảng.
    this.container.visible = b.rows.length > 0;
  }
}

function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
