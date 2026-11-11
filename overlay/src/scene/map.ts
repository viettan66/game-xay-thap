// Bản đồ quần thể chùa: nền ghép + công trình cắt từ ảnh + lớp tiền cảnh.
// Lớp từ sau ra trước (mục 8): nền → công trình nền (sân, hồ, tường) → công trình theo baseY → tiền cảnh → hiệu ứng.
// Hạng mục đã xong hiện đủ ảnh; hạng mục đang xây được XÂY TỪNG MẢNH (build/builder.ts, mục 7); chưa xây thì ẩn.
// Camera (camera.ts, R4): site / overview / tour / ceremony, chuyển mượt, rung khi quà lớn.
// Thiếu ảnh nào thì bỏ qua, không crash.

import { Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { drawOrder, floorBand, itemRect, textureKey, type MapBuilding, type MapManifest, type MapRect } from '../../../shared/map.js';
import type { CameraConfig, CameraMode, PiecesConfig, ProgressView, ServerMessage } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { Builder, type BuilderStats, type BuildSite } from '../build/builder.js';
import { CameraDirector, type CamView } from '../camera.js';

/** Mã hạng mục cổng tam quan: điểm dừng của camera tour (mục 8). */
const TOUR_TARGET_ID = 'tam_quan';

export const DEFAULT_CAMERA: CameraConfig = {
  maxZoom: 1.6,
  siteWidth: 0.52,
  overviewEverySec: 0,
  overviewSec: 9,
  tourEverySec: 0,
  tourSec: 20,
  ceremonySec: 5,
  ceremonyZoom: 1.15,
  shakeMinCoins: 1000,
};

interface Piece {
  itemId: string;
  sprite: Sprite;
}

export class MapView {
  readonly container = new Container();
  private readonly world = new Container();
  private readonly tiles = new Container();
  private readonly buildings = new Container();
  private readonly fg = new Container();
  private readonly builder: Builder;
  private map: MapManifest | null = null;
  private pieces: Piece[] = [];
  private progress: ProgressView | null = null;
  private readonly director = new CameraDirector();
  private cameraCfg: CameraConfig = DEFAULT_CAMERA;
  private complex: MapRect = { x: 0, y: 0, w: 1, h: 1 };
  /** Gọi khi mảnh cuối của một giai đoạn đã đặt xong (sau này mở lễ, giai đoạn 5). */
  onStageDone: (itemId: string, stageIndex: number, itemDone: boolean) => void = () => {};

  constructor(
    private view: CamView,
    renderer: Renderer,
  ) {
    this.builder = new Builder(
      renderer,
      {
        onDisplay: () => this.refreshVisibility(),
        onStageDone: (itemId, stage, itemDone) => {
          // Xong hạng mục: camera đẩy chậm vào công trình (lễ đầy đủ làm ở giai đoạn 5).
          if (itemDone && this.map) this.director.request('ceremony', itemRect(this.map, itemId));
          this.onStageDone(itemId, stage, itemDone);
        },
        attach: (site) => this.attach(site),
      },
      () => this.world.scale.x,
    );
    this.world.addChild(this.tiles, this.buildings, this.fg, this.builder.fxLayer);
    this.container.addChild(this.world);
  }

  get ready(): boolean {
    return this.map !== null;
  }

  setView(view: CamView): void {
    this.view = view;
  }

  setCameraConfig(cfg: CameraConfig): void {
    this.cameraCfg = cfg;
  }

  /** Admin bấm "Toàn cảnh" / "Lia giới thiệu", hoặc thử lễ. */
  requestCamera(mode: Exclude<CameraMode, 'site'>): void {
    const focusId = this.builder.displayItemId ?? this.progress?.item.id;
    this.director.request(mode, this.map && focusId ? itemRect(this.map, focusId) : null);
  }

  get cameraMode(): CameraMode {
    return this.director.mode;
  }

  /** Quà lớn: rung nhẹ (mục 8). */
  shake(): void {
    this.director.shake();
  }

  /** Khung bao toàn quần thể (tọa độ bản đồ). */
  get complexRect(): MapRect {
    return this.complex;
  }

  get manifest(): MapManifest | null {
    return this.map;
  }

  /** Trạng thái từng hạng mục theo những gì đang hiện trên bản đồ (cho bản đồ thu nhỏ). */
  displayStatus(): Map<string, 'done' | 'building' | 'todo'> {
    const out = new Map<string, 'done' | 'building' | 'todo'>();
    const p = this.progress;
    if (!p) return out;
    const done = this.builder.doneCount();
    const building = this.builder.displayItemId ?? (p.completed ? null : p.item.id);
    p.items.forEach((it, i) => {
      const finished = done >= 0 ? i < done : it.status === 'done';
      out.set(it.id, finished ? 'done' : it.id === building ? 'building' : 'todo');
    });
    return out;
  }

  setArt(art: Art): void {
    for (const layer of [this.tiles, this.buildings, this.fg]) layer.removeChildren().forEach((c) => c.destroy());
    this.pieces = [];
    this.map = art.manifest?.map ?? null;
    const map = this.map;
    this.builder.setArt(map, art);
    if (!map) return;
    // Khung bao quần thể: mọi công trình, thêm chút trời phía trên đỉnh tháp.
    const x0 = Math.min(...map.buildings.map((b) => b.x));
    const y0 = Math.min(...map.buildings.map((b) => b.y));
    const x1 = Math.max(...map.buildings.map((b) => b.x + b.w));
    const y1 = Math.max(...map.buildings.map((b) => b.y + b.h));
    this.complex = { x: x0, y: Math.max(0, y0 - 40), w: x1 - x0, h: y1 - Math.max(0, y0 - 40) };
    this.director.snap();
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
      // Tiền cảnh gần giống hệt nền nên luôn hiện: cây vẫn đứng trước công trình, giàn giáo và mảnh bay.
      const s = new Sprite(t);
      s.position.set(b.fg.x, b.fg.y);
      this.fg.addChild(s);
    }
    this.refreshVisibility();
  }

  private addPiece(itemId: string, texture: Texture, x: number, y: number): void {
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    sprite.visible = false;
    this.buildings.addChild(sprite);
    this.pieces.push({ itemId, sprite });
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

  /** Gắn công trường ngay sau ảnh của hạng mục đó, để giữ đúng thứ tự trước sau với công trình khác. */
  private attach(site: BuildSite): void {
    const piece = this.pieces.find((p) => p.itemId === site.target.itemId);
    const idx = piece ? this.buildings.getChildIndex(piece.sprite) + 1 : this.buildings.children.length;
    this.buildings.addChildAt(site.container, idx);
    this.refreshVisibility();
  }

  /** Hạng mục đã hiện xong: đủ ảnh; hạng mục đang xây: công trường (ẩn ảnh đủ); hạng mục sau: ẩn. */
  private refreshVisibility(): void {
    const p = this.progress;
    if (!p) return;
    const done = this.builder.doneCount();
    p.items.forEach((it, i) => {
      const finished = done >= 0 ? i < done : it.status === 'done';
      for (const piece of this.pieces) if (piece.itemId === it.id) piece.sprite.visible = finished;
    });
  }

  update(p: ProgressView): void {
    const first = !this.progress;
    this.progress = p;
    this.builder.setProgress(p);
    if (first) this.refreshVisibility();
  }

  contribution(msg: Extract<ServerMessage, { type: 'contribution' }>): void {
    this.builder.onContribution(msg);
  }

  /** Dựng lại ngay theo tiến độ hiện có, camera đặt thẳng vào chỗ (trang thử /tools/build). */
  resync(): void {
    this.builder.resync();
    this.director.snap();
  }

  stats(): BuilderStats {
    return this.builder.stats();
  }

  /** Khung hạng mục đang hiện trên màn hình (để giao diện tự mờ đi khi che nó). */
  focusOnScreen(): { x: number; y: number; w: number; h: number } | null {
    if (!this.map || !this.progress) return null;
    const r = itemRect(this.map, this.builder.displayItemId ?? this.progress.item.id);
    if (!r) return null;
    const k = this.world.scale.x;
    return { x: this.world.x + r.x * k, y: this.world.y + r.y * k, w: r.w * k, h: r.h * k };
  }

  tick(dtSec: number, pieces: PiecesConfig, texts: string[]): void {
    const map = this.map;
    if (!map) return;
    this.builder.tick(dtSec, pieces, texts);
    const focusId = this.builder.displayItemId ?? this.progress?.item.id;
    const cam = this.director.update(dtSec, {
      map,
      view: this.view,
      cfg: this.cameraCfg,
      focus: focusId ? itemRect(map, focusId) : null,
      complex: this.complex,
      tourTarget: itemRect(map, TOUR_TARGET_ID),
    });
    this.world.scale.set(cam.scale);
    this.world.position.set(cam.x, cam.y);
  }
}
