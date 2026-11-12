// Hiệu ứng quà trên bản đồ (mục 9 "Hiệu ứng theo giá trị một lần tặng"):
// - Xe trâu chở đá (100–499 xu), voi chở gỗ (500–999 xu): đi theo đường chính từ mép bản đồ phía dưới (vào từ mép màn hình)
//   tới công trình đang xây, đổ vật liệu ra đống, rồi quay ra. Tối đa maxVehicles chiếc cùng lúc, thừa thì chờ lượt.
// - Đúc đại hồng chung (1.000–4.999 xu): chuông hiện lên từ khuôn đúc đỏ rực, rồi lắc và ngân (vòng sóng âm), tắt dần.
// Gạch, bó gỗ (dưới 100 xu): nhân vật của người tặng khiêng (actor.ts). Tượng võ tướng đá: honors.ts.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Art } from '../art.js';
import type { CharArt } from './charArt.js';
import { giftTag, type NameTag } from './labels.js';
import { enterStart, exitEnd, Polyline, stopBefore } from './route.js';
import type { Pt } from './spots.js';
import type { MapRect } from '../../../shared/map.js';
import type { PathPoint } from '../../../shared/paths.js';

export type VehicleKind = 'cart' | 'elephant';

/** Tốc độ (đơn vị bản đồ / giây, người cao 54) và cỡ hàng đổ xuống. */
const VEHICLE_SPEED: Record<VehicleKind, number> = { cart: 95, elephant: 80 };
const VEHICLE_PROP: Record<VehicleKind, string> = { cart: 'da', elephant: 'go' };
/** Chiều cao xe / voi so với một người (để đặt tên người tặng ngay trên đầu). */
const VEHICLE_HEIGHT: Record<VehicleKind, number> = { cart: 1.25, elephant: 2.2 };
const DUMP_SEC = 2.4;
const QUEUE_MAX = 8;

export interface FxWorld {
  route(from: Pt, to: Pt): PathPoint[];
  /** Điểm vào bản đồ của đường chính (mép dưới). */
  mainEntry(): Pt;
  view(): MapRect;
  pile(): Pt | null;
  /** Công trình đang xây (để xe dừng trước, không vòng ra sau). */
  site(): { rect: MapRect; baseY: number; flat: boolean } | null;
  /** Chỗ đặt chuông: trước công trình đang xây. */
  front(): Pt | null;
  dropAtPile(): void;
  heightMap(): number;
  /** Lớp hiệu ứng trên cùng của thế giới (vật liệu bay, bụi, sóng âm). */
  fx: Container;
}

interface Flight {
  s: Sprite;
  from: Pt;
  to: Pt;
  t: number;
  dur: number;
  land: () => void;
}

class Vehicle {
  readonly sprite = new Sprite();
  readonly tag: NameTag;
  private line: Polyline;
  private s: number;
  private end: number;
  private phase: 'in' | 'dump' | 'out' = 'in';
  private t = 0;
  private anim = 0;
  private up = true;
  private flipX = false;
  private dumped = 0;
  done = false;
  alpha = 0;

  constructor(
    readonly kind: VehicleKind,
    name: string,
    private readonly w: FxWorld,
    private readonly art: CharArt,
    private readonly fx: Effects,
  ) {
    this.tag = giftTag(name);
    const pile = w.pile();
    const target = pile ? { x: pile.x + 64, y: pile.y + 22 } : w.front() ?? w.mainEntry();
    const site = w.site();
    const pts = w.route(w.mainEntry(), target);
    this.line = new Polyline(site && !site.flat ? stopBefore(pts, site.rect, site.baseY) : pts);
    this.s = enterStart(this.line, w.view(), 60);
    this.end = this.line.length;
  }

  get pos(): Pt {
    const p = this.line.at(this.s);
    return { x: p.x, y: p.y };
  }

  /** Chỗ đặt tên người tặng (trên đầu xe / voi). */
  get top(): Pt {
    const p = this.pos;
    return { x: p.x, y: p.y - this.w.heightMap() * (VEHICLE_HEIGHT[this.kind] + 0.15) };
  }

