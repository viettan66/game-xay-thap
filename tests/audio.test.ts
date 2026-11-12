// Âm thanh (mục 10A, giai đoạn 5b): bộ chọn biến thể / bài, giới hạn chống ồn, quét thư mục, thứ tự nhạc nền, API.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ensureAudioTree, scanAudio } from '../server/audio/library.js';
import { MusicSequencer } from '../server/audio/music.js';
import { openDatabase, type DB } from '../server/db/database.js';
import { silentLogger } from '../server/logger.js';
import { buildOverlayState } from '../server/overlay/state.js';
import { startServer, type RunningServer } from '../server/server.js';
import {
  AMBIENT_GROUPS,
  emptyOrder,
  giftSoundAllowed,
  giftSoundGroup,
  isNight,
  MUSIC_PLAYLISTS,
  MUSIC_SITUATIONS,
  nextInOrder,
  PRIORITY,
  pieceSoundGroup,
  SFX_GROUPS,
  SoundGate,
  tierLimits,
  workSoundGroup,
  type AudioSettings,
  type GroupLimits,
  type OrderMode,
  type OrderState,
  type TierLimits,
} from '../shared/audio.js';
import type { ServerMessage } from '../shared/protocol.js';
import { disableEvents, makeTempRoot, removeTempRoot, REPO_ROOT } from './helpers.js';

