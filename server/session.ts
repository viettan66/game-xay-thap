// Phiên live (mục 14.3 SPEC).
// - Tự bắt đầu khi adapter báo kênh đang live (chuyển sang "live").
// - Tự kết thúc khi kênh tắt live / mất kết nối quá autoEndOfflineMin phút.
// - Admin vẫn bắt đầu, kết thúc tay được. Kết thúc tay xong thì chỉ tự mở phiên mới khi kênh tắt rồi live lại.

import type { DB } from './db/database.js';

export type LiveStatus = 'live' | 'offline' | 'disconnected';

export interface SessionRow {
  id: number;
  started_at: number;
  ended_at: number | null;
  start_reason: string;
  end_reason: string | null;
}

export interface SessionManagerOptions {
  now?: () => number;
  autoEndOfflineMin: () => number;
  onStart?: (s: SessionRow) => void;
  onEnd?: (s: SessionRow) => void;
}

function prepareStatements(db: DB) {
  return {
    open: db.prepare<[], SessionRow>('SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1'),
    byId: db.prepare<[number], SessionRow>('SELECT * FROM sessions WHERE id = ?'),
    insert: db.prepare('INSERT INTO sessions (started_at, start_reason) VALUES (?, ?)'),
    close: db.prepare('UPDATE sessions SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL'),
    lastEventTs: db.prepare<[number], { ts: number | null }>('SELECT MAX(ts) AS ts FROM events WHERE session_id = ?'),
  };
}

export class SessionManager {
  private readonly now: () => number;
  private lastStatus: LiveStatus | null = null;
  private offlineSince: number | null = null;
  private readonly q: ReturnType<typeof prepareStatements>;

  constructor(
    private readonly db: DB,
    private readonly opts: SessionManagerOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.q = prepareStatements(db);
  }

  current(): SessionRow | null {
    return this.q.open.get() ?? null;
  }

  currentId(): number | null {
    return this.current()?.id ?? null;
  }

  /**
   * Gọi lúc khởi động: phiên còn mở từ lần chạy trước mà đã im lặng quá lâu thì đóng lại
   * (thời điểm kết thúc = lần hoạt động cuối). Ngược lại giữ phiên và chờ adapter kết nối lại.
   */
  recoverOnBoot(): void {
    const s = this.current();
    if (!s) return;
    const last = Math.max(s.started_at, this.q.lastEventTs.get(s.id)?.ts ?? 0);
    if (this.now() - last >= this.graceMs()) {
      this.finish(s.id, last, 'recovered_after_restart');
    } else {
      this.offlineSince = this.now();
    }
  }

  /** Adapter báo trạng thái kênh. */
  handleStatus(status: LiveStatus): void {
    const prev = this.lastStatus;
    this.lastStatus = status;
    if (status === 'live') {
      this.offlineSince = null;
      if (prev !== 'live' && !this.current()) this.begin('auto');
      return;
    }
    if (this.current() && this.offlineSince === null) this.offlineSince = this.now();
  }

  /** Gọi định kỳ (ví dụ 30 giây/lần) để tự kết thúc phiên khi kênh tắt live quá lâu. */
  tick(): void {
    const s = this.current();
    if (!s || this.offlineSince === null) return;
    if (this.now() - this.offlineSince >= this.graceMs()) {
      this.finish(s.id, this.offlineSince, 'auto_offline');
      this.offlineSince = null;
    }
  }

  startManual(): SessionRow {
    return this.current() ?? this.begin('manual');
  }

  endManual(): SessionRow | null {
    const s = this.current();
    if (!s) return null;
    this.offlineSince = null;
    return this.finish(s.id, this.now(), 'manual');
  }

  private graceMs(): number {
    return this.opts.autoEndOfflineMin() * 60_000;
  }

  private begin(reason: string): SessionRow {
    const id = Number(this.q.insert.run(this.now(), reason).lastInsertRowid);
    const s = this.q.byId.get(id)!;
    this.opts.onStart?.(s);
    return s;
  }

  private finish(id: number, endedAt: number, reason: string): SessionRow {
    this.q.close.run(endedAt, reason, id);
    const s = this.q.byId.get(id)!;
    this.opts.onEnd?.(s);
    return s;
  }
}
