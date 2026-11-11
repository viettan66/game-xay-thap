import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STAGE_H } from '../overlay/src/layout.js';
import { mapCamera } from '../overlay/src/mapLayout.js';
import type { MapTools } from '../server/assets/mapTools.js';
import { loadCuts } from '../server/assets/mapCut.js';
import { startServer, type RunningServer } from '../server/server.js';
import { silentLogger } from '../server/logger.js';
import type { MapManifest } from '../shared/map.js';
import { disableEvents, makeTempRoot, REPO_ROOT, removeTempRoot } from './helpers.js';

describe('camera tạm trên bản đồ (R2)', () => {
  const map = { width: 1728, height: 5575 };
  const view = { top: 530, bottom: 1270 };

  it('co bản đồ vừa bề ngang 1080, đặt hạng mục đang xây giữa vùng nhìn thấy', () => {
    const cam = mapCamera(map, { x: 455, y: 1705, w: 803, h: 528 }, view); // Tam quan
    expect(cam.scale).toBeCloseTo(1080 / 1728);
    const centerOnScreen = cam.y + (1705 + 264) * cam.scale;
    expect(centerOnScreen).toBeCloseTo((view.top + view.bottom) / 2);
  });

  it('không bao giờ lộ ra ngoài mép bản đồ', () => {
    const top = mapCamera(map, { x: 448, y: 260, w: 247, h: 486 }, view); // bảo tháp ở đỉnh bản đồ
    expect(top.y).toBe(0);
    const bottom = mapCamera(map, { x: 0, y: 5400, w: 100, h: 100 }, view);
    expect(bottom.y).toBeCloseTo(STAGE_H - map.height * bottom.scale);
    const none = mapCamera(map, null, view);
    expect(none.y).toBeLessThanOrEqual(0);
    expect(none.y).toBeGreaterThanOrEqual(STAGE_H - map.height * none.scale);
  });
});

describe('API bản đồ của trang /tools/assets', () => {
  let root: string;
  let srv: RunningServer | undefined;
  const calls: { segment: string[][]; build: number } = { segment: [], build: 0 };
  const fakeMap = { width: 1728, height: 5575, buildings: [] } as unknown as MapManifest;
  let failBuild = false;
  const tools: MapTools = {
    canSegment: () => true,
    segment: async (ids) => {
      calls.segment.push(ids);
    },
    build: async () => {
      calls.build++;
      if (failBuild) throw new Error('hỏng');
      return fakeMap;
    },
  };

  beforeEach(async () => {
    root = makeTempRoot();
    disableEvents(root);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'assets', 'map-cuts.json'), path.join(root, 'assets', 'map-cuts.json'));
    calls.segment = [];
    calls.build = 0;
    failBuild = false;
    srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false, mapTools: tools });
  });
  afterEach(async () => {
    await srv?.close();
    removeTempRoot(root);
  });

  const post = (url: string, body: unknown) =>
    fetch(`${srv!.url}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('đọc khung cắt và tên hạng mục', async () => {
    const j = (await (await fetch(`${srv!.url}/api/tools/map`)).json()) as { cuts: { buildings: { id: string }[] }; names: Record<string, string>; canSegment: boolean };
    expect(j.cuts.buildings.map((b) => b.id)).toContain('gac_chuong');
    expect(j.names.gac_chuong).toBe('Gác chuông');
    expect(j.canSegment).toBe(true);
  });

  it('đổi khung tách thì tách nền lại đúng công trình đó rồi dựng lại bản đồ', async () => {
    const r = await post('/api/tools/map/building', { building: { id: 'gac_chuong', parts: [{ mode: 'object', box: [90, 735, 256, 970] }] } });
    expect(r.status).toBe(200);
    expect(calls.segment).toEqual([['gac_chuong']]);
    expect(calls.build).toBe(1);
    expect(loadCuts(root).buildings.find((b) => b.id === 'gac_chuong')!.parts[0]!.box).toEqual([90, 735, 256, 970]);
  });

  it('chỉ đổi đường chân thì không tách nền lại', async () => {
    // Mặt nạ rembg của Gác chuông đã có sẵn và phủ hết khung.
    const dir = path.join(root, 'assets', 'work', 'map', 'rembg');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ gac_chuong_0: { crop: [79, 719, 272, 986] } }));
    fs.writeFileSync(path.join(dir, 'gac_chuong_0.png'), '');
    const r = await post('/api/tools/map/building', { building: { id: 'gac_chuong', parts: [{ mode: 'object', box: [95, 735, 256, 970] }], baseY: 960 } });
    expect(r.status).toBe(200);
    expect(calls.segment).toEqual([]);
    expect(calls.build).toBe(1);
    expect(loadCuts(root).buildings.find((b) => b.id === 'gac_chuong')!.baseY).toBe(960);
  });

  it('khung sai thì báo lỗi, không đổi file', async () => {
    const before = fs.readFileSync(path.join(root, 'assets', 'map-cuts.json'), 'utf8');
    const r = await post('/api/tools/map/building', { building: { id: 'gac_chuong', parts: [{ mode: 'object', box: [300, 735, 256, 970] }] } });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/nằm ngoài ảnh gốc hoặc bị ngược/);
    expect((await post('/api/tools/map/building', { building: { id: 'khong_co', parts: [] } })).status).toBe(400);
    expect(fs.readFileSync(path.join(root, 'assets', 'map-cuts.json'), 'utf8')).toBe(before);
  });

  it('cắt lỗi giữa chừng thì trả file khung cắt về như cũ', async () => {
    failBuild = true;
    const before = fs.readFileSync(path.join(root, 'assets', 'map-cuts.json'), 'utf8');
    const r = await post('/api/tools/map/building', { building: { id: 'gac_chuong', parts: [{ mode: 'object', box: [95, 735, 256, 970] }], baseY: 900 } });
    expect(r.status).toBe(500);
    expect(fs.readFileSync(path.join(root, 'assets', 'map-cuts.json'), 'utf8')).toBe(before);
  });

  it('chặn lệnh từ trang web lạ', async () => {
    const r = await fetch(`${srv!.url}/api/tools/map/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: '{}',
    });
    expect(r.status).toBe(403);
    expect(calls.build).toBe(0);
  });
});
