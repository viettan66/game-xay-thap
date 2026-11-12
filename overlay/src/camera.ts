// Camera trên bản đồ quần thể chùa (mục 8 SPEC). Hàm thuần + bộ điều khiển không dùng PixiJS, có test.
//
// - Tỉ lệ nhỏ nhất: bản đồ vừa khít bề ngang khung 1080 (không bao giờ lộ ra ngoài mép bản đồ).
//   Tỉ lệ lớn nhất = nhỏ nhất × maxZoom (mặc định 1,6 = đúng độ phân giải ảnh bản đồ).
// - site: khung hình bao hạng mục đang xây, công trình chiếm `siteWidth` (45–60%) bề ngang, nằm giữa vùng nhìn thấy.
// - overview: thu toàn cảnh quần thể, lia chậm từ đỉnh xuống chân quần thể (bản đồ cao hơn khung hình).
// - tour: lia chậm từ trời xuống cổng tam quan.
// - ceremony: đẩy chậm vào công trình đang làm lễ.
// - Chuyển chế độ mượt: tâm khung và tỉ lệ (theo log) tiến dần tới đích. Quà lớn: rung nhẹ.

import type { MapRect } from '../../shared/map.js';
import type { CameraConfig, CameraMode } from '../../shared/protocol.js';

export const STAGE_W = 1080;
export const STAGE_H = 1920;

export interface MapCamera {
  scale: number;
  x: number;
  y: number;
}

/** Vùng màn hình thấy rõ bản đồ: trong vùng an toàn (giữa 180px trên, 600px dưới, trừ 150px bên phải). */
export interface CamView {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MapSize {
  width: number;
  height: number;
}

export function minScale(map: MapSize): number {
  return Math.max(STAGE_W / map.width, STAGE_H / map.height);
}

export function maxScale(map: MapSize, maxZoom: number): number {
  return minScale(map) * Math.max(1, maxZoom);
}

/** Giữ khung hình trong bản đồ: không lộ ra ngoài mép, tỉ lệ trong [nhỏ nhất, lớn nhất]. */
export function clampCamera(map: MapSize, cam: MapCamera, maxZoom: number): MapCamera {
  const scale = Math.max(minScale(map), Math.min(maxScale(map, maxZoom), cam.scale));
  const x = Math.max(STAGE_W - map.width * scale, Math.min(0, cam.x));
  const y = Math.max(STAGE_H - map.height * scale, Math.min(0, cam.y));
  return { scale, x, y };
}

const viewCenter = (v: CamView) => ({ x: (v.left + v.right) / 2, y: (v.top + v.bottom) / 2 });

/** Đặt điểm (mx, my) của bản đồ vào giữa vùng nhìn thấy với tỉ lệ scale. */
export function centerOn(map: MapSize, mx: number, my: number, scale: number, view: CamView, maxZoom: number): MapCamera {
  const c = viewCenter(view);
  return clampCamera(map, { scale, x: c.x - mx * scale, y: c.y - my * scale }, maxZoom);
}

/** Chế độ site: công trình chiếm siteWidth bề ngang khung, vừa chiều cao vùng nhìn thấy, nằm giữa. */
export function siteCamera(map: MapSize, focus: MapRect | null, view: CamView, cfg: Pick<CameraConfig, 'maxZoom' | 'siteWidth'>): MapCamera {
  if (!focus) return centerOn(map, map.width / 2, map.height / 2, minScale(map), view, cfg.maxZoom);
  let s = (STAGE_W * cfg.siteWidth) / Math.max(1, focus.w);
  s = Math.min(s, ((view.bottom - view.top) * 0.9) / Math.max(1, focus.h));
  s = Math.max(minScale(map), Math.min(maxScale(map, cfg.maxZoom), s));
  return centerOn(map, focus.x + focus.w / 2, focus.y + focus.h / 2, s, view, cfg.maxZoom);
}

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));

/** Chế độ overview: tỉ lệ nhỏ nhất; quần thể cao hơn vùng nhìn thấy thì lia từ đỉnh xuống chân trong t ∈ [0, 1]. */
export function overviewCamera(map: MapSize, complex: MapRect, view: CamView, t: number, maxZoom: number): MapCamera {
  const s = minScale(map);
  const viewH = view.bottom - view.top;
  const cx = complex.x + complex.w / 2;
  if (complex.h * s <= viewH) return centerOn(map, cx, complex.y + complex.h / 2, s, view, maxZoom);
  const yTop = view.top - complex.y * s; // đỉnh quần thể chạm mép trên vùng nhìn thấy
  const yBottom = view.bottom - (complex.y + complex.h) * s; // chân quần thể chạm mép dưới
  const k = easeInOut(t);
  const c = viewCenter(view);
  return clampCamera(map, { scale: s, x: c.x - cx * s, y: yTop + (yBottom - yTop) * k }, maxZoom);
}

