// "Bộ não" của một nhân vật trên bản đồ (mục 9). Thuần (không vẽ), có test với thế giới giả.
// Đi từ mép màn hình vào theo lối đi tới chỗ làm việc ở hạng mục đang xây, làm động tác hợp với giai đoạn,
// thỉnh thoảng đi lại giữa đống vật liệu và công trình; thả tim thì làm nhanh hơn; quà nhỏ / tim chưa đủ một mảnh thì
// khiêng vật liệu ra đống; hết giờ thì đi ra khỏi màn hình. Chỗ đứng trên giàn giáo thì trèo lên, trèo xuống.

import type { CharLook } from '../../../shared/characters.js';
import type { MapRect } from '../../../shared/map.js';
import type { PathPoint } from '../../../shared/paths.js';
import { enterStart, exitEnd, facing, Polyline } from './route.js';
import { loopFrame, walkFrame, type CarryKind, type LookFrames } from './sprites.js';
import type { Pt, SiteGeom, Spot, SpotPool } from './spots.js';

/** Tốc độ (đơn vị bản đồ / giây) khi người cao 54 đơn vị. */
export const SPEED = { walk: 82, carry: 62, climb: 36 } as const;
/** Đi thẳng (không theo lối đi) khi đích gần hơn chừng này. */
export const DIRECT_DIST = 260;

export interface ActorWorld {
  /** Đường đi theo mạng lối đi. */
  route(from: Pt, to: Pt): PathPoint[];
  /** Điểm ở mép bản đồ để đi vào / đi ra. */
  edgePoint(rand: () => number): Pt;
  /** Khung đang nhìn thấy (tọa độ bản đồ). */
  view(): MapRect;
  site(): SiteGeom | null;
  pool: SpotPool;
  /** Việc hợp với giai đoạn đang xây (theo kiểu nhân vật), và tỉ lệ người làm trên giàn giáo. */
  actions(look: CharLook): string[];
  scaffoldShare(): number;
  /** Vật liệu của giai đoạn đang xây (để khiêng đúng loại). */
  material(): CarryKind;
  /** Đặt vật liệu xuống đống (đống nảy lên, bụi). */
  dropAtPile(actorId: string): void;
  rand: () => number;
  /** Hệ số tốc độ theo chiều cao người (heightMap / 54). */
  scale: number;
}

type Task =
  | { type: 'walk'; line: Polyline; s: number; end: number; speed: number; climb?: boolean }
  | { type: 'wait'; t: number; dur: number; pose: 'work' | 'stand' }
  | { type: 'do'; fn: () => void };

export interface ActorPose {
  x: number;
  y: number;
  /** Khóa ảnh trong manifest, null = thiếu ảnh (vẽ hình tạm). */
  sprite: string | null;
  flip: boolean;
  /** Nhún lên xuống (đơn vị bản đồ, âm = lên). */
  bob: number;
  /** Đang ở trên giàn giáo (hoặc đang trèo): vẽ trước công trình. */
  scaffold: boolean;
  alpha: number;
}

export class Actor {
  x: number;
  y: number;
  carrying: CarryKind | null = null;
  leaving = false;
  gone = false;
  onScaffold = false;
  /** Việc đang làm (tên ảnh). */
  action: string | null = null;
  private tasks: Task[] = [];
  private anim = 0;
  private boostT = 0;
  private dir: { dir: 'down' | 'up' | 'right'; flip: boolean } = { dir: 'down', flip: false };
  private siteKey = '';
  private spot: Spot | null = null;
  private moving = false;
  private climbing = false;
  private alpha = 1;
  /** Đang đi một chuyến khiêng vật liệu (không nhận chuyến khác). */
  private trip = false;
  /** Chưa vào được vì công trường chưa sẵn sàng: vào ngay khi có (đứng sẵn hay đi từ mép khung hình). */
  private deferred: 'snap' | 'walk' | null = null;
  /** Chân thang của chỗ đang đứng trên giàn giáo (để trèo xuống). */
  private climbBase: number | null = null;
  /** Nhịp làm việc: dân phu NPC chậm hơn người xem (mục 9B, config npc.pace). Không áp khi đi ra. */
  pace = 1;

