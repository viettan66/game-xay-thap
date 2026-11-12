// Bản đồ quần thể chùa: nền ghép + công trình cắt từ ảnh + lớp tiền cảnh.
// Lớp từ sau ra trước (mục 8): nền → công trình nền (sân, hồ, tường) → công trình theo baseY → tiền cảnh → hiệu ứng.
// Hạng mục đã xong hiện đủ ảnh; hạng mục đang xây được XÂY TỪNG MẢNH (build/builder.ts, mục 7); chưa xây thì ẩn.
// Camera (camera.ts, R4): site / overview / tour / ceremony, chuyển mượt, rung khi quà lớn, lia ngắn tới tượng mới.
// Nhân vật, xe trâu, voi, chuông, tượng (chars/, giai đoạn 4d) vẽ chung lớp với công trình, sắp theo chân (zIndex = y),
// để người đi sau công trình bị che, đi trước thì đè lên; chữ trên đầu vẽ ở lớp màn hình.
// Thiếu ảnh nào thì bỏ qua, không crash.

import { Container, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { buildingOf, drawOrder, floorBand, itemRect, textureKey, type MapBuilding, type MapManifest, type MapRect } from '../../../shared/map.js';
import type { ActorInfo, AnonCrowd, CameraConfig, CameraMode, CharactersConfig, HonorInfo, PiecesConfig, ProgressView, ServerMessage } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import { Builder, type BuilderStats, type BuildSite } from '../build/builder.js';
import { CameraDirector, type CamView } from '../camera.js';
import { carryOf, workKind } from '../chars/sprites.js';
import { pieceSoundGroup } from '../../../shared/audio.js';
import { loiterPoints, type Pt, type SiteGeom } from '../chars/spots.js';
import { CharactersView } from '../chars/view.js';

/** Ground (sân, hồ, tường, san nền) luôn vẽ dưới mọi công trình đứng và nhân vật. */
const GROUND_Z = -1_000_000;
/** Mã hạng mục hồ sen (thả hoa đăng trong lễ lớn). */
const POND_ID = 'ho_sen';
/** Lia ngắn tới tượng mới bao nhiêu giây. */
const PEEK_SEC = 4.5;

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
  z: number;
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
  /** Nhân vật, xe, chuông, tượng (giai đoạn 4d). */
  readonly chars: CharactersView;
  private loiterCache: { key: string; pts: Pt[] } = { key: '', pts: [] };
  private finale = false;
  private finaleTurn = 0;
  /** Âm thanh gắn với hoạt ảnh trên bản đồ (mảnh khớp chỗ, nhân vật làm việc…, mục 10A). */
  onSound: (group: string) => void = () => {};
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
          // Lễ (camera đẩy vào, bia…) do bộ điều phối lễ lo (ceremony/director.ts), bắt đầu đúng lúc này.
          this.onStageDone(itemId, stage, itemDone);
        },
        attach: (site) => this.attach(site),
        carry: (actorId, prop) => this.chars.carryFor(actorId, carryOf(prop)),
        source: () => this.chars.handNear(),
        pieceLand: (prop) => this.onSound(pieceSoundGroup(prop)),
      },
      () => this.world.scale.x,
    );
    this.buildings.sortableChildren = true;
    this.world.addChild(this.tiles, this.buildings, this.fg, this.builder.fxLayer);
    this.chars = new CharactersView(this.buildings, this.builder.fxLayer);
    this.chars.onSound = (g) => this.onSound(g);
    this.chars.setContext({
      site: () => this.siteGeom(),
      siteZ: () => {
        const id = this.builder.displayStage()?.itemId;
        const b = id && this.map ? buildingOf(this.map, id)?.building : null;
        return b ? b.baseY + 0.5 : 0;
      },
      kind: () => {
        const d = this.builder.displayStage();
        const st = d ? this.progress?.items.find((i) => i.id === d.itemId)?.stages[d.stage] : null;
        return workKind(st?.build);
      },
      material: () => carryOf(this.builder.siteGeometry()?.prop ?? 'gach'),
      dropAtPile: () => this.builder.bumpPile(),
      view: () => this.visibleRect(),
      toScreen: (x, y) => ({ x: this.world.x + x * this.world.scale.x, y: this.world.y + y * this.world.scale.y }),
      peek: (rect) => this.director.peek(rect, PEEK_SEC),
      screenView: () => this.view,
      // Bị công trình đang hiện che: nằm trong bề ngang ảnh, phía sau đường chân, thấp hơn mép trên một chút.
      hidden: (p) =>
        this.pieces.some((q) => q.sprite.visible && q.z > GROUND_Z / 2 && p.x >= q.sprite.x && p.x <= q.sprite.x + q.sprite.width && p.y >= q.sprite.y + q.sprite.height * 0.15 && p.y < q.z),
    });
    this.container.addChild(this.world, this.chars.screen);
  }

  /** Khung bản đồ đang hiện trong vùng khung hình (tọa độ bản đồ). */
  private visibleRect(): MapRect {
    const k = this.world.scale.x || 1;
    // Vùng khung hình (giữa vùng an toàn trên và khu comment dưới): nhân vật đi vào từ mép vùng này, chữ chỉ hiện trong vùng này.
    const v = this.view;
    return { x: (v.left - this.world.x) / k, y: (v.top - this.world.y) / k, w: (v.right - v.left) / k, h: (v.bottom - v.top) / k };
  }

  /** Công trường đang xây cho nhân vật: chỗ đứng, giàn giáo, đống vật liệu, chỗ chờ dọc lối đi. */
  private siteGeom(): SiteGeom | null {
    const g = this.builder.siteGeometry();
    if (!g || !this.map) return null;
    if (this.loiterCache.key !== g.itemId) {
      const r = g.rect;
      const top = Math.min(r.y + r.h * 0.4, g.baseY - 120);
      const area = { x: r.x - 160, y: top, w: r.w + 320, h: g.baseY + 220 - top };
      this.loiterCache = { key: g.itemId, pts: loiterPoints(this.map.paths ?? [], area) };
    }
    return { key: g.itemId, rect: g.rect, baseY: g.baseY, flat: g.flat, floor: g.floor, ledgers: g.ledgers, pile: g.pile, loiter: this.loiterCache.pts };
  }

  /** Nhân vật người xem đang có (server quyết định), thông số nhân vật, đơn vị công. */
  setActors(list: ActorInfo[], cfg: CharactersConfig, unit: string): void {
    this.chars.setActors(list, cfg, unit);
    this.builder.flags = cfg.flags;
  }

  /** Đám đông vô danh ở phòng rất đông (null ở chế độ khác). */
  setAnonCrowd(c: AnonCrowd | null): void {
    this.chars.setAnonCrowd(c);
  }

  /** Tượng võ tướng đá ở ô ghi danh. */
  setHonors(list: HonorInfo[]): void {
    this.chars.setHonors(list);
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

  // ---------- Cho bộ điều phối lễ (giai đoạn 5) ----------

  /** Hiệu ứng lễ trên bản đồ (đèn lồng, hoa đăng, bụi): trên cùng của thế giới. */
  addWorldFx(c: Container): void {
    this.world.addChild(c);
  }

  itemRectOf(itemId: string): MapRect | null {
    return this.map ? itemRect(this.map, itemId) : null;
  }

  /** Công trường đã hiện qua giai đoạn / hạng mục này chưa (giai đoạn null = cả hạng mục đã hiện xong). */
  isPast(itemId: string, stageIndex: number | null): boolean {
    const p = this.progress;
    if (!p) return false;
    const ci = p.items.findIndex((i) => i.id === itemId);
    if (ci < 0) return true;
    if (this.builder.doneCount() > ci) return true;
    const d = this.builder.displayStage();
    if (!d) return false;
    const di = p.items.findIndex((i) => i.id === d.itemId);
    if (di > ci) return true;
    return stageIndex !== null && di === ci && d.stage > stageIndex;
  }

  /** Khung các công trình đứng đang hiện (đã xong). */
  doneObjectRects(): MapRect[] {
    if (!this.map) return [];
    const status = this.displayStatus();
    return this.map.buildings
      .filter((b) => b.layer === 'object' && b.items.some((id) => status.get(id) === 'done'))
      .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  }

  /** Mặt nước hai bên hồ sen (đã xây xong) để thả hoa đăng; chưa xây thì rỗng. */
  pondWaters(): MapRect[] {
    if (!this.map || this.displayStatus().get(POND_ID) !== 'done') return [];
    const r = itemRect(this.map, POND_ID);
    if (!r) return [];
    const y = r.y + r.h * 0.4;
    const h = r.h * 0.42;
    return [
      { x: r.x + r.w * 0.08, y, w: r.w * 0.26, h },
      { x: r.x + r.w * 0.66, y, w: r.w * 0.26, h },
    ];
  }

  cameraRequest(mode: Exclude<CameraMode, 'site'>, focus: MapRect | null, sec: number, force = false): void {
    this.director.request(mode, focus, sec, force);
  }

  cameraRelease(): void {
    this.director.release();
  }

  pauseBuilder(on: boolean): void {
    this.builder.paused = on;
  }

  /** Cảnh khánh thành lặp (14.12): camera luân phiên lia giới thiệu và thu toàn cảnh. */
  setFinale(on: boolean): void {
    this.finale = on;
  }

  /** Tọa độ bản đồ → màn hình. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.world.x + x * this.world.scale.x, y: this.world.y + y * this.world.scale.y };
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
    this.chars.clear();
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
    drawOrder(map.buildings).forEach((b, i) => {
      const base = tex(b.file);
      if (!base) return;
      // Sắp lớp: nền luôn dưới cùng (theo thứ tự), công trình đứng theo đường chân (baseY), xen với nhân vật.
      const z = b.layer === 'ground' ? GROUND_Z + i : b.baseY;
      if (b.items.length === 1) this.addPiece(b.items[0]!, base, b.x, b.y, z);
      else this.addBands(b, base, z);
    });
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
    this.chars.setArt(art);
  }

  private addPiece(itemId: string, texture: Texture, x: number, y: number, z: number): void {
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    sprite.visible = false;
    sprite.zIndex = z;
    this.buildings.addChild(sprite);
    this.pieces.push({ itemId, sprite, z });
  }

  /** Bảo tháp: mỗi tầng một dải cắt ra từ cùng một ảnh. */
  private addBands(b: MapBuilding, base: Texture, z: number): void {
    b.items.forEach((itemId, k) => {
      const { top, bottom } = floorBand(b, k);
      const h = Math.max(1, Math.round(bottom - top));
      const frame = new Rectangle(0, Math.round(top - b.y), base.width, Math.min(h, base.height - Math.round(top - b.y)));
      this.addPiece(itemId, new Texture({ source: base.source, frame }), b.x, Math.round(top), z);
    });
  }

  /** Gắn công trường ngay sau ảnh của hạng mục đó, để giữ đúng thứ tự trước sau với công trình khác. */
  private attach(site: BuildSite): void {
    const piece = this.pieces.find((p) => p.itemId === site.target.itemId);
    const idx = piece ? this.buildings.getChildIndex(piece.sprite) + 1 : this.buildings.children.length;
    // Ngay trên ảnh của hạng mục đó: giàn giáo, đống vật liệu che công trình nhưng người đứng trước vẫn đè lên.
    site.container.zIndex = (piece?.z ?? site.target.building.baseY) + 0.25;
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
    this.chars.contribution(msg);
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
    // Cảnh khánh thành lặp: hết lượt thì lia giới thiệu, rồi thu toàn cảnh, cứ thế luân phiên.
    if (this.finale && this.director.mode === 'site') {
      const tour = this.finaleTurn++ % 2 === 0;
      this.director.request(tour ? 'tour' : 'overview', null, (tour ? this.cameraCfg.tourSec : this.cameraCfg.overviewSec) * 1.5);
    }
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
    this.chars.tick(dtSec);
  }
}