/** Số ngẫu nhiên lặp lại được. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function run(n: number, mode: OrderMode, count: number, seed = 1): number[] {
  const rand = seeded(seed);
  let st: OrderState = emptyOrder();
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextInOrder(st, n, mode, rand)!;
    out.push(r.index);
    st = r.state;
  }
  return out;
}

describe('chọn biến thể / bài kế tiếp', () => {
  it('không có file: null; một file: luôn file đó', () => {
    expect(nextInOrder(emptyOrder(), 0, 'shuffle', Math.random)).toBeNull();
    for (const m of ['shuffle', 'sequential', 'random'] as const) expect(run(1, m, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it('shuffle: mỗi vòng đủ mọi file, không lặp trong vòng, không lặp ở chỗ nối hai vòng', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const seq = run(5, 'shuffle', 50, seed);
      for (let k = 0; k < 10; k++) expect([...seq.slice(k * 5, k * 5 + 5)].sort()).toEqual([0, 1, 2, 3, 4]);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it('sequential: lần lượt rồi quay lại đầu', () => {
    expect(run(3, 'sequential', 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it('random: không phát lại ngay file vừa phát, vẫn dùng đủ các file', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const seq = run(4, 'random', 200, seed);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
      expect(new Set(seq).size).toBe(4);
    }
  });

  it('số file đổi (thêm, bớt): shuffle tạo vòng mới, không trả chỉ số ngoài danh sách', () => {
    const rand = seeded(7);
    let st = nextInOrder(emptyOrder(), 5, 'shuffle', rand)!.state;
    st = nextInOrder(st, 5, 'shuffle', rand)!.state;
    for (let i = 0; i < 10; i++) {
      const r = nextInOrder(st, 3, 'shuffle', rand)!;
      expect(r.index).toBeLessThan(3);
      st = r.state;
    }
  });
});

const G = (p: Partial<GroupLimits> = {}): GroupLimits => ({ enabled: true, cooldownMs: 0, maxConcurrent: 3, ...p });
const T = (p: Partial<TierLimits> = {}): TierLimits => ({ maxConcurrent: 8, constructionPerSec: 0, likeGapSec: 0, ...p });

describe('giới hạn chống ồn (SoundGate)', () => {
  let gate: SoundGate;
  let id = 0;
  beforeEach(() => {
    gate = new SoundGate();
    id = 0;
  });
  /** Xin phát; được thì ghi nhận (âm dài durMs). */
  const play = (group: string, now: number, g = G(), t = T(), durMs = 1000) => {
    const info = SFX_GROUPS[group]!;
    const r = gate.request(group, info, g, t, now);
    if (r.ok) gate.commit({ id: ++id, group, priority: info.priority, until: now + durMs }, info.kind, now, r.evict);
    return r;
  };

  it('nhóm tắt thì không phát', () => {
    expect(play('brick_lay', 0, G({ enabled: false }))).toEqual({ ok: false, reason: 'tắt' });
  });

  it('thời gian nghỉ của nhóm (cooldownMs)', () => {
    const g = G({ cooldownMs: 500 });
    expect(play('toast_in', 0, g).ok).toBe(true);
    expect(play('toast_in', 300, g).ok).toBe(false);
    expect(play('toast_in', 500, g).ok).toBe(true);
  });

  it('số âm cùng lúc của một nhóm (maxConcurrent của nhóm); âm hết thì nhường chỗ', () => {
    const g = G({ maxConcurrent: 2 });
    expect(play('nail_hammer', 0, g).ok).toBe(true);
    expect(play('nail_hammer', 10, g).ok).toBe(true);
    expect(play('nail_hammer', 20, g)).toMatchObject({ ok: false, reason: 'nhóm đủ số âm' });
    expect(play('nail_hammer', 1001, g).ok).toBe(true); // âm đầu đã hết (dài 1 giây)
  });

  it('âm thi công: vừa tối đa 3 âm/giây, đông 2 âm/giây', () => {
    for (const [rate, expected] of [
      [3, 3],
      [2, 2],
    ] as const) {
      gate = new SoundGate();
      const t = T({ constructionPerSec: rate });
      let ok = 0;
      // 10 giây, mỗi 50 ms một yêu cầu (20/giây).
      for (let now = 0; now < 10_000; now += 50) if (play('brick_lay', now, G({ maxConcurrent: 99 }), t, 10).ok) ok++;
      expect(ok).toBeGreaterThanOrEqual(expected * 10 - 1);
      expect(ok).toBeLessThanOrEqual(expected * 10 + expected);
    }
  });

  it('âm thi công rất đông (0,2 âm/giây): thi thoảng 1 âm nổi bật, không im hẳn', () => {
    const t = T({ constructionPerSec: 0.2 });
    let ok = 0;
    for (let now = 0; now < 60_000; now += 100) if (play('wood_hammer', now, G({ maxConcurrent: 99 }), t, 10).ok) ok++;
    expect(ok).toBeGreaterThanOrEqual(11);
    expect(ok).toBeLessThanOrEqual(13);
  });

  it('vắng: âm thi công theo từng hoạt ảnh (không giới hạn mỗi giây)', () => {
    let ok = 0;
    for (let now = 0; now < 1000; now += 50) if (play('brick_lay', now, G({ maxConcurrent: 99 }), T({ constructionPerSec: 0 }), 10).ok) ok++;
    expect(ok).toBe(20);
  });

  it('tiếng tim: mỗi lô một lần / 1 lần mỗi 2 giây / 1 lần mỗi 5 giây / tắt', () => {
    const count = (gap: number) => {
      gate = new SoundGate();
      let ok = 0;
      for (let now = 0; now < 10_000; now += 100) if (play('like_pop', now, G({ maxConcurrent: 99 }), T({ likeGapSec: gap }), 10).ok) ok++;
      return ok;
    };
    expect(count(0)).toBe(100);
    expect(count(2)).toBe(5);
    expect(count(5)).toBe(2);
    expect(count(-1)).toBe(0);
  });

  it('quá số âm cùng lúc: bỏ âm ưu tiên thấp nhất (tim < thi công < quà nhỏ < giao diện < quà lớn < lễ)', () => {
    expect(PRIORITY.like).toBeLessThan(PRIORITY.construction);
    expect(PRIORITY.construction).toBeLessThan(PRIORITY.smallGift);
    expect(PRIORITY.smallGift).toBeLessThan(PRIORITY.ui);
    expect(PRIORITY.ui).toBeLessThan(PRIORITY.bigGift);
    expect(PRIORITY.bigGift).toBeLessThan(PRIORITY.ceremony);
    const t = T({ maxConcurrent: 3 });
    expect(play('like_pop', 0, G(), t, 5000).ok).toBe(true);
    expect(play('brick_lay', 10, G(), t, 5000).ok).toBe(true);
    expect(play('gift_small', 20, G(), t, 5000).ok).toBe(true);
    // Đầy 3 âm: quà lớn đẩy tiếng tim (ưu tiên thấp nhất) ra.
    const big = play('gift_elephant', 30, G(), t, 5000);
    expect(big).toEqual({ ok: true, evict: 1 });
    // Thi công mới không đẩy được âm nào (không thấp hơn ai): bỏ âm mới.
    expect(play('nail_hammer', 40, G(), t, 5000)).toMatchObject({ ok: false, reason: 'quá nhiều âm cùng lúc' });
    // Lễ đẩy âm thi công cũ.
    expect(play('milestone_bell', 50, G(), t, 5000)).toEqual({ ok: true, evict: 2 });
    expect(gate.active(60).map((p) => p.group)).toEqual(['gift_small', 'gift_elephant', 'milestone_bell']);
  });

  it('âm dừng sớm (ended) nhường chỗ', () => {
    const t = T({ maxConcurrent: 1 });
    expect(play('toast_in', 0, G(), t, 5000).ok).toBe(true);
    expect(play('rank_up', 10, G(), t, 5000).ok).toBe(false);
    gate.ended(1);
    expect(play('rank_up', 20, G(), t, 5000).ok).toBe(true);
  });
});

