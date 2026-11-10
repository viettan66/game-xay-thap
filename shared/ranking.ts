// Xếp hạng và danh hiệu (mục 9, 14.5 SPEC).

export interface RankEntry {
  points: number;
  /** Thứ tự (mã sự kiện) lúc người này đạt mức điểm hiện tại. Nhỏ hơn = đạt trước. */
  reachedSeq: number;
}

/** Điểm cao trước; bằng điểm thì ai đạt mức điểm đó trước được xếp trên (14.5). */
export function compareRank(a: RankEntry, b: RankEntry): number {
  return b.points - a.points || a.reachedSeq - b.reachedSeq;
}

export interface TitleRule {
  minPoints: number;
  label: string;
}

/** Danh hiệu cao nhất đạt được, hoặc null nếu chưa đủ mức thấp nhất. */
export function titleFor(totalPoints: number, titles: TitleRule[]): string | null {
  let best: TitleRule | null = null;
  for (const t of titles) {
    if (totalPoints >= t.minPoints && (!best || t.minPoints > best.minPoints)) best = t;
  }
  return best?.label ?? null;
}
