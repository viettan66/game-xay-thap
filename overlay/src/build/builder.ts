// Xây từng mảnh trên bản đồ (mục 7 SPEC, giai đoạn R3b).
// - Builder: nhận từng lần có công (tin "contribution"), đổi công ra mảnh (công lẻ cộng dồn theo tiến độ giai đoạn),
//   xếp hàng đợi, cho mảnh bay với tốc độ tối đa maxPerSec (hàng đợi dài thì bay theo cụm 4–9 mảnh; giai đoạn bị vượt
//   qua thì cụm lớn để mỗi giai đoạn khoảng 1 giây). Tim, bình luận chưa đủ một mảnh: vật liệu bay ra đống.
//   Lệch với trạng thái server (mở lại overlay, mất tin) thì dựng lại ngay đúng tiến độ, không cần lưu từng mảnh.
// - BuildSite: công trường của hạng mục đang xây. Mảnh đã đặt vẽ dồn vào một render texture; chỉ mảnh đang bay là sprite
//   riêng. Kèm giàn giáo tre (vẽ bằng code), đống vật liệu (props), hiệu ứng mặt đất (cọc, đất đào, đống vật liệu).
// Chữ người xem đọc (nhãn piece_burst, tên vật liệu) lấy từ server (config, kho thoại). Thiếu ảnh thì vẽ hình tạm.

import { Container, Graphics, Rectangle, RenderTexture, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import { floorBand, buildingOf, type MapBuilding, type MapManifest } from '../../../shared/map.js';
import { nearestOnPaths, type MapPath } from '../../../shared/paths.js';
import { assetUrl } from '../../../shared/manifest.js';
import { PART_KEYS } from '../../../shared/parts.js';
import type { PiecesConfig, ProgressItem, ProgressView, ServerMessage } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { FONT_BODY } from '../theme.js';
import { clusterSize, footprint, hashSeed, pieceRange, planStages, rng, scaffold, type Piece, type PropKind, type Rect, type StagePlan } from './pieces.js';

type Contribution = Extract<ServerMessage, { type: 'contribution' }>;

const FLIGHT_SEC = 0.55;
const BOUNCE_SEC = 0.14;

// ---------- Đọc ảnh ----------

async function pixels(url: string): Promise<ImageData> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0);
  bmp.close();
  return x.getImageData(0, 0, c.width, c.height);
}

/** Khung đang xây của một hạng mục: cả công trình, hoặc một dải tầng của bảo tháp. */
export interface Target {
  itemId: string;
  building: MapBuilding;
  /** Vị trí trên bản đồ. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hàng đầu tiên của khung trong ảnh công trình. */
  row0: number;
}

export function targetOf(map: MapManifest, itemId: string): Target | null {
  const found = buildingOf(map, itemId);
  if (!found) return null;
  const { building: b, band } = found;
  if (band === null) return { itemId, building: b, x: b.x, y: b.y, w: b.w, h: b.h, row0: 0 };
  const { top, bottom } = floorBand(b, band);
  const row0 = Math.max(0, Math.round(top - b.y));
  const h = Math.max(1, Math.min(b.h - row0, Math.round(bottom - top)));
  return { itemId, building: b, x: b.x, y: b.y + row0, w: b.w, h, row0 };
}

/** Nhãn vùng của khung: đọc mặt nạ từng vùng (dời theo vị trí lưu), chưa có vùng thì coi cả hình là nền. */
async function loadLabels(t: Target, finalPx: ImageData, version: string): Promise<Uint8Array> {
  const b = t.building;
  const full = new Uint8Array(b.w * b.h);
  const parts = b.parts;
  if (parts && parts.keys.length) {
    const dx = parts.x - b.x;
    const dy = parts.y - b.y;
    await Promise.all(
      parts.keys.map(async (key) => {
        const m = await pixels(`${assetUrl(`buildings/${b.id}/parts/${key}.png`)}?v=${version}`);
        const idx = PART_KEYS.indexOf(key) + 1;
        for (let y = 0; y < m.height; y++) {
          const ty = y + dy;
          if (ty < 0 || ty >= b.h) continue;
          for (let x = 0; x < m.width; x++) {
            const tx = x + dx;
            if (tx >= 0 && tx < b.w && m.data[(y * m.width + x) * 4]! > 127) full[ty * b.w + tx] = idx;
          }
        }
      }),
    );
  }
  // Điểm có hình mà chưa có vùng (thiếu mặt nạ): cho vào nền, để xong hạng mục vẫn đủ hình.
  for (let i = 0; i < full.length; i++) if (!full[i] && finalPx.data[i * 4 + 3]! > 16) full[i] = 1;
  return full.slice(t.row0 * b.w, (t.row0 + t.h) * b.w);
}

// ---------- Công trường của một hạng mục ----------

interface Flight {
  sprite: Sprite;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  t: number;
  dur: number;
  land: () => void;
}

interface Bounce {
  sprite: Sprite;
  t: number;
  done: () => void;
}

interface Dust {
  g: Graphics;
  t: number;
}

export interface SiteDeps {
  renderer: Renderer;
  art: Art;
  version: string;
  /** Lớp hiệu ứng (mảnh bay, bụi, nhãn) trên cùng của thế giới. */
  fx: Container;
  pieces: () => PiecesConfig;
  worldScale: () => number;
  /** Tay một dân phu đứng gần (tọa độ bản đồ) để mảnh bay từ đó; null = bay từ đống vật liệu (mục 7.5). */
  source?: () => { x: number; y: number } | null;
  /** Cờ bay ở công trường (mục 9B: công trường tự chạy). */
  flags?: () => boolean;
}

/** Màu cờ đuôi nheo (cờ ngũ sắc kiểu hội làng): đỏ, vàng, xanh lá, xanh dương, trắng. */
const FLAG_COLORS = [0xc8372d, 0xf0b52b, 0x3f8f4a, 0x2f6fb0, 0xf3eee2];

/** Lá cờ đuôi nheo tung bay trên đỉnh một cột (x, y = đỉnh cột), dài `len`, bay về bên phải. */
function drawPennant(g: Graphics, x: number, y: number, len: number, t: number, color: number): void {
  const h = len * 0.42;
  const w1 = Math.sin(t * 6 + x * 0.05) * len * 0.07;
  const w2 = Math.sin(t * 6 + x * 0.05 + 1.3) * len * 0.14;
  g.poly([x, y, x + len * 0.5, y + h * 0.22 + w1, x + len, y + h * 0.5 + w2, x + len * 0.5, y + h * 0.78 + w1, x, y + h]).fill(color);
  g.poly([x, y, x + len * 0.5, y + h * 0.22 + w1, x + len, y + h * 0.5 + w2, x + len * 0.5, y + h * 0.78 + w1, x, y + h]).stroke({ width: 1, color: 0x5a2a12, alpha: 0.5 });
}

