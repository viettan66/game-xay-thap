// Các loại lễ, bia, khánh thành, credit (mục 10, 14.4, 14.12; giai đoạn 5).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CameraDirector, type CameraInput } from '../overlay/src/camera.js';
import { compactPoints, creditLines, creditsHeight, STELE_MIN_FONT, steleBox, steleProgress } from '../overlay/src/ceremony/layout.js';
import { CeremonyQueue, MAX_WAIT_SEC } from '../overlay/src/ceremony/queue.js';
import { hudRects } from '../overlay/src/hudLayout.js';
import type { GameCore } from '../server/core.js';
import { ceremoniesFor, creditsOf, steleEntries, steleFor } from '../server/game/ceremony.js';
import { silentLogger } from '../server/logger.js';
import { ceremonyDeps } from '../server/overlay/state.js';
import { startServer, type RunningServer } from '../server/server.js';
import type { CameraConfig, CeremonyInfo, ServerMessage } from '../shared/protocol.js';
import { vnTs } from '../shared/time.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot, viewer } from './helpers.js';

// ---------- Server: dựng lễ, bia, credit từ dữ liệu thật ----------

describe('lễ và bia (server)', () => {
  let root: string;
  let core: GameCore;
  const clock = new FakeClock(Date.UTC(2026, 10, 12, 5, 0, 0));

  beforeEach(() => {
    root = makeTempRoot();
    disableEvents(root);
    core = openTestCore(root, clock);
    core.sessions.startManual();
  });
  afterEach(async () => {
    await core.close();
    removeTempRoot(root);
  });

  const gift = (n: number, coins: number, id: string) =>
    core.processEvent({ type: 'gift', user: viewer(n), giftId: 'g', giftName: 'G', coinValueEach: coins, count: 1, ts: clock.t, eventId: id });
  const deps = () => ceremonyDeps(core, false);

  it('xong giai đoạn có lễ: bia top người góp CỦA GIAI ĐOẠN đó; giai đoạn thường: chữ giai đoạn mới', () => {
    gift(1, 30, 'a'); // 3.000
    gift(2, 40, 'b'); // 4.000
    const r = gift(3, 30, 'c'); // 3.000: giai đoạn 1 (8.000) xong, 2.000 sang giai đoạn 2
    const cs = ceremoniesFor(r.progress!.transitions, deps());
    expect(cs.map((c) => c.id)).toEqual(['stage_ritual:san_nen:0']);
    const c = cs[0]!;
    expect(c.durationSec).toBe(10);
    expect(c.shortSec).toBe(4);
    expect(c.stele!.title).toBe('Bia ghi danh – Lễ khởi công · San nền công trường');
    expect(c.stele!.rows).toEqual([
      { rank: 1, name: 'Người xem 2', points: 4000 },
      { rank: 2, name: 'Người xem 1', points: 3000 },
      { rank: 3, name: 'Người xem 3', points: 1000 },
    ]);
    expect(c.stele!.others).toBeNull();
    const r2 = gift(4, 80, 'd');
    const minor = ceremoniesFor(r2.progress!.transitions, deps());
    expect(minor[0]).toMatchObject({ kind: 'stage_minor', banner: 'Giai đoạn 3/5: Đầm nền', durationSec: 2.5, shortSec: 1, stele: null });
  });

  it('live thật chỉ dùng câu đã duyệt: tiêu đề bia lễ giai đoạn về mẫu chung', () => {
    gift(1, 100, 'a');
    const r = gift(1, 1, 'b');
    void r;
    const st = steleFor(ceremonyDeps(core, true), { kind: 'stage', itemId: 'san_nen', stageIndex: 0 });
    expect(st.title).toBe('Bia ghi danh – San nền công trường');
  });

  it('bia ghi top 10, dòng cuối "…và N thiện hữu khác"', () => {
    for (let i = 1; i <= 13; i++) gift(i, i, `g${i}`); // 13 người, 9.100 công
    const st = steleFor(deps(), { kind: 'stage', itemId: 'san_nen', stageIndex: 0 });
    expect(st.rows.length).toBe(10);
    expect(st.rows[0]!.name).toBe('Người xem 12'); // người thứ 13 chỉ có 200 công rơi vào giai đoạn 1
    expect(st.others).toBe('…và 3 thiện hữu khác');
  });

  it('xong hạng mục: thời lượng theo cỡ (nhỏ 8 giây, rút còn 4); hạng mục lớn có lễ hội; giai đoạn cuối không có lễ riêng', () => {
    const r = gift(1, 400, 'a'); // đúng 40.000 = cả San nền
    const cs = ceremoniesFor(r.progress!.transitions, deps());
    expect(cs.map((c) => c.kind)).toEqual(['stage_ritual', 'stage_minor', 'stage_minor', 'stage_minor', 'item_complete']);
    const item = cs[cs.length - 1]!;
    expect(item).toMatchObject({ id: 'item_complete:san_nen', size: 'nho', durationSec: 8, shortSec: 4, festival: false });
    expect(item.stele!.title).toBe('Bia ghi danh – San nền công trường');
    expect(item.stele!.rows).toEqual([{ rank: 1, name: 'Người xem 1', points: 40_000 }]);
  });

  it('khánh thành toàn công trình: lễ hạng mục cuối (lớn, 25 giây) rồi lễ khánh thành (60 giây), bia toàn công trình', () => {
    const r = gift(1, 30_000, 'a'); // 3.000.000 > 2.660.000
    const cs = ceremoniesFor(r.progress!.transitions, deps());
    expect(cs.slice(-2).map((c) => [c.id, c.durationSec, c.shortSec, c.festival])).toEqual([
      ['item_complete:thap_tang_9', 25, 25, true],
      ['project_complete', 60, 60, true],
    ]);
    expect(cs.find((c) => c.id === 'item_complete:gac_chuong')).toMatchObject({ durationSec: 15, shortSec: 15 }); // hạng mục vừa luôn đủ
    expect(cs.at(-1)!.stele!.title).toBe('Bia ghi danh – Đại Danh Lam Thiên Phúc');
    // Danh sách bia xem lại: mọi giai đoạn có lễ (trừ giai đoạn cuối), mọi hạng mục, toàn công trình.
    const list = steleEntries(core.db, core.project);
    expect(list.filter((e) => e.kind === 'item').length).toBe(23);
    expect(list.filter((e) => e.kind === 'project').length).toBe(1);
    expect(list.some((e) => e.kind === 'stage' && e.itemId === 'san_nen' && e.ritual === 'Lễ khởi công')).toBe(true);
  });

  it('credit: TẤT CẢ người góp công, nhiều công trước; dòng đầu, dòng cuối từ kho thoại', () => {
    gift(1, 10, 'a');
    gift(2, 50, 'b');
    core.processEvent({ type: 'like', user: viewer(3), count: 5, ts: clock.t, eventId: 'l' });
    const c = creditsOf(deps());
    expect(c.project).toBe('Đại Danh Lam Thiên Phúc');
    expect(c.names).toEqual(['Người xem 2', 'Người xem 1', 'Người xem 3']);
    expect(c.title).toBe('Cảm ơn 3 thiện hữu đã góp công xây dựng');
    expect(c.end).toBeTruthy();
  });
});