  update(dt: number): void {
    this.anim += dt;
    const p0 = this.line.at(this.s);
    if (this.phase === 'in' || this.phase === 'out') {
      this.alpha = Math.min(1, this.alpha + dt * 3);
      this.s = Math.min(this.end, this.s + VEHICLE_SPEED[this.kind] * (this.w.heightMap() / 54) * dt);
      const p = this.line.at(this.s);
      if (Math.abs(p.dy) > 0.2) this.up = p.dy < 0;
      if (Math.abs(p.dx) > 0.2) this.flipX = p.dx < 0;
      if (this.s >= this.end) {
        if (this.phase === 'in') {
          this.phase = 'dump';
          this.t = 0;
        } else this.done = true;
      }
    } else {
      // Đổ vật liệu ra đống: 3 lượt bay vào đống, đống nảy lên.
      this.t += dt;
      const want = Math.min(3, Math.floor(this.t / 0.55) + 1);
      const pile = this.w.pile();
      while (this.dumped < want && pile) {
        this.dumped++;
        this.fx.fly(VEHICLE_PROP[this.kind], { x: p0.x, y: p0.y - this.w.heightMap() * 0.7 }, { x: pile.x, y: pile.y - 6 }, () => this.w.dropAtPile());
      }
      if (this.t >= DUMP_SEC) {
        // Quay ra: đi ngược lại đường cũ tới khi khuất khỏi màn hình.
        const back = [...this.line.pts].reverse();
        this.line = new Polyline(back);
        this.s = 0;
        this.end = exitEnd(this.line, this.w.view(), 60);
        this.phase = 'out';
      }
    }
    const dir = this.up ? 'up' : 'down';
    const frames = [1, 2, 3, 2];
    const moving = this.phase !== 'dump';
    const k = moving ? frames[Math.floor(this.anim * 5) % frames.length]! : 1;
    const ok = this.art.apply(this.sprite, `vehicles/${this.kind}_${dir}_${k}`, this.w.heightMap(), this.flipX);
    if (!ok) {
      this.sprite.texture = Texture.WHITE;
      this.sprite.visible = true;
      this.sprite.tint = this.kind === 'cart' ? 0x8a5a2e : 0x8d8d8d;
      this.sprite.anchor.set(0.5, 1);
      this.sprite.width = this.w.heightMap() * (this.kind === 'cart' ? 1.3 : 1.8);
      this.sprite.height = this.w.heightMap() * (this.kind === 'cart' ? 0.9 : 1.6);
    }
    const p = this.line.at(this.s);
    this.sprite.position.set(p.x, p.y);
    this.sprite.zIndex = p.y;
    this.sprite.alpha = this.alpha;
  }
}

class Bell {
  readonly root = new Container();
  private readonly bell = new Sprite();
  private readonly mold = new Graphics();
  private readonly waves = new Graphics();
  private readonly sparks: { g: Graphics; vx: number; vy: number; t: number }[] = [];
  readonly tag: NameTag;
  t = 0;
  done = false;
  static readonly DURATION = 7;

  constructor(
    name: string,
    readonly at: Pt,
    private readonly h: number,
    art: Art,
    private readonly fx: Container,
  ) {
    this.tag = giftTag(name);
    const tex = art.textures.get('items/bell') ?? null;
    if (tex) {
      this.bell.texture = tex;
      this.bell.anchor.set(0.5, 0.06);
      const k = (h * 2.6) / tex.height;
      this.bell.scale.set(k);
    } else {
      this.bell.texture = Texture.WHITE;
      this.bell.tint = 0xb8862e;
      this.bell.anchor.set(0.5, 0);
      this.bell.width = h * 2;
      this.bell.height = h * 2.6;
    }
    this.root.position.set(at.x, at.y);
    this.root.zIndex = at.y;
    this.root.addChild(this.mold, this.bell);
    this.waves.position.set(at.x, at.y - h * 1.5);
    fx.addChild(this.waves);
  }

