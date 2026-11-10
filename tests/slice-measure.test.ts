import { describe, expect, it } from 'vitest';
import { extractSprite, findSprites, opaqueBounds, packGroup } from '../scripts/slice-sheet.js';
import { blank, type Img } from '../scripts/assets/image.js';
import { bottomOf, headCenterX, measureEave } from '../scripts/assets/measure.js';

type RGBA = [number, number, number, number];
function fill(img: Img, x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set(c, (yy * img.width + xx) * 4);
}
const RED: RGBA = [200, 40, 40, 255];

describe('cắt sprite sheet theo khoảng trống trong suốt (scripts/slice-sheet.ts)', () => {
  it('tìm đúng từng hình theo thứ tự đọc, bỏ đốm lẻ', () => {
    const img = blank(300, 200);
    fill(img, 10, 10, 40, 60, RED); // hàng 1, trái
    fill(img, 120, 20, 50, 50, RED); // hàng 1, phải
    fill(img, 30, 120, 60, 60, RED); // hàng 2
    fill(img, 250, 180, 2, 2, RED); // đốm lẻ
    const { sprites } = findSprites(img, { minGap: 8 });
    expect(sprites.map((s) => [s.x, s.y, s.w, s.h])).toEqual([
      [10, 10, 40, 60],
      [120, 20, 50, 50],
      [30, 120, 60, 60],
    ]);
  });

  it('mảnh nhỏ nằm sát (dưới minGap) gộp vào cùng hình, ví dụ tia lửa cạnh búa', () => {
    const img = blank(200, 100);
    fill(img, 10, 10, 40, 40, RED);
    fill(img, 54, 12, 6, 6, RED); // cách 4px
    fill(img, 120, 10, 40, 40, RED);
    const { sprites } = findSprites(img, { minGap: 8, minArea: 10 });
    expect(sprites).toHaveLength(2);
    expect(sprites[0]).toMatchObject({ x: 10, w: 50 });
  });

  it('gom phần hào quang mờ vào hình, và tách riêng không lẫn hình bên cạnh', () => {
    const img = blank(200, 100);
    fill(img, 20, 20, 30, 30, RED);
    fill(img, 10, 10, 50, 50, [255, 220, 0, 40]); // hào quang mờ quanh hình 1
    fill(img, 20, 20, 30, 30, RED);
    fill(img, 120, 20, 30, 30, RED);
    const { sprites, labels } = findSprites(img, { coreAlpha: 200, minGap: 4, haloRadius: 12 });
    expect(sprites).toHaveLength(2);
    expect(sprites[0]).toMatchObject({ x: 10, y: 10, w: 50, h: 50 });
    const first = extractSprite(img, labels, sprites[0]!);
    expect(opaqueBounds(first, 1)).toEqual({ x0: 0, y0: 0, x1: 50, y1: 50 });
  });

  it('các khung cùng nhóm có cùng kích thước ô và chân thẳng hàng', () => {
    const a = blank(30, 80);
    fill(a, 5, 0, 20, 80, RED); // cao
    const b = blank(60, 50);
    fill(b, 0, 0, 60, 50, RED); // thấp, rộng
    const group = packGroup(
      [
        { name: 'a', img: a, ax: 15, ay: 80 },
        { name: 'b', img: b, ax: 20, ay: 50 },
      ],
      4,
    );
    expect(new Set(group.frames.map((f) => `${f.img.width}x${f.img.height}`)).size).toBe(1);
    for (const f of group.frames) expect(bottomOf(f.img)).toBe(group.ay); // chân cùng một hàng
    expect(group.cellW).toBe(4 + 20 + 40 + 4);
    expect(group.cellH).toBe(4 + 80 + 4);
  });
});

describe('đo điểm căn tầng tháp bằng phân tích điểm ảnh', () => {
  // Tầng giả: dầm đỉnh, thân, dải ngói cam (rộng nhất), dầm đỡ đỏ sẫm, đèn lồng hẹp thòng xuống.
  function fakeFloor(lanterns: boolean): Img {
    const img = blank(220, 200);
    fill(img, 30, 20, 160, 12, [180, 60, 40, 255]); // dầm đỉnh y 20..31
    fill(img, 50, 32, 120, 78, [240, 210, 170, 255]); // thân
    fill(img, 10, 110, 200, 30, [215, 110, 80, 255]); // ngói y 110..139
    fill(img, 40, 140, 140, 20, [120, 30, 25, 255]); // dầm đỡ y 140..159
    if (lanterns) {
      fill(img, 14, 160, 12, 30, [230, 50, 40, 255]); // đèn lồng trái
      fill(img, 194, 160, 12, 30, [230, 50, 40, 255]); // đèn lồng phải
    }
    return img;
  }

  it('eaveLineY ở mép dưới dải ngói (chỗ chuyển sang dầm đỡ), topY ở mép trên dầm đỉnh', () => {
    const m = measureEave(fakeFloor(false));
    expect(m.eaveLineY).toBe(140);
    expect(m.topY).toBe(20);
    expect(m.bottomY).toBe(160);
    expect(m.eaveWidth).toBe(200);
    expect(m.centerX).toBeCloseTo(109.5);
  });

  it('đèn lồng thòng xuống không làm lệch eaveLineY và topY (nên căn theo eaveLineY, không theo mép ảnh)', () => {
    const plain = measureEave(fakeFloor(false));
    const withLanterns = measureEave(fakeFloor(true));
    expect(withLanterns.eaveLineY).toBe(plain.eaveLineY);
    expect(withLanterns.topY).toBe(plain.topY);
  });

  it('tâm đầu nhân vật', () => {
    const img = blank(100, 100);
    fill(img, 40, 0, 20, 20, RED); // đầu
    fill(img, 10, 20, 80, 80, RED); // thân + đồ vác lệch
    expect(headCenterX(img)).toBeCloseTo(49.5, 0);
  });
});
