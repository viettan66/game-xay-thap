// Giao diện chung cho mọi nguồn live (mục 3 SPEC). Logic game không biết sự kiện đến từ đâu.

import type { LiveEvent } from '../../shared/types.js';

export type LiveSource = 'tiktok-connector' | 'simulator' | 'euler-ws' | 'tikfinity';

export type AdapterStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'connected' }
  | { state: 'retrying'; attempt: number; reason?: string }
  | { state: 'offline' }
  | { state: 'error'; message: string };

export interface LiveAdapter {
  readonly source: LiveSource;
  start(): void;
  stop(): void;
  status(): AdapterStatus;
  onEvent(cb: (ev: LiveEvent) => void): void;
  onStatus(cb: (s: AdapterStatus) => void): void;
}

/** Câu trạng thái hiển thị trên admin. */
export function statusText(s: AdapterStatus): string {
  switch (s.state) {
    case 'idle':
      return 'chưa chạy';
    case 'connecting':
      return 'đang kết nối';
    case 'connected':
      return 'đã kết nối';
    case 'retrying':
      return `đang thử lại (lần ${s.attempt})${s.reason ? `: ${s.reason}` : ''}`;
    case 'offline':
      return 'kênh chưa live';
    case 'error':
      return `lỗi: ${s.message}`;
  }
}

/** Phần dùng chung: lưu trạng thái, báo cho người nghe. */
export abstract class BaseAdapter implements LiveAdapter {
  abstract readonly source: LiveSource;
  private current: AdapterStatus = { state: 'idle' };
  private eventListeners: ((ev: LiveEvent) => void)[] = [];
  private statusListeners: ((s: AdapterStatus) => void)[] = [];

  abstract start(): void;
  abstract stop(): void;

  status(): AdapterStatus {
    return this.current;
  }

  onEvent(cb: (ev: LiveEvent) => void): void {
    this.eventListeners.push(cb);
  }

  onStatus(cb: (s: AdapterStatus) => void): void {
    this.statusListeners.push(cb);
  }

  protected setStatus(s: AdapterStatus): void {
    this.current = s;
    for (const l of this.statusListeners) l(s);
  }

  protected emit(ev: LiveEvent): void {
    for (const l of this.eventListeners) l(ev);
  }
}

/** Nguồn chưa làm hoặc không được phép: luôn báo lỗi, không phát sự kiện. */
export class UnavailableAdapter extends BaseAdapter {
  constructor(
    readonly source: LiveSource,
    private readonly message: string,
  ) {
    super();
  }

  start(): void {
    this.setStatus({ state: 'error', message: this.message });
  }

  stop(): void {
    this.setStatus({ state: 'idle' });
  }
}