/** Hình học công trường cho nhân vật (tọa độ bản đồ): chỗ đứng, giàn giáo, đống vật liệu (mục 9). */
export interface SiteGeometry {
  itemId: string;
  rect: Rect;
  baseY: number;
  flat: boolean;
  floor: { x: number; y: number }[];
  ledgers: [number, number, number][];
  pile: { x: number; y: number };
  /** Vật liệu của giai đoạn đang hiện. */
  prop: PropKind;
}

export class BuildSite {
  readonly container = new Container();
  private readonly groundLayer = new Container();
  private readonly rtSprite: Sprite;
  private readonly flashSprite: Sprite;
  private readonly bounceLayer = new Container();
  private readonly scaffoldG = new Graphics();
  private readonly flagG = new Graphics();
  private flagT = 0;
  /** Cột giàn giáo đang vẽ [x, đỉnh, chân] (tọa độ trong khung), để cắm cờ ở hai đầu. */
  private poles: [number, number, number][] = [];
  private readonly pileLayer = new Container();
  private readonly batch = new Container();
  private readonly rt: RenderTexture;
  private readonly partTex = new Map<string, Texture>();
  private groundG: Graphics[] = [];
  private readonly flights: Flight[] = [];
  private readonly bounces: Bounce[] = [];
  private readonly dusts: Dust[] = [];
  private readonly fp: Rect;
  private readonly bodyBox: Rect | null;
  private builtTop = Infinity;
  private flashAlpha = 0;
  private pileSprite: Sprite | null = null;
  private pileKey = '';
  private placedGround = new Map<number, number>();
  /** Thanh ngang giàn giáo đang vẽ (tọa độ trong khung). */
  private ledgers: [number, number, number][] = [];
  /** Công trình phẳng: điểm đứng rải trên phần đất của hạng mục (tọa độ trong khung). */
  private floorPts: { x: number; y: number }[] = [];
  private pileBump = 0;
  private flatPile: { x: number; y: number } | null = null;
  private lastBump = 0;
  /** Giai đoạn và số mảnh đang hiện (đã đặt xong, không tính mảnh đang bay). */
  shownStage = 0;
  stock = 0;

  private constructor(
    readonly target: Target,
    readonly plans: StagePlan[],
    private readonly deps: SiteDeps,
    finalPx: ImageData,
    labels: Uint8Array,
    paths: MapPath[] = [],
  ) {
    const { w, h } = target;
    this.rt = RenderTexture.create({ width: w, height: h });
    this.rtSprite = new Sprite(this.rt);
    this.flashSprite = new Sprite(this.rt);
    this.flashSprite.blendMode = 'add';
    this.flashSprite.alpha = 0;
    this.container.position.set(target.x, target.y);
    this.container.addChild(this.groundLayer, this.rtSprite, this.flashSprite, this.bounceLayer, this.scaffoldG, this.pileLayer, this.flagG);
    // Ảnh từng vùng theo cách hiện (màu thật / gỗ thô): mảnh lấy phần ảnh của đúng vùng đó.
    const looks = new Set(plans.flatMap((p) => p.pieces.map((q) => `${q.part}:${q.look}`)));
    for (const key of looks) {
      const [part, look] = key.split(':') as [string, string];
      const idx = PART_KEYS.indexOf(part as never) + 1;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d')!;
      const img = x.createImageData(w, h);
      const off = target.row0 * target.building.w * 4;
      for (let i = 0; i < w * h; i++) {
        if (labels[i] !== idx) continue;
        const s = off + i * 4;
        let r = finalPx.data[s]!;
        let g = finalPx.data[s + 1]!;
        let b = finalPx.data[s + 2]!;
        if (look === 'wood') {
          // Gỗ thô: giữ sáng tối của hình, đổi sang màu gỗ mộc.
          const l = 0.3 * r + 0.59 * g + 0.11 * b;
          r = Math.min(255, 92 + 0.55 * l);
          g = Math.min(255, 58 + 0.38 * l);
          b = Math.min(255, 32 + 0.22 * l);
        }
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = finalPx.data[s + 3]!;
      }
      x.putImageData(img, 0, 0);
      this.partTex.set(key, Texture.from(c));
    }
    this.fp = footprint(labels, w, h, target.building.layer === 'ground');
    const body = plans.flatMap((p) => p.pieces).filter((p) => p.part !== 'nen');
    this.bodyBox =
      target.building.layer === 'ground' || body.length === 0
        ? null
        : (() => {
            const x0 = Math.min(...body.map((p) => p.x));
            const y0 = Math.min(...body.map((p) => p.y));
            const x1 = Math.max(...body.map((p) => p.x + p.w));
            // Giàn giáo dựng từ mặt đất (đáy vùng đất dưới chân) lên tới đỉnh thân công trình.
            const y1 = Math.max(...body.map((p) => p.y + p.h), this.fp.y + this.fp.h);
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          })();
    this.groundG = plans.map(() => {
      const g = new Graphics();
      this.groundLayer.addChild(g);
      return g;
    });
    if (target.building.layer === 'ground') {
      this.floorPts = floorPoints(labels, w, h, target.itemId);
      // Công trình phẳng rộng (san nền, sân, hồ): đống vật liệu đặt cạnh lối đi gần chân hạng mục, không nằm sát mép bản đồ.
      const q = nearestOnPaths(paths, { x: target.x + this.fp.x + this.fp.w / 2, y: target.y + this.fp.y + this.fp.h - Math.min(140, this.fp.h * 0.1) });
      if (q) this.flatPile = { x: Math.round(q.x - 46 - target.x), y: Math.round(q.y + 6 - target.y) };
    }
  }

