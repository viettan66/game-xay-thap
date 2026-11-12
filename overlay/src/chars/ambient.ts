// Công trường tự chạy (mục 9B), giảm dần khi đông (số giây theo chế độ trong config ambient):
// - chim bay ngang khung hình thành đàn nhỏ (vẽ bằng code, lớp màn hình);
// - xe trâu NPC chở vật liệu chạy qua mỗi vài phút (không có tên người tặng, khác với xe trâu do quà);
// - cờ bay: vẽ ở công trường (build/builder.ts).
// Ánh sáng theo giờ thật trong ngày làm cùng phần ngày đêm, thời tiết (giai đoạn 5c, mục 14.14).

import { Container, Graphics } from 'pixi.js';
import { nextDelay } from './schedule.js';

export { NpcCartTimer } from './schedule.js';

interface Bird {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  size: number;
  phase: number;
}

export class Birds {
  readonly container = new Container();
  private birds: Bird[] = [];
  private t = 0;
  private wait: number | null = null;

  constructor(private readonly rand: () => number = Math.random) {}

  get flying(): number {
    return this.birds.length;
  }

  /** Cho một đàn bay qua ngay (trang thử, test). */
  launch(view: { left: number; right: number; top: number; bottom: number }): void {
    const n = 3 + Math.floor(this.rand() * 5);
    const fromLeft = this.rand() < 0.5;
    const y0 = view.top + 40 + this.rand() * Math.max(40, (view.bottom - view.top) * 0.3);
    const speed = (90 + this.rand() * 50) * (fromLeft ? 1 : -1);
    for (let i = 0; i < n; i++) {
      const g = new Graphics();
      this.container.addChild(g);
      // Đội hình chữ V lỏng.
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      this.birds.push({
        g,
        x: (fromLeft ? view.left - 30 : view.right + 30) - Math.sign(speed) * row * 22,
        y: y0 + side * row * 12 + (this.rand() - 0.5) * 6,
        vx: speed * (0.95 + this.rand() * 0.1),
        size: 6 + this.rand() * 4,
        phase: this.rand() * Math.PI * 2,
      });
    }
  }

  tick(dt: number, everySec: number, view: { left: number; right: number; top: number; bottom: number }): void {
    this.t += dt;
    if (this.wait === null) this.wait = nextDelay(everySec, this.rand) * 0.5;
    this.wait -= dt;
    if (this.wait <= 0 && !this.birds.length) {
      this.launch(view);
      this.wait = nextDelay(everySec, this.rand);
    } else if (!Number.isFinite(this.wait) && everySec > 0) this.wait = nextDelay(everySec, this.rand);
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]!;
      b.x += b.vx * dt;
      b.y += Math.sin(this.t * 1.3 + b.phase) * 4 * dt;
      const flap = Math.sin(this.t * 9 + b.phase) * 0.55;
      const s = b.size;
      b.g
        .clear()
        .moveTo(b.x - s, b.y - s * (0.35 + flap * 0.6))
        .quadraticCurveTo(b.x - s * 0.45, b.y - s * 0.2, b.x, b.y)
        .quadraticCurveTo(b.x + s * 0.45, b.y - s * 0.2, b.x + s, b.y - s * (0.35 + flap * 0.6))
        .stroke({ width: 1.8, color: 0x3b3530, alpha: 0.75 });
      if ((b.vx > 0 && b.x > view.right + 60) || (b.vx < 0 && b.x < view.left - 60)) {
        b.g.destroy();
        this.birds.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const b of this.birds) b.g.destroy();
    this.birds = [];
  }
}
