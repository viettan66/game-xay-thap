// Bảng thứ tự hình của ảnh nhân vật, xe, tượng (giai đoạn 4c).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHEETS, spriteName } from '../scripts/assets/chars-sheets.js';
import { REPO_ROOT } from './helpers.js';

const rawFiles = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets', 'raw-files.json'), 'utf8')) as Record<string, string>;
const all = SHEETS.flatMap((s) => s.names.filter((n) => n !== '-').map((n) => spriteName(s.prefix, n)));
const TYPES = ['danphu_nam', 'danphu_nu', 'thomoc', 'thone', 'tusi'];

describe('bảng thứ tự hình nhân vật, xe, tượng', () => {
  it('mỗi tấm có trong bảng ánh xạ tên ảnh gốc', () => {
    for (const s of SHEETS) expect(rawFiles[s.sheet], s.sheet).toBeTruthy();
  });

  it('không trùng tên ảnh; tên theo quy ước SPEC mục 7', () => {
    expect(new Set(all).size).toBe(all.length);
    for (const n of all) expect(n).toMatch(/^(chars\/[a-z_]+_\d|vehicles\/(cart|elephant)_(up|down)_\d|honor\/statue_\d)$/);
  });

  it('mỗi loại người đi được 3 hướng (đứng yên + 3 khung) và có dáng làm việc kéo dây, chuyền ngói', () => {
    for (const t of TYPES) {
      for (const d of ['down', 'up', 'right']) for (let k = 0; k <= 3; k++) expect(all, `${t} ${d} ${k}`).toContain(`chars/${t}_${d}_${k}`);
      for (const w of ['rope_1', 'rope_2', 'tile_1', 'tile_2', 'brick_up_1', 'basket_up_1', 'wood_down_1']) expect(all, `${t} ${w}`).toContain(`chars/${t}_${w}`);
    }
  });

  it('xe trâu, voi: 2 hướng × 3 khung; 3 tượng võ tướng', () => {
    for (const v of ['cart', 'elephant']) for (const d of ['up', 'down']) for (let k = 1; k <= 3; k++) expect(all).toContain(`vehicles/${v}_${d}_${k}`);
    expect(all.filter((n) => n.startsWith('honor/'))).toEqual(['honor/statue_1', 'honor/statue_2', 'honor/statue_3']);
  });
});
