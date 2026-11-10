// Trời và nền (mục 8 SPEC):
// - Trời (bg/sky_upper.png) nối phía trên nền, trôi theo camera với hệ số 0,25.
// - Nền (bg/background.png, có bệ móng) trôi với hệ số 0,5. Mép trên của nền mờ dần trên đoạn skyOverlap
//   (mặc định 150px) chồng lên trời, để không lộ vệt nối.
// - Phía trên ảnh trời và phía dưới (lộ ra khi nền trôi xuống) tô bằng màu lấy từ mép ảnh trời.
// Thiếu ảnh thì vẽ trời, núi, mặt đất tạm như giai đoạn 2.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { BG_KEY, SKY_KEY } from '../../../shared/manifest.js';
import type { Art } from '../art.js';
import { STAGE_H, STAGE_W } from '../layout.js';
import { C } from '../theme.js';

export const PARALLAX_SKY = 0.25;
export const PARALLAX_LAND = 0.5;
const FAR = 200_000; // đủ cao cho tháp 100 tầng
const SKY_FADE = 260; // mép dưới ảnh trời mờ dần trên đoạn này

function edgeColor(bmp: ImageBitmap, fromTop: boolean): number {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, fromTop ? 0 : bmp.height - 8, bmp.width, 8, 0, 0, 64, 8);
  const d = ctx.getImageData(0, 0, 64, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]!;
    g += d[i + 1]!;
    b += d[i + 2]!;
  }
  const n = d.length / 4;
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

/** Ảnh trời mờ dần ở mép dưới để nhập vào màu nền phía dưới, không lộ vệt khi nền trôi xa (camera lên cao). */
function fadedBottom(bmp: ImageBitmap, fade: number): Texture {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(Math.max(0, 1 - fade / c.height), 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return Texture.from(c);
}

function fadedTop(bmp: ImageBitmap, overlap: number): Texture {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  if (overlap > 0) {
    // destination-in xoá mọi thứ nằm ngoài hình được tô, nên phải tô phủ cả ảnh:
    // trong suốt ở mép trên, đục hoàn toàn từ `overlap` trở xuống.
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(Math.min(1, overlap / c.height), 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return Texture.from(c);
}

export class Backdrop {
  readonly sky = new Container();
  readonly land = new Container();
  private owned: Texture[] = [];

  build(art: Art, towerBaseY: number): void {
    this.clear();
    const overlap = art.manifest?.background.skyOverlap ?? 150;
    const skyBmp = art.bitmaps.get(SKY_KEY);
    const bgBmp = art.bitmaps.get(BG_KEY);

    if (skyBmp) {
      const top = edgeColor(skyBmp, true);
      const bottom = edgeColor(skyBmp, false);
      const skyY = -STAGE_H + overlap;
      const skyTex = fadedBottom(skyBmp, SKY_FADE);
      this.owned.push(skyTex);
      const sprite = new Sprite(skyTex);
      sprite.width = STAGE_W;
      sprite.height = STAGE_H;
      sprite.y = skyY;
      this.sky.addChild(
        new Graphics().rect(0, skyY - FAR, STAGE_W, FAR + 1).fill(top),
        // Lót màu dưới cả phần ảnh trời đang mờ dần, để không lộ nền đen.
        new Graphics().rect(0, skyY + STAGE_H - SKY_FADE, STAGE_W, FAR).fill(bottom),
        sprite,
      );
    } else {
      this.sky.addChild(placeholderSky());
    }

    if (bgBmp) {
      const tex = fadedTop(bgBmp, overlap);
      this.owned.push(tex);
      const sprite = new Sprite(tex);
      sprite.width = STAGE_W;
      sprite.height = STAGE_H;
      this.land.addChild(sprite);
    } else {
      this.land.addChild(placeholderMountains(towerBaseY), placeholderGround(towerBaseY));
    }
  }

  /** camera: độ dịch của tháp (dương = nhìn lên cao). */
  update(camera: number): void {
    this.sky.y = camera * PARALLAX_SKY;
    this.land.y = camera * PARALLAX_LAND;
  }

  private clear(): void {
    this.sky.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.land.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const t of this.owned) t.destroy(true);
    this.owned = [];
  }
}

function placeholderSky(): Container {
  const c = new Container();
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
  c.addChild(new Graphics().rect(0, -FAR, STAGE_W, FAR).fill(0x6f92dc), sky, new Graphics().rect(0, STAGE_H, STAGE_W, FAR).fill(0xfde6c6));
  return c;
}

function placeholderMountains(baseY: number): Container {
  const c = new Container();
  c.addChild(
    new Graphics()
      .poly([0, baseY - 180, 140, baseY - 330, 260, baseY - 240, 420, baseY - 400, 560, baseY - 260, 700, baseY - 350, 860, baseY - 220, 1080, baseY - 310, 1080, baseY + 40, 0, baseY + 40])
      .fill({ color: 0xa7b4cf, alpha: 0.75 }),
    new Graphics()
      .poly([0, baseY - 90, 180, baseY - 200, 330, baseY - 120, 520, baseY - 230, 690, baseY - 110, 880, baseY - 190, 1080, baseY - 100, 1080, baseY + 40, 0, baseY + 40])
      .fill({ color: 0x8fa79a, alpha: 0.85 }),
  );
  return c;
}

function placeholderGround(baseY: number): Graphics {
  const g = new Graphics();
  g.rect(0, baseY - 6, STAGE_W, 2600).fill(C.ground);
  g.rect(0, baseY - 6, STAGE_W, 10).fill(C.groundDark);
  return g;
}
