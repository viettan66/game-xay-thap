// Múa lân khi đủ mục tiêu tim của phiên (phần thưởng, bảng 9A SPEC). Vẽ trong không gian màn hình, trên dải
// miễn trừ: người đánh trống, đánh chũm chọe đứng bên trái, ông Địa phe phẩy quạt bên phải; con lân đi vào,
// múa ở giữa rồi đi ra. Hoa giấy đỏ vàng rơi khắp màn hình. Ảnh: assets/game/festival/ (npm run assets:festival).
// Thiếu ảnh thì vẽ hình tạm, không crash.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Art } from '../art.js';
import { STAGE_H, type Rect } from '../layout.js';

interface Actor {
  sprite: Sprite;
  frames: Texture[];
  fps: number;
}

interface Confetti {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
}

const COLORS = [0xd8342a, 0xf2c14e, 0xffe08a, 0xe85d3a];

export class FestivalView {
  readonly container = new Container();
  private readonly actors = new Container();
  private readonly confettiLayer = new Container();
  private frames = new Map<string, Texture[]>();
  private lion: Actor | null = null;
  private others: Actor[] = [];
  private confetti: Confetti[] = [];
  private t = 0;
  private dur = 0;
  private spawnAcc = 0;

  constructor(private rect: Rect) {
    this.container.addChild(this.confettiLayer, this.actors);
    this.container.visible = false;
  }

  setArt(art: Art): void {
    this.frames.clear();
    for (const [name, n] of [
      ['lion_front', 4],
      ['lion_side', 4],
      ['drum', 2],
      ['cymbal', 2],
      ['ongdia', 2],
    ] as const) {
      const list: Texture[] = [];
      for (let i = 1; i <= n; i++) {
        const t = art.textures.get(`festival/${name}_${i}`);
        if (t) list.push(t);
      }
      if (list.length) this.frames.set(name, list);
    }
  }

  setRect(r: Rect): void {
    this.rect = r;
  }

  get active(): boolean {
    return this.t < this.dur;
  }

  private actor(name: string, x: number, fps: number): Actor {
    // Thiếu ảnh: khối màu đỏ tạm.
    const frames = this.frames.get(name) ?? [Texture.WHITE];
    const s = new Sprite(frames[0]!);
    s.anchor.set(0.5, 1);
    if (!this.frames.has(name)) {
      s.width = 120;
      s.height = 200;
      s.tint = 0xd8342a;
    }
    s.position.set(x, this.rect.y + this.rect.h);
    this.actors.addChild(s);
    return { sprite: s, frames, fps };
  }

  /** Bắt đầu màn múa lân (kéo dài durationMs). Đang múa mà đủ nấc nữa thì múa thêm. */
  start(durationMs: number): void {
    const r = this.rect;
    if (this.active) {
      this.dur = Math.max(this.dur, this.t + durationMs / 1000);
      return;
    }
    this.actors.removeChildren().forEach((c) => c.destroy());
    this.t = 0;
    this.dur = durationMs / 1000;
    // Ban nhạc đứng bên phải chỗ trụ trì (trụ trì đứng góc trái), ông Địa ở mép phải.
    this.others = [this.actor('drum', r.x + 320, 4), this.actor('cymbal', r.x + 450, 3.3), this.actor('ongdia', r.x + r.w - 120, 2.5)];
    this.lion = this.actor('lion_side', r.x - 200, 7);
    this.container.visible = true;
  }

  tick(dt: number): void {
    if (!this.container.visible) return;
    this.t += dt;
    const r = this.rect;
    const k = this.t / Math.max(0.1, this.dur);
    // Hiện / ẩn mờ dần.
    this.container.alpha = Math.max(0, Math.min(1, this.t / 0.5, (this.dur - this.t) / 0.6));
    for (const a of this.others) a.sprite.texture = a.frames[Math.floor(this.t * a.fps) % a.frames.length]!;
    const lion = this.lion;
    if (lion) {
      // 0–30%: đi vào giữa; 30–75%: múa nhìn thẳng (nhún nhảy); 75–100%: đi ra bên phải.
      const mid = r.x + r.w * 0.66;
      const side = this.frames.get('lion_side');
      const front = this.frames.get('lion_front');
      let x: number;
      let frames = side ?? lion.frames;
      let bob = 0;
      if (k < 0.3) x = r.x - 200 + (mid - (r.x - 200)) * (k / 0.3);
      else if (k < 0.75) {
        x = mid + Math.sin(this.t * 2.2) * 40;
        frames = front ?? frames;
        bob = Math.abs(Math.sin(this.t * 5)) * 18;
      } else x = mid + (r.x + r.w + 220 - mid) * ((k - 0.75) / 0.25);
      lion.sprite.texture = frames[Math.floor(this.t * (k >= 0.3 && k < 0.75 ? 5 : lion.fps)) % frames.length]!;
      lion.sprite.position.set(x, r.y + r.h - bob);
    }
    // Hoa giấy rơi.
    this.spawnAcc += dt * (k < 0.85 ? 40 : 0);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const g = new Graphics().rect(-4, -7, 8, 14).fill(COLORS[Math.floor(Math.random() * COLORS.length)]!);
      g.position.set(Math.random() * (r.x + r.w), -20);
      this.confettiLayer.addChild(g);
      this.confetti.push({ g, vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 120, spin: (Math.random() - 0.5) * 8 });
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i]!;
      c.g.x += c.vx * dt + Math.sin(this.t * 3 + i) * 0.6;
      c.g.y += c.vy * dt;
      c.g.rotation += c.spin * dt;
      c.g.scale.x = Math.cos(this.t * 6 + i);
      if (c.g.y > STAGE_H + 20) {
        c.g.destroy();
        this.confetti.splice(i, 1);
      }
    }
    if (this.t >= this.dur && this.container.alpha <= 0.01) {
      this.container.visible = false;
      this.actors.removeChildren().forEach((c) => c.destroy());
      for (const c of this.confetti) c.g.destroy();
      this.confetti = [];
      this.lion = null;
      this.others = [];
    }
  }
}
