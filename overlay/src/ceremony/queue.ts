// Hàng đợi lễ trên overlay (mục 10, 14.4). Thuần, có test.
// - Lễ chỉ bắt đầu khi mảnh cuối của giai đoạn đã đặt xong (Builder báo onStageDone), hoặc khi công trường đã hiện qua
//   giai đoạn / hạng mục đó (mở lại overlay, dựng thẳng); chờ quá lâu thì cũng cho diễn để không kẹt.
// - Nhiều lễ dồn lại (hàng đợi có hơn 1 lễ): lễ giai đoạn thường còn khoảng 1 giây, lễ giai đoạn có lễ và lễ hạng mục nhỏ
//   còn khoảng 4 giây; lễ hạng mục vừa, lớn và khánh thành luôn diễn đủ (server đã ghi shortSec cho từng lễ).
// - Lễ chiếu lại bia (admin bấm) diễn ngay khi tới lượt.

import type { CeremonyInfo } from '../../../shared/protocol.js';

/** Chờ mảnh cuối quá lâu (ví dụ overlay dựng thẳng, không có mảnh bay) thì vẫn cho diễn. */
export const MAX_WAIT_SEC = 40;
/** Giữ tối đa bấy nhiêu lễ đang chờ; thừa thì bỏ lễ giai đoạn thường cũ nhất. */
export const MAX_PENDING = 40;

interface Pending {
  c: CeremonyInfo;
  ready: boolean;
  waited: number;
}

export interface Started {
  c: CeremonyInfo;
  /** Thời lượng sẽ diễn (đã rút gọn nếu cần). */
  durationSec: number;
}

/** Công trường đã hiện qua chỗ này chưa (hạng mục, giai đoạn; giai đoạn null = cả hạng mục). */
export type PastCheck = (itemId: string, stageIndex: number | null) => boolean;

export class CeremonyQueue {
  private pending: Pending[] = [];
  private readonly seen = new Set<string>();

  get length(): number {
    return this.pending.length;
  }

  ids(): string[] {
    return this.pending.map((p) => p.c.id);
  }

  push(c: CeremonyInfo): void {
    if (this.seen.has(c.id)) return;
    this.seen.add(c.id);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    this.pending.push({ c, ready: c.kind === 'replay', waited: 0 });
    while (this.pending.length > MAX_PENDING) {
      const i = this.pending.findIndex((p) => p.c.kind === 'stage_minor');
      this.pending.splice(i >= 0 ? i : 0, 1);
    }
  }

  /** Mảnh cuối của giai đoạn vừa đặt xong (itemDone: là giai đoạn cuối, xong cả hạng mục). */
  stageDone(itemId: string, stageIndex: number, itemDone: boolean): void {
    for (const p of this.pending) {
      if (p.c.itemId !== itemId) continue;
      if ((p.c.kind === 'stage_minor' || p.c.kind === 'stage_ritual') && p.c.stageIndex === stageIndex) p.ready = true;
      if (p.c.kind === 'item_complete' && itemDone) p.ready = true;
    }
  }

  /** Cập nhật theo thời gian và theo những gì công trường đã hiện. */
  update(dt: number, past: PastCheck): void {
    for (const p of this.pending) {
      if (p.ready) continue;
      p.waited += dt;
      const c = p.c;
      if (c.kind === 'project_complete') p.ready = this.pending[0] === p;
      else if (c.itemId !== null && past(c.itemId, c.kind === 'item_complete' ? null : c.stageIndex)) p.ready = true;
      if (p.waited >= MAX_WAIT_SEC) p.ready = true;
    }
  }

  /** Lấy lễ đầu hàng nếu đã sẵn sàng; rút gọn khi còn lễ khác đang chờ phía sau (14.4). */
  next(): Started | null {
    const head = this.pending[0];
    if (!head?.ready) return null;
    this.pending.shift();
    const crowded = this.pending.length > 0;
    return { c: head.c, durationSec: crowded ? head.c.shortSec : head.c.durationSec };
  }

  clear(): void {
    this.pending = [];
  }
}
