// Nhân vật trên bản đồ, phần overlay (mục 9, giai đoạn 4d): chọn ảnh theo việc, đi theo đường, chỗ đứng làm việc,
// "bộ não" nhân vật (đi vào, làm việc, khiêng vật liệu, trèo giàn giáo, đi ra), lượt tượng ghi danh, camera lia tới tượng.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CameraDirector, siteCamera, type CameraInput } from '../overlay/src/camera.js';
import { Actor, type ActorWorld } from '../overlay/src/chars/actor.js';
import { pageOf, pagesOf, pageStatues, statueStyle } from '../overlay/src/chars/honorPages.js';
import { enterStart, exitEnd, facing, Polyline, stopBefore } from '../overlay/src/chars/route.js';
import { carryOf, catalog, scaffoldShare, walkFrame, workActions, workKind, type WorkKind } from '../overlay/src/chars/sprites.js';
import { buildSpots, loiterPoints, SpotPool, type SiteGeom } from '../overlay/src/chars/spots.js';
import { VIEWER_LOOKS, type CharLook } from '../shared/characters.js';
import type { Manifest } from '../shared/manifest.js';
import { nearestOnPaths, type PathPoint } from '../shared/paths.js';
import type { CameraConfig, HonorInfo } from '../shared/protocol.js';
import { REPO_ROOT } from './helpers.js';

const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets', 'manifest.json'), 'utf8')) as Manifest;
const frames = catalog(Object.keys(manifest.images));

describe('ảnh nhân vật theo việc', () => {
  it('đọc đủ bộ khung từ manifest: đi 3 hướng (đứng + 3 bước), mang vác, làm việc', () => {
    for (const look of [...VIEWER_LOOKS, 'tusi' as const]) {
      const f = frames.get(look)!;
      for (const d of ['down', 'up', 'right'] as const) expect(f.walk[d], `${look} ${d}`).toEqual([0, 1, 2, 3].map((k) => `chars/${look}_${d}_${k}`));
      expect(f.carry.brick.length + f.carry.basket.length + f.carry.wood.length).toBeGreaterThan(2);
      expect(f.work.has('rope') && f.work.has('tile')).toBe(true);
    }
    expect(frames.get('danphu_nam')!.work.get('hoe')).toEqual(['chars/danphu_nam_hoe_1', 'chars/danphu_nam_hoe_2']);
  });

  it('nhóm việc theo giai đoạn (mục 9): cắm mốc, đào → cuốc; cột, khung → kéo dây; tường, nền → thợ nề; mái → chuyền ngói', () => {
    expect(workKind({ parts: [], look: 'coc', band: [0, 100] })).toBe('stake');
    expect(workKind({ parts: [], look: 'dao', band: [0, 100] })).toBe('dig');
    expect(workKind({ parts: ['cot'], look: 'wood', band: [0, 100] })).toBe('wood');
    expect(workKind({ parts: ['tuong'], look: 'full', band: [0, 100] })).toBe('mason');
    expect(workKind({ parts: ['tuong', 'mai'], look: 'full', band: [0, 100] })).toBe('roof');
    expect(workKind({ parts: ['trangtri'], look: 'full', band: [0, 100] })).toBe('decor');
    expect(scaffoldShare('roof')).toBeGreaterThan(scaffoldShare('mason'));
    expect(scaffoldShare('dig')).toBe(0);
  });

  it('mọi kiểu nhân vật của người xem đều có động tác cho mọi nhóm việc', () => {
    const kinds: WorkKind[] = ['stake', 'dig', 'haul', 'mason', 'wood', 'roof', 'decor', 'water'];
    for (const look of VIEWER_LOOKS) for (const k of kinds) expect(workActions(frames.get(look), k).length, `${look} ${k}`).toBeGreaterThan(0);
    expect(workActions(frames.get('danphu_nam'), 'dig')[0]).toBe('hoe');
    expect(workActions(frames.get('thone'), 'mason')).toEqual(['lay', 'trowel']);
    expect(workActions(frames.get('danphu_nu'), 'roof')).toEqual(['tile', 'rope']);
    expect(workActions(undefined, 'roof')).toEqual([]);
  });

  it('khung đi bộ lặp 1 → 2 → 3 → 2; vật liệu mang vác theo đống', () => {
    const f = ['s', 'a', 'b', 'c'];
    expect([0, 0.13, 0.26, 0.38, 0.5].map((t) => walkFrame(f, t))).toEqual(['a', 'b', 'c', 'b', 'a']);
    expect(walkFrame([], 0)).toBeNull();
    expect([carryOf('gach'), carryOf('go'), carryOf('ngoi')]).toEqual(['brick', 'wood', 'basket']);
  });
});