/** Chế độ tour: từ trời (đỉnh bản đồ) lia xuống, dừng ở cổng tam quan; 15% thời gian cuối đứng yên. */
export function tourCamera(map: MapSize, target: MapRect | null, view: CamView, t: number, maxZoom: number): MapCamera {
  const s0 = minScale(map);
  const s1 = Math.min(maxScale(map, maxZoom), s0 * 1.25);
  const start = clampCamera(map, { scale: s0, x: 0, y: 0 }, maxZoom);
  const goal = target ? centerOn(map, target.x + target.w / 2, target.y + target.h / 2, s1, view, maxZoom) : start;
  const k = easeInOut(t / 0.85);
  return lerpPose(map, start, goal, k, view, maxZoom);
}

/** Chế độ ceremony: từ khung site đẩy chậm vào tâm công trình, tối đa ceremonyZoom lần (không quá maxZoom). */
export function ceremonyCamera(map: MapSize, focus: MapRect | null, view: CamView, cfg: CameraConfig, t: number): MapCamera {
  const base = siteCamera(map, focus, view, cfg);
  if (!focus) return base;
  const k = 1 - (1 - Math.max(0, Math.min(1, t))) ** 2;
  const s = base.scale * (1 + (cfg.ceremonyZoom - 1) * k);
  return centerOn(map, focus.x + focus.w / 2, focus.y + focus.h / 2, s, view, cfg.maxZoom);
}

// ---- Nội suy theo "tư thế": điểm bản đồ ở giữa vùng nhìn thấy + log tỉ lệ ----

interface Pose {
  mx: number;
  my: number;
  ls: number;
}

function toPose(cam: MapCamera, view: CamView): Pose {
  const c = viewCenter(view);
  return { mx: (c.x - cam.x) / cam.scale, my: (c.y - cam.y) / cam.scale, ls: Math.log(cam.scale) };
}

function fromPose(map: MapSize, p: Pose, view: CamView, maxZoom: number): MapCamera {
  return centerOn(map, p.mx, p.my, Math.exp(p.ls), view, maxZoom);
}

function lerpPose(map: MapSize, a: MapCamera, b: MapCamera, k: number, view: CamView, maxZoom: number): MapCamera {
  const pa = toPose(a, view);
  const pb = toPose(b, view);
  return fromPose(map, { mx: pa.mx + (pb.mx - pa.mx) * k, my: pa.my + (pb.my - pa.my) * k, ls: pa.ls + (pb.ls - pa.ls) * k }, view, maxZoom);
}

/** Rung nhẹ: lệch vài điểm ảnh, tắt dần trong `dur` giây. */
export function shakeOffset(t: number, dur = 0.6, amp = 7): { x: number; y: number } {
  if (t < 0 || t >= dur) return { x: 0, y: 0 };
  const a = amp * (1 - t / dur) ** 2;
  return { x: a * Math.sin(t * 61), y: a * Math.cos(t * 47) };
}

// ---- Bộ điều khiển: chọn chế độ, hẹn giờ overview / tour, chuyển mượt ----

export interface CameraInput {
  map: MapSize;
  view: CamView;
  cfg: CameraConfig;
  /** Khung hạng mục đang xây (tọa độ bản đồ), null nếu chưa có. */
  focus: MapRect | null;
  /** Khung bao toàn quần thể (cho overview). */
  complex: MapRect;
  /** Khung cổng tam quan (điểm dừng của tour). */
  tourTarget: MapRect | null;
}

const SITE_RATE = 1.6;
const PATH_RATE = 2.2;

export class CameraDirector {
  mode: CameraMode = 'site';
  /** Thời gian đã ở chế độ hiện tại (giây). */
  modeT = 0;
  private sinceOverview = 0;
  private sinceTour = 0;
  private pose: Pose | null = null;
  private shakeT = Infinity;
  private ceremonyFocus: MapRect | null = null;
  /** Lia ngắn tới một chỗ rồi quay về (quà lớn: tượng mới ở ô ghi danh, mục 8). */
  private peekFocus: MapRect | null = null;
  private peekLeft = 0;

