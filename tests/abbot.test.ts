// Trụ trì nói gì, lúc nào (mục 9, 9A, 9C): chào, cảm ơn quà theo chế độ, gộp, ưu tiên, mốc tiến độ, thoại tự do.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AbbotDirector, joinNames, sayDurationMs, type SayMessage } from '../server/abbot/director.js';
import type { GameConfig } from '../server/config/schema.js';
import type { PickContext } from '../server/dialogue/selector.js';
import type { ProcessResult } from '../server/game/engine.js';
import type { CrowdTier, ProgressView } from '../shared/protocol.js';
import type { ProgressTransition } from '../shared/project.js';
import type { LiveEvent } from '../shared/types.js';
import { REPO_ROOT } from './helpers.js';

const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'config.json'), 'utf8')) as GameConfig;
const user = (n: number) => ({ platformId: `u${n}`, uniqueId: `u${n}`, nickname: `Người ${n}` });
const counted = (progress: ProcessResult['progress'] = null): ProcessResult => ({ status: 'counted', eventRowId: 1, score: null, multiplier: null, progress });

function setup(tier: CrowdTier, opts: { percent?: number; session?: number | null } = {}) {
  let now = 1_000_000;
  let t = tier;
  let percent = opts.percent ?? 0;
  const said: SayMessage[] = [];
  const picks: { group: string; ctx: PickContext }[] = [];
  const greeted = new Set<string>();
  const progress = () =>
    ({
      item: { id: 'gac_chuong', name: 'Gác chuông', number: 8, count: 23 },
      stage: { number: 5, count: 10, name: 'Dựng cột', ritual: null },
      percent,
      completed: false,
      items: [{ id: 'gac_chuong', name: 'Gác chuông', stages: Array.from({ length: 10 }, (_, k) => ({ name: k === 4 ? 'Dựng cột' : `GĐ ${k + 1}` })) }],
    }) as unknown as ProgressView;
  const d = new AbbotDirector({
    selector: {
      pick: (group, ctx) => {
        picks.push({ group, ctx });
        return { group, text: `${group}|${JSON.stringify(ctx.vars)}`, verified: true };
      },
    },
    config: () => config,
    tier: () => t,
    verifiedOnly: () => true,
    progress,
    name: (raw) => raw.toUpperCase(),
    sessionId: () => (opts.session === undefined ? 1 : opts.session),
    greeted: { has: (s, p) => greeted.has(`${s}:${p}`), add: (s, p) => void greeted.add(`${s}:${p}`) },
    itemContributors: () => 42,
    send: (m) => said.push(m),
    now: () => now,
    rng: () => 0,
  });
  const run = (sec: number) => {
    for (let k = 0; k < sec * 2; k++) {
      now += 500;
      d.tick();
    }
  };
  const ev = (e: LiveEvent, r = counted()) => d.onEvent(e, r);
  const gift = (n: number, coins: number) => ev({ type: 'gift', user: user(n), giftId: 'g', giftName: 'G', coinValueEach: coins, count: 1, ts: now });
  return {
    d,
    said,
    picks,
    run,
    ev,
    gift,
    setTier: (x: CrowdTier) => (t = x),
    setPercent: (x: number) => (percent = x),
    groups: () => said.map((m) => m.text?.split('|')[0]),
  };
}

describe('chào người mới', () => {
  it('phòng vắng: chào từng người khi vào, mỗi người một lần trong phiên', () => {
    const s = setup('vang');
    s.ev({ type: 'join', user: user(1), ts: 0 });
    s.ev({ type: 'join', user: user(1), ts: 0 });
    s.run(20);
    expect(s.groups()).toEqual(['greet_single']);
    expect(s.said[0]!.text).toContain('NGƯỜI 1'); // tên đi qua bộ lọc
    expect(s.said[0]!.pose).toBe('wave');
  });

  it('phòng vừa: chào lần tương tác đầu, gộp nhóm trong 10 giây', () => {
    const s = setup('vua');
    for (const n of [1, 2, 3, 4, 5]) s.ev({ type: 'like', user: user(n), count: 3, ts: 0 });
    s.ev({ type: 'join', user: user(9), ts: 0 }); // vào phòng thì không chào
    s.run(5);
    expect(s.said).toHaveLength(0);
    s.run(10);
    expect(s.groups()).toEqual(['greet_group']);
    expect(s.picks[0]!.ctx.vars).toMatchObject({ names: 'NGƯỜI 1, NGƯỜI 2 và NGƯỜI 3', n: 2 });
  });

  it('phòng đông, rất đông: không chào; chưa có phiên thì không chào', () => {
    for (const tier of ['dong', 'ratdong'] as const) {
      const s = setup(tier);
      s.ev({ type: 'join', user: user(1), ts: 0 });
      s.ev({ type: 'comment', user: user(1), text: 'hi', ts: 0 });
      s.run(20);
      expect(s.said).toHaveLength(0);
    }
    const s = setup('vang', { session: null });
    s.ev({ type: 'join', user: user(1), ts: 0 });
    s.run(20);
    expect(s.said).toHaveLength(0);
  });
});

