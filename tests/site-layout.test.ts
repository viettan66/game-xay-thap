import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hudRects } from '../overlay/src/hudLayout.js';
import { rectInside, rectsOverlap } from '../overlay/src/layout.js';
import { siteBlocks } from '../overlay/src/siteLayout.js';
import { resolveProject, type ProjectFile } from '../shared/project.js';
import { REPO_ROOT } from './helpers.js';

const project = resolveProject(
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'project.json'), 'utf8')) as ProjectFile,
);
const area = hudRects({ top: 180, bottom: 600, right: 150 }).site;

describe('công trường tạm bằng hình khối (R1)', () => {
  const blocks = siteBlocks(project.items, area);

  it('mỗi hạng mục một khối, nằm gọn trong vùng vẽ, không khối nào chồng khối nào', () => {
    expect(blocks).toHaveLength(23);
    for (const b of blocks) {
      expect(rectInside(b.rect, area), b.id).toBe(true);
      expect(b.rect.h, b.id).toBeGreaterThan(20);
    }
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        expect(rectsOverlap(blocks[i]!.rect, blocks[j]!.rect), `${blocks[i]!.id} chồng ${blocks[j]!.id}`).toBe(false);
      }
    }
  });

  it('gom theo khu vực; bảo tháp 9 tầng xếp chồng từ dưới lên, tầng trên hẹp dần', () => {
    const tower = blocks.filter((b) => b.id.startsWith('thap_tang_'));
    expect(new Set(tower.map((b) => b.group)).size).toBe(1);
    for (let k = 1; k < tower.length; k++) {
      expect(tower[k]!.rect.y).toBeLessThan(tower[k - 1]!.rect.y);
      expect(tower[k]!.rect.w).toBeLessThan(tower[k - 1]!.rect.w);
    }
  });

  it('khu đầu tiên ở hàng dưới cùng (như đi từ chân đồi lên)', () => {
    const first = blocks.find((b) => b.id === 'san_nen')!;
    const last = blocks.find((b) => b.id === 'nha_to')!;
    expect(first.rect.y).toBeGreaterThan(last.rect.y);
    expect(blocks.map((b) => b.id)).toEqual(project.items.map((i) => i.id)); // giữ thứ tự danh sách
  });

  it('danh sách trống thì không có khối nào', () => {
    expect(siteBlocks([], area)).toEqual([]);
  });
});