describe('âm quà, nhóm âm theo hoạt ảnh, ban đêm', () => {
  it('âm quà theo chế độ độ đông', () => {
    expect(giftSoundAllowed('vang', 1, false, 10)).toBe(true);
    expect(giftSoundAllowed('vua', 1, false, 10)).toBe(true);
    expect(giftSoundAllowed('dong', 9, false, 10)).toBe(false);
    expect(giftSoundAllowed('dong', 10, false, 10)).toBe(true);
    expect(giftSoundAllowed('ratdong', 500, false, 10)).toBe(false);
    expect(giftSoundAllowed('ratdong', 500, true, 10)).toBe(true);
  });

  it('nhóm âm quà theo hiệu ứng; âm mảnh khớp theo vật liệu; âm động tác làm việc', () => {
    expect(giftSoundGroup(null)).toBe('gift_small');
    expect(giftSoundGroup('logs')).toBe('gift_logs');
    expect(giftSoundGroup('cart')).toBe('gift_buffalo');
    expect(giftSoundGroup('elephant')).toBe('gift_elephant');
    expect(giftSoundGroup('bell')).toBe('gift_huge');
    expect(giftSoundGroup('statue')).toBe('gift_guardian');
    expect(pieceSoundGroup('ngoi')).toBe('tile_place');
    expect(pieceSoundGroup('go')).toBe('wood_hammer');
    expect(pieceSoundGroup('gach')).toBe('brick_lay');
    expect(workSoundGroup('saw')).toBe('wood_saw');
    expect(workSoundGroup('hammer')).toBe('nail_hammer');
    expect(workSoundGroup(null)).toBeNull();
    expect(workSoundGroup('idle')).toBeNull();
    // Mọi nhóm trả về đều có trong bảng nhóm.
    for (const g of [giftSoundGroup(null), giftSoundGroup('logs'), giftSoundGroup('cart'), giftSoundGroup('elephant'), giftSoundGroup('bell'), giftSoundGroup('statue')])
      expect(SFX_GROUPS[g]).toBeDefined();
    for (const p of ['ngoi', 'go', 'da', 'cat', 'gach']) expect(SFX_GROUPS[pieceSoundGroup(p)]).toBeDefined();
    for (const a of ['hoe', 'sand', 'saw', 'hammer', 'carve', 'chisel', 'stone', 'lay', 'trowel', 'rope', 'tile']) expect(SFX_GROUPS[workSoundGroup(a)!]).toBeDefined();
  });

  it('ban đêm qua nửa đêm (18:30 → 05:30)', () => {
    expect(isNight(18 * 60 + 29, '18:30', '05:30')).toBe(false);
    expect(isNight(18 * 60 + 30, '18:30', '05:30')).toBe(true);
    expect(isNight(2 * 60, '18:30', '05:30')).toBe(true);
    expect(isNight(5 * 60 + 30, '18:30', '05:30')).toBe(false);
    expect(isNight(12 * 60, '10:00', '14:00')).toBe(true);
  });

  it('cấu hình mặc định có đủ mọi nhóm, mọi tình huống; giới hạn đúng bảng mục 10A', () => {
    const s = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'audio.json'), 'utf8')) as AudioSettings;
    for (const g of Object.keys(SFX_GROUPS)) expect(s.groups[g], g).toBeDefined();
    for (const g of Object.keys(AMBIENT_GROUPS)) expect(s.ambient[g], g).toBeDefined();
    for (const k of MUSIC_SITUATIONS) expect(MUSIC_PLAYLISTS[s.music.situations[k]!], k).toBeDefined();
    expect(tierLimits(s, 'vang')).toEqual({ maxConcurrent: 6, constructionPerSec: 0, likeGapSec: 0 });
    expect(tierLimits(s, 'vua')).toEqual({ maxConcurrent: 8, constructionPerSec: 3, likeGapSec: 2 });
    expect(tierLimits(s, 'dong')).toEqual({ maxConcurrent: 8, constructionPerSec: 2, likeGapSec: 5 });
    expect(tierLimits(s, 'ratdong').likeGapSec).toBeLessThan(0);
    expect(s.limits.giftDongMinCoins).toBe(10);
  });

  it('không có nhóm âm tụng kinh, niệm Phật, mõ', () => {
    const text = JSON.stringify({ SFX_GROUPS, MUSIC_PLAYLISTS, AMBIENT_GROUPS }).toLowerCase();
    for (const banned of ['tụng', 'niệm phật', '"mo"', 'mõ ']) expect(text.includes(banned) && !text.includes('không')).toBe(false);
    expect(Object.keys(SFX_GROUPS).some((k) => /chant|tung_kinh|mo_/.test(k))).toBe(false);
  });
});

