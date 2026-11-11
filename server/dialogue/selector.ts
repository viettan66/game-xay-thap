// Bộ chọn câu thoại (mục 9C SPEC).
// - Chỉ chọn câu đang bật, đúng chế độ độ đông, đủ dữ liệu cho các biến trong câu; live thật chỉ dùng câu đã duyệt.
// - shuffle: xáo trộn, dùng hết một vòng rồi xáo lại; câu cuối vòng cũ không là câu đầu vòng mới.
//   sequential: lần lượt theo thứ tự. random: ngẫu nhiên theo weight, tránh lặp câu vừa nói.
// - Vị trí của shuffle / sequential lưu trong bảng dialogue_state, khởi động lại vẫn nói tiếp.
//   Sửa danh sách câu của nhóm thì vòng của nhóm đó được tạo lại.
// - cooldownSec: khoảng nghỉ tối thiểu giữa hai lần nói cùng nhóm.
// - Nhóm không còn câu hợp lệ: bỏ qua, ghi cảnh báo, không crash.

import crypto from 'node:crypto';
import type { CrowdTier } from '../../shared/protocol.js';
import { fillTemplate } from '../../shared/project.js';
import type { DialoguesFile } from '../config/schema.js';
import type { DB } from '../db/database.js';
import { silentLogger, type Logger } from '../logger.js';
import { varsOf } from './rules.js';

export type DialogueGroups = DialoguesFile['groups'];
export type DialogueVars = Record<string, string | number | undefined>;

export interface PickContext {
  tier: CrowdTier;
  vars: DialogueVars;
  /** Live thật: chỉ dùng câu đã duyệt. */
  verifiedOnly: boolean;
  now: number;
  /** Bỏ qua khoảng nghỉ của nhóm (ví dụ "nói thử"). */
  ignoreCooldown?: boolean;
}

export interface Picked {
  group: string;
  text: string;
  verified: boolean;
}

interface State {
  order: number[];
  position: number;
  hash: string;
  last: number | null;
}

function shuffled(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class DialogueSelector {
  private readonly lastSaid = new Map<string, number>();
  private readonly warned = new Map<string, number>();

  constructor(
    private readonly db: DB,
    private readonly groups: () => DialogueGroups,
    private readonly log: Logger = silentLogger,
    private readonly rng: () => number = Math.random,
  ) {}

  private load(group: string): State | null {
    const r = this.db
      .prepare<[string], { order_json: string; position: number; lines_hash: string; last_index: number | null }>(
        'SELECT order_json, position, lines_hash, last_index FROM dialogue_state WHERE group_key = ?',
      )
      .get(group);
    if (!r) return null;
    try {
      return { order: JSON.parse(r.order_json) as number[], position: r.position, hash: r.lines_hash, last: r.last_index };
    } catch {
      return null;
    }
  }

  private save(group: string, s: State): void {
    this.db
      .prepare(
        `INSERT INTO dialogue_state (group_key, order_json, position, lines_hash, last_index) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (group_key) DO UPDATE SET order_json = excluded.order_json, position = excluded.position,
           lines_hash = excluded.lines_hash, last_index = excluded.last_index`,
      )
      .run(group, JSON.stringify(s.order), s.position, s.hash, s.last);
  }

  /** Nhóm còn đang nghỉ bao nhiêu ms (0 = nói được). */
  cooldownLeft(group: string, now: number): number {
    const g = this.groups()[group];
    const last = this.lastSaid.get(group);
    if (!g || last === undefined) return 0;
    return Math.max(0, last + g.cooldownSec * 1000 - now);
  }

  private warn(group: string, msg: string, now: number): void {
    const last = this.warned.get(group) ?? -Infinity;
    if (now - last < 60_000) return;
    this.warned.set(group, now);
    this.log.warn(msg);
  }

  /** Chọn và điền một câu của nhóm; null nếu nhóm đang nghỉ hoặc không có câu hợp lệ. */
  pick(group: string, ctx: PickContext): Picked | null {
    const g = this.groups()[group];
    if (!g) {
      this.warn(group, `Kho thoại không có nhóm "${group}"`, ctx.now);
      return null;
    }
    if (!ctx.ignoreCooldown && this.cooldownLeft(group, ctx.now) > 0) return null;
    const lines = g.lines;
    const ok = (i: number) => {
      const l = lines[i]!;
      if (!l.enabled) return false;
      if (l.tiers.length > 0 && !l.tiers.includes(ctx.tier)) return false;
      if (ctx.verifiedOnly && !l.verified) return false;
      return varsOf(l.text).every((v) => ctx.vars[v] !== undefined && ctx.vars[v] !== '');
    };
    const eligible = lines.map((_, i) => i).filter(ok);
    if (!eligible.length) {
      this.warn(group, `Nhóm thoại "${group}" không còn câu hợp lệ (chế độ ${ctx.tier}${ctx.verifiedOnly ? ', chỉ câu đã duyệt' : ''}), bỏ qua`, ctx.now);
      return null;
    }
    const hash = crypto.createHash('sha1').update(JSON.stringify(lines.map((l) => l.text))).digest('hex').slice(0, 16);
    let st = this.load(group);
    // Danh sách câu đổi (sửa, thêm, xóa câu): bắt đầu vòng mới.
    if (!st || st.hash !== hash) st = { order: [], position: 0, hash, last: null };

    let idx: number;
    if (g.mode === 'random') {
      const pool = eligible.length > 1 ? eligible.filter((i) => i !== st.last) : eligible;
      const total = pool.reduce((a, i) => a + lines[i]!.weight, 0);
      let r = this.rng() * total;
      idx = pool[pool.length - 1]!;
      for (const i of pool) {
        r -= lines[i]!.weight;
        if (r < 0) {
          idx = i;
          break;
        }
      }
    } else if (g.mode === 'sequential') {
      const n = lines.length;
      const start = Math.min(st.position, n);
      idx = eligible[0]!;
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (ok(i)) {
          idx = i;
          break;
        }
      }
      st.position = idx + 1;
    } else {
      // shuffle: tìm câu hợp lệ kế tiếp trong vòng; hết vòng thì xáo vòng mới.
      const next = (): number | null => {
        for (let p = st!.position; p < st!.order.length; p++) {
          if (ok(st!.order[p]!)) {
            st!.position = p + 1;
            return st!.order[p]!;
          }
        }
        return null;
      };
      let found = st.order.length ? next() : null;
      if (found === null) {
        const order = shuffled(lines.length, this.rng);
        // Câu cuối vòng cũ không được là câu đầu vòng mới.
        if (order.length > 1 && order[0] === st.last) [order[0], order[1]] = [order[1]!, order[0]!];
        st.order = order;
        st.position = 0;
        found = next();
      }
      idx = found ?? eligible[0]!;
    }
    st.last = idx;
    this.save(group, st);
    this.lastSaid.set(group, ctx.now);
    const line = lines[idx]!;
    const vars = Object.fromEntries(Object.entries(ctx.vars).filter(([, v]) => v !== undefined)) as Record<string, string | number>;
    return { group, text: fillTemplate(line.text, vars), verified: line.verified };
  }
}
