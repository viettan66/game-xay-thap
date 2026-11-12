// Hiệu ứng lễ (mục 10), vẽ bằng code (ảnh fx/ của mục 14.11 là tùy chọn, chưa có thì không cần):
// - Đèn lồng đỏ treo trước công trình vừa xong, sáng dần, đung đưa (lớp bản đồ).
// - Pháo hoa trên trời (lớp màn hình, chỉ trong vùng khung hình), ít hạt hơn khi phòng rất đông.
// - Hoa đăng trôi trên mặt hồ sen (lớp bản đồ), khi hồ sen đã xây xong.
// - Chữ giai đoạn mới hiện ngắn (lớp màn hình) và vòng bụi ở chân công trình (lớp bản đồ) cho lễ giai đoạn thường.

import { Container, Graphics, Text } from 'pixi.js';
import type { MapRect } from '../../../shared/map.js';
import { C, FONT_BODY } from '../theme.js';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Đèn lồng ----------

interface Lantern {
  x: number;
  y: number;
  phase: number;
}

export class Lanterns {
  readonly g = new Graphics();
  private list: Lantern[] = [];
  private t = 0;
  private life = 0;
  private alpha = 0;
  private size = 1;

  /** Treo đèn dọc mái công trình (khung bản đồ `r`), sáng trong `sec` giây rồi tắt dần. */
  hang(r: MapRect, sec: number, heightMap: number): void {
    const n = Math.max(2, Math.min(6, Math.round(r.w / 110)));
    const y = r.y + r.h * 0.42;
    for (let i = 0; i < n; i++) this.list.push({ x: r.x + r.w * (0.18 + (0.64 * i) / Math.max(1, n - 1)), y, phase: Math.random() * 6 });
    this.life = Math.max(this.life, sec);
    this.size = heightMap / 54;
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  tick(dt: number): void {
    if (!this.list.length) return;
    this.t += dt;
    this.life -= dt;
    this.alpha = this.life > 1 ? Math.min(1, this.alpha + dt * 1.5) : Math.max(0, this.alpha - dt);
    const g = this.g.clear();
    const k = this.size;
    for (const l of this.list) {
      const sway = Math.sin(this.t * 1.6 + l.phase) * 0.12;
      const x = l.x + Math.sin(sway) * 14 * k;
      const y = l.y + (1 - Math.cos(sway)) * 14 * k;
      const glow = 0.28 + 0.08 * Math.sin(this.t * 3 + l.phase);
      g.circle(x, y, 26 * k).fill({ color: 0xffb347, alpha: glow * this.alpha });
      g.moveTo(l.x, l.y - 22 * k).lineTo(x, y - 9 * k).stroke({ width: 1.2 * k, color: 0x5a3a1e, alpha: this.alpha });
      g.ellipse(x, y, 8 * k, 10 * k).fill({ color: 0xd8342a, alpha: this.alpha });
      g.ellipse(x - 2.5 * k, y - 2 * k, 2.5 * k, 5 * k).fill({ color: 0xff8a5c, alpha: 0.6 * this.alpha });
      g.rect(x - 4 * k, y - 11 * k, 8 * k, 2.5 * k).fill({ color: 0xe2ae45, alpha: this.alpha });
      g.rect(x - 4 * k, y + 8.5 * k, 8 * k, 2.5 * k).fill({ color: 0xe2ae45, alpha: this.alpha });
      g.moveTo(x, y + 11 * k).lineTo(x, y + 17 * k).stroke({ width: 1.5 * k, color: 0xe2ae45, alpha: this.alpha });
    }
    if (this.life <= 0 && this.alpha <= 0) {
      this.list = [];
      g.clear();
    }
  }

  clear(): void {
    this.list = [];
    this.life = 0;
    this.alpha = 0;
    this.g.clear();
  }
}

// ---------- Pháo hoa ----------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: number;
}

interface Rocket {
  x: number;
  y: number;
  ty: number;
  vy: number;
  color: number;
}

const FIRE_COLORS = [0xffd54f, 0xff7043, 0xe91e63, 0x80deea, 0xb39ddb, 0xfff59d, 0x81c784];

export class Fireworks {
  readonly g = new Graphics();
  private sparks: Spark[] = [];
  private rockets: Rocket[] = [];
  private left = 0;
  private next = 0;
  /** Số hạt mỗi chùm (giảm khi phòng rất đông để giữ 60fps). */
  sparksPerBurst = 46;

  /** Bắn pháo hoa trong `sec` giây. */
  start(sec: number): void {
    this.left = Math.max(this.left, sec);
  }

  get active(): boolean {
    return this.left > 0 || this.sparks.length > 0 || this.rockets.length > 0;
  }

  tick(dt: number, view: { left: number; right: number; top: number; bottom: number }): void {
    if (this.left > 0) {
      this.left -= dt;
      this.next -= dt;
      if (this.next <= 0) {
        this.next = rnd(0.35, 0.8);
        const x = rnd(view.left + 80, view.right - 80);
        this.rockets.push({ x, y: view.top + (view.bottom - view.top) * 0.62, ty: rnd(view.top + 60, view.top + (view.bottom - view.top) * 0.32), vy: -rnd(520, 700), color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]! });
      }
    }
    const g = this.g.clear();
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.y += r.vy * dt;
      g.moveTo(r.x, r.y).lineTo(r.x, r.y + 22).stroke({ width: 3, color: r.color, alpha: 0.85 });
      g.circle(r.x, r.y, 3).fill({ color: 0xffffff, alpha: 0.95 });
      if (r.y <= r.ty) {
        this.rockets.splice(i, 1);
        const n = this.sparksPerBurst;
        const speed = rnd(150, 230);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
          const v = speed * rnd(0.75, 1.05);
          this.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(1.1, 1.6), color: Math.random() < 0.8 ? r.color : 0xffffff });
        }
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.t += dt;
      s.vx *= 1 - dt * 0.9;
      s.vy = s.vy * (1 - dt * 0.9) + 70 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t >= s.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      const a = 1 - s.t / s.life;
      g.circle(s.x, s.y, 5).fill({ color: s.color, alpha: 0.35 * a });
      g.circle(s.x, s.y, 2.4).fill({ color: s.color === 0xffffff ? 0xffffff : 0xfffbe8, alpha: a });
    }
  }

  clear(): void {
    this.left = 0;
    this.sparks = [];
    this.rockets = [];
    this.g.clear();
  }
}

