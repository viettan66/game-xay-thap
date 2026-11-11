// Bản đồ thu nhỏ (mục 8 SPEC): ảnh thu nhỏ quần thể; công trình đã xong có màu, chưa xây là bóng xám,
// hạng mục đang xây nhấp nháy. Mặc định chỉ hiện ở chế độ camera overview (hud.minimap).
// Ảnh được thu nhỏ bằng trình duyệt (createImageBitmap, chất lượng cao) để không bị răng cưa.
// Thiếu ảnh nào thì bỏ qua, không crash.

import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { assetUrl } from '../../../shared/manifest.js';
import { drawOrder, floorBand, type MapBuilding, type MapManifest, type MapRect } from '../../../shared/map.js';
import type { Rect } from '../layout.js';
import { C } from '../theme.js';

interface ItemSprites {
  ground: boolean;
  color: Sprite;
  grey: Sprite | null;
}

async function smallBitmap(file: string, version: string, w: number, h: number): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(`${assetUrl(file)}?v=${version}`);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob(), {
      resizeWidth: Math.max(1, Math.round(w)),
      resizeHeight: Math.max(1, Math.round(h)),
      resizeQuality: 'high',
    });
  } catch {
    return null;
  }
}

/** Bóng xám của ảnh: giữ hình dáng (kênh alpha), tô một màu xám. */
function greyOf(bmp: ImageBitmap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const x = c.getContext('2d')!;
  x.drawImage(bmp, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = '#5d5a55';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

export class Minimap {
  readonly container = new Container();
  private readonly content = new Container();
  private readonly frame = new Graphics();
  private readonly maskG = new Graphics();
  private items = new Map<string, ItemSprites>();
  /** Ảnh gốc (hủy cả nguồn) và ảnh con cắt từ chúng (chỉ hủy khung). */
  private textures: Texture[] = [];
  private subTextures: Texture[] = [];
  private bitmaps: ImageBitmap[] = [];
  private status = new Map<string, 'done' | 'building' | 'todo'>();
  private blink = 0;
  private key = '';
  /** Độ hiện mong muốn (0/1); hiện, ẩn mờ dần. */
  want = 0;

  constructor() {
    this.container.addChild(this.content, this.frame, this.maskG);
    this.content.mask = this.maskG;
    this.container.alpha = 0;
    this.container.visible = false;
  }

  /** Dựng ảnh thu nhỏ của vùng `region` (tọa độ bản đồ), vừa trong hộp `box` (giữ tỉ lệ, neo góc dưới phải). */
  async load(map: MapManifest, version: string, region: MapRect, box: Rect): Promise<void> {
    const key = `${version}:${box.x},${box.y},${box.w},${box.h}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const k = Math.min(box.w / region.w, box.h / region.h);
    const w = Math.round(region.w * k);
    const h = Math.round(region.h * k);
    this.container.position.set(box.x + box.w - w, box.y + box.h - h);
    this.maskG.clear().roundRect(0, 0, w, h, 10).fill(0xffffff);
    this.frame.clear().roundRect(0, 0, w, h, 10).stroke({ width: 2.5, color: C.gold, alpha: 0.9 });
    this.content.position.set(-region.x * k, -region.y * k);

    // Nền: các dải ảnh đồi trống (chỉ phần nằm trong vùng).
    const tiles = map.tiles.filter((t) => t.y < region.y + region.h && t.y + t.h > region.y);
    const tileBmps = await Promise.all(tiles.map((t) => smallBitmap(t.file, version, map.width * k, t.h * k)));
    if (this.key !== key) return tileBmps.forEach((b) => b?.close());
    tiles.forEach((t, i) => {
      const b = tileBmps[i];
      if (!b) return;
      this.bitmaps.push(b);
      const tex = Texture.from(b);
      this.textures.push(tex);
      const s = new Sprite(tex);
      s.position.set(0, t.y);
      s.scale.set(map.width / b.width, t.h / b.height);
      this.content.addChild(s);
    });
    this.content.scale.set(k);

    // Công trình theo thứ tự vẽ của bản đồ.
    const order = drawOrder(map.buildings);
    const bmps = await Promise.all(order.map((b) => smallBitmap(b.file, version, b.w * k, b.h * k)));
    if (this.key !== key) return bmps.forEach((b) => b?.close());
    order.forEach((b, i) => {
      const bmp = bmps[i];
      if (bmp) this.addBuilding(b, bmp);
    });
    this.apply();
  }

  private addBuilding(b: MapBuilding, bmp: ImageBitmap): void {
    this.bitmaps.push(bmp);
    const color = Texture.from(bmp);
    const grey = b.layer === 'object' ? Texture.from(greyOf(bmp)) : null;
    this.textures.push(color, ...(grey ? [grey] : []));
    const sx = b.w / bmp.width;
    const sy = b.h / bmp.height;
    const make = (tex: Texture, frame: Rectangle | null, y: number) => {
      const t = frame ? new Texture({ source: tex.source, frame }) : tex;
      if (frame) this.subTextures.push(t);
      const s = new Sprite(t);
      s.position.set(b.x, y);
      s.scale.set(sx, sy);
      this.content.addChild(s);
      return s;
    };
    if (b.items.length === 1) {
      const g = grey ? make(grey, null, b.y) : null;
      this.items.set(b.items[0]!, { ground: b.layer === 'ground', color: make(color, null, b.y), grey: g });
      return;
    }
    // Bảo tháp: mỗi tầng một dải.
    b.items.forEach((itemId, idx) => {
      const { top, bottom } = floorBand(b, idx);
      const fy = Math.max(0, Math.floor((top - b.y) / sy));
      const fh = Math.max(1, Math.min(bmp.height - fy, Math.ceil((bottom - top) / sy)));
      const frame = new Rectangle(0, fy, bmp.width, fh);
      const g = grey ? make(grey, frame, b.y + fy * sy) : null;
      this.items.set(itemId, { ground: false, color: make(color, frame, b.y + fy * sy), grey: g });
    });
  }

  update(status: Map<string, 'done' | 'building' | 'todo'>): void {
    this.status = status;
    this.apply();
  }

  private apply(): void {
    for (const [id, it] of this.items) {
      const st = this.status.get(id) ?? 'todo';
      it.color.visible = st !== 'todo';
      it.color.alpha = 1;
      // Chưa xây: bóng xám (sân, hồ, tường nền thì để đồi trống).
      if (it.grey) {
        it.grey.visible = st !== 'done';
        it.grey.alpha = 0.6;
      }
    }
  }

  tick(dt: number): void {
    this.blink += dt;
    const a = this.container.alpha + (this.want - this.container.alpha) * Math.min(1, dt * 4);
    this.container.alpha = a < 0.01 && this.want === 0 ? 0 : a;
    this.container.visible = this.container.alpha > 0;
    if (!this.container.visible) return;
    for (const [id, it] of this.items) {
      if (this.status.get(id) === 'building') it.color.alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(this.blink * 5));
    }
  }

  private clear(): void {
    this.content.removeChildren().forEach((c) => c.destroy());
    for (const t of this.subTextures) t.destroy(false);
    for (const t of this.textures) t.destroy(true);
    for (const b of this.bitmaps) b.close();
    this.subTextures = [];
    this.textures = [];
    this.bitmaps = [];
    this.items.clear();
  }

  destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }
}
