// Bản đồ quần thể chùa (giai đoạn R2): nền ghép + công trình cắt từ ảnh + lớp tiền cảnh, lia dọc theo hạng mục đang xây.
// Lớp từ sau ra trước (mục 8): nền → công trình nền (sân, hồ, tường) → công trình theo baseY → tiền cảnh.
// Hiển thị TẠM: hạng mục đã xong hiện đủ, đang xây hiện mờ nhấp nháy, chưa xây thì ẩn. R3 thay bằng từng giai đoạn
// (markers, foundation, frame…), R4 làm camera đầy đủ. Thiếu ảnh nào thì bỏ qua, không crash.

import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { drawOrder, floorBand, itemRect, textureKey, type MapBuilding, type MapManifest } from '../../../shared/map.js';
import type { ProgressView } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { lerpCamera } from '../layout.js';
import { lookAlpha, mapCamera, type ItemLook, type ViewBand } from '../mapLayout.js';

interface Piece {
  itemId: string;
  sprite: Sprite;
  flash: Sprite;
  look: ItemLook;
  flashAlpha: number;
}

export class MapView {
  readonly container = new Container();
  private readonly world = new Container();
  private readonly tiles = new Container();
  private readonly buildings = new Container();
  private readonly fg = new Container();
  private map: MapManifest | null = null;
  private pieces: Piece[] = [];
  private progress: ProgressView | null = null;
  private camY = 0;
  private hasCam = false;
  private pulse = 0;

  constructor(private view: ViewBand) {
    this.world.addChild(this.tiles, this.buildings, this.fg);
    this.container.addChild(this.world);
  }

  get ready(): boolean {
    return this.map !== null;
  }

  setView(view: ViewBand): void {
    this.view = view;
  }

  setArt(art: Art): void {
    for (const layer of [this.tiles, this.buildings, this.fg]) layer.removeChildren().forEach((c) => c.destroy());
    this.pieces = [];
    this.map = art.manifest?.map ?? null;
    const map = this.map;
    if (!map) return;
    const tex = (file: string) => art.textures.get(textureKey(file)) ?? null;
    for (const t of map.tiles) {
      const tx = tex(t.file);
      if (!tx) continue;
      const s = new Sprite(tx);
      s.position.set(0, t.y);
      this.tiles.addChild(s);
    }
    for (const b of drawOrder(map.buildings)) {
      const base = tex(b.file);
      if (!base) continue;
      if (b.items.length === 1) this.addPiece(b.items[0]!, base, b.x, b.y);
      else this.addBands(b, base);
    }
    for (const b of map.buildings) {
      if (!b.fg) continue;
      const t = tex(b.fg.file);
      if (!t) continue;
      // Tiền cảnh gần giống hệt nền nên luôn hiện: cây vẫn đứng trước công trình, giàn giáo và nhân vật sau này.
      const s = new Sprite(t);
      s.position.set(b.fg.x, b.fg.y);
      this.fg.addChild(s);
    }
    if (this.progress) this.update(this.progress);
  }

  private addPiece(itemId: string, texture: Texture, x: number, y: number): void {
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    sprite.visible = false;
    // Bản sao cộng sáng để chớp khi xong giai đoạn / hạng mục.
    const flash = new Sprite(texture);
    flash.position.set(x, y);
    flash.blendMode = 'add';
    flash.alpha = 0;
    this.buildings.addChild(sprite, flash);
    this.pieces.push({ itemId, sprite, flash, look: 'todo', flashAlpha: 0 });
  }

  /** Bảo tháp: mỗi tầng một dải cắt ra từ cùng một ảnh. */
  private addBands(b: MapBuilding, base: Texture): void {
    b.items.forEach((itemId, k) => {
      const { top, bottom } = floorBand(b, k);
      const h = Math.max(1, Math.round(bottom - top));
      const frame = new Rectangle(0, Math.round(top - b.y), base.width, Math.min(h, base.height - Math.round(top - b.y)));
      this.addPiece(itemId, new Texture({ source: base.source, frame }), b.x, Math.round(top));
    });
  }

  update(p: ProgressView): void {
    this.progress = p;
    const status = new Map(p.items.map((i) => [i.id, i.status]));
    for (const piece of this.pieces) {
      const s = status.get(piece.itemId);
      piece.look = s === 'done' ? 'done' : s === 'building' ? 'building' : 'todo';
    }
  }

  /** Khung hạng mục đang xây trên màn hình (để giao diện tự mờ đi khi che nó). */
  focusOnScreen(): { x: number; y: number; w: number; h: number } | null {
    if (!this.map || !this.progress) return null;
    const r = itemRect(this.map, this.progress.item.id);
    if (!r) return null;
    const k = this.world.scale.x;
    return { x: this.world.x + r.x * k, y: this.world.y + r.y * k, w: r.w * k, h: r.h * k };
  }

  flash(itemId: string, strength: number): void {
    for (const p of this.pieces) if (p.itemId === itemId) p.flashAlpha = Math.max(p.flashAlpha, strength);
  }

  tick(dtSec: number): void {
    const map = this.map;
    if (!map) return;
    this.pulse += dtSec;
    for (const p of this.pieces) {
      const a = lookAlpha(p.look, this.pulse);
      p.sprite.visible = a > 0;
      p.sprite.alpha = a;
      if (p.flashAlpha > 0) p.flashAlpha = Math.max(0, p.flashAlpha - dtSec * 1.2);
      p.flash.alpha = p.look === 'todo' ? 0 : p.flashAlpha * 0.6;
    }
    const focus = this.progress ? itemRect(map, this.progress.item.id) : null;
    const cam = mapCamera(map, focus, this.view);
    // Lần đầu mở overlay thì đặt camera đúng chỗ ngay, không lia từ đầu bản đồ.
    this.camY = this.hasCam ? lerpCamera(this.camY, cam.y, dtSec, 1.5) : cam.y;
    this.hasCam = true;
    this.world.scale.set(cam.scale);
    this.world.position.set(cam.x, this.camY);
  }
}
