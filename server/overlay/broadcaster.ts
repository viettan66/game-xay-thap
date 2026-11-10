// Gửi trạng thái xuống overlay, gộp lại khi có nhiều sự kiện dồn dập (tối đa ~4 lần/giây),
// để không phải tính lại bảng xếp hạng sau từng sự kiện một (mục 12 SPEC).

import type { OverlayState, ServerMessage } from '../../shared/protocol.js';
import type { TowerTransition } from '../../shared/tower.js';

export class StateBroadcaster {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;
  private dirty = false;

  constructor(
    private readonly build: () => OverlayState,
    private readonly sendAll: (msg: ServerMessage) => void,
    private readonly minIntervalMs = 250,
  ) {}

  snapshot(): ServerMessage {
    return { type: 'state', state: this.build() };
  }

  /** Báo có thay đổi; trạng thái mới sẽ được gửi trong vòng minIntervalMs. */
  markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    const wait = Math.max(0, this.lastSent + this.minIntervalMs - Date.now());
    this.timer = setTimeout(() => this.flush(), wait);
  }

  /** Báo tầng/giai đoạn vừa xong (để overlay chớp sáng), gửi ngay. */
  tower(transitions: TowerTransition[]): void {
    if (transitions.length > 0) this.sendAll({ type: 'tower', transitions });
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSent = Date.now();
    this.sendAll(this.snapshot());
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
