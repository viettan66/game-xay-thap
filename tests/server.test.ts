// Chạy server thật trên cổng ngẫu nhiên: HTTP API + WebSocket cho overlay.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { silentLogger } from '../server/logger.js';
import { startServer, type RunningServer } from '../server/server.js';
import { buildOverlayState, overlayName } from '../server/overlay/state.js';
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
    expect(contrib).toMatchObject({ source: 'gift', points: 100_000, coins: 1000 });
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

describe('camera và giao diện mới (R4)', () => {
  it('trạng thái gửi overlay có camera, bố cục, ô sự kiện; bảng tổng chỉ top 5', async () => {
    await start();
    for (let i = 0; i < 8; i++) await post('/api/sim/fire', { kind: 'gift_small' });
    await post('/api/crowd', { tier: 'vua' });
    const s = buildOverlayState(srv.core, null);
    expect(s.crowd).toBe('vua');
    expect(s.camera).toMatchObject({ maxZoom: 1.6, siteWidth: 0.52, overviewEverySec: 360, tourEverySec: 0, shakeMinCoins: 1000 });
    expect(s.hud).toMatchObject({ boardPosition: 'auto', minimap: 'overview', boardRotateSec: 15 });
    expect(s.eventBox).toEqual([]);
    expect(s.serverNow).toBe(clock.now());
    for (const b of s.boards) expect(b.rows.length).toBeLessThanOrEqual(5);
  });

  it('giờ vàng bật tay: ô sự kiện có dòng đếm ngược tới lúc tắt', async () => {
    await start();
    const until = clock.now() + 15 * 60_000;
    srv.core.engine.setGoldenManualUntil(until);
    const s = buildOverlayState(srv.core, null);
    expect(s.eventBox).toEqual([{ kind: 'golden', text: 'Giờ vàng ×2 · còn {time}', endsAt: until }]);
  });

  it('tên chứa từ cấm hiện "Thiện hữu ẩn danh" trên bảng xếp hạng', async () => {
    await start();
    await post('/api/sim/fire', { kind: 'gift_large' });
    const name = buildOverlayState(srv.core, null).boards[1]!.rows[0]!.nickname;
    const next = structuredClone(srv.core.config);
    next.nameFilter.bannedWords = [name.slice(0, 4)];
    srv.core.saveConfig(next, { source: 'test' });
    expect(buildOverlayState(srv.core, null).boards[1]!.rows[0]!.nickname).toBe('Thiện hữu ẩn danh');
    expect(overlayName(srv.core, name)).toBe('Thiện hữu ẩn danh');
  });

  it('nút Toàn cảnh / Lia giới thiệu gửi lệnh camera xuống overlay', async () => {
    await start();
    const c = connect(`http://127.0.0.1:${srv.port}`);
    await c.waitFor((m) => m.type === 'state');
    expect((await post('/api/camera', { mode: 'overview' })).status).toBe(200);
    expect(await c.waitFor((m) => m.type === 'camera')).toEqual({ type: 'camera', mode: 'overview' });
    expect((await post('/api/camera', { mode: 'bay' })).status).toBe(400);
  });

  it('chỉnh hiển thị: lưu vào config, sai thì báo lỗi, không đổi', async () => {
    await start();
    const r = await post('/api/display', { maxZoom: 1.4, siteWidth: 0.5, boardPosition: 'leftTop', minimap: 'always', opacity: { board: 0.5 } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ maxZoom: 1.4, siteWidth: 0.5, boardPosition: 'leftTop', minimap: 'always', opacity: { board: 0.5, progress: 0.78 } });
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'config', 'config.json'), 'utf8'));
    expect(saved.camera.maxZoom).toBe(1.4);
    expect(saved.overlay.boardPosition).toBe('leftTop');
    expect((await post('/api/display', { maxZoom: 9 })).status).toBe(400);
    expect((await post('/api/display', { boardPosition: 'giua' })).status).toBe(400);
    expect((await post('/api/display', { opacity: { khung: 1 } })).status).toBe(400);
    expect(srv.core.config.camera.maxZoom).toBe(1.4);
    expect(((await (await fetch(`${srv.url}/api/display`)).json()) as { boardPosition: string }).boardPosition).toBe('leftTop');
  });
});

describe('độ đông và trụ trì (4a)', () => {
  it('ép chế độ độ đông: camera, tốc độ đặt mảnh theo chế độ; trả về tự động', async () => {
    await start();
    const r = await post('/api/crowd', { tier: 'dong' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { crowd: { tier: string; forced: string } }).crowd).toMatchObject({ tier: 'dong', forced: 'dong' });
    let s = buildOverlayState(srv.core, null);
    expect(s.crowd).toBe('dong');
    expect(s.pieces.maxPerSec).toBe(14);
    expect(s.camera.overviewEverySec).toBe(0);
    await post('/api/crowd', { tier: 'vang' });
    s = buildOverlayState(srv.core, null);
    expect(s.camera).toMatchObject({ overviewEverySec: 180, tourEverySec: 600 });
    await post('/api/crowd', { tier: 'auto' });
    expect(srv.core.crowd.forced).toBeNull();
    expect((await post('/api/crowd', { tier: 'qua_dong' })).status).toBe(400);
  });

  it('mở phiên: trụ trì chào mở phiên; tặng quà: trụ trì cảm ơn (giả lập dùng cả câu chưa duyệt)', async () => {
    await start();
    const c = connect(`http://127.0.0.1:${srv.port}`);
    await c.waitFor((m) => m.type === 'state');
    await post('/api/session/start');
    const hello = (await c.waitFor((m) => m.type === 'say')) as Extract<ServerMessage, { type: 'say' }>;
    expect(hello.pose).toBe('welcome');
    expect(hello.text!.length).toBeGreaterThan(5);
    expect(hello.durationMs).toBeGreaterThanOrEqual(4000);
    // Câu tiếp theo phải đợi câu trước nói xong (đồng hồ giả: cho thời gian trôi).
    clock.advance(hello.durationMs + 1000);
    await post('/api/sim/fire', { kind: 'gift_large' });
    const thanks = (await c.waitFor((m) => m.type === 'say' && m !== hello)) as Extract<ServerMessage, { type: 'say' }>;
    expect(thanks.pose).toBe('bow');
  });
});

