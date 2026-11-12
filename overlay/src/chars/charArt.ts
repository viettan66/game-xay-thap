// Ảnh nhân vật, xe, tượng cho lớp vẽ (mục 9): texture + điểm neo (chân) theo manifest, cùng một tỉ lệ
// (đơn vị bản đồ / điểm ảnh = characters.heightMap / CHAR_REF_HEIGHT). Thiếu ảnh thì trả null để vẽ hình tạm.

import { Graphics, Sprite, type Texture } from 'pixi.js';
import { CHAR_REF_HEIGHT } from '../../../shared/paths.js';
import type { Art } from '../art.js';
import { catalog, type LookFrames } from './sprites.js';
import type { CharLook } from '../../../shared/characters.js';

export interface CharTex {
  tex: Texture;
  ax: number;
  ay: number;
}

export class CharArt {
  readonly frames: Map<CharLook, LookFrames>;
  private readonly cache = new Map<string, CharTex | null>();

  constructor(private readonly art: Art) {
    this.frames = catalog(Object.keys(art.manifest?.images ?? {}));
  }

  get(key: string | null): CharTex | null {
    if (!key) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const tex = this.art.textures.get(key) ?? null;
    const e = this.art.manifest?.images[key];
    const v = tex && e ? { tex, ax: e.w ? e.anchor.x / e.w : 0.5, ay: e.h ? e.anchor.y / e.h : 1 } : null;
    this.cache.set(key, v);
    return v;
  }

  /** Đặt ảnh lên sprite (neo ở chân), cỡ theo heightMap. Trả về false nếu thiếu ảnh. */
  apply(sprite: Sprite, key: string | null, heightMap: number, flip = false): boolean {
    const t = this.get(key);
    if (!t) {
      sprite.visible = false;
      return false;
    }
    if (sprite.texture !== t.tex) sprite.texture = t.tex;
    sprite.anchor.set(t.ax, t.ay);
    const k = heightMap / CHAR_REF_HEIGHT;
    sprite.scale.set(flip ? -k : k, k);
    sprite.visible = true;
    return true;
  }
}

/** Hình tạm khi thiếu ảnh nhân vật: đầu tròn và thân, chân ở (0, 0), cao `h`. */
export function placeholderFigure(color: number, h: number): Graphics {
  const g = new Graphics();
  g.roundRect(-h * 0.14, -h * 0.72, h * 0.28, h * 0.62, h * 0.08).fill(color);
  g.rect(-h * 0.1, -h * 0.12, h * 0.07, h * 0.12).fill(0x3a2414);
  g.rect(h * 0.03, -h * 0.12, h * 0.07, h * 0.12).fill(0x3a2414);
  g.circle(0, -h * 0.84, h * 0.13).fill(0xe8c39e);
  return g;
}
