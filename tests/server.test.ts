// Chạy server thật trên cổng ngẫu nhiên: HTTP API + WebSocket cho overlay.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { silentLogger } from '../server/logger.js';
import { startServer, type RunningServer } from '../server/server.js';
import type { ServerMessage } from '../shared/protocol.js';
import { vnTs } from '../shared/time.js';
import { disableEvents, FakeClock, makeTempRoot, removeTempRoot } from './helpers.js';

let root: string;
let srv: RunningServer;
let clock: FakeClock;
const sockets: WebSocket[] = [];

async function start(profile: 'test' | 'production' = 'test') {
  srv = await startServer({ rootDir: root, profile, logger: silentLogger, port: 0, simulatorTimer: false, now: clock.now });
}

function post(p: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return fetch(`${srv.url}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/** Mở WebSocket và gom tin nhắn; waitFor chờ tới khi có tin thỏa điều kiện. */
function connect(origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, origin ? { origin } : {});
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on('message', (d) => messages.push(JSON.parse(String(d)) as ServerMessage));
  const waitFor = (pred: (m: ServerMessage) => boolean, timeoutMs = 3000) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const m = messages.find(pred);
        if (m) return resolve(m);
        if (Date.now() - started > timeoutMs) return reject(new Error('Hết thời gian chờ tin nhắn'));
        setTimeout(check, 10);
      };
      check();
    });
  return { ws, messages, waitFor };
}

beforeEach(() => {
  root = makeTempRoot();
  disableEvents(root);
  clock = new FakeClock(vnTs(2026, 3, 10, 20));
});
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await srv?.close();
  removeTempRoot(root);
});

describe('WebSocket cho overlay', () => {
  it('kết nối là nhận ngay toàn bộ trạng thái; có sự kiện thì nhận trạng thái mới', async () => {
    await start();
    const c = connect(`http://127.0.0.1:${srv.port}`);
    const first = (await c.waitFor((m) => m.type === 'state')) as Extract<ServerMessage, { type: 'state' }>;
    expect(first.state.badge).toBe('CHẾ ĐỘ THỬ');
    expect(first.state.progress.item.number).toBe(1);

    const r = await post('/api/sim/fire', { kind: 'gift_large' }); // 100.000 công
    expect(r.status).toBe(200);
    const progress = await c.waitFor((m) => m.type === 'progress');
    expect(progress).toMatchObject({ type: 'progress' });
    const updated = (await c.waitFor((m) => m.type === 'state' && m.state.progress.item.number > 1)) as Extract<
      ServerMessage,
      { type: 'state' }
    >;
    // 40.000 San nền + 40.000 Bệ bồ đề + 20.000 vào Sân gạch (12.000 xong giai đoạn 1, 8.000 vào giai đoạn 2)
    expect(updated.state.progress).toMatchObject({ item: { id: 'san_gach', number: 3 }, stage: { number: 2 }, stagePoints: 8000 });
    expect(updated.state.boards[1]!.rows[0]!.points).toBe(100_000);
    // Tin "có công" để overlay cho mảnh bay vào đúng giai đoạn, kèm tên người góp (mục 7).
    const contrib = (await c.waitFor((m) => m.type === 'contribution')) as Extract<ServerMessage, { type: 'contribution' }>;
    expect(contrib).toMatchObject({ source: 'gift', points: 100_000 });
    expect(contrib.name.length).toBeGreaterThan(0);
    expect(contrib.allocations[0]).toMatchObject({ itemId: 'san_nen', stageIndex: 0, from: 0, cost: 8000 });
    expect(contrib.allocations.reduce((a, x) => a + x.points, 0)).toBe(100_000);
    expect(first.state.pieces.maxPerSec).toBe(20);
    expect(first.state.texts.pieceBurst).toContain('{name} vừa xây {n} {material}');
  });

  it('mất kết nối rồi kết nối lại thì nhận lại đúng trạng thái hiện tại', async () => {
    await start();
    await post('/api/sim/fire', { kind: 'gift_medium' });
    const a = connect();
    await a.waitFor((m) => m.type === 'state');
    a.ws.terminate();
    const b = connect();
    const snap = (await b.waitFor((m) => m.type === 'state')) as Extract<ServerMessage, { type: 'state' }>;
    // 10.000 công: xong giai đoạn 1 (8.000) của San nền, 2.000 vào giai đoạn 2
    expect(snap.state.progress).toMatchObject({ item: { id: 'san_nen' }, stage: { number: 2 }, stagePoints: 2000, totalPoints: 10_000 });
  });

  it('từ chối kết nối từ trang web lạ', async () => {
    await start();
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { origin: 'https://evil.example' });
    sockets.push(ws);
    const err = await new Promise<Error>((resolve) => ws.on('error', resolve));
    expect(err.message).toMatch(/403/);
  });
});

