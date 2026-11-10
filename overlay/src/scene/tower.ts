// Tháp vẽ tạm bằng hình khối (giai đoạn 2). Mỗi giai đoạn có hình riêng, phỏng theo ảnh tầng thật:
// 1 sàn và mái hiên → 2 dựng cột (giàn tre) → 3 xây tường → 4 lắp cửa → 5 hoàn thiện (đèn lồng).
// Nền móng (tầng 0): dọn mặt bằng → đào móng → đóng cọc → xây bệ đá → hoàn thiện bệ.
// Giai đoạn 3 thay bằng ảnh tower/floor_stage_*.png, căn theo eaveLineY.

import { Container, Graphics, Text } from 'pixi.js';
import type { OverlayState } from '../../../shared/protocol.js';
import { SPIRE_HEIGHT_RATIO, towerGeometry, type TowerGeometry } from '../layout.js';
import { C, FONT_BODY } from '../theme.js';

interface FloorNode {
  c: Container;
  g: Graphics;
  stage: number;
}

export class TowerView {
  readonly container = new Container();
  private floors: FloorNode[] = [];
  private geom: TowerGeometry | null = null;
  private geomKey = '';
  private spire: Graphics | null = null;
  private readonly flash = new Graphics();
  private flashAlpha = 0;

  constructor() {
    this.flash.alpha = 0;
  }

  geometry(): TowerGeometry | null {
    return this.geom;
  }

  update(state: OverlayState): void {
    const { tower, layout } = state;
    const key = JSON.stringify([layout.floor1WidthPx, layout.towerTaper, layout.towerCenterX, layout.towerBaseY, tower.totalFloors]);
    if (key !== this.geomKey) {
      this.geomKey = key;
      this.geom = towerGeometry(layout, tower.totalFloors);
      this.clear();
    }
    const geom = this.geom!;
    const lastVisible = tower.completed ? tower.totalFloors : tower.floor;

    while (this.floors.length > lastVisible + 1) this.floors.pop()!.c.destroy({ children: true });
    for (let f = 0; f <= lastVisible; f++) {
      const stage = f < tower.floor || tower.completed ? 5 : tower.stage;
      let node = this.floors[f];
      if (!node) {
        node = { c: new Container(), g: new Graphics(), stage: -1 };
        node.c.position.set(geom.centerX, geom.baseY[f]!);
        node.c.addChild(node.g);
        if (f > 0) {
          const label = this.makeLabel(f);
          label.position.set(-geom.widths[f]! / 2 - 18, -geom.heights[f]! / 2);
          node.c.addChild(label);
        }
        this.floors[f] = node;
        this.container.addChild(node.c);
      }
      if (node.stage !== stage) {
        node.stage = stage;
        node.g.clear();
        if (f === 0) drawFoundation(node.g, geom.widths[0]!, geom.heights[0]!, stage);
        else drawFloor(node.g, geom.widths[f]!, geom.heights[f]!, stage);
      }
    }

    if (tower.completed && !this.spire) {
      const top = geom.baseY[lastVisible]! - geom.heights[lastVisible]!;
      this.spire = drawSpire(geom.widths[lastVisible]!);
      this.spire.position.set(geom.centerX, top);
      this.container.addChild(this.spire);
    } else if (!tower.completed && this.spire) {
      this.spire.destroy();
      this.spire = null;
    }
    this.container.addChild(this.flash); // luôn nằm trên cùng
  }

  /** Chớp sáng nhẹ khi xong một giai đoạn hoặc một tầng. */
  flashFloor(floor: number, strength = 0.55): void {
    const geom = this.geom;
    if (!geom || floor >= geom.baseY.length) return;
    const w = geom.widths[floor]! * 1.15;
    const h = geom.heights[floor]! * 1.1;
    this.flash
      .clear()
      .roundRect(geom.centerX - w / 2, geom.baseY[floor]! - h, w, h, 24)
      .fill({ color: 0xfff6d0 });
    this.flashAlpha = strength;
    this.flash.alpha = strength;
  }

  tick(dtSec: number): void {
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dtSec * 1.4);
      this.flash.alpha = this.flashAlpha;
    }
  }

  private clear(): void {
    for (const n of this.floors) n.c.destroy({ children: true });
    this.floors = [];
    this.spire?.destroy();
    this.spire = null;
  }

  /** Số tầng nhỏ bên trái (để soi thứ tự tầng khi thử). */
  private makeLabel(floor: number): Container {
    const c = new Container();
    const t = new Text({ text: String(floor), style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: 0xffffff } });
    t.anchor.set(0.5);
    const r = Math.max(18, t.width / 2 + 8);
    c.addChild(new Graphics().circle(0, 0, r).fill({ color: C.ink, alpha: 0.55 }), t);
    c.pivot.set(r, 0);
    return c;
  }
}