describe('đi theo đường', () => {
  const line = new Polyline([
    [0, 0],
    [0, 100],
    [50, 100],
  ]);

  it('vị trí theo quãng đường, hướng của đoạn đang đi', () => {
    expect(line.length).toBe(150);
    expect(line.at(50)).toMatchObject({ x: 0, y: 50, dx: 0, dy: 1 });
    expect(line.at(125)).toMatchObject({ x: 25, y: 100, dx: 1, dy: 0 });
    expect(line.at(999)).toMatchObject({ x: 50, y: 100 });
    expect(facing(0, -1)).toEqual({ dir: 'up', flip: false });
    expect(facing(-1, 0.2)).toEqual({ dir: 'right', flip: true });
  });

  it('đi vào từ mép khung nhìn: bỏ đoạn ngoài màn hình; đi ra: dừng khi vừa khuất', () => {
    const long = new Polyline([
      [500, 5000],
      [500, 1000],
    ]);
    const view = { x: 0, y: 800, w: 1000, h: 1200 }; // y 800..2000
    const s0 = enterStart(long, view, 40);
    expect(long.at(s0).y).toBeGreaterThan(2000);
    expect(long.at(s0).y).toBeLessThan(2060);
    const out = new Polyline([
      [500, 1000],
      [500, 5000],
    ]);
    const e = exitEnd(out, view, 40);
    expect(out.at(e).y).toBeGreaterThan(2040);
    expect(out.at(e).y).toBeLessThan(2060);
  });

  it('xe trâu, voi dừng trước công trình đang xây, không vòng ra sau', () => {
    const pts: PathPoint[] = [
      [860, 5000],
      [860, 2250],
      [860, 2165],
      [560, 2172],
      [500, 2260],
    ];
    const gate = { x: 451, y: 1700, w: 820, h: 533 };
    expect(stopBefore(pts, gate, 2233)).toEqual([
      [860, 5000],
      [860, 2250],
      [860, 2247],
    ]);
    expect(stopBefore(pts, { x: 0, y: 0, w: 100, h: 100 }, 2233)).toEqual(pts); // không đi qua công trình: giữ nguyên
  });

  it('điểm trên lối đi gần nhất', () => {
    const paths = [{ id: 'a', kind: 'main' as const, points: [[860, 5000], [860, 1000]] as PathPoint[] }];
    expect(nearestOnPaths(paths, { x: 700, y: 2400 })).toEqual({ x: 860, y: 2400 });
    expect(nearestOnPaths([], { x: 0, y: 0 })).toBeNull();
  });
});

// Công trường mẫu: công trình đứng rộng 300, chân ở y = 1000, giàn giáo 4 thanh ngang.
const geom = (over: Partial<SiteGeom> = {}): SiteGeom => ({
  key: 'gac',
  rect: { x: 100, y: 600, w: 300, h: 400 },
  baseY: 1000,
  flat: false,
  floor: [],
  ledgers: [
    [94, 406, 982],
    [94, 406, 960],
    [94, 406, 938],
    [94, 406, 916],
    [94, 406, 894],
  ],
  pile: { x: 80, y: 1008 },
  loiter: [
    { x: 600, y: 1100 },
    { x: 620, y: 1100 },
  ],
  ...over,
});

