// Các phép xử lý mặt nạ (ảnh xám một kênh) dùng khi cắt công trình từ bản đồ (mục 7). Hàm thuần, có test.
// Mặt nạ nhị phân: Uint8Array giá trị 0/1. Mặt nạ mềm (alpha): Uint8Array 0–255. Thứ tự điểm ảnh: hàng ngang trước.

export type Bin = Uint8Array;

/**
 * Nở / co vùng 1 theo ô vuông bán kính r: tách hai chiều, mỗi chiều dùng tổng cửa sổ trượt nên nhanh.
 * Ngoài mép ảnh coi là `pad` (khi co dùng 1 để mép ảnh không bị ăn vào, khi nở dùng 0).
 */
function slide(m: Bin, w: number, h: number, r: number, erodeMode: boolean): Bin {
  if (r <= 0) return m.slice();
  const pad = erodeMode ? 1 : 0;
  const size = 2 * r + 1;
  const pass = (src: Bin, len: number, lines: number, at: (line: number, k: number) => number): Bin => {
    const out = new Uint8Array(w * h);
    for (let line = 0; line < lines; line++) {
      const get = (k: number) => (k < 0 || k >= len ? pad : src[at(line, k)]!);
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += get(k);
      for (let k = 0; k < len; k++) {
        out[at(line, k)] = erodeMode ? (sum === size ? 1 : 0) : sum > 0 ? 1 : 0;
        sum += get(k + r + 1) - get(k - r);
      }
    }
    return out;
  };
  const rows = pass(m, w, h, (y, x) => y * w + x);
  return pass(rows, h, w, (x, y) => y * w + x);
}

export function dilate(m: Bin, w: number, h: number, r: number): Bin {
  return slide(m, w, h, r, false);
}

export function erode(m: Bin, w: number, h: number, r: number): Bin {
  return slide(m, w, h, r, true);
}

/** Bỏ đốm nhỏ hơn cửa sổ (co rồi nở). */
export function open(m: Bin, w: number, h: number, r: number): Bin {
  return dilate(erode(m, w, h, r), w, h, r);
}

/** Lấp khe nhỏ (nở rồi co). */
export function close(m: Bin, w: number, h: number, r: number): Bin {
  return erode(dilate(m, w, h, r), w, h, r);
}

/** Lấp các lỗ kín (vùng 0 không thông ra mép ảnh). */
export function fillHoles(m: Bin, w: number, h: number): Bin {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!m[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = m[i] || !outside[i] ? 1 : 0;
  return out;
}

export interface Components {
  /** Nhãn từng điểm ảnh: 0 = nền, 1..n = vùng. */
  labels: Int32Array;
  /** sizes[k] = số điểm ảnh của vùng k (sizes[0] không dùng). */
  sizes: number[];
}

/** Đánh nhãn các vùng liền nhau (nối 4 hướng). */
export function components(m: Bin, w: number, h: number): Components {
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || labels[s]) continue;
    const id = sizes.length;
    let count = 0;
    labels[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && m[j] && !labels[j]) {
          labels[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(count);
  }
  return { labels, sizes };
}

/** Mặt nạ 0/1 của đa giác (tọa độ tuyệt đối) trong khung (x0, y0, w, h). Lấy tâm điểm ảnh để xét trong/ngoài. */
export function polygonMask(points: [number, number][], x0: number, y0: number, w: number, h: number): Bin {
  const out = new Uint8Array(w * h);
  const n = points.length;
  for (let y = 0; y < h; y++) {
    const py = y0 + y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = points[i]!;
      const [xj, yj] = points[j]!;
      if (yi > py !== yj > py) xs.push(xi + ((py - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - x0 - 0.5));
      const to = Math.min(w - 1, Math.floor(xs[k + 1]! - x0 - 0.5));
      for (let x = from; x <= to; x++) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Làm mềm mép alpha bằng lọc trung bình ô vuông bán kính r (hai chiều). */
export function boxBlur(a: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return a.slice();
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / size;
      sum += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / size);
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/** 0 khi v ≤ lo, 1 khi v ≥ hi, chuyển mượt ở giữa. */
export function smoothstep(lo: number, hi: number, v: number): number {
  if (v <= lo) return 0;
  if (v >= hi) return 1;
  const t = (v - lo) / (hi - lo);
  return t * t * (3 - 2 * t);
}

/** Khung bao các điểm có alpha > threshold. Không có điểm nào thì null. */
export function bbox(a: Uint8Array, w: number, h: number, threshold = 0): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x]! > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
