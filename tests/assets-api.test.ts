// API ảnh game và trang /tools/assets, chạy trên thư mục tạm có manifest và ảnh nhỏ.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { applyToManifest } from '../server/assets/tools.js';
import { ManifestError, validateManifest } from '../server/assets/manifest.js';
import { silentLogger } from '../server/logger.js';
import { startServer, type RunningServer } from '../server/server.js';
import { FLOOR_STAGE_KEYS, SPIRE_KEY, type Manifest } from '../shared/manifest.js';
import type { ServerMessage } from '../shared/protocol.js';
import { disableEvents, makeTempRoot, removeTempRoot } from './helpers.js';

let root: string;
let srv: RunningServer | null = null;

function sampleManifest(): Manifest {
  const floor = { w: 40, h: 50, anchor: { x: 20, y: 40 }, eaveLineY: 40, topY: 5, bottomY: 45, eaveWidth: 40 };
  const images: Manifest['images'] = {};
  for (const k of FLOOR_STAGE_KEYS) images[k] = { file: `${k}.png`, ...floor, auto: { eaveLineY: 40, topY: 5 } };
  images[SPIRE_KEY] = { file: 'tower/spire.png', ...floor, auto: { eaveLineY: 40, topY: 5 } };
  images['bg/background'] = { file: 'bg/background.png', w: 1080, h: 1920, anchor: { x: 0, y: 0 } };
  return {
    version: 1,
    images,
    background: {
      variant: 'A',
      variants: [
        { key: 'A', label: 'A', background: 'bg/variants/background_A.png', sky: 'bg/variants/sky_upper_A.png' },
        { key: 'B', label: 'B', background: 'bg/variants/background_B.png', sky: 'bg/variants/sky_upper_B.png' },
      ],
      towerAnchor: { x: 508, y: 1215 },
      skyOverlap: 150,
    },
    tower: { spireScale: 1 },
  };
}

async function png(file: string, color: { r: number; g: number; b: number }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: 4, height: 4, channels: 4, background: { ...color, alpha: 1 } } }).png().toFile(file);
}

beforeEach(async () => {
  root = makeTempRoot();
  disableEvents(root);
  const game = path.join(root, 'assets', 'game');
  for (const k of [...FLOOR_STAGE_KEYS, SPIRE_KEY, 'bg/background']) await png(path.join(game, `${k}.png`), { r: 200, g: 0, b: 0 });
  await png(path.join(game, 'bg/variants/background_A.png'), { r: 255, g: 0, b: 0 });
  await png(path.join(game, 'bg/variants/sky_upper_A.png'), { r: 255, g: 0, b: 0 });
  await png(path.join(game, 'bg/variants/background_B.png'), { r: 0, g: 0, b: 255 });
  await png(path.join(game, 'bg/variants/sky_upper_B.png'), { r: 0, g: 0, b: 255 });
  fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify(sampleManifest()));
});
afterEach(async () => {
  await srv?.close();
  srv = null;
  removeTempRoot(root);
});