describe('chỗ đứng làm việc', () => {
  it('hàng chân công trình + sàn giàn giáo cách nhau ít nhất một người; chừa chỗ đống vật liệu', () => {
    const spots = buildSpots(geom());
    const ground = spots.filter((s) => s.kind === 'ground');
    const sc = spots.filter((s) => s.kind === 'scaffold');
    expect(ground.length).toBeGreaterThan(4);
    expect(ground.every((s) => Math.abs(s.x - 80) >= 32 || Math.abs(s.y - 1008) >= 40)).toBe(true);
    const levels = [...new Set(sc.map((s) => s.y))].sort((a, b) => b - a);
    expect(levels[0]).toBeLessThan(1000 - 30); // không đứng trên thanh sát đất
    for (let i = 1; i < levels.length; i++) expect(levels[i - 1]! - levels[i]!).toBeGreaterThanOrEqual(40);
    expect(sc.every((s) => s.climbY === 1008)).toBe(true);
  });

  it('công trình phẳng: đứng trên phần đất của hạng mục', () => {
    const spots = buildSpots(geom({ flat: true, floor: [{ x: 300, y: 700 }, { x: 340, y: 720 }] }));
    expect(spots).toEqual([
      { x: 300, y: 700, kind: 'ground' },
      { x: 340, y: 720, kind: 'ground' },
    ]);
  });

  it('mỗi chỗ một người; hết chỗ thì đứng chờ dọc lối đi; giàn giáo thấp xuống thì trả chỗ', () => {
    const pool = new SpotPool();
    pool.update(geom());
    const n = pool.total;
    const got = new Set<string>();
    let r = 0;
    const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) {
      const s = pool.claim(`a${i}`, i % 2 === 0, rand)!;
      expect(s.kind).not.toBe('loiter');
      got.add(`${s.kind}:${s.x}:${s.y}`);
    }
    expect(got.size).toBe(n);
    expect(pool.claim('extra', false, rand)!.kind).toBe('loiter');
    const onScaffold = [...Array(n).keys()].filter((i) => pool.spotOf(`a${i}`)?.kind === 'scaffold');
    pool.update(geom({ ledgers: [] }));
    for (const i of onScaffold) expect(pool.spotOf(`a${i}`)).toBeNull();
    expect(pool.spotOf('extra')!.kind).toBe('loiter');
  });

  it('điểm chờ rải dọc lối đi trong vùng quanh công trường', () => {
    const pts = loiterPoints([{ points: [[0, 0], [0, 200]] }], { x: -10, y: 50, w: 20, h: 100 }, 26);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts.every((p) => p.y >= 50 && p.y <= 150)).toBe(true);
  });
});

// ---- Bộ não nhân vật với thế giới giả ----

function world(site: SiteGeom | null = geom(), over: Partial<ActorWorld> = {}): ActorWorld & { drops: number; pool: SpotPool; setSite(s: SiteGeom | null): void } {
  let cur = site;
  const pool = new SpotPool();
  pool.update(cur);
  let seed = 1;
  const w = {
    route: (a: { x: number; y: number }, b: { x: number; y: number }): PathPoint[] => [
      [a.x, a.y],
      [b.x, b.y],
    ],
    edgePoint: () => ({ x: 250, y: 3000 }),
    view: () => ({ x: 0, y: 500, w: 1000, h: 800 }),
    site: () => cur,
    pool,
    actions: (look: CharLook) => workActions(frames.get(look), 'mason'),
    scaffoldShare: () => 0,
    material: () => 'brick' as const,
    drops: 0,
    dropAtPile() {
      w.drops++;
    },
    rand: () => (seed = (seed * 16807) % 2147483647) / 2147483647,
    scale: 1,
    setSite(s: SiteGeom | null) {
      cur = s;
      pool.update(s);
    },
    ...over,
  };
  return w;
}