describe('thư viện âm thanh trên đĩa', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempRoot();
  });
  afterEach(() => removeTempRoot(root));

  const put = (rel: string, bytes = 10) => {
    const f = path.join(root, 'assets', 'audio', ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.alloc(bytes));
  };

  it('tạo đủ cây thư mục kèm README.txt; không ghi đè README đã có; chạy lại không tạo thêm', () => {
    const made = ensureAudioTree(root);
    const total = Object.keys(SFX_GROUPS).length + Object.keys(MUSIC_PLAYLISTS).length + Object.keys(AMBIENT_GROUPS).length;
    expect(made).toBe(total);
    const base = path.join(root, 'assets', 'audio');
    expect(fs.existsSync(path.join(base, 'README.txt'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(base, 'credits.json'), 'utf8'))).toEqual({ files: [] });
    for (const g of Object.keys(SFX_GROUPS)) expect(fs.readFileSync(path.join(base, 'sfx', g, 'README.txt'), 'utf8')).toContain(SFX_GROUPS[g]!.desc);
    fs.writeFileSync(path.join(base, 'sfx', 'brick_lay', 'README.txt'), 'của mình');
    expect(ensureAudioTree(root)).toBe(0);
    expect(fs.readFileSync(path.join(base, 'sfx', 'brick_lay', 'README.txt'), 'utf8')).toBe('của mình');
  });

  it('chưa có thư mục: thư viện rỗng, mọi nhóm báo trống (game im lặng, không lỗi)', () => {
    const s = scanAudio(root);
    expect(Object.values(s.library.sfx).flat()).toEqual([]);
    expect(s.empty.length).toBe(Object.keys(SFX_GROUPS).length + Object.keys(MUSIC_PLAYLISTS).length + Object.keys(AMBIENT_GROUPS).length);
    expect(s.creditsError).toBeNull();
  });

  it('quét file .ogg/.mp3 (tên có dấu), bỏ file khác; báo thiếu credits, thư mục lạ; version đổi khi thêm file', () => {
    ensureAudioTree(root);
    const v0 = scanAudio(root).version;
    put('sfx/brick_lay/đặt gạch 1.ogg');
    put('sfx/brick_lay/dat-gach-2.MP3');
    put('sfx/brick_lay/ghi-chu.txt');
    put('music/calm/sáo trúc.mp3');
    put('sfx/thu_rieng/a.ogg');
    fs.writeFileSync(
      path.join(root, 'assets', 'audio', 'credits.json'),
      JSON.stringify({ files: [{ file: 'sfx\\brick_lay\\đặt gạch 1.ogg', source: 'Tự thu âm', license: 'CC0', link: '' }] }),
    );
    const s = scanAudio(root);
    // Xếp theo thứ tự tiếng Việt (d trước đ).
    expect(s.library.sfx.brick_lay).toEqual(['sfx/brick_lay/dat-gach-2.MP3', 'sfx/brick_lay/đặt gạch 1.ogg']);
    expect(s.library.music.calm).toEqual(['music/calm/sáo trúc.mp3']);
    expect(s.missingCredits.sort()).toEqual(['music/calm/sáo trúc.mp3', 'sfx/brick_lay/dat-gach-2.MP3', 'sfx/thu_rieng/a.ogg']);
    expect(s.unknown).toEqual([{ section: 'sfx', group: 'thu_rieng' }]);
    expect(s.empty.some((e) => e.group === 'brick_lay')).toBe(false);
    expect(s.version).not.toBe(v0);
    expect(scanAudio(root).version).toBe(s.version);
  });

  it('credits.json sai cú pháp: báo lỗi, không crash', () => {
    ensureAudioTree(root);
    fs.writeFileSync(path.join(root, 'assets', 'audio', 'credits.json'), '{ files: [');
    const s = scanAudio(root);
    expect(s.creditsError).toMatch(/credits\.json sai cú pháp/);
    // Notepad lưu kèm BOM: vẫn đọc được.
    put('sfx/brick_lay/a.ogg');
    fs.writeFileSync(path.join(root, 'assets', 'audio', 'credits.json'), '\uFEFF' + JSON.stringify({ files: [{ file: 'sfx/brick_lay/a.ogg', source: 'x', license: 'CC0', link: '' }] }));
    const s2 = scanAudio(root);
    expect(s2.creditsError).toBeNull();
    expect(s2.missingCredits).toEqual([]);
  });
});

