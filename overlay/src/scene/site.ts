// Công trường TẠM bằng hình khối (giai đoạn R1): mỗi hạng mục một khối có tên.
// Đã xong: tô màu đỏ son. Đang xây: phần màu vàng dâng lên theo % hạng mục, viền nhấp nháy. Chưa xây: khối mờ.
// Xong giai đoạn / hạng mục thì khối chớp sáng. Chữ (tên hạng mục) lấy từ server (project.json).
// R2–R4 thay bằng bản đồ thật, công trình cắt từ ảnh và camera.

import { Container, Graphics, Text } from 'pixi.js';
import type { ProgressItem, ProgressView } from '../../../shared/protocol.js';
import { STAGE_H, STAGE_W, type Rect } from '../layout.js';
import { siteBlocks } from '../siteLayout.js';
import { C, FONT_BODY } from '../theme.js';

interface BlockNode {
  id: string;
  rect: Rect;
  root: Container;
  body: Graphics;
  fill: Graphics;
  flash: Graphics;
  label: Text;
  status: ProgressItem['status'];
  flashAlpha: number;
}

export class SiteView {
  readonly container = new Container();
  private readonly backdrop = new Graphics();
  private readonly blocksLayer = new Container();
  private blocks: BlockNode[] = [];
  private key = '';
  private building: string | null = null;
  private targetPct = 0;
  private shownPct = 0;
  private pulse = 0;

  constructor(private area: Rect) {
    this.drawBackdrop();
    this.container.addChild(this.backdrop, this.blocksLayer);
  }

  /** Nền tạm: trời, núi xa, đồi cỏ. */
  private drawBackdrop(): void {
    const g = this.backdrop.clear();
    g.rect(0, 0, STAGE_W, STAGE_H).fill(0xcfe3ee);
    g.rect(0, STAGE_H * 0.32, STAGE_W, STAGE_H * 0.68).fill(0xe3eef0);
    g.poly([0, 620, 260, 430, 470, 600, 700, 400, 1080, 640, 1080, STAGE_H, 0, STAGE_H]).fill(0xa9c3b8);
    g.poly([0, 760, 300, 640, 640, 700, 1080, 600, 1080, STAGE_H, 0, STAGE_H]).fill(0x9cc27a);
    g.rect(0, 1100, STAGE_W, STAGE_H - 1100).fill(0x8fb56c);
  }

  setArea(area: Rect): void {
    if (area.x === this.area.x && area.y === this.area.y && area.w === this.area.w && area.h === this.area.h) return;
    this.area = area;
    this.key = '';
  }

  update(p: ProgressView): void {
    const key = JSON.stringify([p.items.map((i) => [i.id, i.area, i.name]), this.area]);
    if (key !== this.key) this.rebuild(p.items, key);
    for (const b of this.blocks) {
      const it = p.items.find((i) => i.id === b.id);
      if (it && it.status !== b.status) {
        b.status = it.status;
        this.paint(b);
      }
    }
    if (this.building !== p.item.id || p.completed) this.shownPct = p.completed ? 100 : p.itemPercent;
    this.building = p.completed ? null : p.item.id;
    this.targetPct = p.itemPercent;
  }

  private rebuild(items: ProgressItem[], key: string): void {
    this.key = key;
    for (const b of this.blocks) b.root.destroy({ children: true });
    this.blocks = [];
    for (const sb of siteBlocks(items, this.area)) {
      const it = items.find((i) => i.id === sb.id)!;
      const root = new Container();
      const body = new Graphics();
      const fill = new Graphics();
      const flash = new Graphics().roundRect(sb.rect.x, sb.rect.y, sb.rect.w, sb.rect.h, 8).fill(0xffffff);
      flash.alpha = 0;
      const label = new Text({
        text: it.name,
        style: {
          fontFamily: FONT_BODY,
          fontSize: 22,
          fontWeight: '700',
          fill: 0xffffff,
          stroke: { color: C.ink, width: 4 },
          align: 'center',
          wordWrap: true,
          wordWrapWidth: sb.rect.w - 8,
        },
      });
      label.anchor.set(0.5);
      label.position.set(sb.rect.x + sb.rect.w / 2, sb.rect.y + sb.rect.h / 2);
      // Chữ dài hoặc khối thấp thì thu nhỏ chữ cho vừa.
      while ((label.height > sb.rect.h - 4 || label.width > sb.rect.w - 6) && Number(label.style.fontSize) > 12) {
        label.style.fontSize = Number(label.style.fontSize) - 1;
      }
      root.addChild(body, fill, flash, label);
      this.blocksLayer.addChild(root);
      const node: BlockNode = { id: sb.id, rect: sb.rect, root, body, fill, flash, label, status: it.status, flashAlpha: 0 };
      this.paint(node);
      this.blocks.push(node);
    }
  }

  private paint(b: BlockNode): void {
    const { x, y, w, h } = b.rect;
    const g = b.body.clear();
    if (b.status === 'done') {
      g.roundRect(x, y, w, h, 8).fill({ color: C.red, alpha: 0.95 }).stroke({ width: 3, color: C.gold });
    } else if (b.status === 'building') {
      g.roundRect(x, y, w, h, 8).fill({ color: C.stoneLight, alpha: 0.85 }).stroke({ width: 4, color: C.gold });
    } else {
      g.roundRect(x, y, w, h, 8).fill({ color: 0xffffff, alpha: 0.22 }).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    }
    b.fill.clear();
    b.label.alpha = b.status === 'todo' ? 0.75 : 1;
  }

  /** Chớp sáng khối: giai đoạn xong (nhẹ), hạng mục xong (mạnh). */
  flash(itemId: string, strength: number): void {
    const b = this.blocks.find((x) => x.id === itemId);
    if (b) b.flashAlpha = Math.max(b.flashAlpha, strength);
  }

  tick(dtSec: number): void {
    this.pulse += dtSec;
    if (Math.abs(this.targetPct - this.shownPct) > 0.05) {
      this.shownPct += (this.targetPct - this.shownPct) * Math.min(1, dtSec * 4);
    }
    for (const b of this.blocks) {
      if (b.flashAlpha > 0) b.flashAlpha = Math.max(0, b.flashAlpha - dtSec * 1.2);
      b.flash.alpha = b.flashAlpha;
      if (b.id !== this.building || b.status !== 'building') continue;
      const { x, y, w, h } = b.rect;
      const fh = (h * this.shownPct) / 100;
      b.fill.clear();
      if (fh > 0.5) b.fill.roundRect(x, y + h - fh, w, fh, 8).fill({ color: C.gold, alpha: 0.9 });
      b.root.alpha = 0.9 + 0.1 * Math.sin(this.pulse * 3);
    }
  }
}
