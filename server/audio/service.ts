// Âm thanh phía server (mục 10A): quét thư viện, chọn bài nhạc nền (nhớ vị trí trong DB), bài đang phát, cảnh báo cho admin.
// Âm thanh phát ở trang overlay; server chỉ quyết định danh sách file và thứ tự bài.

import type { OrderMode } from '../../shared/audio.js';
import type { AudioFile } from '../config/schema.js';
import type { DB } from '../db/database.js';
import type { Logger } from '../logger.js';
import { ensureAudioTree, scanAudio, type AudioScan } from './library.js';
import { MusicSequencer } from './music.js';

export class AudioService {
  scan: AudioScan;
  readonly music: MusicSequencer;

  constructor(
    private readonly rootDir: string,
    db: DB,
    private readonly cfg: () => AudioFile,
    private readonly log: Logger,
  ) {
    try {
      const made = ensureAudioTree(rootDir);
      if (made > 0) log.info(`Đã tạo ${made} thư mục âm thanh còn thiếu trong assets/audio (kèm README.txt)`);
    } catch (e) {
      log.error('Không tạo được thư mục âm thanh', e);
    }
    this.scan = scanAudio(rootDir);
    this.music = new MusicSequencer(
      db,
      (p) => this.scan.library.music[p] ?? [],
      (p) => (this.cfg().music.modes[p] ?? 'shuffle') as OrderMode,
    );
    this.logSummary();
  }

  /** Quét lại thư mục (admin bấm "Quét lại"). */
  rescan(): AudioScan {
    this.scan = scanAudio(this.rootDir);
    this.logSummary();
    return this.scan;
  }

  private logSummary(): void {
    const s = this.scan;
    const n = Object.values(s.library).reduce((a, sec) => a + Object.values(sec as Record<string, string[]>).flat().length, 0);
    this.log.info(`Âm thanh: ${n} file, ${s.empty.length} nhóm trống, ${s.missingCredits.length} file chưa có credits`);
  }
}
