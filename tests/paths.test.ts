// Lối đi, vị trí làm việc, ô ghi danh (mục 9, giai đoạn 4c).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPaths, savePaths, syncManifestPaths, validatePaths } from '../server/assets/paths.js';
import { ManifestError } from '../server/assets/manifest.js';
import type { MapManifest } from '../shared/map.js';
import {
  buildGraph,
  components,
  honorSlotFor,
  mainEntry,
  nearestNode,
  route,
  routeLength,
  workSpots,
  type MapPaths,
  type PathPoint,
} from '../shared/paths.js';
import { makeTempRoot, REPO_ROOT, removeTempRoot } from './helpers.js';

const repoPaths = loadPaths(REPO_ROOT)!;
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets', 'manifest.json'), 'utf8')) as { map: MapManifest };

describe('mạng lối đi', () => {
  const tiny: MapPaths = {
    paths: [
      { id: 'a', kind: 'main', points: [[0, 1000], [0, 0]] },
      { id: 'b', kind: 'walk', points: [[0, 500], [300, 500]] },
      { id: 'c', kind: 'walk', points: [[300, 505], [300, 100]] }, // đầu mút lệch 5 đơn vị: vẫn nối
    ],
    honorSlots: [],
  };

  it('điểm trùng hoặc rất gần được nối thành một mạng', () => {
    const g = buildGraph(tiny.paths);
    expect(g.nodes).toHaveLength(5);
    expect(components(g)).toBe(1);
  });

  it('đi theo mạng: tới nút gần nhất, theo đường, rồi tới đích', () => {
    const g = buildGraph(tiny.paths);
    const r = route(g, [0, 990], [310, 110]);
    expect(r).toEqual([[0, 990], [0, 1000], [0, 500], [300, 500], [300, 100], [310, 110]]);
    expect(routeLength([[0, 0], [3, 4]])).toBe(5);
    expect(nearestNode(g, [290, 480])).toBe(g.nodes.findIndex((n) => n[0] === 300 && n[1] === 500));
  });

  it('không nối được thì đi thẳng', () => {
    const g = buildGraph([
      { id: 'a', kind: 'main', points: [[0, 0], [0, 100]] },
      { id: 'b', kind: 'walk', points: [[500, 0], [500, 100]] },
    ]);
    expect(route(g, [0, 0], [500, 100])).toEqual([[0, 0], [500, 100]]);
  });

  it('điểm vào của đường chính là đầu mút thấp nhất', () => {
    expect(mainEntry(tiny.paths)).toEqual([0, 1000]);
    expect(mainEntry([{ id: 'x', kind: 'walk', points: [[0, 0], [1, 1]] }])).toBeNull();
  });
});

describe('lối đi mặc định của bản đồ chùa', () => {
  const g = buildGraph(repoPaths.paths);

  it('liền một khối, đường chính đi từ mép dưới bản đồ vào', () => {
    expect(components(g)).toBe(1);
    const entry = mainEntry(repoPaths.paths)!;
    expect(entry[1]).toBeGreaterThan(manifest.map.height - 100);
  });

  it('từ cổng vào tới được chân mọi công trình, không vòng vèo quá xa', () => {
    const entry = mainEntry(repoPaths.paths)!;
    for (const b of manifest.map.buildings) {
      const foot: PathPoint = [b.x + b.w / 2, b.baseY];
      const r = route(g, entry, foot);
      const nearest = g.nodes[nearestNode(g, foot)]!;
      // Nút gần nhất cách chân công trình không quá 450 đơn vị (công trình nền rộng như sân, hồ thì xa hơn chút).
      expect(Math.hypot(nearest[0] - foot[0], nearest[1] - foot[1]), b.id).toBeLessThan(b.layer === 'ground' ? 900 : 450);
      expect(routeLength(r), b.id).toBeLessThan(6500);
    }
  });

  it('mọi điểm, ô ghi danh nằm trong bản đồ; có ít nhất 8 ô ghi danh', () => {
    for (const p of repoPaths.paths) for (const [x, y] of p.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(manifest.map.width);
      expect(y).toBeLessThanOrEqual(manifest.map.height);
    }
    expect(repoPaths.honorSlots.length).toBeGreaterThanOrEqual(8);
  });
});

describe('vị trí làm việc, ô ghi danh', () => {
  it('một hàng dọc chân công trình, hai bên hông; sàn giàn giáo ở giữa thân', () => {
    const spots = workSpots({ x: 100, y: 0, w: 300, h: 400 }, 400, { spacing: 40, scaffoldLevels: [300, 200] });
    const ground = spots.filter((s) => s.kind === 'ground');
    const scaffold = spots.filter((s) => s.kind === 'scaffold');
    expect(ground.length).toBeGreaterThanOrEqual(6);
    expect(ground.filter((s) => s.y === 408)).toHaveLength(ground.length - 2);
    expect(ground.some((s) => s.x < 100)).toBe(true);
    expect(ground.some((s) => s.x > 400)).toBe(true);
    expect(scaffold.length).toBeGreaterThanOrEqual(2);
    expect(new Set(scaffold.map((s) => s.y))).toEqual(new Set([300, 200]));
    for (const s of scaffold) expect(s.x).toBeGreaterThanOrEqual(175);
    expect(workSpots({ x: 0, y: 0, w: 10, h: 10 }, 10, { ground: false })).toEqual([]);
  });

  it('hết ô ghi danh thì xoay vòng', () => {
    const slots = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(honorSlotFor(slots, 4)).toEqual({ x: 2, y: 2 });
    expect(honorSlotFor([], 0)).toBeNull();
  });
});

describe('lưu lối đi', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempRoot();
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'assets', 'manifest.json'), path.join(root, 'assets', 'manifest.json'));
    fs.copyFileSync(path.join(REPO_ROOT, 'assets', 'map-paths.json'), path.join(root, 'assets', 'map-paths.json'));
  });
  afterEach(() => removeTempRoot(root));

  it('lưu file, giữ dòng ghi chú, chép vào manifest', () => {
    const next = { paths: [{ id: 'moi', kind: 'main', points: [[1, 2], [3, 4]] }], honorSlots: [{ x: 5, y: 6 }] };
    savePaths(root, next);
    const file = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'map-paths.json'), 'utf8')) as { _ghi_chu: string };
    expect(file._ghi_chu).toContain('Lối đi');
    const m = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8')) as { map: MapManifest };
    expect(m.map.paths).toEqual(next.paths);
    expect(m.map.honorSlots).toEqual(next.honorSlots);
    expect(syncManifestPaths(root)).toBe(false); // đã khớp
  });

  it('sai thì báo lỗi rõ, không ghi', () => {
    expect(() => validatePaths({ paths: [{ id: 'A B', kind: 'main', points: [[1, 2], [3, 4]] }], honorSlots: [] })).toThrow(ManifestError);
    expect(() => validatePaths({ paths: [{ id: 'a', kind: 'main', points: [[1, 2]] }], honorSlots: [] })).toThrow(ManifestError);
    expect(() =>
      validatePaths({
        paths: [
          { id: 'a', kind: 'main', points: [[1, 2], [3, 4]] },
          { id: 'a', kind: 'walk', points: [[1, 2], [3, 4]] },
        ],
        honorSlots: [],
      }),
    ).toThrow(/trùng mã/);
  });
});
