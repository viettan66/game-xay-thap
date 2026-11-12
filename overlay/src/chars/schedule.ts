// Hẹn giờ công trường tự chạy (mục 9B): chim bay, xe trâu NPC. Hàm thuần, có test.

/** Lần tới sau bao lâu: quanh `everySec` (±40%) để không đều đặn máy móc; 0 = không bao giờ. */
export function nextDelay(everySec: number, rand: () => number): number {
  return everySec > 0 ? everySec * (0.6 + rand() * 0.8) : Infinity;
}

/** Hẹn giờ xe trâu NPC chạy qua công trường. */
export class NpcCartTimer {
  private wait: number | null = null;

  constructor(private readonly rand: () => number = Math.random) {}

  /** Trả về true khi tới lượt cho một xe trâu NPC chạy qua. */
  tick(dt: number, everySec: number): boolean {
    if (everySec <= 0) {
      this.wait = null;
      return false;
    }
    if (this.wait === null) this.wait = nextDelay(everySec, this.rand) * 0.5;
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = nextDelay(everySec, this.rand);
    return true;
  }
}
