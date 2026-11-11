// Các vùng của công trình cho cách hiển thị "xây từng mảnh" (mục 7 SPEC). Hàm thuần.
// Vùng được lưu dưới dạng mảng nhãn: mỗi điểm ảnh của final.png mang số thứ tự vùng (1..7), 0 = chưa thuộc vùng nào.

export const PART_KEYS = ['nen', 'cot', 'khung', 'mai', 'tuong', 'trangtri', 'nuoc'] as const;
export type PartKey = (typeof PART_KEYS)[number];

export interface PartInfo {
  key: PartKey;
  /** Tên hiện trên trang /tools/parts (trang quản trị, không phải chữ người xem đọc). */
  label: string;
  /** Màu tô vùng trên trang công cụ. */
  color: string;
}

export const PARTS: PartInfo[] = [
  { key: 'nen', label: 'Nền, móng, bậc', color: '#8d6e63' },
  { key: 'cot', label: 'Cột', color: '#e53935' },
  { key: 'khung', label: 'Khung: xà, kèo', color: '#fb8c00' },
  { key: 'mai', label: 'Mái ngói', color: '#8e24aa' },
  { key: 'tuong', label: 'Tường, cửa', color: '#1e88e5' },
  { key: 'trangtri', label: 'Trang trí: bờ nóc, đầu đao, hoành phi, đèn', color: '#fdd835' },
  { key: 'nuoc', label: 'Mặt nước', color: '#00acc1' },
];

/** Số thứ tự nhãn của vùng (1..7). */
export function partIndex(key: PartKey): number {
  return PART_KEYS.indexOf(key) + 1;
}

export function partKeyOf(label: number): PartKey | null {
  return PART_KEYS[label - 1] ?? null;
}

export interface PartStats {
  /** Số điểm ảnh của từng vùng. */
  counts: Record<PartKey, number>;
  /** Điểm ảnh đặc của công trình mà chưa thuộc vùng nào (sẽ không bao giờ được xây). */
  unassigned: number;
  opaque: number;
}

/** Đếm điểm ảnh theo vùng; alpha > 128 coi là đặc. */
export function partStats(labels: Uint8Array, alpha: Uint8Array): PartStats {
  const counts = Object.fromEntries(PART_KEYS.map((k) => [k, 0])) as Record<PartKey, number>;
  let unassigned = 0;
  let opaque = 0;
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!;
    const k = partKeyOf(l);
    if (k) counts[k]++;
    if (alpha[i]! > 128) {
      opaque++;
      if (!k) unassigned++;
    }
  }
  return { counts, unassigned, opaque };
}
