// Tên người xem hiển thị trên overlay (mục 8 "Lọc tên", 14.7). Hàm thuần, có test.
// - Chuẩn hóa NFKC để chữ kiểu "𝓜𝓲𝓷𝓱" hiện được; bỏ ký tự điều khiển, ký tự riêng, ký tự chưa gán.
// - Tên chứa từ cấm (so không dấu, không phân biệt hoa thường, bỏ dấu chấm, gạch, cách) hoặc rỗng sau khi lọc:
//   hiện tên ẩn danh trong config (mặc định "Thiện hữu ẩn danh").

/** Bỏ dấu tiếng Việt, đổi đ → d, chữ thường, chỉ giữ chữ cái và số (để so từ cấm). */
export function foldForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Tên sau khi chuẩn hóa: NFKC, bỏ ký tự không hiển thị được, gộp khoảng trắng. */
export function cleanName(raw: string): string {
  return (
    raw
      .normalize('NFKC')
      // Ký tự điều khiển, ký tự riêng (private use), chưa gán, nửa cặp surrogate lẻ. Giữ ZWJ và biến thể emoji.
      .replace(/[\p{Cc}\p{Co}\p{Cn}\p{Cs}]/gu, '')
      .replace(/[​‌‎‏‪-‮⁠-⁤﻿]/g, '')
      .replace(/\s+/gu, ' ')
      .trim()
  );
}

export function hasBannedWord(name: string, bannedWords: readonly string[]): boolean {
  const folded = foldForMatch(name);
  return bannedWords.some((w) => {
    const f = foldForMatch(w);
    return f.length > 0 && folded.includes(f);
  });
}

export function displayName(raw: string | null | undefined, bannedWords: readonly string[], anonymous: string): string {
  const name = cleanName(raw ?? '');
  if (!name || !/[\p{L}\p{N}\p{So}]/u.test(name) || hasBannedWord(name, bannedWords)) return anonymous;
  return name;
}