  /** Hình học công trường (tọa độ bản đồ) cho nhân vật. */
  geometry(stage: number): SiteGeometry {
    const t = this.target;
    const b = t.building;
    const flat = b.layer === 'ground';
    const pile = this.pilePos();
    // Bảo tháp: người dưới đất đứng ở chân tháp; công trình khác: chân của khung đang xây.
    const baseY = b.items.length > 1 ? b.baseY : t.y + this.fp.y + this.fp.h;
    return {
      itemId: t.itemId,
      rect: { x: t.x + this.fp.x, y: t.y, w: this.fp.w, h: t.h },
      baseY: Math.round(Math.min(baseY, b.baseY + 4)),
      flat,
      floor: this.floorPts.map((p) => ({ x: t.x + p.x, y: t.y + p.y })),
      ledgers: this.ledgers.map(([x0, x1, y]) => [t.x + x0, t.x + x1, t.y + y] as [number, number, number]),
      pile: { x: t.x + pile.x, y: t.y + pile.y },
      prop: this.plans[Math.min(stage, this.plans.length - 1)]?.prop ?? 'gach',
    };
  }

  /** Cờ đuôi nheo tung bay (mục 9B): một cột cờ cạnh đống vật liệu, cờ nhỏ trên hai cột ngoài cùng của giàn giáo. */
  private drawFlags(dt: number): void {
    const g = this.flagG.clear();
    if (!(this.deps.flags?.() ?? true)) return;
    this.flagT += dt;
    const t = this.flagT;
    const pile = this.pilePos();
    const px = pile.x - 30;
    const top = pile.y - 92;
    g.moveTo(px, pile.y).lineTo(px, top).stroke({ width: 2.5, color: 0x6b4426 });
    g.circle(px, top - 2, 2.5).fill(0xe2ae45);
    drawPennant(g, px + 1, top + 2, 30, t, FLAG_COLORS[0]!);
    drawPennant(g, px + 1, top + 18, 22, t + 0.7, FLAG_COLORS[1]!);
    if (this.poles.length >= 2) {
      const ends = [this.poles[0]!, this.poles[this.poles.length - 1]!];
      ends.forEach(([x, y0], i) => {
        g.moveTo(x, y0).lineTo(x, y0 - 16).stroke({ width: 2, color: 0xc8a050 });
        drawPennant(g, x, y0 - 16, 20, t + i * 1.9, FLAG_COLORS[2 + (i % 3)]!);
      });
    }
  }

  /** Dân phu đặt vật liệu xuống đống: đống nảy lên, bụi nhỏ. */
  bumpPile(): void {
    this.pileBump = 1;
    const p = this.pilePos();
    this.dust(this.target.x + p.x, this.target.y + p.y - 4);
  }

  static async create(map: MapManifest, itemId: string, item: ProgressItem, deps: SiteDeps): Promise<BuildSite | null> {
    const t = targetOf(map, itemId);
    if (!t) return null;
    const finalPx = await pixels(`${assetUrl(t.building.file)}?v=${deps.version}`);
    const labels = await loadLabels(t, finalPx, deps.version);
    const plans = planStages({
      labels,
      w: t.w,
      h: t.h,
      builds: item.stages.map((s) => s.build),
      sizes: deps.pieces().size,
      seed: itemId,
      flat: t.building.layer === 'ground',
    });
    return new BuildSite(t, plans, deps, finalPx, labels, map.paths ?? []);
  }

  count(stage: number): number {
    return this.plans[stage]?.count ?? 0;
  }

  // ---- Vẽ mảnh ----

  private pieceSprite(p: Piece): Sprite {
    const base = this.partTex.get(`${p.part}:${p.look}`)!;
    const s = new Sprite(new Texture({ source: base.source, frame: new Rectangle(p.x, p.y, p.w, p.h) }));
    s.position.set(p.x, p.y);
    return s;
  }

  private commitPieces(list: Piece[]): void {
    for (const p of list) {
      if (!this.partTex.has(`${p.part}:${p.look}`)) continue;
      this.batch.addChild(this.pieceSprite(p));
      if (p.part !== 'nen') this.builtTop = Math.min(this.builtTop, p.y);
    }
    if (!this.batch.children.length) return;
    this.deps.renderer.render({ container: this.batch, target: this.rt, clear: false });
    for (const c of this.batch.removeChildren()) {
      (c as Sprite).texture.destroy(false);
      c.destroy();
    }
  }