/** Vẽ một tầng, gốc toạ độ ở giữa mép dưới, trục y hướng lên là số âm. */
export function drawFloor(g: Graphics, w: number, h: number, stage: number): void {
  const eaveH = h * 0.17;
  const slabH = h * 0.05;
  const beamH = h * 0.08;
  const bodyBottom = -eaveH - slabH;
  const bodyTop = -h + beamH;
  const bodyH = bodyBottom - bodyTop;
  const colX = w * 0.36;
  const colW = w * 0.075;

  // Giàn tre phía sau (giai đoạn 2–4); giai đoạn 4 chỉ còn bên phải.
  if (stage >= 2 && stage <= 4) {
    const sides = stage === 4 ? [1] : [-1, 1];
    for (const s of sides) {
      const x = s * w * 0.47;
      g.moveTo(x, -eaveH * 0.4).lineTo(x, -h * 1.04).stroke({ width: 5, color: C.bamboo });
      g.moveTo(x - s * w * 0.06, -eaveH * 0.4).lineTo(x - s * w * 0.06, -h * 0.98).stroke({ width: 4, color: C.bamboo });
      for (let i = 1; i <= 3; i++) {
        const y = bodyBottom - (bodyH * i) / 3.4;
        g.moveTo(x - s * w * 0.1, y).lineTo(x + s * w * 0.03, y).stroke({ width: 4, color: C.bamboo });
      }
    }
  }

  // Tường (giai đoạn 3: xây dở 55%, từ 4: kín).
  if (stage >= 3) {
    const wallH = stage === 3 ? bodyH * 0.55 : bodyH;
    g.rect(-colX, bodyBottom - wallH, colX * 2, wallH).fill(stage === 3 ? C.brick : C.wall);
    for (let y = bodyBottom - 14; y > bodyBottom - wallH; y -= 14) {
      g.moveTo(-colX, y).lineTo(colX, y).stroke({ width: 1, color: 0xc89a6c, alpha: 0.45 });
    }
  }
  // Cửa sổ vòm có song (giai đoạn 4–5).
  if (stage >= 4) {
    const ww = w * 0.2;
    const wh = bodyH * 0.5;
    const wy = bodyTop + bodyH * 0.22;
    g.roundRect(-ww / 2 - 6, wy - 6, ww + 12, wh + 12, ww / 2).fill(C.column);
    g.roundRect(-ww / 2, wy, ww, wh, ww / 2 - 4).fill(C.windowDark);
    for (let i = 1; i < 4; i++) {
      const x = -ww / 2 + (ww * i) / 4;
      g.moveTo(x, wy + ww * 0.3).lineTo(x, wy + wh).stroke({ width: 3, color: C.column });
    }
    g.moveTo(-ww / 2, wy + wh * 0.55).lineTo(ww / 2, wy + wh * 0.55).stroke({ width: 3, color: C.column });
    g.rect(-ww / 2 - 12, wy + wh + 4, ww + 24, 8).fill(C.stoneDark);
  }
  // Cột và dầm đỉnh (từ giai đoạn 2).
  if (stage >= 2) {
    for (const s of [-1, 1]) {
      g.rect(s * colX - colW / 2, bodyTop, colW, bodyH).fill(C.column);
      g.rect(s * colX - colW / 2 + colW * 0.15, bodyTop, colW * 0.2, bodyH).fill({ color: 0xffffff, alpha: 0.15 });
      g.rect(s * colX - colW * 0.8, bodyBottom - 18, colW * 1.6, 18).fill(C.stone);
      g.rect(s * colX - colW * 0.7, bodyTop, colW * 1.4, 14).fill(C.tile);
    }
    g.rect(-w * 0.45, -h, w * 0.9, beamH).fill(C.column);
    g.rect(-w * 0.45, -h + beamH - 6, w * 0.9, 6).fill(C.tileDark);
  }

  // Sàn đá và mái hiên ngói (mọi giai đoạn).
  g.rect(-w * 0.44, bodyBottom, w * 0.88, slabH).fill(C.stoneLight);
  const tileTop = -eaveH;
  const tileBottom = -eaveH * 0.38;
  g.poly([-w * 0.5, tileTop, w * 0.5, tileTop, w * 0.46, tileBottom, -w * 0.46, tileBottom]).fill(C.tile);
  for (let x = -w * 0.46; x < w * 0.46; x += w * 0.04) {
    g.moveTo(x, tileTop + 3).lineTo(x + w * 0.004, tileBottom - 2).stroke({ width: 2, color: C.tileDark, alpha: 0.7 });
  }
  for (const s of [-1, 1]) {
    g.circle(s * w * 0.5, tileTop - 4, w * 0.022).fill(C.tile); // đầu đao cong lên
  }
  g.rect(-w * 0.4, tileBottom, w * 0.8, -tileBottom).fill(C.redDark);
  for (const s of [-1, 1]) g.rect(s * w * 0.3 - 10, tileBottom, 20, -tileBottom).fill(C.gold);

  // Đống gạch đá chờ xây (giai đoạn 1).
  if (stage === 1) {
    for (let i = 0; i < 3; i++) g.rect(-w * 0.3 + i * 22, bodyBottom - 16, 20, 14).fill(C.column);
    for (let i = 0; i < 2; i++) g.rect(-w * 0.27 + i * 22, bodyBottom - 30, 20, 14).fill(C.column);
    for (let i = 0; i < 3; i++) g.rect(w * 0.1 + i * 24, bodyBottom - 18, 22, 16).fill(C.stone);
    g.rect(w * 0.13, bodyBottom - 34, 22, 16).fill(C.stone);
  }

  // Đèn lồng thòng xuống dưới mái hiên (giai đoạn 5).
  if (stage >= 5) {
    for (const s of [-1, 1]) {
      const x = s * w * 0.43;
      g.moveTo(x, tileBottom).lineTo(x, h * 0.03).stroke({ width: 2, color: C.ink });
      g.ellipse(x, h * 0.075, w * 0.032, w * 0.04).fill(C.lantern);
      g.rect(x - w * 0.02, h * 0.075 - w * 0.045, w * 0.04, 5).fill(C.gold);
      g.rect(x - 2, h * 0.075 + w * 0.04, 4, h * 0.04).fill(C.lantern);
    }
  }
}