describe('API điều khiển', () => {
  it('chỉ nhận lệnh JSON từ chính trang của game', async () => {
    await start();
    const noJson = await fetch(`${srv.url}/api/sim/fire`, { method: 'POST', body: 'kind=gift_large' });
    expect(noJson.status).toBe(415);
    const evil = await post('/api/sim/fire', { kind: 'gift_large' }, { Origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(srv.core.engine.status().totalPoints).toBe(0);
    const own = await post('/api/sim/fire', { kind: 'gift_small' }, { Origin: srv.url });
    expect(own.status).toBe(200);
  });

  it('chạy/dừng giả lập, đổi kịch bản và tốc độ, phiên tự mở', async () => {
    await start();
    const r = await post('/api/sim/start', { scenario: 'ratdong', speed: 2 });
    const s = (await r.json()) as { sim: { running: boolean; scenario: string; speed: number }; session: unknown };
    expect(s.sim).toMatchObject({ running: true, scenario: 'ratdong', speed: 2 });
    expect(s.session).not.toBeNull();
    expect((await post('/api/sim/settings', { scenario: 'khong-co' })).status).toBe(400);
    expect((await post('/api/sim/fire', { kind: 'bom' })).status).toBe(400);
    const stopped = (await (await post('/api/sim/stop')).json()) as { sim: { running: boolean }; live: { text: string } };
    expect(stopped.sim.running).toBe(false);
    expect(stopped.live.text).toBe('kênh chưa live');
  });

  it('bắt đầu và kết thúc phiên bằng tay', async () => {
    await start();
    const a = (await (await post('/api/session/start')).json()) as { session: { id: number } | null };
    expect(a.session).not.toBeNull();
    const b = (await (await post('/api/session/end')).json()) as { session: unknown };
    expect(b.session).toBeNull();
  });

  it('hồ sơ production: không có giả lập, nguồn TikTok báo chưa làm', async () => {
    await start('production');
    expect((await post('/api/sim/fire', { kind: 'gift_large' })).status).toBe(403);
    expect((await post('/api/live/mode', { mode: 'simulator' })).status).toBe(403);
    const s = (await (await fetch(`${srv.url}/api/status`)).json()) as { badge: unknown; sim: unknown; live: { text: string } };
    expect(s.badge).toBeNull();
    expect(s.sim).toBeNull();
    expect(s.live.text).toMatch(/giai đoạn 6/);
  });

  it('chưa đóng gói overlay thì /overlay báo cách làm bằng tiếng Việt', async () => {
    await start();
    const r = await fetch(`${srv.url}/overlay/`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('npm run build');
  });

  it('đã đóng gói thì phục vụ overlay', async () => {
    fs.mkdirSync(path.join(root, 'dist', 'overlay'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'overlay', 'index.html'), '<!doctype html><title>ok</title>');
    await start();
    const r = await fetch(`${srv.url}/overlay/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<title>ok</title>');
  });
});

describe('trang thử xây /tools/build', () => {
  it('trả về danh sách hạng mục, chỗ đang xây, quy tắc tính công; không ghi gì vào dữ liệu game', async () => {
    await start();
    await post('/api/sim/fire', { kind: 'gift_large' });
    const before = srv.core.engine.status();
    const r = await fetch(`${srv.url}/api/tools/build`);
    expect(r.status).toBe(200);
    const b = (await r.json()) as {
      project: { items: { id: string; stages: { cost: number; build: { parts: string[] } }[] }[] };
      current: { itemId: string; stageIndex: number; completed: boolean };
      points: { giftPointsPerCoin: number };
      pieces: { maxPerSec: Record<string, number> };
      texts: { pieceBurst: string[] };
      labels: { badge: string; disclaimer: string };
    };
    expect(b.project.items.map((i) => i.id)).toEqual(srv.core.project.items.map((i) => i.id));
    expect(b.project.items[0]!.stages[0]!.build.parts).toBeDefined();
    expect(b.current).toEqual({ itemId: before.item.id, stageIndex: before.stage.number - 1, completed: false });
    expect(b.points.giftPointsPerCoin).toBe(srv.core.config.points.giftPointsPerCoin);
    expect(b.pieces.maxPerSec).toEqual({ vang: 20, vua: 20, dong: 14, ratdong: 10 });
    expect(b.texts.pieceBurst.length).toBeGreaterThan(0);
    expect(b.labels.badge).toBe(srv.core.config.labels.testBadge);
    expect(b.labels.disclaimer).toBe(srv.core.config.labels.disclaimer);
    expect(srv.core.engine.status()).toEqual(before);
  });

  it('trang chưa đóng gói thì báo cách làm', async () => {
    await start();
    const r = await fetch(`${srv.url}/tools/build`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('npm run build');
  });
});