// ---------- Server thật: tin "ceremony", API bia ----------

describe('tin lễ qua WebSocket, trang Bia ghi danh', () => {
  let root: string;
  let srv: RunningServer;
  const sockets: WebSocket[] = [];
  const clock = new FakeClock(vnTs(2026, 3, 10, 20));

  beforeEach(async () => {
    root = makeTempRoot();
    disableEvents(root);
    srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false, now: clock.now });
  });
  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate();
    await srv.close();
    removeTempRoot(root);
  });

  const post = (p: string, body: unknown) =>
    fetch(`${srv.url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: srv.url }, body: JSON.stringify(body) });

  it('quà lớn: server gửi các lễ theo thứ tự; admin xem lại và chiếu lại bia', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    sockets.push(ws);
    const msgs: ServerMessage[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
    await new Promise((r) => ws.once('open', r));
    await post('/api/sim/fire', { kind: 'gift_large' }); // 100.000 công: xong San nền, Bệ cây bồ đề
    const wait = async (pred: (m: ServerMessage) => boolean) => {
      for (let i = 0; i < 200 && !msgs.some(pred); i++) await new Promise((r) => setTimeout(r, 10));
      return msgs.filter(pred);
    };
    const cers = (await wait((m) => m.type === 'ceremony' && m.ceremony.id === 'item_complete:be_bo_de')) && msgs.flatMap((m) => (m.type === 'ceremony' ? [m.ceremony] : []));
    expect(cers[0]!.id).toBe('stage_ritual:san_nen:0');
    expect(cers.map((c) => c.id)).toContain('item_complete:san_nen');
    expect(cers.findIndex((c) => c.id === 'item_complete:san_nen')).toBeLessThan(cers.findIndex((c) => c.id === 'item_complete:be_bo_de'));

    const list = (await (await fetch(`${srv.url}/api/steles`)).json()) as { steles: { kind: string; itemId: string }[] };
    expect(list.steles.filter((s) => s.kind === 'item').map((s) => s.itemId)).toEqual(['san_nen', 'be_bo_de']);
    const view = (await (await fetch(`${srv.url}/api/steles/view?kind=item&itemId=san_nen`)).json()) as { stele: { rows: unknown[] } };
    expect(view.stele.rows.length).toBe(1);
    expect((await post('/api/steles/show', { kind: 'item', itemId: 'san_nen' })).status).toBe(200);
    const replay = await wait((m) => m.type === 'ceremony' && m.ceremony.kind === 'replay');
    expect(replay.length).toBe(1);
    expect((await post('/api/steles/show', { kind: 'item', itemId: 'khong_co' })).status).toBe(400);
    const credits = (await (await fetch(`${srv.url}/api/credits`)).json()) as { names: string[] };
    expect(credits.names.length).toBe(1);
  });
});

// ---------- Overlay: hàng đợi lễ, bố cục bia, credit, camera ----------

const cer = (id: string, kind: CeremonyInfo['kind'], itemId: string | null, stageIndex: number | null, full = 10, short = 4): CeremonyInfo => ({
  id,
  kind,
  itemId,
  stageIndex,
  size: 'nho',
  durationSec: full,
  shortSec: short,
  banner: null,
  stele: null,
  festival: false,
});

describe('hàng đợi lễ (overlay)', () => {
  const never = () => false;

  it('chỉ bắt đầu khi mảnh cuối của giai đoạn đã đặt xong', () => {
    const q = new CeremonyQueue();
    q.push(cer('a', 'stage_ritual', 'gac', 2));
    q.update(1, never);
    expect(q.next()).toBeNull();
    q.stageDone('gac', 1, false);
    expect(q.next()).toBeNull();
    q.stageDone('gac', 2, false);
    expect(q.next()).toMatchObject({ durationSec: 10 });
  });

  it('nhiều lễ dồn lại: lễ đầu rút gọn (14.4); lễ cuối hàng diễn đủ', () => {
    const q = new CeremonyQueue();
    q.push(cer('m1', 'stage_minor', 'gac', 0, 2.5, 1));
    q.push(cer('r', 'stage_ritual', 'gac', 1, 10, 4));
    q.push(cer('i', 'item_complete', 'gac', null, 15, 15));
    q.stageDone('gac', 0, false);
    q.stageDone('gac', 1, false);
    q.stageDone('gac', 9, true);
    expect(q.next()!.durationSec).toBe(1);
    expect(q.next()!.durationSec).toBe(4);
    expect(q.next()!.durationSec).toBe(15);
  });

  it('mở lại overlay (dựng thẳng, không có mảnh bay): công trường đã qua chỗ đó thì diễn; chờ quá lâu cũng diễn', () => {
    const q = new CeremonyQueue();
    q.push(cer('i', 'item_complete', 'gac', null));
    q.update(0.5, (id, st) => id === 'gac' && st === null);
    expect(q.next()?.c.id).toBe('i');
    q.push(cer('j', 'item_complete', 'nha_to', null));
    q.update(MAX_WAIT_SEC - 1, never);
    expect(q.next()).toBeNull();
    q.update(2, never);
    expect(q.next()?.c.id).toBe('j');
  });

  it('không diễn lại lễ trùng; chiếu lại bia diễn ngay; khánh thành chỉ khi tới lượt đầu hàng', () => {
    const q = new CeremonyQueue();
    q.push(cer('i', 'item_complete', 'thap', null, 25, 25));
    q.push(cer('i', 'item_complete', 'thap', null, 25, 25));
    q.push(cer('p', 'project_complete', null, null, 60, 60));
    expect(q.length).toBe(2);
    q.update(0.1, never);
    expect(q.next()).toBeNull(); // lễ hạng mục chưa xong mảnh
    q.stageDone('thap', 6, true);
    expect(q.next()?.c.id).toBe('i');
    q.update(0.1, never);
    expect(q.next()?.c.id).toBe('p');
    q.push(cer('rp', 'replay', 'gac', null, 12, 12));
    expect(q.next()?.c.id).toBe('rp');
  });
});

describe('bố cục bia, credit', () => {
  it('bia vừa khung hình: chân bia trên dải miễn trừ, mặt bia đủ rộng cho 10 dòng chữ 32px', () => {
    const r = hudRects({ top: 180, bottom: 600, right: 150 });
    const b = steleBox({ left: r.view.left, right: r.view.right, top: r.view.top + 16, bottom: r.disclaimer.y - 4 });
    expect(b.base).toBe(r.disclaimer.y - 4);
    expect(b.base - b.h).toBeGreaterThanOrEqual(r.view.top);
    expect(b.inner.w).toBeGreaterThan(380);
    expect(b.inner.h).toBeGreaterThan(10 * 40 + 2 * STELE_MIN_FONT * 1.2 + 46);
    expect(b.cx - b.w / 2).toBeGreaterThanOrEqual(0);
    expect(b.cx + b.w / 2).toBeLessThanOrEqual(r.view.right);
  });

  it('bia trồi lên, đứng, thu lại; số công viết đủ', () => {
    expect([0, 0.6, 1.2, 5, 9.5, 10].map((t) => steleProgress(t, 10))).toEqual([0, 0.5, 1, 1, 0.5, 0]);
    expect(compactPoints(2_659_000)).toBe('2.659.000');
  });

  it('credit: tên công trình, dòng đầu, mọi tên theo thứ tự, dòng cuối', () => {
    const lines = creditLines({ project: 'Chùa', title: 'Cảm ơn', names: ['A', 'B'], end: 'Hẹn gặp lại' });
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ['project', 'Chùa'],
      ['title', 'Cảm ơn'],
      ['gap', ''],
      ['name', 'A'],
      ['name', 'B'],
      ['gap', ''],
      ['end', 'Hẹn gặp lại'],
    ]);
    expect(creditsHeight(lines)).toBe(lines.at(-1)!.y + lines.at(-1)!.h);
    expect(creditLines({ project: 'Chùa', title: '', names: [], end: '' }).map((l) => l.kind)).toEqual(['project', 'gap', 'gap']);
  });
});

describe('camera: thời lượng riêng của từng lễ', () => {
  const map = { width: 1728, height: 5575 };
  const view = { left: 0, right: 930, top: 180, bottom: 1320 };
  const cfg: CameraConfig = { maxZoom: 1.6, siteWidth: 0.52, overviewEverySec: 0, overviewSec: 9, tourEverySec: 0, tourSec: 20, ceremonySec: 5, ceremonyZoom: 1.15, shakeMinCoins: 1000 };
  const inp: CameraInput = { map, view, cfg, focus: { x: 174, y: 1349, w: 297, h: 433 }, complex: { x: 0, y: 200, w: 1728, h: 2300 }, tourTarget: null };
  const run = (d: CameraDirector, sec: number) => {
    for (let t = 0; t < sec; t += 0.1) d.update(0.1, inp);
  };

  it('lễ 15 giây giữ camera 15 giây; khánh thành chen được lia giới thiệu khi đang lễ; release về site', () => {
    const d = new CameraDirector();
    d.request('ceremony', inp.focus, 15);
    run(d, 10);
    expect(d.mode).toBe('ceremony');
    d.request('overview');
    expect(d.mode).toBe('ceremony'); // không chen ngang
    d.request('tour', null, 30, true);
    expect(d.mode).toBe('tour');
    run(d, 25);
    expect(d.mode).toBe('tour');
    d.release();
    expect(d.mode).toBe('site');
    d.request('ceremony', inp.focus);
    run(d, 5.2);
    expect(d.mode).toBe('site'); // không ghi thời lượng: theo config (5 giây)
  });
});