describe('thông báo quà, mục tiêu tim, kho thoại (4b)', () => {
  it('tặng quà: overlay nhận thông báo quà kèm ảnh vật phẩm', async () => {
    await start();
    const c = connect(`http://127.0.0.1:${srv.port}`);
    await c.waitFor((m) => m.type === 'state');
    await post('/api/sim/fire', { kind: 'gift_large' });
    const t = (await c.waitFor((m) => m.type === 'toast')) as Extract<ServerMessage, { type: 'toast' }>;
    expect(t).toMatchObject({ kind: 'big', coins: 1000, icon: 'items/bell' });
    expect(t.text).toContain('đại hồng chung');
  });

  it('đặt mục tiêu tim từ admin; đủ tim thì overlay múa lân; ô sự kiện hiện tiến độ tim', async () => {
    await start();
    const c = connect(`http://127.0.0.1:${srv.port}`);
    await c.waitFor((m) => m.type === 'state');
    await post('/api/session/start');
    let r = (await (await post('/api/goal', { target: 2000 })).json()) as { goal: { target: number; manual: number } };
    expect(r.goal).toMatchObject({ target: 2000, manual: 2000 });
    const box = buildOverlayState(srv.core, null).eventBox.find((e) => e.kind === 'goal')!;
    expect(box.text).toBe('❤ 0/2.000 · Đủ 2.000 tim mở khóa màn múa lân');
    await post('/api/sim/fire', { kind: 'like_1000' });
    await post('/api/sim/fire', { kind: 'like_1000' });
    const f = (await c.waitFor((m) => m.type === 'festival')) as Extract<ServerMessage, { type: 'festival' }>;
    expect(f).toEqual({ type: 'festival', target: 2000, durationMs: 14_000 });
    expect(buildOverlayState(srv.core, null).eventBox.find((e) => e.kind === 'goal')!.text).toBe('❤ 2.000 tim · đã mở khóa màn múa lân');
    r = (await (await post('/api/goal', { target: 'auto' })).json()) as { goal: { target: number; manual: number } };
    expect(r.goal.manual).toBeNull();
    expect((await post('/api/goal', { target: -5 })).status).toBe(400);
  });

  it('trang Kho thoại: đọc, kiểm tra câu, lưu (có backup bản cũ), nói thử, xuất file', async () => {
    await start();
    const g = (await (await fetch(`${srv.url}/api/dialogues`)).json()) as {
      file: { groups: Record<string, { lines: { text: string; verified: boolean }[] }> };
      warnings: string[];
      used: string[];
    };
    expect(g.used).toContain('toast_gift');
    expect(g.warnings).toContain('goal_reached'); // chưa có câu nào được duyệt
    const status = (await (await fetch(`${srv.url}/api/status`)).json()) as { dialogueWarnings: string[] };
    expect(status.dialogueWarnings).toEqual(g.warnings);

    const chk = (await (await post('/api/dialogues/check', { group: 'gift_small', text: 'Cảm ơn {ten}, chúc may mắn' })).json()) as { problems: string[] };
    expect(chk.problems).toHaveLength(2);

    const next = structuredClone(g.file);
    for (const l of next.groups.goal_reached!.lines) l.verified = true;
    next.groups.goal_reached!.lines.push({ ...next.groups.goal_reached!.lines[0]!, text: 'Đủ {target} tim rồi, mời xem lân!' });
    const saved = (await (await post('/api/dialogues', { file: next })).json()) as { warnings: string[]; file: typeof next };
    expect(saved.warnings).not.toContain('goal_reached');
    expect(saved.file.groups.goal_reached!.lines).toHaveLength(6);
    const disk = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dialogues.json'), 'utf8')) as typeof next;
    expect(disk.groups.goal_reached!.lines).toHaveLength(6);
    const backups = fs.readdirSync(path.join(srv.core.paths.backupsDir, 'dialogues'));
    expect(backups).toHaveLength(1);

    const bad = structuredClone(next);
    bad.groups.gift_small!.lines[0]!.text = 'Cảm ơn {ten}';
    const br = await post('/api/dialogues', { file: bad });
    expect(br.status).toBe(400);
    expect(((await br.json()) as { error: string }).error).toContain('{ten}');

    const c = connect(`http://127.0.0.1:${srv.port}`);
    await c.waitFor((m) => m.type === 'state');
    await post('/api/dialogues/say', { group: 'gift_small', text: 'Cảm ơn {name} đã góp {gift}!', verified: false });
    const say = (await c.waitFor((m) => m.type === 'say')) as Extract<ServerMessage, { type: 'say' }>;
    expect(say).toMatchObject({ text: 'Cảm ơn Tên người xem đã góp một xe trâu chở đá!', verified: false });
    await post('/api/dialogues/say', { group: 'toast_gift', text: '{name} vừa góp {gift}' });
    expect(await c.waitFor((m) => m.type === 'toast')).toMatchObject({ kind: 'big', text: 'Tên người xem vừa góp một xe trâu chở đá' });

    const ex = await fetch(`${srv.url}/api/dialogues/export`);
    expect(ex.headers.get('content-disposition')).toContain('dialogues-');
    expect(((await ex.json()) as typeof next).groups.goal_reached!.lines).toHaveLength(6);
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