  private drawGround(stage: number, upTo: number): void {
    const plan = this.plans[stage]!;
    const g = this.groundG[stage]!;
    g.clear();
    this.placedGround.set(stage, upTo);
    const list = plan.ground.slice(0, upTo);
    if (plan.material === 'coc') {
      // Cọc gỗ và dây căng nối các cọc.
      for (let k = 1; k < list.length; k++) g.moveTo(list[k - 1]!.x, list[k - 1]!.y - 9).lineTo(list[k]!.x, list[k]!.y - 9);
      if (list.length > 1) g.stroke({ width: 1.5, color: 0xf5e6c8, alpha: 0.9 });
      for (const s of list) g.rect(s.x - 1.5, s.y - 14, 3, 14).fill(0x7a4a22);
    } else if (plan.material === 'dao') {
      for (const s of list) g.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w * 0.55, s.h * 0.6).fill({ color: 0x5a3a1e, alpha: 0.5 });
      // Đống đất đào lên cao dần bên cạnh.
      const f = list.length / Math.max(1, plan.count);
      if (f > 0) {
        const cx = this.fp.x + this.fp.w + 22;
        const cy = this.fp.y + this.fp.h;
        g.ellipse(cx, cy - 6 * f, 16 + 22 * f, 6 + 14 * f).fill(0x8a5a2e);
      }
    }
    // dong: thể hiện bằng đống vật liệu to dần (updatePile).
  }

  /** Dựng lại ngay đúng tiến độ: các giai đoạn trước đủ mảnh, giai đoạn hiện tại `placed` mảnh. */
  drawState(stage: number, placed: number): void {
    this.deps.renderer.render({ container: new Container(), target: this.rt, clear: true });
    this.builtTop = Infinity;
    for (let s = 0; s < this.plans.length && s <= stage; s++) {
      const n = s < stage ? this.plans[s]!.count : placed;
      const plan = this.plans[s]!;
      if (plan.kind === 'pieces') this.commitPieces(plan.pieces.slice(0, n));
      else this.drawGround(s, n);
    }
    this.shownStage = stage;
    this.refreshVisibility(stage, placed);
  }

  private refreshVisibility(stage: number, placed: number): void {
    // Hiệu ứng mặt đất còn hiện tới hết giai đoạn kế tiếp, rồi dọn đi.
    this.groundG.forEach((g, s) => (g.visible = s <= stage && stage <= s + 1));
    this.updateScaffold(stage, placed);
    this.updatePile(stage);
  }

  private updateScaffold(stage: number, placed: number): void {
    const g = this.scaffoldG.clear();
    this.ledgers = [];
    this.poles = [];
    if (!this.bodyBox || this.builtTop === Infinity) return;
    const last = this.plans.length - 1;
    const removeFrac = stage >= last ? placed / Math.max(1, this.count(last)) : 0;
    const s = scaffold(this.bodyBox, this.builtTop, removeFrac);
    this.ledgers = s.ledgers;
    this.poles = s.poles;
    for (const [x0, x1, y] of s.ledgers) g.moveTo(x0, y).lineTo(x1, y);
    for (const [x, top, bottom] of s.poles) g.moveTo(x, top).lineTo(x, bottom);
    g.stroke({ width: 2.5, color: 0xc8a050, alpha: 0.85 });
  }

  /** Đống vật liệu của giai đoạn đang xây, to nhỏ theo lượng vật liệu đang chờ đặt. */
  updatePile(stage: number): void {
    const plan = this.plans[Math.min(stage, this.plans.length - 1)];
    if (!plan) return;
    const prop = plan.prop;
    const extra = plan.material === 'dong' ? (this.placedGround.get(stage) ?? 0) : 0;
    const amount = this.stock + extra;
    const level = amount >= 30 ? 'lon' : amount >= 8 ? 'vua' : 'nho';
    const key = `${prop}:${level}`;
    if (key === this.pileKey) return;
    this.pileKey = key;
    this.pileSprite?.destroy();
    this.lastBump = 0;
    this.pileBump = 0;
    const tex = propTexture(this.deps.art, prop, level);
    const width = Math.max(40, Math.min(110, this.target.w * 0.18)) * (level === 'lon' ? 1.25 : level === 'vua' ? 1 : 0.8);
    const s = tex ? new Sprite(tex) : new Sprite(Texture.WHITE);
    if (!tex) s.tint = 0xb06a3c;
    s.anchor.set(0.5, 1);
    s.scale.set(width / (tex?.width ?? 1), (tex ? width / tex.width : width * 0.5));
    s.position.set(this.pilePos().x, this.pilePos().y);
    this.pileLayer.addChild(s);
    this.pileSprite = s;
  }

  /** Chỗ đặt đống vật liệu: bên trái chân công trình; công trình phẳng: cạnh lối đi gần chân hạng mục (tọa độ trong khung). */
  pilePos(): { x: number; y: number } {
    if (this.flatPile) return this.flatPile;
    return { x: Math.max(10, this.fp.x - 28), y: Math.min(this.target.h + 30, this.fp.y + this.fp.h + 8) };
  }

  // ---- Mảnh bay ----

  /** Cho mảnh [from, to) của giai đoạn bay vào; onLand gọi khi đã khớp vào chỗ. */
  fly(stage: number, from: number, to: number, onLand: () => void): Rect | null {
    const plan = this.plans[stage]!;
    const pile = this.pilePos();
    const hand = this.deps.source?.() ?? null;
    const sx = hand ? hand.x : this.target.x + pile.x;
    const sy = hand ? hand.y : this.target.y + pile.y - 20;
    if (plan.kind === 'ground') {
      const g = plan.ground[Math.min(to, plan.ground.length) - 1];
      const ex = this.target.x + (g ? g.x + g.w / 2 : pile.x);
      const ey = this.target.y + (g ? g.y : pile.y);
      this.launch(plan.prop, sx, sy, ex, ey, 12, () => {
        this.drawGround(stage, to);
        this.dust(ex, ey);
        onLand();
      });
      return g ? { x: g.x, y: g.y - 14, w: Math.max(8, g.w), h: Math.max(14, g.h) } : null;
    }
    const list = plan.pieces.slice(from, to);
    if (!list.length) {
      onLand();
      return null;
    }
    const x0 = Math.min(...list.map((p) => p.x));
    const y0 = Math.min(...list.map((p) => p.y));
    const x1 = Math.max(...list.map((p) => p.x + p.w));
    const y1 = Math.max(...list.map((p) => p.y + p.h));
    const ex = this.target.x + (x0 + x1) / 2;
    const ey = this.target.y + (y0 + y1) / 2;
    const size = Math.max(10, Math.min(30, Math.max(list[0]!.w, list[0]!.h) * 1.4));
    this.launch(plan.prop, sx, sy, ex, ey, size, () => {
      // Khớp vào chỗ, nảy nhẹ, bụi nhỏ; xong thì vẽ dồn vào render texture.
      for (const p of list) {
        if (!this.partTex.has(`${p.part}:${p.look}`)) continue;
        const s = this.pieceSprite(p);
        s.anchor.set(0.5);
        s.position.set(p.x + p.w / 2, p.y + p.h / 2);
        s.scale.set(1.25);
        this.bounceLayer.addChild(s);
        this.bounces.push({
          sprite: s,
          t: 0,
          done: () => {
            this.commitPieces([p]);
          },
        });
      }
      this.dust(ex, this.target.y + y1);
      onLand();
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Vật liệu bay ra đống (tim, bình luận chưa đủ một mảnh). */
  carry(prop: PropKind): void {
    const pile = this.pilePos();
    const ex = this.target.x + pile.x;
    const ey = this.target.y + pile.y - 6;
    this.launch(prop, ex - 240, ey + 160, ex, ey, 14, () => {
      this.stock += 0.5;
      this.updatePile(this.shownStage);
    });
  }

  private launch(prop: PropKind, sx: number, sy: number, ex: number, ey: number, size: number, land: () => void): void {
    const tex = propTexture(this.deps.art, prop, 'nho');
    const s = tex ? new Sprite(tex) : new Sprite(Texture.WHITE);
    if (!tex) s.tint = 0xc0703c;
    s.anchor.set(0.5);
    s.scale.set(size / (tex?.width ?? 1));
    s.position.set(sx, sy);
    this.deps.fx.addChild(s);
    const dist = Math.hypot(ex - sx, ey - sy);
    this.flights.push({ sprite: s, sx, sy, ex, ey, t: 0, dur: FLIGHT_SEC + Math.min(0.35, dist / 2000), land });
  }

  private dust(x: number, y: number): void {
    const g = new Graphics();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.circle(Math.cos(a) * 6, Math.sin(a) * 2, 3).fill({ color: 0xe8d9b8, alpha: 0.8 });
    }
    g.position.set(x, y);
    this.deps.fx.addChild(g);
    this.dusts.push({ g, t: 0 });
  }

  flash(strength: number): void {
    this.flashAlpha = Math.max(this.flashAlpha, strength);
  }

  /** Còn mảnh đang bay hoặc đang nảy không. */
  get busy(): boolean {
    return this.flights.length > 0 || this.bounces.length > 0;
  }

  /** Số vật liệu đang bay. */
  get flying(): number {
    return this.flights.length;
  }

  /** Bỏ mọi mảnh đang bay, đang nảy, bụi (trang thử đổi giai đoạn: dựng lại từ đầu, không để mảnh cũ rơi vào). */
  clearMotion(): void {
    for (const f of this.flights.splice(0)) f.sprite.destroy();
    for (const b of this.bounces.splice(0)) {
      b.sprite.texture.destroy(false);
      b.sprite.destroy();
    }
    for (const d of this.dusts.splice(0)) d.g.destroy();
    this.stock = 0;
    this.flashAlpha = 0;
  }

  tick(dt: number, stage: number, placed: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      // Đường vòng cung: điểm điều khiển ở giữa, nâng lên theo khoảng cách.
      const cx = (f.sx + f.ex) / 2;
      const cy = Math.min(f.sy, f.ey) - 40 - Math.hypot(f.ex - f.sx, f.ey - f.sy) * 0.25;
      const u = 1 - k;
      f.sprite.position.set(u * u * f.sx + 2 * u * k * cx + k * k * f.ex, u * u * f.sy + 2 * u * k * cy + k * k * f.ey);
      f.sprite.rotation = Math.sin(k * Math.PI) * 0.6;
      if (k >= 1) {
        f.sprite.destroy();
        this.flights.splice(i, 1);
        f.land();
      }
    }
    for (let i = this.bounces.length - 1; i >= 0; i--) {
      const b = this.bounces[i]!;
      b.t += dt;
      const k = Math.min(1, b.t / BOUNCE_SEC);
      b.sprite.scale.set(1 + 0.25 * (1 - k) * (1 - k));
      if (k >= 1) {
        b.sprite.texture.destroy(false);
        b.sprite.destroy();
        this.bounces.splice(i, 1);
        b.done();
      }
    }
    for (let i = this.dusts.length - 1; i >= 0; i--) {
      const d = this.dusts[i]!;
      d.t += dt;
      d.g.scale.set(1 + d.t * 3);
      d.g.alpha = Math.max(0, 1 - d.t / 0.45);
      if (d.t >= 0.45) {
        d.g.destroy();
        this.dusts.splice(i, 1);
      }
    }
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.2);
    this.drawFlags(dt);
    // Đống vật liệu nảy lên khi dân phu đặt vật liệu xuống.
    if (this.pileSprite && (this.pileBump > 0 || this.lastBump > 0)) {
      this.pileBump = Math.max(0, this.pileBump - dt * 4);
      const k = (1 + this.pileBump * 0.12) / (1 + this.lastBump * 0.12);
      this.pileSprite.scale.set(this.pileSprite.scale.x * k, this.pileSprite.scale.y * k);
      this.lastBump = this.pileBump;
    }
    this.flashSprite.alpha = this.flashAlpha * 0.6;
    this.shownStage = stage;
    this.refreshVisibility(stage, placed);
  }

  destroy(): void {
    for (const f of this.flights) f.sprite.destroy();
    for (const d of this.dusts) d.g.destroy();
    this.container.destroy({ children: true });
    this.rt.destroy(true);
    for (const t of this.partTex.values()) t.destroy(true);
  }
}

