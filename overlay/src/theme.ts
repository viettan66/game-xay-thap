// Màu và font tạm cho giai đoạn 2 (hình khối). Giai đoạn 3 thay bằng ảnh thật.

import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/noto-serif/700.css';

// Font emoji của Windows để tên có emoji không bị ô vuông.
export const FONT_BODY = ['Be Vietnam Pro', 'Segoe UI Emoji', 'Segoe UI Symbol', 'sans-serif'];
export const FONT_TITLE = ['Noto Serif', 'Be Vietnam Pro', 'serif'];

export const C = {
  redDark: 0x5e150c,
  red: 0x9e2a1c,
  gold: 0xe2ae45,
  goldLight: 0xf8de8f,
  cream: 0xfff4dc,
  parchment: 0xf3e4c4,
  ink: 0x3a2414,
  brown: 0x6b4426,
  stone: 0xbcae96,
  stoneDark: 0x8a7b66,
  stoneLight: 0xd8ccb6,
  wall: 0xf0d6a8,
  brick: 0xdfae80,
  column: 0xb6352a,
  tile: 0xa9442d,
  tileDark: 0x7d2c1c,
  bamboo: 0xd8b062,
  lantern: 0xe2382b,
  windowDark: 0x5a1a12,
  ground: 0xd7bf8e,
  groundDark: 0xbca06c,
  badge: 0xe07a12,
  medals: [0xf2c14e, 0xcfd4dc, 0xcb8a4c] as const,
};

const SAMPLE = 'Tầng Nền móng ơ ư đ ạ ặ ữ Ỹ 0123456789';

/** Chờ font tải xong trước khi vẽ chữ, để Pixi đo chữ đúng. */
export async function loadFonts(): Promise<void> {
  const specs = ['400 30px "Be Vietnam Pro"', '600 30px "Be Vietnam Pro"', '700 30px "Be Vietnam Pro"', '700 50px "Noto Serif"'];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s, SAMPLE)));
    await document.fonts.ready;
  } catch {
    // Font lỗi thì dùng font dự phòng, không dừng overlay.
  }
}