  constructor(
    readonly id: string,
    readonly look: CharLook,
    private readonly frames: LookFrames | undefined,
    start: Pt,
  ) {
    this.x = start.x;
    this.y = start.y;
  }

  /** Đi từ mép màn hình vào (mở overlay giữa chừng thì `snap` = đặt thẳng vào chỗ làm). */
  enter(w: ActorWorld, snap: boolean): void {
    const site = w.site();
    // Công trường chưa dựng xong (vừa mở overlay, đang tải ảnh): chờ, có công trường rồi mới vào (không đi bộ từ tận mép bản đồ).
    if (!site) {
      this.deferred = snap ? 'snap' : 'walk';
      this.alpha = snap ? 1 : 0;
      return;
    }
    this.deferred = null;
    this.alpha = 1;
    const spot = this.claim(w, site);
    if (snap && spot) {
      this.x = spot.x;
      this.y = spot.y;
      this.onScaffold = spot.kind === 'scaffold';
      if (this.onScaffold) this.climbBase = groundOf(spot).y;
      return;
    }
    const from = w.edgePoint(w.rand);
    const target = spot ? groundOf(spot) : null;
    if (!target) {
      this.x = from.x;
      this.y = from.y;
      return;
    }
    const line = new Polyline(w.route(from, target));
    const s0 = enterStart(line, w.view());
    const p = line.at(s0);
    this.x = p.x;
    this.y = p.y;
    this.tasks.push({ type: 'walk', line, s: s0, end: line.length, speed: SPEED.walk });
    if (spot?.kind === 'scaffold') this.pushClimb(spot.y, true);
  }

  /** Hết giờ hoặc nhường chỗ: đi ra khỏi màn hình. */
  leave(w: ActorWorld): void {
    if (this.leaving) return;
    this.leaving = true;
    this.trip = false;
    const gy = this.groundY(w);
    w.pool.release(this.id);
    this.spot = null;
    this.tasks = [];
    if (this.onScaffold) this.pushClimb(gy, false);
    const to = w.edgePoint(w.rand);
    const startPt = { x: this.x, y: this.onScaffold ? gy : this.y };
    const line = new Polyline(w.route(startPt, to));
    this.tasks.push({ type: 'walk', line, s: 0, end: exitEnd(line, w.view()), speed: SPEED.walk * 1.25 });
    this.tasks.push({ type: 'do', fn: () => (this.gone = true) });
  }

  /** Thả tim, bình luận: làm nhanh hơn trong vài giây (mục 9). */
  boost(sec: number): void {
    this.boostT = Math.max(this.boostT, sec);
  }

  get boosted(): boolean {
    return this.boostT > 0;
  }

  /** Khiêng vật liệu ra đống (tim / bình luận chưa đủ một mảnh, quà gạch / bó gỗ). Bận thì thôi. */
  carryTrip(w: ActorWorld, kind: CarryKind): boolean {
    if (this.leaving || this.trip) return false;
    const site = w.site();
    if (!site) return false;
    this.trip = true;
    this.tasks = [];
    this.carrying = kind;
    const back = this.spot;
    this.goTo(w, { x: site.pile.x + 14, y: site.pile.y + 4 }, SPEED.carry);
    this.tasks.push({
      type: 'do',
      fn: () => {
        this.carrying = null;
        w.dropAtPile(this.id);
      },
    });
    this.tasks.push({ type: 'wait', t: 0, dur: 0.4, pose: 'stand' });
    if (back) this.goTo(w, back, SPEED.walk, { x: site.pile.x + 14, y: site.pile.y + 4 });
    this.tasks.push({ type: 'do', fn: () => (this.trip = false) });
    return true;
  }

