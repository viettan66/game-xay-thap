// Nền tạm: trời (đứng yên), núi xa (trôi chậm theo camera), mặt đất (đi cùng tháp).
// Giai đoạn 3 thay bằng ảnh bg/sky_upper.png và bg/background.png.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { STAGE_H, STAGE_W } from '../layout.js';
import { C } from '../theme.js';

export function createSky(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#6f92dc');
  g.addColorStop(0.4, '#b9aee6');
  g.addColorStop(0.58, '#f2c3c9');
  g.addColorStop(0.7, '#fcdcbc');
  g.addColorStop(1, '#fde6c6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sky = new Sprite(Texture.from(canvas));
  sky.width = STAGE_W;
  sky.height = STAGE_H;
  return sky;
}

export function createMountains(baseY: number): Container {
  const c = new Container();
  const far = new Graphics()
    .poly([0, baseY - 180, 140, baseY - 330, 260, baseY - 240, 420, baseY - 400, 560, baseY - 260, 700, baseY - 350, 860, baseY - 220, 1080, baseY - 310, 1080, baseY + 40, 0, baseY + 40])
    .fill({ color: 0xa7b4cf, alpha: 0.75 });
  const near = new Graphics()
    .poly([0, baseY - 90, 180, baseY - 200, 330, baseY - 120, 520, baseY - 230, 690, baseY - 110, 880, baseY - 190, 1080, baseY - 100, 1080, baseY + 40, 0, baseY + 40])
    .fill({ color: 0x8fa79a, alpha: 0.85 });
  // Dải mây mù quanh chân núi.
  const mist = new Graphics().rect(0, baseY - 70, STAGE_W, 90).fill({ color: 0xffffff, alpha: 0.35 });
  c.addChild(far, near, mist);
  return c;
}

export function createGround(baseY: number): Graphics {
  const g = new Graphics();
  g.rect(0, baseY - 6, STAGE_W, 2600).fill(C.ground);
  g.rect(0, baseY - 6, STAGE_W, 10).fill(C.groundDark);
  // Đường lát đá.
  for (let row = 0; row < 12; row++) {
    const y = baseY + 30 + row * 60;
    g.moveTo(0, y).lineTo(STAGE_W, y).stroke({ width: 2, color: C.groundDark, alpha: 0.5 });
    for (let x = (row % 2) * 70; x < STAGE_W; x += 140) {
      g.moveTo(x, y).lineTo(x, y + 60).stroke({ width: 2, color: C.groundDark, alpha: 0.4 });
    }
  }
  return g;
}
