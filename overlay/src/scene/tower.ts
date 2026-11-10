// Tháp bằng ảnh thật (giai đoạn 3): tầng dưới dùng ảnh giai đoạn 5, tầng đang xây dùng ảnh giai đoạn hiện tại,
// xếp chồng theo eaveLineY / topY trong manifest (xem towerLayout.ts). Xong tháp thì đặt chóp.
// Nền móng (tầng 0) chưa có ảnh riêng: vẽ tạm bằng đạo cụ đá, gạch, gỗ trên bệ móng của ảnh nền (mục 7).
// Thiếu ảnh nào thì vẽ hình chữ nhật màu kèm tên file, không crash.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { C, FONT_BODY } from '../theme.js';
import { placeTower, towerArtFrom, type FloorArt, type PlacedPiece, type TowerArt, type TowerParams, type TowerPlacement } from '../towerLayout.js';

interface PieceNode {
  key: string;
  node: Container;
}

export class TowerView {
  readonly container = new Container();
  private readonly pieces = new Container();
  private readonly props = new Container();
  private readonly debugLayer = new Container();
  private readonly flash = new Graphics();
  private flashAlpha = 0;
  private art: Art | null = null;
  private towerArt: TowerArt = towerArtFrom(null);
  private nodes: PieceNode[] = [];
  private spireNode: PieceNode | null = null;
  private placement: TowerPlacement = { floors: [], spire: null };
  private lastParams: TowerParams | null = null;
  private propsKey = '';
  private debug = false;

  constructor() {
    this.container.addChild(this.props, this.pieces, this.flash, this.debugLayer);
    this.flash.alpha = 0;
    this.debugLayer.visible = false;
  }

  setArt(art: Art): void {
    this.art = art;
    this.towerArt = towerArtFrom(art.manifest);
    for (const n of this.nodes) n.node.destroy({ children: true });
    this.nodes = [];
    this.spireNode?.node.destroy({ children: true });
    this.spireNode = null;
    this.propsKey = '';
  }

  params(state: OverlayState): TowerParams {
    const m = this.art?.manifest;
    return {
      floor1WidthPx: state.layout.floor1WidthPx,
      towerTaper: state.layout.towerTaper,
      anchor: m?.background.towerAnchor ?? { x: state.layout.towerCenterX, y: state.layout.towerBaseY },
      spireScale: m?.tower.spireScale ?? 1,
    };
  }

  currentPlacement(): TowerPlacement {
    return this.placement;
  }

  /** Vẽ theo trạng thái overlay. `override` cho trang /tools/assets thử thông số mà chưa lưu. */
  update(state: OverlayState, override?: Partial<TowerParams>): void {
    const p = { ...this.params(state), ...override };
    this.lastParams = p;
    this.placement = placeTower(this.towerArt, p, state.tower);
    const floors = this.placement.floors;
    while (this.nodes.length > floors.length) this.nodes.pop()!.node.destroy({ children: true });
    floors.forEach((piece, i) => {
      let n = this.nodes[i];
      if (!n || n.key !== piece.key) {
        n?.node.destroy({ children: true });
        n = { key: piece.key, node: this.makePiece(piece.key, this.towerArt.stages[piece.stage - 1]!) };
        this.nodes[i] = n;
        this.pieces.addChildAt(n.node, i);
      }
      place(n.node, piece);
    });
    if (this.placement.spire) {
      if (!this.spireNode) {
        this.spireNode = { key: this.towerArt.spire.key, node: this.makePiece(this.towerArt.spire.key, this.towerArt.spire) };
        this.pieces.addChild(this.spireNode.node);
      }
      place(this.spireNode.node, this.placement.spire);
    } else if (this.spireNode) {
      this.spireNode.node.destroy({ children: true });
      this.spireNode = null;
    }
    this.drawProps(state, p);
    this.drawDebug(p);
  }

  /** Thay ảnh (eaveLineY, topY…) khi đang chỉnh trên trang /tools/assets. */
  setTowerArt(a: TowerArt): void {
    this.towerArt = a;
    // Điểm neo của ảnh đổi thì phải tạo lại các tầng.
    for (const n of this.nodes) n.node.destroy({ children: true });
    this.nodes = [];
    this.spireNode?.node.destroy({ children: true });
    this.spireNode = null;
  }

  setDebug(on: boolean): void {
    this.debug = on;
    if (this.lastParams) this.drawDebug(this.lastParams);
  }

  /** Chớp sáng nhẹ khi xong một giai đoạn hoặc một tầng. */
  flashFloor(floor: number, strength = 0.5): void {
    const piece = this.placement.floors.find((f) => f.floor === floor) ?? this.placement.floors.at(-1);
    const g = this.flash.clear();
    if (piece) {
      const w = this.towerArt.stages[4]!.eaveWidth * piece.scale * 1.1;
      g.roundRect(piece.x - w / 2, piece.topY, w, piece.bottomY - piece.topY, 30).fill({ color: 0xfff6d0 });
    } else if (this.lastParams) {
      const { anchor, floor1WidthPx } = this.lastParams;
      g.ellipse(anchor.x, anchor.y - 20, floor1WidthPx * 0.6, 70).fill({ color: 0xfff6d0 });
    }
    this.flashAlpha = strength;
    this.flash.alpha = strength;
  }

