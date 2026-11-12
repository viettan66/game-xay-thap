// Chọn bài nhạc nền (mục 10A): mỗi playlist một vòng phát shuffle / sequential / random (đặt trên trang Âm thanh),
// vị trí lưu trong DB (bảng music_state) nên khởi động lại vẫn phát tiếp. Danh sách bài đổi (thêm, bớt file) thì vòng
// của playlist đó tạo lại. Overlay hỏi bài kế tiếp và báo bài đang phát (admin hiện bài đang phát).

import crypto from 'node:crypto';
import { emptyOrder, nextInOrder, type OrderMode, type OrderState } from '../../shared/audio.js';
import type { DB } from '../db/database.js';

export interface NowPlaying {
  playlist: string;
  file: string | null;
  paused: boolean;
  at: number;
}

export class MusicSequencer {
  nowPlaying: NowPlaying | null = null;

  constructor(
    private readonly db: DB,
    private readonly files: (playlist: string) => string[],
    private readonly mode: (playlist: string) => OrderMode,
    private readonly rand: () => number = Math.random,
  ) {}

  private load(playlist: string, hash: string): OrderState {
    const r = this.db
      .prepare<[string], { order_json: string; position: number; files_hash: string; last_index: number | null }>(
        'SELECT order_json, position, files_hash, last_index FROM music_state WHERE playlist = ?',
      )
      .get(playlist);
    if (!r || r.files_hash !== hash) return emptyOrder();
    try {
      return { order: JSON.parse(r.order_json) as number[], position: r.position, last: r.last_index };
    } catch {
      return emptyOrder();
    }
  }

  /** Bài kế tiếp của playlist (đường dẫn tương đối với assets/audio); playlist trống thì null. */
  next(playlist: string): string | null {
    const list = this.files(playlist);
    if (!list.length) return null;
    const hash = crypto.createHash('sha1').update(list.join('|')).digest('hex').slice(0, 16);
    const r = nextInOrder(this.load(playlist, hash), list.length, this.mode(playlist), this.rand);
    if (!r) return null;
    this.db
      .prepare(
        `INSERT INTO music_state (playlist, order_json, position, files_hash, last_index) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (playlist) DO UPDATE SET order_json = excluded.order_json, position = excluded.position,
           files_hash = excluded.files_hash, last_index = excluded.last_index`,
      )
      .run(playlist, JSON.stringify(r.state.order), r.state.position, hash, r.state.last);
    return list[r.index]!;
  }
}