const run = (a: Actor, w: ActorWorld, sec: number, step = 1 / 30) => {
  for (let t = 0; t < sec; t += step) a.update(step, w);
};

describe('bộ não nhân vật', () => {
  it('đi vào từ mép khung nhìn tới chỗ làm, rồi làm việc hợp giai đoạn', () => {
    const w = world();
    const a = new Actor('p1', 'thone', frames.get('thone'), { x: 0, y: 0 });
    a.enter(w, false);
    expect(a.y).toBeGreaterThan(1300); // xuất hiện ở mép dưới khung nhìn, không phải tận mép bản đồ
    expect(a.y).toBeLessThan(1360);
    run(a, w, 6);
    const spot = w.pool.spotOf('p1')!;
    expect(a.x).toBeCloseTo(spot.x, 0);
    expect(a.y).toBeCloseTo(spot.y, 0);
    expect(a.working).toBe(true);
    expect(a.pose().sprite).toMatch(/^chars\/thone_(lay|trowel)_\d$/);
  });

  it('mở overlay giữa chừng: đứng sẵn ở chỗ làm', () => {
    const w = world();
    const a = new Actor('p1', 'thomoc', frames.get('thomoc'), { x: 0, y: 0 });
    a.enter(w, true);
    const s = w.pool.spotOf('p1')!;
    expect([a.x, a.y]).toEqual([s.x, s.y]);
  });

  it('khiêng vật liệu ra đống (tim chưa đủ một mảnh, quà gạch): mang vác, đặt xuống đống, quay lại chỗ làm', () => {
    const w = world();
    const a = new Actor('p1', 'danphu_nam', frames.get('danphu_nam'), { x: 0, y: 0 });
    a.enter(w, true);
    const spot = { ...w.pool.spotOf('p1')! };
    expect(a.carryTrip(w, 'brick')).toBe(true);
    expect(a.carryTrip(w, 'brick')).toBe(false); // đang đi một chuyến
    run(a, w, 0.2);
    expect(a.pose().sprite).toMatch(/^chars\/danphu_nam_brick_up_\d$/);
    run(a, w, 8);
    expect(w.drops).toBe(1);
    expect(a.carrying).toBeNull();
    expect(Math.hypot(a.x - spot.x, a.y - spot.y)).toBeLessThan(1);
  });

  it('thả tim: làm nhanh hơn vài giây', () => {
    const w = world();
    const slow = new Actor('p1', 'thone', frames.get('thone'), { x: 0, y: 0 });
    const fast = new Actor('p2', 'thone', frames.get('thone'), { x: 0, y: 0 });
    slow.enter(w, false);
    fast.enter(w, false);
    fast.boost(4);
    const d0 = [slow.y, fast.y];
    run(slow, w, 2);
    run(fast, w, 2);
    expect(d0[1]! - fast.y).toBeGreaterThan((d0[0]! - slow.y) * 1.4);
    expect(fast.boosted).toBe(true);
    run(fast, w, 3);
    expect(fast.boosted).toBe(false);
  });

  it('chỗ trên giàn giáo: đi tới chân thang, trèo lên, vẽ trước công trình; đi ra thì trèo xuống', () => {
    const w = world(geom(), { scaffoldShare: () => 1 });
    const a = new Actor('p1', 'danphu_nu', frames.get('danphu_nu'), { x: 0, y: 0 });
    a.enter(w, false);
    run(a, w, 8);
    const s = w.pool.spotOf('p1')!;
    expect(s.kind).toBe('scaffold');
    expect(a.y).toBeCloseTo(s.y, 0);
    expect(a.onScaffold).toBe(true);
    expect(a.pose().scaffold).toBe(true);
    a.leave(w);
    run(a, w, 2);
    expect(a.onScaffold).toBe(false);
    expect(a.y).toBeGreaterThan(1000);
  });

  it('đổi hạng mục: thôi làm, đi sang công trình mới', () => {
    const w = world();
    const a = new Actor('p1', 'thone', frames.get('thone'), { x: 0, y: 0 });
    a.enter(w, true);
    run(a, w, 1);
    w.setSite(geom({ key: 'nha_to', rect: { x: 700, y: 300, w: 200, h: 300 }, baseY: 600, ledgers: [], pile: { x: 680, y: 608 } }));
    run(a, w, 10);
    expect(a.x).toBeGreaterThan(700);
    expect(a.y).toBeLessThan(650);
    expect(w.pool.spotOf('p1')).not.toBeNull();
  });

  it('đi ra khỏi màn hình rồi biến mất; mờ dần', () => {
    const w = world();
    const a = new Actor('p1', 'thone', frames.get('thone'), { x: 0, y: 0 });
    a.enter(w, true);
    a.leave(w);
    expect(w.pool.spotOf('p1')).toBeNull();
    run(a, w, 30);
    expect(a.gone).toBe(true);
    expect(a.y).toBeGreaterThan(1300);
    expect(a.y).toBeLessThan(1400);
    let done = false;
    for (let i = 0; i < 30 && !done; i++) done = a.fade(1 / 30);
    expect(done).toBe(true);
  });

  it('thiếu ảnh nhân vật: không lỗi, sprite null (lớp vẽ vẽ hình tạm)', () => {
    const w = world();
    const a = new Actor('p1', 'thone', undefined, { x: 0, y: 0 });
    a.enter(w, false);
    run(a, w, 3);
    expect(a.pose().sprite).toBeNull();
  });
});