describe('thứ tự nhạc nền (lưu DB)', () => {
  let root: string;
  let db: DB;
  beforeEach(() => {
    root = makeTempRoot();
    db = openDatabase(path.join(root, 'test.db'));
  });
  afterEach(() => {
    db.close();
    removeTempRoot(root);
  });

  it('khởi động lại vẫn phát tiếp vòng cũ; playlist trống thì null; danh sách bài đổi thì vòng mới', () => {
    let files = ['a.ogg', 'b.ogg', 'c.ogg', 'd.ogg'];
    const make = (seed: number) => new MusicSequencer(db, (p) => (p === 'calm' ? files : []), () => 'shuffle', seeded(seed));
    const m1 = make(1);
    const first = [m1.next('calm'), m1.next('calm')];
    // "Tắt máy bật lại": bộ chọn mới (số ngẫu nhiên khác) đọc vị trí từ DB, phát nốt 2 bài còn lại của vòng.
    const m2 = make(99);
    const rest = [m2.next('calm'), m2.next('calm')];
    expect([...first, ...rest].sort()).toEqual(files);
    expect(m2.next('trong')).toBeNull();
    files = ['a.ogg', 'b.ogg', 'c.ogg', 'd.ogg', 'e.ogg'];
    const round = Array.from({ length: 5 }, () => m2.next('calm'));
    expect([...round].sort()).toEqual(files);
  });

  it('lần lượt (sequential) nối tiếp qua lần khởi động lại', () => {
    const files = ['1.ogg', '2.ogg', '3.ogg'];
    const make = () => new MusicSequencer(db, () => files, () => 'sequential');
    expect([make().next('normal'), make().next('normal'), make().next('normal'), make().next('normal')]).toEqual(['1.ogg', '2.ogg', '3.ogg', '1.ogg']);
  });
});