  /** Admin bấm hoặc game gọi. Đang lễ thì không chen overview / tour vào. */
  request(mode: Exclude<CameraMode, 'site'>, focus?: MapRect | null): void {
    if (this.mode === 'ceremony' && mode !== 'ceremony') return;
    this.mode = mode;
    this.modeT = 0;
    if (mode === 'ceremony') this.ceremonyFocus = focus ?? null;
    if (mode === 'overview' || mode === 'tour') this.sinceOverview = 0;
    if (mode === 'tour') this.sinceTour = 0;
  }

  shake(): void {
    this.shakeT = 0;
  }

  /** Lia ngắn tới `focus` trong `sec` giây rồi quay về hạng mục đang xây. Chỉ khi đang ở chế độ thường (site). */
  peek(focus: MapRect, sec: number): void {
    if (this.mode !== 'site') return;
    this.peekFocus = focus;
    this.peekLeft = sec;
  }

  get peeking(): boolean {
    return this.peekFocus !== null && this.peekLeft > 0;
  }

  /** Lần cập nhật tới đặt camera thẳng vào chỗ (mở overlay, trang thử đổi hạng mục). */
  snap(): void {
    this.pose = null;
  }

  private duration(cfg: CameraConfig): number {
    if (this.mode === 'overview') return cfg.overviewSec;
    if (this.mode === 'tour') return cfg.tourSec;
    if (this.mode === 'ceremony') return cfg.ceremonySec;
    return Infinity;
  }

  /** Khung hình đích của chế độ hiện tại (chưa làm mượt). */
  target(inp: CameraInput): MapCamera {
    const dur = this.duration(inp.cfg);
    const t = Math.min(1, this.modeT / dur);
    switch (this.mode) {
      case 'overview':
        return overviewCamera(inp.map, inp.complex, inp.view, t, inp.cfg.maxZoom);
      case 'tour':
        return tourCamera(inp.map, inp.tourTarget, inp.view, t, inp.cfg.maxZoom);
      case 'ceremony':
        return ceremonyCamera(inp.map, this.ceremonyFocus ?? inp.focus, inp.view, inp.cfg, t);
      default:
        return siteCamera(inp.map, this.peeking ? this.peekFocus : inp.focus, inp.view, inp.cfg);
    }
  }

  update(dt: number, inp: CameraInput): MapCamera {
    // Hẹn giờ tự động (theo chế độ độ đông, 0 = không tự động); chỉ đếm khi đang ở site.
    if (this.peekLeft > 0) {
      this.peekLeft -= dt;
      if (this.peekLeft <= 0 || this.mode !== 'site') {
        this.peekLeft = 0;
        this.peekFocus = null;
      }
    }
    if (this.mode === 'site') {
      this.sinceOverview += dt;
      this.sinceTour += dt;
      if (inp.cfg.tourEverySec > 0 && this.sinceTour >= inp.cfg.tourEverySec) this.request('tour');
      else if (inp.cfg.overviewEverySec > 0 && this.sinceOverview >= inp.cfg.overviewEverySec) this.request('overview');
    } else {
      this.modeT += dt;
      if (this.modeT >= this.duration(inp.cfg)) {
        this.mode = 'site';
        this.modeT = 0;
        this.ceremonyFocus = null;
      }
    }

    const goal = toPose(this.target(inp), inp.view);
    if (!this.pose) this.pose = goal;
    else {
      const rate = this.mode === 'site' ? SITE_RATE : PATH_RATE;
      const k = 1 - Math.exp(-rate * Math.max(0, dt));
      this.pose = {
        mx: this.pose.mx + (goal.mx - this.pose.mx) * k,
        my: this.pose.my + (goal.my - this.pose.my) * k,
        ls: this.pose.ls + (goal.ls - this.pose.ls) * k,
      };
    }
    const cam = fromPose(inp.map, this.pose, inp.view, inp.cfg.maxZoom);
    this.shakeT += dt;
    const sh = shakeOffset(this.shakeT);
    // Rung lệch vài điểm ảnh, vẫn giữ trong mép bản đồ.
    return clampCamera(inp.map, { scale: cam.scale, x: cam.x + sh.x, y: cam.y + sh.y }, inp.cfg.maxZoom);
  }
}