  /** Vị trí tay (để mảnh vật liệu bay từ tay dân phu đứng gần, mục 7.5). */
  hand(heightMap: number): Pt {
    return { x: this.x, y: this.y - heightMap * 0.62 };
  }

  /** Đang đứng làm việc ở công trường. */
  get working(): boolean {
    return !this.leaving && !this.moving && this.action !== null;
  }

  private groundY(w: ActorWorld): number {
    return this.climbBase ?? this.spot?.climbY ?? (w.site()?.baseY ?? this.y - 8) + 8;
  }

  private claim(w: ActorWorld, site: SiteGeom): Spot | null {
    this.siteKey = site.key;
    const s = w.pool.claim(this.id, w.rand() < w.scaffoldShare(), w.rand);
    this.spot = s;
    return s;
  }

  /** Thêm các bước đi tới một điểm: trèo xuống (nếu đang trên giàn giáo), đi (thẳng nếu gần, theo lối đi nếu xa), trèo lên. */
  private goTo(w: ActorWorld, target: Spot | Pt, speed: number, fromOverride?: Pt): void {
    let from: Pt = fromOverride ?? { x: this.x, y: this.y };
    if (!fromOverride && this.onScaffold) {
      const gy = this.groundY(w);
      this.pushClimb(gy, false);
      from = { x: this.x, y: gy };
    }
    const dest = 'kind' in target ? groundOf(target) : target;
    const pts: PathPoint[] = Math.hypot(dest.x - from.x, dest.y - from.y) < DIRECT_DIST ? [[from.x, from.y], [dest.x, dest.y]] : w.route(from, dest);
    const line = new Polyline(pts);
    if (line.length > 0.5) this.tasks.push({ type: 'walk', line, s: 0, end: line.length, speed });
    if ('kind' in target && target.kind === 'scaffold') this.pushClimb(target.y, true);
  }

  private pushClimb(toY: number, up: boolean): void {
    this.tasks.push({
      type: 'do',
      fn: () => {
        if (up) this.climbBase = this.y;
        const line = new Polyline([
          [this.x, this.y],
          [this.x, toY],
        ]);
        this.tasks.unshift({ type: 'walk', line, s: 0, end: line.length, speed: SPEED.climb, climb: true });
        this.onScaffold = true;
      },
    });
    if (!up)
      this.tasks.push({
        type: 'do',
        fn: () => {
          this.onScaffold = false;
          this.climbBase = null;
        },
      });
  }

  private plan(w: ActorWorld): void {
    const site = w.site();
    if (!site) {
      this.tasks.push({ type: 'wait', t: 0, dur: 1, pose: 'stand' });
      return;
    }
    if (this.deferred) {
      this.enter(w, this.deferred === 'snap');
      return;
    }
    // Đổi hạng mục, hoặc chỗ đứng không còn (giàn giáo thấp xuống): nhận chỗ mới rồi đi tới.
    const mine = w.pool.spotOf(this.id);
    if (site.key !== this.siteKey || !mine) {
      const s = this.claim(w, site);
      if (s) this.goTo(w, s, SPEED.walk);
      else this.tasks.push({ type: 'wait', t: 0, dur: 1, pose: 'stand' });
      return;
    }
    this.spot = mine;
    const acts = w.actions(this.look);
    this.action = acts.length ? acts[Math.floor(w.rand() * acts.length)]! : null;
    this.tasks.push({ type: 'wait', t: 0, dur: 7 + w.rand() * 8, pose: this.action ? 'work' : 'stand' });
    // Thỉnh thoảng đi lấy vật liệu ở đống mang về (đi lại giữa đống vật liệu và công trình), hoặc đổi chỗ làm.
    const r = w.rand();
    if (r < 0.3 && mine.kind !== 'loiter') {
      const pile = { x: site.pile.x + 14, y: site.pile.y + 4 };
      const kind = w.material();
      this.goTo(w, pile, SPEED.walk);
      this.tasks.push({ type: 'wait', t: 0, dur: 0.5, pose: 'stand' });
      this.tasks.push({ type: 'do', fn: () => (this.carrying = kind) });
      this.goTo(w, mine, SPEED.carry, pile);
      this.tasks.push({ type: 'do', fn: () => (this.carrying = null) });
    } else if (r < 0.4) {
      w.pool.release(this.id);
      this.siteKey = '';
    }
  }