  tick(dtSec: number): void {
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dtSec * 1.4);
      this.flash.alpha = this.flashAlpha;
    }
  }

  private texture(key: string): Texture | null {
    return this.art?.textures.get(key) ?? null;
  }

  private makePiece(key: string, a: FloorArt): Container {
    const c = new Container();
    const tex = this.texture(key);
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(a.ax / a.w, a.eaveLineY / a.h);
      c.addChild(s);
    } else {
      c.addChild(missingBox(key, a.w, a.h, a.ax, a.eaveLineY));
    }
    return c;
  }

  /** Đạo cụ tạm cho 5 giai đoạn nền móng, đặt trên mặt bệ móng. Xong nền móng thì còn lại một bệ đá thấp. */
  private drawProps(state: OverlayState, p: TowerParams): void {
    const t = state.tower;
    const stage = t.floor === 0 && !t.completed ? t.stage : 6;
    const key = `${stage}|${p.anchor.x}|${p.anchor.y}|${p.floor1WidthPx}|${this.art?.version}`;
    if (key === this.propsKey) return;
    this.propsKey = key;
    this.props.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { x, y } = p.anchor;
    const w = p.floor1WidthPx;
    const g = new Graphics();
    this.props.addChild(g);
    const sprite = (tex: Texture | null, sx: number, sy: number, width: number) => {
      if (!tex) return;
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.scale.set(width / tex.width);
      s.position.set(sx, sy);
      this.props.addChild(s);
    };
    if (stage === 1) {
      // Dọn mặt bằng: đá vụn, cọc mốc, dây căng.
      for (let i = 0; i < 6; i++) g.ellipse(x - w * 0.35 + i * w * 0.14, y - 6 + (i % 2) * 4, 12 + (i % 3) * 4, 7).fill(C.stoneDark);
      for (const sx of [-1, 1]) g.rect(x + sx * w * 0.46 - 4, y - 40, 8, 40).fill(C.brown);
      g.moveTo(x - w * 0.46, y - 36).lineTo(x + w * 0.46, y - 36).stroke({ width: 2, color: C.cream });
      return;
    }
    if (stage <= 3) {
      // Đào móng: hố đất; đóng cọc: thêm cọc gỗ và bó gỗ chờ.
      g.ellipse(x, y - 4, w * 0.42, 26).fill(0x5b4229);
      g.ellipse(x, y - 8, w * 0.38, 18).fill(0x46321f);
      for (const sx of [-1, 1]) g.ellipse(x + sx * w * 0.5, y - 12, 46, 20).fill(0x8a6a3e);
      if (stage === 3) {
        for (let i = 0; i < 7; i++) {
          const px = x - w * 0.33 + (i * w * 0.66) / 6;
          g.rect(px - 7, y - 60, 14, 56).fill(C.brown);
          g.rect(px - 9, y - 62, 18, 6).fill(0x4a2f18);
        }
        sprite(this.texture('items/logs'), x + w * 0.62, y + 6, 120);
      }
      return;
    }
    if (stage === 4) {
      // Xây bệ đá: một nửa bệ đã xếp đá, đống gạch chờ.
      for (let i = 0; i < 6; i++) g.rect(x - w * 0.45 + i * 44, y - 26, 42, 24).fill(C.stone).stroke({ width: 2, color: C.stoneDark });
      for (let i = 0; i < 4; i++) g.rect(x - w * 0.45 + 22 + i * 44, y - 48, 42, 22).fill(C.stoneLight).stroke({ width: 2, color: C.stoneDark });
      sprite(this.texture('items/brick'), x + w * 0.3, y, 90);
      sprite(this.texture('items/brick'), x + w * 0.42, y, 80);
      return;
    }
    // Đã xong nền móng: bệ đá thấp dưới chân tháp.
    g.roundRect(x - w * 0.46, y - 4, w * 0.92, 18, 6).fill(C.stone).stroke({ width: 2, color: C.stoneDark });
    g.rect(x - w * 0.46 + 6, y - 4, w * 0.92 - 12, 4).fill(C.stoneLight);
  }

  /** Phím D: vạch eaveLineY (đỏ), topY (xanh), số tầng, điểm đặt tháp (vàng). */
  private drawDebug(p: TowerParams): void {
    this.debugLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.debugLayer.visible = this.debug;
    if (!this.debug) return;
    const g = new Graphics();
    this.debugLayer.addChild(g);
    const pieces: PlacedPiece[] = [...this.placement.floors, ...(this.placement.spire ? [this.placement.spire] : [])];
    for (const piece of pieces) {
      const w = this.towerArt.stages[4]!.eaveWidth * piece.scale * 0.6;
      g.moveTo(piece.x - w, piece.eaveY).lineTo(piece.x + w, piece.eaveY).stroke({ width: 3, color: 0xff3030 });
      g.moveTo(piece.x - w, piece.topY).lineTo(piece.x + w, piece.topY).stroke({ width: 3, color: 0x3c8cff });
      const label = new Text({
        text: String(piece.floor),
        style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
      });
      label.anchor.set(1, 0.5);
      label.position.set(piece.x - w - 10, (piece.eaveY + piece.topY) / 2);
      this.debugLayer.addChild(label);
    }
    g.circle(p.anchor.x, p.anchor.y, 8).fill(0xffe000);
  }
}

function place(node: Container, piece: PlacedPiece): void {
  node.position.set(piece.x, piece.eaveY);
  node.scale.set(piece.scale);
}

/** Hình chữ nhật màu tạm kèm tên file, khi thiếu ảnh. */
export function missingBox(key: string, w: number, h: number, ax: number, ay: number): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(-ax, -ay, w, h).fill({ color: 0xd64fd0, alpha: 0.55 }).stroke({ width: 4, color: 0xffffff }));
  const t = new Text({ text: `${key}.png`, style: { fontFamily: FONT_BODY, fontSize: 28, fontWeight: '700', fill: 0xffffff } });
  t.anchor.set(0.5);
  t.position.set(-ax + w / 2, -ay + h / 2);
  c.addChild(t);
  return c;
}