/** Nhãn vùng mặt nước trong mặt nạ vùng (1..7 theo PART_KEYS). */
const NUOC = PART_KEYS.indexOf('nuoc') + 1;
const NEN = PART_KEYS.indexOf('nen') + 1;

/** Điểm đứng trên phần đất của công trình phẳng (sân, hồ, tường bao): lưới thưa, thứ tự cố định theo mã hạng mục. */
function floorPoints(labels: Uint8Array, w: number, h: number, seed: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  /** Chỗ đứng trên vùng nền (bờ đá, mặt sân, mặt đất): ưu tiên, vì vùng trang trí của hồ sen là lá sen giữa hồ. */
  const onNen: { x: number; y: number }[] = [];
  const step = 44;
  let row = 0;
  for (let y = step / 2; y < h; y += step * 0.75, row++) {
    for (let x = step / 2 + (row % 2) * (step / 2); x < w; x += step) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      // Cần có đất quanh chỗ đứng (không đứng ở mép hình).
      // Không đứng trên mặt nước, lá sen giữa hồ (gần vùng nuoc trong bán kính 18 điểm ảnh).
      const at = (dx: number, dy: number) => labels[Math.min(h - 1, Math.max(0, yi + dy)) * w + Math.min(w - 1, Math.max(0, xi + dx))]!;
      if (!at(0, 0) || !at(0, -10) || !at(0, 6)) continue;
      let wet = false;
      for (let k = 0; k < 8 && !wet; k++) wet = at(Math.round(Math.cos((k * Math.PI) / 4) * 18), Math.round(Math.sin((k * Math.PI) / 4) * 9)) === NUOC;
      if (wet || at(0, 0) === NUOC) continue;
      out.push({ x: xi, y: yi });
      if (at(0, 0) === NEN && at(0, -10) === NEN && at(0, 6) === NEN) onNen.push({ x: xi, y: yi });
    }
  }
  const list = onNen.length >= 8 ? onNen : out;
  const r = rng(hashSeed('floor:' + seed));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list.slice(0, 60);
}

function propTexture(art: Art, prop: PropKind, level: 'lon' | 'vua' | 'nho'): Texture | null {
  return art.textures.get(prop === 'cat' ? 'props/cat' : `props/${prop}_${level}`) ?? null;
}

// ---------- Bộ điều phối ----------

interface Job {
  itemId: string;
  stageIndex: number;
  from: number;
  points: number;
  cost: number;
  name: string | null;
  source: Contribution['source'] | null;
  contrib: number;
  /** Người góp (platformId), để nhân vật của họ khiêng vật liệu. */
  actor: string | null;
  /** Đặt thẳng khoảng mảnh (dùng khi bù cho khớp server). */
  pieces?: [number, number];
  cursor?: number;
  end?: number;
}

interface Burst {
  label: Text;
  glow: Graphics;
  t: number;
}

export interface BuilderStats {
  itemId: string | null;
  stage: number;
  placed: number;
  count: number;
  pending: number;
  flying: number;
  done: boolean;
}