describe('API âm thanh', () => {
  let root: string;
  let srv: RunningServer;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    root = makeTempRoot();
    disableEvents(root);
    srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false });
  });
  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.terminate();
    await srv.close();
    removeTempRoot(root);
  });

  const post = (p: string, body: unknown) =>
    fetch(`${srv.url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: srv.url }, body: JSON.stringify(body) });
  const get = async <T>(p: string) => (await (await fetch(`${srv.url}${p}`)).json()) as T;

  it('khởi động tạo cây thư mục; quét lại thấy file mới; overlay nhận bài kế tiếp; file phục vụ ở /assets/audio', async () => {
    expect(fs.existsSync(path.join(root, 'assets', 'audio', 'sfx', 'brick_lay', 'README.txt'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'config', 'audio.json'))).toBe(true);
    const a0 = await get<{ empty: unknown[]; version: string; known: { situations: string[] } }>('/api/audio');
    expect(a0.empty.length).toBeGreaterThan(40);
    expect(a0.known.situations).toEqual(MUSIC_SITUATIONS);
    expect((await get<{ file: string | null }>('/api/audio/next?playlist=calm')).file).toBeNull();

    fs.writeFileSync(path.join(root, 'assets', 'audio', 'music', 'calm', 'bai 1.ogg'), Buffer.from('OggS'));
    const a1 = (await (await post('/api/audio/rescan', {})).json()) as { version: string; library: { music: Record<string, string[]> }; missingCredits: string[] };
    expect(a1.version).not.toBe(a0.version);
    expect(a1.library.music.calm).toEqual(['music/calm/bai 1.ogg']);
    expect(a1.missingCredits).toEqual(['music/calm/bai 1.ogg']);
    expect((await get<{ file: string }>('/api/audio/next?playlist=calm')).file).toBe('music/calm/bai 1.ogg');
    expect((await get<{ file: string | null }>('/api/audio/next?playlist=../x')).file).toBeNull();
    const f = await fetch(`${srv.url}/assets/audio/music/calm/bai%201.ogg`);
    expect(f.status).toBe(200);
    expect((await get<{ version: string }>('/api/audio/library')).version).toBe(a1.version);
    const st = await get<{ audio: { files: number; missingCredits: number } }>('/api/status');
    expect(st.audio).toMatchObject({ files: 1, missingCredits: 1 });
  });

  it('lưu cấu hình: kiểm tra giá trị, ghi file, overlay nhận cấu hình mới; giá trị sai bị từ chối', async () => {
    const a = await get<{ settings: AudioSettings }>('/api/audio');
    const next = structuredClone(a.settings);
    next.channels.music = 0.2;
    next.muted = true;
    const r = await post('/api/audio', { settings: next });
    expect(r.status).toBe(200);
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'config', 'audio.json'), 'utf8')) as AudioSettings;
    expect(saved.channels.music).toBe(0.2);
    expect(saved.muted).toBe(true);
    expect(buildOverlayState(srv.core, null).audio.settings.channels.music).toBe(0.2);
    const bad = structuredClone(next);
    bad.channels.music = 5;
    expect((await post('/api/audio', { settings: bad })).status).toBe(400);
    const bad2 = structuredClone(next) as unknown as { groups: Record<string, { mode: string }> };
    bad2.groups.brick_lay!.mode = 'lung tung';
    expect((await post('/api/audio', { settings: bad2 })).status).toBe(400);
  });

  it('lệnh chuyển bài / tạm dừng gửi xuống overlay; báo bài đang phát; quà có cờ âm thanh', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { headers: { Origin: srv.url } });
    sockets.push(ws);
    const msgs: ServerMessage[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
    await new Promise((r) => ws.once('open', r));
    const wait = async (pred: (m: ServerMessage) => boolean) => {
      for (let i = 0; i < 200 && !msgs.some(pred); i++) await new Promise((r) => setTimeout(r, 10));
      return msgs.find(pred);
    };
    expect((await post('/api/audio/cmd', { cmd: 'next' })).status).toBe(200);
    expect(await wait((m) => m.type === 'audio')).toEqual({ type: 'audio', cmd: 'next' });
    expect((await post('/api/audio/cmd', { cmd: 'xoa' })).status).toBe(400);
    await post('/api/audio/nowplaying', { playlist: 'calm', file: 'music/calm/a.ogg', paused: false });
    expect((await get<{ nowPlaying: { file: string } }>('/api/audio')).nowPlaying.file).toBe('music/calm/a.ogg');
    await post('/api/sim/fire', { kind: 'gift_small' });
    const c = await wait((m) => m.type === 'contribution' && m.source === 'gift');
    expect(c).toMatchObject({ type: 'contribution', sound: true });
  });
});
