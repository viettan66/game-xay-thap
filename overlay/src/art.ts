// Tải ảnh game theo assets/manifest.json. Thiếu manifest hoặc thiếu ảnh nào thì bỏ qua ảnh đó
// (overlay vẽ hình tạm kèm tên file), không bao giờ làm overlay dừng (mục 7 SPEC).

import { Texture } from 'pixi.js';
import { assetUrl, type Manifest } from '../../shared/manifest.js';
import { textureKey } from '../../shared/map.js';

export interface Art {
  version: string;
  manifest: Manifest | null;
  textures: Map<string, Texture>;
  /** Ảnh gốc dạng bitmap (cần cho nền: làm mặt nạ mờ dần, lấy màu trời). */
  bitmaps: Map<string, ImageBitmap>;
}

export const EMPTY_ART: Art = { version: 'none', manifest: null, textures: new Map(), bitmaps: new Map() };

async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return createImageBitmap(await res.blob());
}

export async function loadArt(version: string): Promise<Art> {
  let manifest: Manifest | null = null;
  try {
    const res = await fetch('/assets/manifest.json', { cache: 'no-store' });
    if (res.ok) manifest = (await res.json()) as Manifest;
  } catch {
    manifest = null;
  }
  const textures = new Map<string, Texture>();
  const bitmaps = new Map<string, ImageBitmap>();
  if (manifest) {
    await Promise.all(
      Object.entries(manifest.images).map(async ([key, e]) => {
        try {
          const bmp = await fetchBitmap(`${assetUrl(e.file)}?v=${version}`);
          bitmaps.set(key, bmp);
          textures.set(key, Texture.from(bmp));
        } catch {
          console.warn(`Thiếu ảnh ${e.file}, dùng hình tạm`);
        }
      }),
    );
    // Bản đồ (R2): nền, công trình, tiền cảnh. Khóa texture = đường dẫn bỏ đuôi, ví dụ "buildings/gac_chuong/final".
    const map = manifest.map;
    if (map) {
      const files = [...map.tiles.map((t) => t.file), ...map.buildings.flatMap((b) => [b.file, ...(b.fg ? [b.fg.file] : [])])];
      await Promise.all(
        files.map(async (file) => {
          try {
            textures.set(textureKey(file), Texture.from(await fetchBitmap(`${assetUrl(file)}?v=${version}`)));
          } catch {
            console.warn(`Thiếu ảnh ${file}, bỏ qua`);
          }
        }),
      );
    }
  }
  return { version, manifest, textures, bitmaps };
}

export function destroyArt(art: Art): void {
  for (const t of art.textures.values()) t.destroy(true);
  for (const b of art.bitmaps.values()) b.close();
}