export interface BuilderEvents {
  /** Hạng mục đang hiện thay đổi (để bản đồ ẩn/hiện công trình). */
  onDisplay(): void;
  /** Xong giai đoạn / xong hạng mục (sau khi mảnh cuối đã đặt): chớp sáng (lễ làm ở giai đoạn 5). */
  onStageDone(itemId: string, stageIndex: number, itemDone: boolean): void;
  /** Gắn công trường vào đúng lớp vẽ của công trình. */
  attach(site: BuildSite): void;
  /** Tim, bình luận chưa đủ một mảnh: nhân vật của người góp khiêng vật liệu ra đống (true = đã lo). */
  carry?(actorId: string | null, prop: PropKind): boolean;
  /** Tay dân phu đứng gần để mảnh bay từ đó (mục 7.5). */
  source?(): { x: number; y: number } | null;
  /** Mảnh vật liệu vừa khớp vào chỗ (âm brick_lay / tile_place…, mục 10A). */
  pieceLand?(prop: PropKind): void;
}

export class Builder {
  private map: MapManifest | null = null;
  private art: Art | null = null;
  private progress: ProgressView | null = null;
  private site: BuildSite | null = null;
  private loading: string | null = null;
  private queue: Job[] = [];
  /** Hạng mục, giai đoạn, số mảnh đã cho bay (kể cả đang bay) đang hiện trên bản đồ. */
  private shown: { itemId: string; stage: number; placed: number } | null = null;
  /** Hạng mục đang hiện đã xây xong hết (chờ sang hạng mục sau). */
  private shownDone = false;
  private budget = 0;
  private idle = 0;
  private carryCooldown = 0;
  private contribSeq = 0;
  private bursts: Burst[] = [];
  /** Các lần có công đã hiện nhãn (một quà vượt nhiều giai đoạn chỉ hiện một nhãn). */
  private burstShown = new Set<number>();
  private lineOrder: number[] = [];
  private lineAt = 0;
  private readonly fx = new Container();
  private piecesCfg: PiecesConfig = DEFAULT_PIECES;
  /** Cờ bay ở công trường (config ambient.flags). */
  flags = true;
  /** Tạm dừng đặt mảnh mới (trong lúc làm lễ). Mảnh đang bay vẫn bay nốt. */
  paused = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly events: BuilderEvents,
    private readonly worldScale: () => number,
  ) {}

  get fxLayer(): Container {
    return this.fx;
  }

  /** Hạng mục đang hiện dở (đang có công trường) hoặc null. */
  get displayItemId(): string | null {
    return this.shown && !this.shownDone ? this.shown.itemId : null;
  }

  /** Số hạng mục (theo thứ tự xây) đã hiện xong hẳn trên bản đồ. */
  doneCount(): number {
    if (!this.progress || !this.shown) return -1;
    const idx = this.progress.items.findIndex((i) => i.id === this.shown!.itemId);
    return this.shownDone ? idx + 1 : idx;
  }

  get siteReady(): boolean {
    return !!this.site && this.site.target.itemId === this.shown?.itemId;
  }

  setArt(map: MapManifest | null, art: Art): void {
    this.map = map;
    this.art = art;
    this.resetSite();
    this.shown = null; // dựng lại theo trạng thái server
  }

  private resetSite(): void {
    this.site?.destroy();
    this.site = null;
    this.loading = null;
    this.queue = [];
  }

  setProgress(p: ProgressView): void {
    this.progress = p;
  }

  /** Bỏ hàng đợi và mảnh đang bay, dựng lại ngay đúng tiến độ hiện có (trang thử chọn hạng mục, giai đoạn khác). */
  resync(): void {
    this.queue = [];
    this.site?.clearMotion();
    for (const b of this.bursts.splice(0)) {
      b.label.destroy();
      b.glow.destroy();
    }
    this.shown = null;
    this.shownDone = false;
    this.budget = 0;
  }

  /** Số liệu cho trang thử: giai đoạn đang hiện, số mảnh đã cho bay / tổng, đang chờ, đang bay. */
  stats(): BuilderStats {
    const site = this.siteReady ? this.site! : null;
    const shown = this.shown;
    if (!shown || !site) return { itemId: shown?.itemId ?? null, stage: shown?.stage ?? 0, placed: 0, count: 0, pending: 0, flying: 0, done: this.shownDone };
    return {
      itemId: shown.itemId,
      stage: shown.stage,
      placed: this.shownDone ? site.count(shown.stage) : shown.placed,
      count: site.count(shown.stage),
      pending: this.pendingPieces(site),
      flying: site.flying,
      done: this.shownDone,
    };
  }

  private item(itemId: string): ProgressItem | undefined {
    return this.progress?.items.find((i) => i.id === itemId);
  }

  private itemIndex(itemId: string): number {
    return this.progress?.items.findIndex((i) => i.id === itemId) ?? -1;
  }

  onContribution(msg: Contribution): void {
    if (!this.shown) return; // chưa dựng xong: lần đối chiếu tới sẽ dựng đúng tiến độ
    const contrib = ++this.contribSeq;
    for (const a of msg.allocations) {
      this.queue.push({ itemId: a.itemId, stageIndex: a.stageIndex, from: a.from, points: a.points, cost: a.cost, name: msg.name, source: msg.source, contrib, actor: msg.platformId || null });
    }
    if (msg.allocations.length === 0 && this.site && msg.source !== 'gift') this.queueCarry(msg.platformId || null);
  }

  private queueCarry(actor: string | null): void {
    if (!this.site) return;
    const plan = this.site.plans[this.shown?.stage ?? 0];
    const prop = plan?.prop ?? 'gach';
    // Có nhân vật của người góp: người đó khiêng ra đống (dân phu khiêng, mục 7.5). Không có: vật liệu bay từ mép công trường.
    if (this.events.carry?.(actor, prop)) return;
    if (this.carryCooldown > 0) return;
    this.carryCooldown = 0.35;
    this.site.carry(prop);
  }

  /** Hình học công trường đang hiện (cho nhân vật), null nếu chưa dựng xong. */
  siteGeometry(): SiteGeometry | null {
    if (!this.siteReady || !this.shown || this.shownDone) return null;
    return this.site!.geometry(this.shown.stage);
  }

  /** Giai đoạn đang hiện trên bản đồ (hạng mục, số thứ tự từ 0). */
  displayStage(): { itemId: string; stage: number } | null {
    return this.shown && !this.shownDone ? { itemId: this.shown.itemId, stage: this.shown.stage } : null;
  }

  /** Dân phu đặt vật liệu xuống đống. */
  bumpPile(): void {
    if (this.siteReady) this.site!.bumpPile();
  }

  /** Dựng ngay công trường đúng trạng thái server (mở overlay, mất tin, đổi giá…). */
  private snap(): void {
    const p = this.progress;
    if (!p || !this.map || !this.art) return;
    this.queue = [];
    if (p.completed) {
      this.site?.destroy();
      this.site = null;
      this.shown = { itemId: p.item.id, stage: p.stage.count - 1, placed: 0 };
      this.shownDone = true;
      this.events.onDisplay();
      return;
    }
    const itemId = p.item.id;
    const stage = p.stage.number - 1;
    const want = { itemId, stage, points: p.stagePoints, cost: p.stageCost };
    this.shownDone = false;
    if (this.site?.target.itemId === itemId) {
      const placed = pieceRange(this.site.count(stage), 0, want.points, want.cost)[1];
      this.site.drawState(stage, placed);
      this.shown = { itemId, stage, placed };
      this.events.onDisplay();
      return;
    }
    this.shown = { itemId, stage, placed: 0 };
    void this.loadSite(itemId).then((site) => {
      if (!site || this.progress?.item.id !== itemId) return;
      const pl = pieceRange(site.count(stage), 0, want.points, want.cost)[1];
      site.drawState(stage, pl);
      this.shown = { itemId, stage, placed: pl };
      this.events.onDisplay();
    });
    this.events.onDisplay();
  }

  private async loadSite(itemId: string): Promise<BuildSite | null> {
    if (!this.map || !this.art) return null;
    const item = this.item(itemId);
    if (!item) return null;
    this.loading = itemId;
    const map = this.map;
    const art = this.art;
    try {
      const site = await BuildSite.create(map, itemId, item, {
        renderer: this.renderer,
        art,
        version: art.version,
        fx: this.fx,
        pieces: () => this.piecesCfg,
        worldScale: this.worldScale,
        source: () => this.events.source?.() ?? null,
        flags: () => this.flags,
      });
      if (this.map !== map || this.loading !== itemId) {
        site?.destroy();
        return null;
      }
      this.site?.destroy();
      this.site = site;
      this.loading = null;
      if (site) this.events.attach(site);
      return site;
    } catch (e) {
      console.warn('Không dựng được công trường', e);
      this.loading = null;
      return null;
    }
  }

  tick(dt: number, pieces: PiecesConfig, texts: string[]): void {
    this.piecesCfg = pieces;
    for (const b of this.bursts.splice(0)) {
      b.t += dt;
      const left = pieces.burstSec - b.t;
      b.label.alpha = b.glow.alpha = Math.max(0, Math.min(1, left / 0.5));
      if (left > 0) this.bursts.push(b);
      else {
        b.label.destroy();
        b.glow.destroy();
      }
    }
    if (this.carryCooldown > 0) this.carryCooldown -= dt;
    const p = this.progress;
    if (!p || !this.map || !this.art) return;
    if (!this.shown) {
      this.snap();
      return;
    }
    const site = this.site && this.site.target.itemId === this.shown.itemId ? this.site : null;
    if (site) {
      site.stock = this.pendingPieces(site);
      site.tick(dt, this.shown.stage, this.shown.placed);
    }
    if (this.loading) return;
    // Đang làm lễ (mục 10): công trường tạm dừng, mảnh mới chờ tới khi lễ xong.
    if (this.paused) return;

    this.budget = Math.min(pieces.maxPerSec * 0.5 + 1, this.budget + pieces.maxPerSec * dt);
    if (!this.queue.length) {
      this.idle += dt;
      if (this.idle > 0.6 && !(site?.busy ?? false)) this.reconcile();
      return;
    }
    this.idle = 0;
    let guard = 0;
    while (this.queue.length && guard++ < 50) {
      const job = this.queue[0]!;
      // Việc của hạng mục đã qua: bỏ. Việc của hạng mục sau: chờ hạng mục đang hiện xong hết rồi chuyển.
      const ji = this.itemIndex(job.itemId);
      const si = this.itemIndex(this.shown.itemId);
      if (ji < si || (ji === si && job.stageIndex < this.shown.stage)) {
        this.queue.shift();
        continue;
      }
      if (job.itemId !== this.shown.itemId) {
        if (!this.shownDone) {
          this.snap();
          return;
        }
        if (site?.busy) return;
        this.shown = { itemId: job.itemId, stage: job.stageIndex, placed: 0 };
        this.shownDone = false;
        this.events.onDisplay();
        void this.loadSite(job.itemId).then((s) => s?.drawState(job.stageIndex, 0));
        return;
      }
      if (!site) return;
      if (job.stageIndex > this.shown.stage) {
        if (this.shown.placed >= site.count(this.shown.stage) && job.stageIndex === this.shown.stage + 1) {
          this.shown = { ...this.shown, stage: job.stageIndex, placed: 0 };
        } else {
          this.snap();
          return;
        }
      }
      const count = site.count(job.stageIndex);
      if (job.cursor === undefined) {
        const [a, b] = job.pieces ?? pieceRange(count, job.from, job.points, job.cost);
        job.cursor = Math.max(a, this.shown.placed);
        job.end = b;
        if (job.source === 'gift' && b > a && job.name) this.burst(site, job, b - a, pieces, texts);
        if (b === a && job.source !== 'gift') this.queueCarry(job.actor);
      }
      if (job.cursor >= job.end!) {
        this.queue.shift();
        continue;
      }
      if (this.budget < 1) return;
      const later = this.queue.some((q) => q !== job && (q.itemId !== job.itemId || q.stageIndex !== job.stageIndex));
      const passed = job.end === count && later ? count : null;
      const k = Math.min(job.end! - job.cursor, clusterSize(this.pendingPieces(site), pieces.maxPerSec, passed));
      const from = job.cursor;
      const to = from + k;
      const stage = job.stageIndex;
      const itemId = job.itemId;
      const completes = to >= count;
      const prop = site.plans[stage]?.prop ?? 'gach';
      site.fly(stage, from, to, () => {
        this.events.pieceLand?.(prop);
        if (completes) {
          const last = stage === site.plans.length - 1;
          site.flash(last ? 0.9 : 0.45);
          if (last && this.shown?.itemId === itemId) this.shownDone = true;
          this.events.onStageDone(itemId, stage, last);
          if (last) this.events.onDisplay();
        }
      });
      job.cursor = to;
      this.shown = { ...this.shown, placed: to };
      this.budget -= 1;
    }
  }

  /** Số mảnh còn chờ bay của hạng mục đang hiện (để đống vật liệu to nhỏ, và chọn cỡ cụm). */
  private pendingPieces(site: BuildSite): number {
    let n = 0;
    for (const j of this.queue) {
      if (j.itemId !== site.target.itemId) continue;
      const count = site.count(j.stageIndex);
      const [a, b] = j.end !== undefined ? [j.cursor ?? 0, j.end] : (j.pieces ?? pieceRange(count, j.from, j.points, j.cost));
      n += Math.max(0, b - a);
    }
    return n;
  }

  /** Hết việc mà vẫn lệch trạng thái server: bù vài mảnh bằng cách cho bay, lệch nhiều thì dựng lại ngay. */
  private reconcile(): void {
    const p = this.progress!;
    const shown = this.shown!;
    if (p.completed) {
      if (!this.shownDone || shown.itemId !== p.item.id) this.snap();
      return;
    }
    const stage = p.stage.number - 1;
    const site = this.site;
    if (p.item.id !== shown.itemId || stage !== shown.stage || !site || site.target.itemId !== shown.itemId) {
      // Vừa xong giai đoạn trước, server đã sang giai đoạn kế mà chưa có mảnh nào: chuyển êm.
      if (site && p.item.id === shown.itemId && stage === shown.stage + 1 && shown.placed >= site.count(shown.stage) && p.stagePoints === 0) {
        this.shown = { ...shown, stage, placed: 0 };
        return;
      }
      this.snap();
      return;
    }
    const want = pieceRange(site.count(stage), 0, p.stagePoints, p.stageCost)[1];
    if (want > shown.placed && want - shown.placed <= 40) {
      this.queue.push({ itemId: shown.itemId, stageIndex: stage, from: 0, points: 0, cost: 1, name: null, source: null, contrib: 0, actor: null, pieces: [shown.placed, want] });
    } else if (want !== shown.placed) {
      this.snap();
    }
  }

  /** Quà: vùng vừa xây sáng viền và nhãn nhỏ "{name} vừa xây {n} {material}" (nhóm câu piece_burst). */
  private burst(site: BuildSite, job: Job, n: number, pieces: PiecesConfig, texts: string[]): void {
    if (!texts.length || this.burstShown.has(job.contrib)) return;
    this.burstShown.add(job.contrib);
    if (this.burstShown.size > 200) this.burstShown.delete(this.burstShown.values().next().value!);
    // Tổng số mảnh của cả quà (có thể vượt nhiều giai đoạn); vật liệu là loại nhiều mảnh nhất.
    const byMaterial = new Map<string, number>();
    let total = 0;
    for (const q of this.queue) {
      if (q.contrib !== job.contrib || q.itemId !== site.target.itemId) continue;
      const [x, y] = q.pieces ?? pieceRange(site.count(q.stageIndex), q.from, q.points, q.cost);
      const m = site.plans[q.stageIndex]?.material ?? '';
      byMaterial.set(m, (byMaterial.get(m) ?? 0) + Math.max(0, y - x));
      total += Math.max(0, y - x);
    }
    const mainMaterial = [...byMaterial.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? site.plans[job.stageIndex]!.material;
    const plan = site.plans[job.stageIndex]!;
    const material = pieces.materials[mainMaterial] ?? mainMaterial;
    if (this.lineOrder.length !== texts.length || this.lineAt >= this.lineOrder.length) {
      this.lineOrder = texts.map((_, i) => i).sort(() => Math.random() - 0.5);
      this.lineAt = 0;
    }
    const tpl = texts[this.lineOrder[this.lineAt++]!] ?? texts[0]!;
    const text = tpl.replace(/\{name\}/g, job.name ?? '').replace(/\{n\}/g, String(Math.max(n, total))).replace(/\{material\}/g, material);
    const pts = plan.kind === 'pieces' ? plan.pieces.slice(job.cursor ?? 0, Math.min(plan.pieces.length, (job.cursor ?? 0) + Math.max(n, 1))) : [];
    const box =
      pts.length > 0
        ? { x: Math.min(...pts.map((q) => q.x)), y: Math.min(...pts.map((q) => q.y)), x1: Math.max(...pts.map((q) => q.x + q.w)), y1: Math.max(...pts.map((q) => q.y + q.h)) }
        : { x: 0, y: 0, x1: site.target.w, y1: site.target.h * 0.4 };
    const tx = site.target.x;
    const ty = site.target.y;
    const glow = new Graphics()
      .roundRect(tx + box.x - 6, ty + box.y - 6, box.x1 - box.x + 12, box.y1 - box.y + 12, 8)
      .stroke({ width: 3 / this.worldScale(), color: 0xffd54f, alpha: 0.95 });
    glow.blendMode = 'add';
    const label = new Text({
      text,
      style: { fontFamily: FONT_BODY, fontSize: 24, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x3a2414, width: 5 } },
    });
    label.anchor.set(0.5, 1);
    label.scale.set(1 / this.worldScale());
    label.position.set(tx + (box.x + box.x1) / 2, ty + box.y - 10);
    // Nhiều quà liền nhau: bỏ nhãn cũ nhất khi quá MAX_BURSTS, nhãn cũ bị nhãn mới che thì đẩy lên trên.
    while (this.bursts.length >= MAX_BURSTS) {
      const old = this.bursts.shift()!;
      old.label.destroy();
      old.glow.destroy();
    }
    const placed = [labelRect(label)];
    for (const b of [...this.bursts].reverse()) {
      let guard = 0;
      while (placed.some((r) => overlaps(r, labelRect(b.label))) && guard++ < MAX_BURSTS) b.label.y = Math.min(...placed.map((r) => r.y)) - 2 / this.worldScale();
      placed.push(labelRect(b.label));
    }
    this.fx.addChild(glow, label);
    this.bursts.push({ label, glow, t: 0 });
  }
}

/** Số nhãn piece_burst hiện cùng lúc tối đa. */
const MAX_BURSTS = 4;

/** Khung nhãn (neo giữa, đáy) trong tọa độ bản đồ. */
function labelRect(t: Text): Rect {
  return { x: t.x - t.width / 2, y: t.y - t.height, w: t.width, h: t.height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const DEFAULT_PIECES: PiecesConfig = {
  size: { nen: [22, 12], cot: [0, 14], khung: [24, 8], mai: [12, 8], tuong: [12, 6], trangtri: [10, 10], nuoc: [16, 16] },
  maxPerSec: 20,
  materials: {},
  burstSec: 3,
};