const start = async () => {
  srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false });
  return srv;
};
const post = (p: string, body: unknown) =>
  fetch(`${srv!.url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('kiểm tra manifest', () => {
  it('báo lỗi khi topY không nằm trên eaveLineY', () => {
    const m = sampleManifest();
    m.images[SPIRE_KEY]!.topY = 45;
    expect(() => validateManifest(m)).toThrow(ManifestError);
  });

  it('chỉnh tay: ghi giá trị mới, đánh dấu đã chỉnh, giữ giá trị máy đo', () => {
    const pieces = Object.fromEntries(FLOOR_STAGE_KEYS.map((k) => [k, { eaveLineY: 38, topY: 6 }]));
    const next = applyToManifest(sampleManifest(), { pieces, towerAnchor: { x: 500.4, y: 1200.6 }, spireScale: 1.25 });
    expect(next.images['tower/floor_stage_3']).toMatchObject({ eaveLineY: 38, topY: 6, tuned: true, auto: { eaveLineY: 40, topY: 5 } });
    expect(next.background.towerAnchor).toEqual({ x: 500, y: 1201 });
    expect(next.tower.spireScale).toBe(1.25);
  });

  it('5 ảnh tầng phải dùng chung eaveLineY', () => {
    expect(() => applyToManifest(sampleManifest(), { pieces: { 'tower/floor_stage_1': { eaveLineY: 30, topY: 5 } } })).toThrow(/cùng eaveLineY/);
  });
});

describe('server phục vụ ảnh và trang /tools/assets', () => {
  it('trả manifest và file ảnh; ảnh không có thì 404', async () => {
    await start();
    const m = (await (await fetch(`${srv!.url}/assets/manifest.json`)).json()) as Manifest;
    expect(m.background.variant).toBe('A');
    const img = await fetch(`${srv!.url}/assets/game/tower/spire.png`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect((await fetch(`${srv!.url}/assets/game/khong-co.png`)).status).toBe(404);
  });

  it('chưa có manifest thì báo 404 kèm hướng dẫn, game vẫn chạy', async () => {
    fs.rmSync(path.join(root, 'assets', 'manifest.json'));
    await start();
    const r = await fetch(`${srv!.url}/assets/manifest.json`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toContain('assets:build');
    expect((await fetch(`${srv!.url}/api/status`)).status).toBe(200);
  });

  it('lưu điểm căn: ghi manifest + config, overlay đang mở nhận phiên bản ảnh mới', async () => {
    await start();
    const ws = new WebSocket(`ws://127.0.0.1:${srv!.port}/ws`);
    const msgs: ServerMessage[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
    await new Promise((r) => ws.once('open', r));
    await new Promise((r) => setTimeout(r, 100));
    const before = (msgs[0] as Extract<ServerMessage, { type: 'state' }>).state.assetsVersion;

    const pieces = Object.fromEntries(FLOOR_STAGE_KEYS.map((k) => [k, { eaveLineY: 39, topY: 7 }]));
    const r = await post('/api/tools/manifest', { pieces, towerAnchor: { x: 520, y: 1210 }, floor1WidthPx: 540, towerTaper: 0.99 });
    expect(r.status).toBe(200);
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8')) as Manifest;
    expect(saved.images['tower/floor_stage_1']).toMatchObject({ eaveLineY: 39, topY: 7, tuned: true });
    expect(saved.background.towerAnchor).toEqual({ x: 520, y: 1210 });
    expect(srv!.core.config.overlay).toMatchObject({ floor1WidthPx: 540, towerTaper: 0.99 });
    const logged = srv!.core.db.prepare("SELECT source FROM config_changes WHERE path = 'overlay.towerTaper'").get() as { source: string };
    expect(logged.source).toBe('tools/assets');

    await new Promise((res) => setTimeout(res, 400));
    const last = msgs.filter((m) => m.type === 'state').at(-1) as Extract<ServerMessage, { type: 'state' }>;
    expect(last.state.assetsVersion).not.toBe(before);
    expect(last.state.layout.floor1WidthPx).toBe(540);
    ws.terminate();
  });

  it('giá trị sai thì không lưu', async () => {
    await start();
    const bad = await post('/api/tools/manifest', { pieces: { 'tower/spire': { eaveLineY: 10, topY: 20 } } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/topY/);
  });

  it('chọn bản nền: chép thành ảnh chính thức và ghi vào manifest', async () => {
    await start();
    const r = await post('/api/tools/background', { variant: 'B' });
    expect(r.status).toBe(200);
    const pixel = await sharp(path.join(root, 'assets', 'game', 'bg', 'background.png')).raw().toBuffer();
    expect([pixel[0], pixel[1], pixel[2]]).toEqual([0, 0, 255]);
    const m = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8')) as Manifest;
    expect(m.background.variant).toBe('B');
    expect((await post('/api/tools/background', { variant: 'Z' })).status).toBe(400);
  });

  it('trang /tools/assets: chưa đóng gói thì báo cách làm', async () => {
    await start();
    const r = await fetch(`${srv!.url}/tools/assets`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('npm run build');
  });
});
