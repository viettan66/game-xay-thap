// Kho thoại mặc định theo nguyên tắc ngôn ngữ (mục 0, 9C) và bộ chọn câu (shuffle / sequential / random).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dialoguesFileSchema, type DialoguesFile } from '../server/config/schema.js';
import { openDatabase, type DB } from '../server/db/database.js';
import { containsPhrase, lineProblems } from '../server/dialogue/rules.js';
import { DialogueSelector, type DialogueGroups } from '../server/dialogue/selector.js';
import { REPO_ROOT, makeTempRoot, removeTempRoot } from './helpers.js';

const defaults = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'dialogues.json'), 'utf8')) as DialoguesFile;
const ABBOT_GROUPS = [
  'session_start',
  'greet_single',
  'greet_group',
  'returning',
  'gift_small',
  'gift_medium',
  'gift_large',
  'gift_huge',
  'gift_thanks_group',
  'progress',
  'item_complete',
  'stage_ritual',
  'idle_story',
  'idle_howto',
  'session_end',
];

describe('kho thoại mặc định', () => {
  it('hợp lệ theo khuôn kiểm tra', () => {
    expect(dialoguesFileSchema.safeParse(defaults).success).toBe(true);
  });

  it('đủ các nhóm thoại trụ trì, mỗi nhóm 5–10 câu (idle_story khoảng 15), mặc định shuffle', () => {
    for (const g of ABBOT_GROUPS) {
      const group = defaults.groups[g];
      expect(group, g).toBeDefined();
      expect(group!.mode, g).toBe('shuffle');
      const n = group!.lines.length;
      if (g === 'idle_story') expect(n, g).toBeGreaterThanOrEqual(13);
      else {
        expect(n, g).toBeGreaterThanOrEqual(5);
        expect(n, g).toBeLessThanOrEqual(10);
      }
    }
  });

  it('không câu nào vi phạm bảng từ cấm, từ hạn chế; nhóm quà không có từ tôn giáo', () => {
    const problems: string[] = [];
    for (const [g, group] of Object.entries(defaults.groups)) {
      for (const l of group.lines) for (const p of lineProblems(g, l.text)) problems.push(`${g}: "${l.text}" – ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it('câu ngắn (dưới khoảng 20 chữ), riêng câu kiến thức và hướng dẫn được dài hơn chút', () => {
    for (const [g, group] of Object.entries(defaults.groups)) {
      for (const l of group.lines) {
        const words = l.text.split(/\s+/).length;
        expect(words, `${g}: ${l.text}`).toBeLessThanOrEqual(g.startsWith('idle_') ? 24 : 20);
      }
    }
  });

  it('câu mẫu của SPEC đã duyệt, câu viết thêm chờ duyệt', () => {
    expect(defaults.groups.session_start!.lines[0]).toMatchObject({ verified: true });
    expect(defaults.groups.idle_story!.lines.filter((l) => !l.verified).length).toBeGreaterThan(5);
  });

  it('bộ quét bắt được câu vi phạm', () => {
    expect(lineProblems('gift_small', 'Cảm ơn {name}, công đức vô lượng!')).toHaveLength(2);
    expect(lineProblems('idle_story', 'A Di Đà Phật, chào các con')).toHaveLength(1);
    expect(lineProblems('session_end', 'Tạm biệt. A Di Đà Phật.')).toEqual([]);
    expect(lineProblems('gift_huge', 'Cảm ơn {name}, chúc con bình an')).toHaveLength(1);
    expect(lineProblems('greet_single', 'Chào {ten}')).toEqual(['biến không hợp lệ {ten}']);
    expect(containsPhrase('Phật tử', 'phật')).toBe(true);
    expect(containsPhrase('Phật tử', 'tử')).toBe(true);
    expect(containsPhrase('Nhật Bản', 'phật')).toBe(false);
  });

  it('biến sai trong file kho thoại thì báo lỗi khi đọc', () => {
    const bad = structuredClone(defaults);
    bad.groups.gift_small!.lines[0]!.text = 'Cảm ơn {ten}';
    const r = dialoguesFileSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('{ten}');
  });
});

describe('bộ chọn câu', () => {
  let root: string;
  let db: DB;
  let groups: DialogueGroups;
  const line = (text: string, extra: Partial<DialogueGroups[string]['lines'][number]> = {}) => ({ text, tiers: [], weight: 1, enabled: true, verified: true, ...extra });
  const ctx = (over: Partial<Parameters<DialogueSelector['pick']>[1]> = {}) => ({ tier: 'vua' as const, vars: { name: 'Lan' }, verifiedOnly: false, now: 0, ...over });
  let seed = 1;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  beforeEach(() => {
    root = makeTempRoot();
    db = openDatabase(path.join(root, 'test.db'));
    seed = 7;
    groups = {
      sh: { mode: 'shuffle', cooldownSec: 0, lines: ['A', 'B', 'C', 'D'].map((t) => line(t)) },
      seq: { mode: 'sequential', cooldownSec: 0, lines: ['1', '2', '3'].map((t) => line(t)) },
      rnd: { mode: 'random', cooldownSec: 0, lines: [line('x', { weight: 1 }), line('y', { weight: 1 })] },
      cd: { mode: 'shuffle', cooldownSec: 10, lines: [line('chào {name}')] },
      filt: {
        mode: 'sequential',
        cooldownSec: 0,
        lines: [line('vắng', { tiers: ['vang'] }), line('chưa duyệt', { verified: false }), line('tắt', { enabled: false }), line('{percent}%'), line('ok')],
      },
    };
  });
  afterEach(() => {
    db.close();
    removeTempRoot(root);
  });

  it('shuffle: dùng hết một vòng không lặp, câu đầu vòng mới khác câu cuối vòng cũ', () => {
    const s = new DialogueSelector(db, () => groups, undefined, rng);
    let prev: string | null = null;
    for (let round = 0; round < 20; round++) {
      const seen = Array.from({ length: 4 }, () => s.pick('sh', ctx())!.text);
      expect(new Set(seen).size).toBe(4);
      if (prev) expect(seen[0]).not.toBe(prev);
      prev = seen[3]!;
    }
  });

  it('shuffle: khởi động lại vẫn nói tiếp vòng cũ', () => {
    const a = new DialogueSelector(db, () => groups, undefined, rng);
    const first = [a.pick('sh', ctx())!.text, a.pick('sh', ctx())!.text];
    const b = new DialogueSelector(db, () => groups, undefined, rng);
    const rest = [b.pick('sh', ctx())!.text, b.pick('sh', ctx())!.text];
    expect(new Set([...first, ...rest]).size).toBe(4);
  });

  it('sửa danh sách câu thì tạo vòng mới', () => {
    const s = new DialogueSelector(db, () => groups, undefined, rng);
    s.pick('sh', ctx());
    groups.sh!.lines = ['E', 'F'].map((t) => line(t));
    const got = [s.pick('sh', ctx())!.text, s.pick('sh', ctx())!.text];
    expect(got.sort()).toEqual(['E', 'F']);
  });

  it('sequential: lần lượt, hết thì quay lại', () => {
    const s = new DialogueSelector(db, () => groups);
    expect(Array.from({ length: 5 }, () => s.pick('seq', ctx())!.text)).toEqual(['1', '2', '3', '1', '2']);
  });

  it('random: tránh lặp câu vừa nói', () => {
    const s = new DialogueSelector(db, () => groups, undefined, rng);
    const got = Array.from({ length: 10 }, () => s.pick('rnd', ctx())!.text);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });

  it('lọc theo chế độ, đã duyệt, đang bật, đủ biến', () => {
    const s = new DialogueSelector(db, () => groups);
    const take = (c: ReturnType<typeof ctx>) => Array.from({ length: 4 }, () => s.pick('filt', c)?.text);
    expect(new Set(take(ctx({ verifiedOnly: true })))).toEqual(new Set(['ok']));
    expect(new Set(take(ctx({ tier: 'vang', vars: { percent: 50 } })))).toEqual(new Set(['vắng', 'chưa duyệt', '50%', 'ok']));
  });

  it('khoảng nghỉ của nhóm; điền biến vào câu', () => {
    const s = new DialogueSelector(db, () => groups);
    expect(s.pick('cd', ctx({ now: 1000 }))).toEqual({ group: 'cd', text: 'chào Lan', verified: true });
    expect(s.pick('cd', ctx({ now: 5000 }))).toBeNull();
    expect(s.pick('cd', ctx({ now: 11_001 }))?.text).toBe('chào Lan');
  });

  it('nhóm không có hoặc không còn câu hợp lệ: trả null, không lỗi', () => {
    const s = new DialogueSelector(db, () => groups);
    expect(s.pick('khong_co', ctx())).toBeNull();
    expect(s.pick('cd', ctx({ vars: {} }))).toBeNull();
  });
});