  /** Đỉnh chuông (để đặt tên người tặng). */
  get top(): Pt {
    return { x: this.at.x, y: this.at.y - this.h * 2.95 };
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const h = this.h;
    const pivotY = -h * 2.75; // treo ở đỉnh
    // 0–1,6 giây: khuôn đúc đỏ rực, chuông nhô dần lên; tia lửa bắn ra.
    const rise = Math.min(1, t / 1.6);
    this.bell.position.set(0, pivotY + (1 - easeOut(rise)) * h * 0.9);
    this.bell.tint = mix(0xff7a2a, 0xffffff, Math.min(1, Math.max(0, (t - 0.8) / 1.2)));
    const moldA = t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) / 0.8);
    this.mold.clear();
    if (moldA > 0) {
      this.mold.ellipse(0, -2, h * 1.2, h * 0.3).fill({ color: 0x5a2a12, alpha: moldA });
      this.mold.ellipse(0, -4, h * 0.9, h * 0.18).fill({ color: 0xff8c2a, alpha: moldA * (0.6 + 0.4 * Math.sin(t * 18)) });
    }
    if (t < 1.8 && this.sparks.length < 18 && Math.random() < dt * 30) {
      const g = new Graphics().circle(0, 0, 1.6).fill(0xffd27a);
      g.position.set(this.at.x + (Math.random() - 0.5) * h, this.at.y - 6);
      this.fx.addChild(g);
      this.sparks.push({ g, vx: (Math.random() - 0.5) * 90, vy: -60 - Math.random() * 90, t: 0 });
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.t += dt;
      s.vy += 160 * dt;
      s.g.x += s.vx * dt;
      s.g.y += s.vy * dt;
      s.g.alpha = Math.max(0, 1 - s.t / 0.9);
      if (s.t > 0.9) {
        s.g.destroy();
        this.sparks.splice(i, 1);
      }
    }
    // 1,6–6 giây: chuông lắc qua lại, tắt dần; vòng sóng âm lan ra mỗi lần ngân.
    const swingT = Math.max(0, t - 1.6);
    this.bell.rotation = swingT > 0 ? Math.sin(swingT * 4.2) * 0.22 * Math.exp(-swingT * 0.45) : 0;
    this.waves.clear();
    if (swingT > 0) {
      for (let k = 0; k < 3; k++) {
        const wt = (swingT - k * 0.75) % 2.2;
        if (swingT < k * 0.75 || wt < 0 || swingT > 5.2) continue;
        const r = h * (0.9 + wt * 1.4);
        this.waves.ellipse(0, 0, r, r * 0.45).stroke({ width: 2.5, color: 0xffe28a, alpha: Math.max(0, 0.75 - wt * 0.35) });
      }
    }
    const fade = t > Bell.DURATION - 1 ? Math.max(0, Bell.DURATION - t) : Math.min(1, t * 3);
    this.root.alpha = fade;
    this.tag.root.alpha = fade;
    if (t >= Bell.DURATION) this.done = true;
  }

  destroy(): void {
    for (const s of this.sparks) s.g.destroy();
    this.waves.destroy();
    this.root.destroy({ children: true });
  }
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Xe trâu, voi, chuông đang chạy + vật liệu bay. Vẽ trong lớp sắp theo chân (depth); tên người tặng ở lớp màn hình. */
export class Effects {
  private vehicles: Vehicle[] = [];
  private queue: { kind: VehicleKind; name: string }[] = [];
  private bells: Bell[] = [];
  private flights: Flight[] = [];
  maxVehicles = 3;

  constructor(
    private readonly depth: Container,
    private readonly screen: Container,
    private art: Art,
    private charArt: CharArt,
    private readonly w: FxWorld,
  ) {}

  setArt(art: Art, charArt: CharArt): void {
    this.clear();
    this.art = art;
    this.charArt = charArt;
  }

  vehicle(kind: VehicleKind, name: string): void {
    if (this.vehicles.length < this.maxVehicles) this.launch(kind, name);
    else if (this.queue.length < QUEUE_MAX) this.queue.push({ kind, name });
  }