export function drawFoundation(g: Graphics, w: number, h: number, stage: number): void {
  if (stage === 1) {
    // Dọn mặt bằng: cọc mốc và dây căng.
    g.rect(-w / 2, -6, w, 12).fill({ color: C.groundDark, alpha: 0.8 });
    for (const s of [-1, 1]) {
      g.rect(s * w * 0.5 - 4, -30, 8, 36).fill(C.brown);
    }
    g.moveTo(-w / 2, -26).lineTo(w / 2, -26).stroke({ width: 2, color: C.cream });
    for (let i = 0; i < 5; i++) g.circle(-w * 0.3 + i * w * 0.15, -4, 8 + (i % 2) * 4).fill(C.stoneDark);
    return;
  }
  // Hố móng (giai đoạn 2–3).
  if (stage <= 3) {
    g.rect(-w * 0.46, -4, w * 0.92, h * 0.35).fill(0x6b5233);
    g.rect(-w * 0.46, -4, w * 0.92, 8).fill(C.groundDark);
    for (const s of [-1, 1]) g.poly([s * w * 0.5, -4, s * w * 0.62, -4, s * w * 0.58, -24, s * w * 0.5, -18]).fill(0x8a6a3e);
    if (stage === 3) {
      for (let i = 0; i < 7; i++) {
        const x = -w * 0.38 + (i * w * 0.76) / 6;
        g.rect(x - 7, -h * 0.35, 14, h * 0.6).fill(C.brown);
        g.rect(x - 9, -h * 0.35, 18, 6).fill(0x4a2f18);
      }
    }
    return;
  }
  // Bệ đá (giai đoạn 4: xây dở, 5: hoàn thiện có bậc thang).
  const blockH = stage === 4 ? h * 0.6 : h;
  g.rect(-w / 2, -blockH, w, blockH).fill(C.stone);
  for (let y = -26; y > -blockH; y -= 26) g.moveTo(-w / 2, y).lineTo(w / 2, y).stroke({ width: 2, color: C.stoneDark, alpha: 0.6 });
  for (let row = 0; row * 26 < blockH; row++) {
    for (let x = -w / 2 + (row % 2) * 30; x < w / 2; x += 60) {
      g.moveTo(x, -row * 26).lineTo(x, -row * 26 - 26).stroke({ width: 1.5, color: C.stoneDark, alpha: 0.4 });
    }
  }
  if (stage === 4) {
    for (let i = 0; i < 4; i++) g.rect(w * 0.1 + i * 46, -blockH - 22, 42, 22).fill(C.stoneLight);
    return;
  }
  g.rect(-w / 2 - 10, -h - 10, w + 20, 14).fill(C.stoneLight);
  for (let i = 0; i < 9; i++) g.rect(-w / 2 + (i * (w - 16)) / 8, -h - 34, 16, 26).fill(C.stoneLight);
  for (let i = 0; i < 4; i++) {
    const sw = w * 0.26 - i * 10;
    g.rect(-sw / 2, -h * 0.25 * (i + 1) + h * 0.25, sw, h * 0.25).fill(i % 2 ? C.stoneLight : C.stone);
  }
}

export function drawSpire(baseWidth: number): Graphics {
  const g = new Graphics();
  const h = baseWidth * SPIRE_HEIGHT_RATIO;
  const w = baseWidth;
  g.poly([-w * 0.55, 0, w * 0.55, 0, w * 0.12, -h * 0.35, -w * 0.12, -h * 0.35]).fill(C.tile);
  g.rect(-w * 0.14, -h * 0.4, w * 0.28, h * 0.06).fill(C.stoneLight);
  for (let i = 0; i < 3; i++) {
    const tw = w * (0.24 - i * 0.06);
    const y = -h * (0.4 + i * 0.15);
    g.poly([-tw / 2, y, tw / 2, y, tw * 0.3, y - h * 0.13, -tw * 0.3, y - h * 0.13]).fill(C.gold);
  }
  g.circle(0, -h * 0.9, w * 0.05).fill(C.goldLight);
  g.poly([-w * 0.02, -h * 0.92, w * 0.02, -h * 0.92, 0, -h]).fill(C.gold);
  return g;
}