describe('cảm ơn quà', () => {
  it('mức quà theo số xu: tên vật phẩm, nhóm thoại, dáng', () => {
    const s = setup('vua');
    s.gift(1, 5);
    s.gift(2, 150);
    s.gift(3, 700);
    s.gift(4, 2000);
    s.gift(5, 6000);
    s.run(60);
    const gifts = s.picks.filter((p) => p.group.startsWith('gift_'));
    expect(gifts.map((p) => [p.group, p.ctx.vars.gift])).toEqual([
      ['gift_small', 'một viên gạch'],
      ['gift_medium', 'một xe trâu chở đá'],
      ['gift_large', 'một đoàn voi chở gỗ'],
      ['gift_huge', 'một quả đại hồng chung'],
      ['gift_huge', 'một tượng võ tướng đá'],
    ]);
    expect(s.said.filter((m) => m.text?.startsWith('gift_')).map((m) => m.pose)).toEqual(['pray', 'wave', 'wave', 'bow', 'bow']);
  });

  it('phòng vắng: cúi chào mọi quà', () => {
    const s = setup('vang');
    s.gift(1, 1);
    s.run(10);
    expect(s.said[0]!.pose).toBe('bow');
  });

  it('phòng vừa: quà liên tiếp của cùng người chưa kịp cảm ơn thì gộp làm một', () => {
    const s = setup('vua');
    s.gift(1, 2000); // đang nói câu này
    s.run(1);
    s.gift(2, 50);
    s.gift(2, 60);
    s.run(30);
    const forTwo = s.picks.filter((p) => p.ctx.vars.name === 'NGƯỜI 2');
    expect(forTwo).toHaveLength(1);
    expect(forTwo[0]!.group).toBe('gift_medium'); // 110 xu
  });

  it('phòng đông: cảm ơn quà lớn và quà đầu tiên; quà nhỏ còn lại gộp thành câu cảm ơn chung', () => {
    const s = setup('dong');
    s.gift(1, 5); // quà đầu tiên của người 1
    s.gift(1, 5);
    s.gift(2, 5);
    s.gift(2, 5);
    s.gift(3, 200);
    s.run(40);
    expect(s.groups().filter((g) => g === 'gift_small')).toHaveLength(2);
    expect(s.groups()).toContain('gift_medium');
    const group = s.picks.find((p) => p.group === 'gift_thanks_group');
    expect(group?.ctx.vars).toEqual({ n: 2 });
  });

  it('phòng rất đông: chỉ cảm ơn riêng quà từ 1.000 xu', () => {
    const s = setup('ratdong');
    s.gift(1, 500);
    s.gift(2, 1000);
    s.run(40);
    expect(s.groups()).toEqual(['gift_huge', 'gift_thanks_group']);
  });
});

describe('ưu tiên và nhịp nói', () => {
  it('lễ, xong hạng mục nói trước quà; đợi 2 giây cho mảnh cuối đặt xong', () => {
    const s = setup('vua');
    s.gift(1, 5);
    s.gift(2, 5);
    const ts: ProgressTransition[] = [{ type: 'item_complete', itemId: 'gac_chuong', size: 'vua' }];
    s.d.onTransitions(ts);
    s.run(30);
    expect(s.groups()[1]).toBe('item_complete'); // câu đầu đã nói ngay, câu lễ đợi 2 giây rồi chen lên trước
    expect(s.picks.find((p) => p.group === 'item_complete')!.ctx.vars).toEqual({ item: 'Gác chuông', count: 42 });
    expect(s.said.find((m) => m.text?.startsWith('item_complete'))!.pose).toBe('welcome');
  });

  it('mỗi lần một câu, 4–6 giây; chỉ dùng câu đã duyệt khi live thật', () => {
    const s = setup('vua');
    s.gift(1, 5);
    s.gift(2, 5);
    s.run(1);
    expect(s.said).toHaveLength(1);
    s.run(10);
    expect(s.said).toHaveLength(2);
    expect(s.picks.every((p) => p.ctx.verifiedOnly)).toBe(true);
    expect(sayDurationMs('ngắn')).toBe(4000);
    expect(sayDurationMs('x'.repeat(200))).toBe(6000);
  });

  it('thoại tự do theo nhịp của chế độ; rất đông không nói tự do', () => {
    const s = setup('vang');
    s.run(59);
    expect(s.said).toHaveLength(0);
    s.run(2);
    expect(s.groups()).toEqual(['idle_story']);
    const r = setup('ratdong');
    r.run(600);
    expect(r.said).toHaveLength(0);
  });

  it('phòng đông: báo tiến độ khi giai đoạn qua mốc 50%, 80%, 95%', () => {
    const s = setup('dong', { percent: 40 });
    s.ev({ type: 'like', user: user(1), count: 1, ts: 0 });
    s.setPercent(55);
    s.ev({ type: 'like', user: user(1), count: 1, ts: 0 });
    s.setPercent(60);
    s.ev({ type: 'like', user: user(1), count: 1, ts: 0 });
    s.run(10);
    expect(s.picks.filter((p) => p.group === 'progress').map((p) => p.ctx.vars.percent)).toEqual([50]);
  });

  it('mở phiên, đóng phiên', () => {
    const s = setup('vua');
    s.d.onSessionStart();
    s.run(8);
    s.d.onSessionEnd();
    s.run(8);
    expect(s.groups()).toEqual(['session_start', 'session_end']);
  });

  it('gộp tên', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A và B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B và C');
  });
});