  update(dt: number, w: ActorWorld): void {
    const k = (this.boostT > 0 ? 1.6 : 1) * (this.leaving ? 1 : this.pace);
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    this.anim += dt * k;
    if (this.gone) return;
    if (!this.tasks.length && !this.leaving) this.plan(w);
    let guard = 0;
    let left = dt;
    while (this.tasks.length && left > 0 && guard++ < 20) {
      const t = this.tasks[0]!;
      if (t.type === 'do') {
        this.tasks.shift();
        t.fn();
        continue;
      }
      if (t.type === 'wait') {
        this.moving = false;
        this.climbing = false;
        // Đổi hạng mục hoặc chỗ đứng không còn (giàn giáo thấp xuống): thôi làm, đi chỗ mới ngay.
        if (t.pose === 'work' && !this.leaving && (w.site()?.key !== this.siteKey || !w.pool.spotOf(this.id))) {
          this.tasks.shift();
          continue;
        }
        if (t.pose === 'stand') this.action = null;
        t.t += left * (t.pose === 'work' ? k : 1);
        if (t.t < t.dur) return;
        left = 0;
        this.tasks.shift();
        continue;
      }
      this.moving = true;
      this.climbing = !!t.climb;
      if (!t.climb) this.action = null;
      const step = t.speed * w.scale * k * left;
      t.s = Math.min(t.end, t.s + step);
      const p = t.line.at(t.s);
      this.x = p.x;
      this.y = p.y;
      if (!t.climb && (p.dx !== 0 || p.dy !== 0)) this.dir = facing(p.dx, p.dy);
      if (t.s < t.end) return;
      left = 0;
      this.tasks.shift();
      this.moving = false;
      this.climbing = false;
    }
    if (this.leaving && !this.tasks.length) this.gone = true;
  }

  /** Tắt dần (đi ra xong, hoặc bị đẩy ra khi đổi bản đồ). */
  fade(dt: number): boolean {
    this.alpha = Math.max(0, this.alpha - dt * 2.5);
    return this.alpha <= 0;
  }

  pose(): ActorPose {
    const f = this.frames;
    let sprite: string | null = null;
    let bob = 0;
    let flip = this.dir.flip;
    if (f) {
      if (this.climbing) {
        sprite = walkFrame(f.walk.up, this.anim, 5);
        flip = false;
      } else if (this.carrying && (this.moving || f.carry[this.carrying].length)) {
        const fr = f.carry[this.carrying];
        sprite = loopFrame(fr, this.anim, 3) ?? walkFrame(f.walk[this.dir.dir], this.anim);
        if (this.moving) bob = -Math.abs(Math.sin(this.anim * Math.PI * 3)) * 2.2;
      } else if (this.moving) {
        sprite = walkFrame(f.walk[this.dir.dir], this.anim);
        bob = -Math.abs(Math.sin(this.anim * Math.PI * 4)) * 1.2;
      } else if (this.action && f.work.get(this.action)?.length) {
        sprite = loopFrame(f.work.get(this.action)!, this.anim, 2.4);
      } else {
        sprite = f.walk.down[0] ?? f.walk.right[0] ?? null;
        flip = false;
      }
    }
    return { x: this.x, y: this.y, sprite, flip, bob, scaffold: this.onScaffold || this.climbing, alpha: this.alpha };
  }
}

/** Chỗ dưới đất ứng với chỗ đứng (giàn giáo: chân thang). */
function groundOf(s: Spot): Pt {
  return s.kind === 'scaffold' ? { x: s.x, y: s.climbY ?? s.y } : { x: s.x, y: s.y };
}