// ---------- Hoa đăng ----------

interface Lotus {
  x: number;
  y: number;
  vx: number;
  phase: number;
  t: number;
  life: number;
  color: number;
}

export class LotusLanterns {
  readonly g = new Graphics();
  private list: Lotus[] = [];
  private time = 0;

  private k = 1.6;

  /** Thả `n` hoa đăng trên mặt hồ (các dải nước, tọa độ bản đồ), trôi trong khoảng `sec` giây; cỡ theo người (heightMap). */
  release(waters: MapRect[], n: number, sec: number, heightMap = 54): void {
    if (!waters.length) return;
    this.k = 1.7 * (heightMap / 54);
    for (let i = 0; i < n; i++) {
      const w = waters[i % waters.length]!;
      this.list.push({
        x: rnd(w.x, w.x + w.w),
        y: rnd(w.y, w.y + w.h),
        vx: rnd(-6, 6),
        phase: Math.random() * 6,
        t: -i * 0.25,
        life: sec * rnd(0.85, 1.1),
        color: Math.random() < 0.6 ? 0xf8bbd0 : 0xfff3e0,
      });
    }
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  tick(dt: number): void {
    this.time += dt;
    const g = this.g.clear();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i]!;
      l.t += dt;
      if (l.t >= l.life) {
        this.list.splice(i, 1);
        continue;
      }
      if (l.t < 0) continue;
      l.x += l.vx * dt;
      const a = Math.min(1, l.t / 1.2, (l.life - l.t) / 2);
      const k = this.k;
      const y = l.y + Math.sin(this.time * 1.4 + l.phase) * 1.5 * k;
      // Quầng sáng ấm, bóng nước, đế lá, cánh hoa, ngọn nến.
      g.circle(l.x, y - 6 * k, 20 * k).fill({ color: 0xffb74d, alpha: 0.28 * a });
      g.circle(l.x, y - 6 * k, 10 * k).fill({ color: 0xffe0b2, alpha: 0.35 * a });
      g.ellipse(l.x, y + 3 * k, 13 * k, 4 * k).fill({ color: 0xffcc80, alpha: 0.35 * a });
      g.ellipse(l.x, y + 1.5 * k, 11 * k, 3.6 * k).fill({ color: 0x3f7a3f, alpha: a });
      for (let j = -2; j <= 2; j++) g.ellipse(l.x + j * 3.6 * k, y - 2 * k - (2 - Math.abs(j)) * 1.4 * k, 3.3 * k, 6.2 * k).fill({ color: l.color, alpha: a });
      g.circle(l.x, y - 10 * k, (2.2 + Math.sin(this.time * 8 + l.phase) * 0.4) * k).fill({ color: 0xfff176, alpha: a });
    }
  }

  clear(): void {
    this.list = [];
    this.g.clear();
  }
}

// ---------- Chữ giai đoạn mới, vòng bụi ----------

export class StageBanner {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly text = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 30, fontWeight: '700', fill: C.cream, stroke: { color: 0x2a170b, width: 4 } } });
  private t = 0;
  private dur = 0;

  constructor() {
    this.text.anchor.set(0.5);
    this.container.addChild(this.bg, this.text);
    this.container.visible = false;
  }

  show(text: string, x: number, y: number, dur: number): void {
    this.text.text = text;
    const w = this.text.width + 36;
    this.bg.clear().roundRect(-w / 2, -26, w, 52, 26).fill({ color: C.redDark, alpha: 0.85 }).stroke({ width: 2, color: C.gold });
    this.container.position.set(x, y);
    this.t = 0;
    this.dur = dur;
    this.container.visible = true;
  }

  tick(dt: number): void {
    if (!this.container.visible) return;
    this.t += dt;
    const fade = Math.min(1, this.t / 0.25, Math.max(0, (this.dur - this.t) / 0.4));
    this.container.alpha = fade;
    this.container.scale.set(0.9 + 0.1 * Math.min(1, this.t / 0.25));
    if (this.t >= this.dur) this.container.visible = false;
  }
}

interface Ring {
  x: number;
  y: number;
  w: number;
  t: number;
}

export class DustRings {
  readonly g = new Graphics();
  private list: Ring[] = [];

  /** Vòng bụi tỏa ra ở chân công trình (tọa độ bản đồ, rộng w). */
  burst(x: number, y: number, w: number): void {
    this.list.push({ x, y, w, t: 0 });
  }

  tick(dt: number): void {
    const g = this.g.clear();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i]!;
      r.t += dt;
      if (r.t > 1.4) {
        this.list.splice(i, 1);
        continue;
      }
      const k = r.t / 1.4;
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2;
        g.circle(r.x + Math.cos(a) * r.w * (0.35 + k * 0.35), r.y + Math.sin(a) * 10 * (1 + k * 2), 8 + k * 14).fill({ color: 0xe8d9b8, alpha: 0.6 * (1 - k) });
      }
    }
  }

  clear(): void {
    this.list = [];
    this.g.clear();
  }
}