  private launch(kind: VehicleKind, name: string): void {
    const v = new Vehicle(kind, name, this.w, this.charArt, this);
    this.depth.addChild(v.sprite);
    this.screen.addChild(v.tag.root);
    this.vehicles.push(v);
  }

  bell(name: string): void {
    const at = this.w.front();
    if (!at) return;
    // Cùng lúc tối đa 2 quả chuông; quả sau đặt lệch sang bên.
    if (this.bells.length >= 2) return;
    const off = this.bells.length ? this.w.heightMap() * 3 : 0;
    const b = new Bell(name, { x: at.x + off, y: at.y }, this.w.heightMap(), this.art, this.w.fx);
    this.depth.addChild(b.root);
    this.screen.addChild(b.tag.root);
    this.bells.push(b);
  }

  /** Vật liệu bay theo đường vòng cung (đổ từ xe, voi ra đống). */
  fly(prop: string, from: Pt, to: Pt, land: () => void): void {
    const tex = this.art.textures.get(`props/${prop}_nho`) ?? null;
    const s = new Sprite(tex ?? Texture.WHITE);
    s.anchor.set(0.5);
    const size = this.w.heightMap() * 0.42;
    s.scale.set(size / (tex?.width ?? 1));
    if (!tex) {
      s.tint = 0xa07850;
      s.width = s.height = size;
    }
    s.position.set(from.x, from.y);
    this.w.fx.addChild(s);
    this.flights.push({ s, from, to, t: 0, dur: 0.6, land });
  }

  /** Khung tên người tặng trên màn hình (chữ nhân vật chồng lên thì nhường). */
  tagRects(): { x: number; y: number; w: number; h: number }[] {
    return [...this.vehicles.map((v) => v.tag), ...this.bells.map((b) => b.tag)]
      .filter((t) => t.root.visible && t.root.alpha > 0.1)
      .map((t) => ({ x: t.root.x - t.w / 2 - 2, y: t.root.y - t.h - 2, w: t.w + 4, h: t.h + 4 }));
  }

  /** Số xe đang chạy và đang chờ (cho test, trang công cụ). */
  get busy(): number {
    return this.vehicles.length + this.queue.length + this.bells.length;
  }

  tick(dt: number, toScreen: (x: number, y: number) => Pt): void {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i]!;
      v.update(dt);
      const top = v.top;
      const sp = toScreen(top.x, top.y);
      v.tag.root.position.set(sp.x, sp.y);
      v.tag.root.alpha = v.alpha;
      if (v.done) {
        v.sprite.destroy();
        v.tag.root.destroy({ children: true });
        this.vehicles.splice(i, 1);
      }
    }
    while (this.vehicles.length < this.maxVehicles && this.queue.length) {
      const q = this.queue.shift()!;
      this.launch(q.kind, q.name);
    }
    for (let i = this.bells.length - 1; i >= 0; i--) {
      const b = this.bells[i]!;
      b.update(dt);
      const sp = toScreen(b.top.x, b.top.y);
      b.tag.root.position.set(sp.x, sp.y);
      if (b.done) {
        b.destroy();
        b.tag.root.destroy({ children: true });
        this.bells.splice(i, 1);
      }
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const cx = (f.from.x + f.to.x) / 2;
      const cy = Math.min(f.from.y, f.to.y) - 50;
      const u = 1 - k;
      f.s.position.set(u * u * f.from.x + 2 * u * k * cx + k * k * f.to.x, u * u * f.from.y + 2 * u * k * cy + k * k * f.to.y);
      f.s.rotation = k * 3;
      if (k >= 1) {
        f.s.destroy();
        this.flights.splice(i, 1);
        f.land();
      }
    }
  }

  clear(): void {
    for (const v of this.vehicles) {
      v.sprite.destroy();
      v.tag.root.destroy({ children: true });
    }
    for (const b of this.bells) {
      b.destroy();
      b.tag.root.destroy({ children: true });
    }
    for (const f of this.flights) f.s.destroy();
    this.vehicles = [];
    this.bells = [];
    this.flights = [];
    this.queue = [];
  }
}
