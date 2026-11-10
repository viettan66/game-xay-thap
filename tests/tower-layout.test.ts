import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cameraTargetFor, placeTower, towerArtFrom, type TowerParams } from '../overlay/src/towerLayout.js';
import { CAMERA_FOCUS_Y } from '../overlay/src/layout.js';
import { FLOOR_STAGE_KEYS, SPIRE_KEY, type Manifest } from '../shared/manifest.js';
import { validateManifest, missingFiles } from '../server/assets/manifest.js';
import { REPO_ROOT } from './helpers.js';

const manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets', 'manifest.json'), 'utf8')));
const params: TowerParams = { floor1WidthPx: 520, towerTaper: 0.995, anchor: { x: 508, y: 1215 }, spireScale: 1 };
const tower = (floor: number, stage = 1, completed = false, totalFloors = 100) => ({ floor, stage, completed, totalFloors });

describe('assets/manifest.json của dự án', () => {
  it('đủ 57 ảnh theo mục 7, file nào cũng có', () => {
    expect(Object.keys(manifest.images)).toHaveLength(57);
    expect(missingFiles(REPO_ROOT, manifest)).toEqual([]);
    for (const k of ['bg/background', 'bg/sky_upper', 'tower/spire', 'stele/stele', 'abbot/abbot_pray', 'ui/banner', 'items/guardian']) {
      expect(manifest.images[k], k).toBeDefined();
    }
  });

  it('5 ảnh tầng cùng khung, cùng eaveLineY; topY phía trên eaveLineY; đáy thân phía dưới', () => {
    const floors = FLOOR_STAGE_KEYS.map((k) => manifest.images[k]!);
    expect(new Set(floors.map((f) => `${f.w}x${f.h}`)).size).toBe(1);
    expect(new Set(floors.map((f) => f.eaveLineY)).size).toBe(1);
    for (const f of floors) {
      expect(f.topY!).toBeLessThan(f.eaveLineY!);
      expect(f.bottomY!).toBeGreaterThan(f.eaveLineY!);
      expect(f.eaveWidth!).toBeGreaterThan(380);
    }
    // Ảnh giai đoạn 5 có đèn lồng thòng xuống, thấp hơn đáy thân.
    expect(floors[4]!.h).toBeGreaterThan(floors[4]!.bottomY!);
  });

  it('các khung nhân vật cùng nhóm có cùng kích thước ô', () => {
    const groups = ['worker_m', 'worker_f', 'monk', 'carpenter', 'mason'];
    for (const g of groups) {
      const frames = Object.entries(manifest.images).filter(([k]) => k.startsWith(`chars/${g}_`));
      expect(frames.length, g).toBeGreaterThanOrEqual(2);
      expect(new Set(frames.map(([, e]) => `${e.w}x${e.h}:${e.anchor.y}`)).size, g).toBe(1);
    }
  });
});

describe('xếp chồng tầng theo eaveLineY (mục 7, 8)', () => {
  const art = towerArtFrom(manifest);
  const ref = art.stages[4]!;

  it('tầng 1 đặt đáy thân lên bệ móng, rộng đúng floor1WidthPx', () => {
    const p = placeTower(art, params, tower(1, 3));
    const f1 = p.floors[0]!;
    expect(f1.bottomY).toBeCloseTo(1215);
    expect(ref.eaveWidth * f1.scale).toBeCloseTo(520);
    expect(f1.stage).toBe(3);
  });

  it('tầng sau đặt mép dưới dải ngói lên mép trên phẳng của tầng dưới, thu nhỏ dần', () => {
    const p = placeTower(art, params, tower(10, 2));
    expect(p.floors).toHaveLength(10);
    for (let i = 1; i < p.floors.length; i++) {
      expect(p.floors[i]!.eaveY).toBeCloseTo(p.floors[i - 1]!.topY);
      expect(p.floors[i]!.scale / p.floors[i - 1]!.scale).toBeCloseTo(0.995);
    }
    // Tầng dưới dùng ảnh giai đoạn 5, tầng đang xây dùng ảnh giai đoạn hiện tại.
    expect(p.floors.slice(0, 9).every((f) => f.stage === 5)).toBe(true);
    expect(p.floors[9]!.key).toBe('tower/floor_stage_2');
  });

  it('căn theo eaveLineY chứ không theo mép ảnh: ảnh giai đoạn 5 cao hơn vẫn không làm lệch tầng', () => {
    const p = placeTower(art, params, tower(3, 5));
    const step = p.floors[1]!.eaveY - p.floors[2]!.eaveY;
    expect(step).toBeCloseTo((ref.eaveLineY - ref.topY) * p.floors[1]!.scale);
  });

  it('xong tháp thì đặt chóp lên tầng cuối, mái chóp rộng spireScale lần mái tầng cuối', () => {
    const p = placeTower(art, { ...params, spireScale: 1.2 }, tower(3, 5, true, 3));
    const last = p.floors.at(-1)!;
    expect(p.spire!.eaveY).toBeCloseTo(last.topY);
    expect(art.spire.eaveWidth * p.spire!.scale).toBeCloseTo(1.2 * ref.eaveWidth * last.scale);
    expect(p.spire!.key).toBe(SPIRE_KEY);
  });

  it('camera giữ tầng đang xây ở ~45% màn hình, nền móng thì đứng yên', () => {
    expect(cameraTargetFor(placeTower(art, params, tower(0)))).toBe(0);
    const p = placeTower(art, params, tower(12, 1));
    const f = p.floors.at(-1)!;
    expect((f.eaveY + f.topY) / 2 + cameraTargetFor(p)).toBeCloseTo(CAMERA_FOCUS_Y);
  });

  it('thiếu manifest thì dùng kích thước tạm, không lỗi', () => {
    const p = placeTower(towerArtFrom(null), params, tower(5, 2));
    expect(p.floors).toHaveLength(5);
    expect(p.floors.every((f) => Number.isFinite(f.eaveY))).toBe(true);
    const partial: Manifest = structuredClone(manifest);
    delete partial.images['tower/floor_stage_2'];
    expect(() => placeTower(towerArtFrom(partial), params, tower(2, 2))).not.toThrow();
  });
});