describe('tượng ghi danh: xoay vòng khi hết ô', () => {
  const H = (seq: number): HonorInfo => ({ id: seq + 1, seq, name: `T${seq}` });

  it('tượng thứ k đứng ở ô k % số ô; chia lượt; kiểu tượng các ô liền nhau khác nhau', () => {
    const list = [0, 1, 2, 12, 13, 25].map(H);
    expect(pageOf(13, 12)).toBe(1);
    expect(pagesOf(list, 12)).toEqual([0, 1, 2]);
    expect(pageStatues(list, 12, 1).map((x) => [x.honor.seq, x.slot])).toEqual([
      [12, 0],
      [13, 1],
    ]);
    expect([0, 1, 2, 3].map(statueStyle)).toEqual([1, 2, 3, 1]);
  });
});

describe('camera lia ngắn tới tượng mới rồi quay về', () => {
  const map = { width: 1728, height: 5575 };
  const view = { left: 0, right: 1080, top: 180, bottom: 1320 };
  const cfg: CameraConfig = { maxZoom: 1.6, siteWidth: 0.52, overviewEverySec: 0, overviewSec: 9, tourEverySec: 0, tourSec: 20, ceremonySec: 5, ceremonyZoom: 1.15, shakeMinCoins: 1000 };
  const site = { x: 174, y: 1349, w: 297, h: 433 };
  const statue = { x: 360, y: 2560, w: 216, h: 160 };
  const inp: CameraInput = { map, view, cfg, focus: site, complex: { x: 0, y: 200, w: 1728, h: 2300 }, tourTarget: null };

  it('trong lúc lia: khung hình đích là tượng; hết giờ thì về hạng mục đang xây', () => {
    const d = new CameraDirector();
    d.update(0, inp);
    d.peek(statue, 4);
    expect(d.target(inp)).toEqual(siteCamera(map, statue, view, cfg));
    for (let t = 0; t < 4.1; t += 0.1) d.update(0.1, inp);
    expect(d.peeking).toBe(false);
    expect(d.target(inp)).toEqual(siteCamera(map, site, view, cfg));
  });

  it('đang toàn cảnh / lễ thì không lia', () => {
    const d = new CameraDirector();
    d.request('overview');
    d.peek(statue, 4);
    expect(d.peeking).toBe(false);
  });
});
