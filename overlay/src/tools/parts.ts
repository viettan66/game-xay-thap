// Trang /tools/parts (giai đoạn R3a, mục 7 SPEC "Xây từng mảnh"): chia ảnh công trình thành các vùng
// (nền, cột, khung, mái, tường, trang trí, mặt nước). Máy đề xuất sẵn; chủ dự án tô lại bằng cọ, tẩy, rồi lưu.
// Vùng là một mảng nhãn cùng cỡ final.png: 0 = chưa thuộc vùng nào, 1..7 = thứ tự trong PARTS.

import { assetUrl } from '../../../shared/manifest.js';
import { PARTS, type PartInfo } from '../../../shared/parts.js';

interface BuildingRow {
  id: string;
  name: string;
  w: number;
  h: number;
  layer: string;
  status: 'none' | 'auto' | 'edited';
}
interface PartsReply {
  building: { id: string; name: string; w: number; h: number; file: string; layer: string };
  labels: string;
  source: 'none' | 'auto' | 'edited' | 'unsaved';
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const STATUS_TEXT: Record<string, string> = {
  none: 'chưa chia',
  unsaved: 'máy đề xuất, chưa lưu',
  auto: 'máy đề xuất, đã lưu',
  edited: 'đã chỉnh tay',
};

const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
let parts: PartInfo[] = PARTS;
let buildings: BuildingRow[] = [];
let current: PartsReply['building'] | null = null;
let source: PartsReply['source'] = 'none';
let labels: Uint8Array = new Uint8Array(0);
let saved: Uint8Array = new Uint8Array(0);
let base: ImageData | null = null;
let alpha = new Uint8Array(0);
let selected = 1;
const hidden = new Set<number>();
let tool: 'brush' | 'eraser' = 'brush';
let view: 'color' | 'solo' | 'plain' = 'color';
let size = 10;
let zoom = 2;
let opacity = 0.55;
const undoStack: Uint8Array[] = [];
const redoStack: Uint8Array[] = [];
let colors: [number, number, number][] = [];

function msg(html: string): void {
  $('msg').innerHTML = html;
}

const dirty = () => labels.length > 0 && !labels.every((v, i) => v === saved[i]);

// ---------- Tải dữ liệu ----------

async function loadList(): Promise<void> {
  const r = (await (await fetch('/api/tools/parts', { cache: 'no-store' })).json()) as { parts: PartInfo[]; buildings: BuildingRow[] };
  parts = r.parts;
  colors = parts.map((p) => [1, 3, 5].map((k) => parseInt(p.color.slice(k, k + 2), 16)) as [number, number, number]);
  buildings = r.buildings;
  const sel = $<HTMLSelectElement>('building');
  const keep = sel.value || new URLSearchParams(location.search).get('id') || 'gac_chuong';
  sel.innerHTML = buildings.map((b) => `<option value="${b.id}">${b.name} – ${STATUS_TEXT[b.status]}</option>`).join('');
  sel.value = buildings.some((b) => b.id === keep) ? keep : (buildings[0]?.id ?? '');
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encode(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

async function loadImage(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}

async function open(id: string, propose = false): Promise<void> {
  msg('Đang tải…');
  const r = (await (await fetch(`/api/tools/parts/${id}${propose ? '/propose' : ''}`, { method: propose ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: propose ? '{}' : undefined })).json()) as PartsReply & { error?: string };
  if (r.error) {
    msg(`<span class="err">${r.error}</span>`);
    return;
  }
  current = r.building;
  source = r.source;
  base = await loadImage(`${assetUrl(r.building.file)}?v=${Date.now()}`);
  alpha = new Uint8Array(base.width * base.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = base.data[i * 4 + 3]!;
  labels = decode(r.labels);
  // Đề xuất lại thì "đã lưu" vẫn là bản cũ, để nút Lưu sáng lên.
  if (!propose) saved = labels.slice();
  undoStack.length = 0;
  redoStack.length = 0;
  canvas.width = base.width;
  canvas.height = base.height;
  applyZoom();
  render();
  refreshPanel();
  msg(`${current.name}: ${current.w}×${current.h} điểm ảnh`);
}

// ---------- Vẽ ----------

function render(x0 = 0, y0 = 0, x1 = canvas.width, y1 = canvas.height): void {
  if (!base) return;
  const w = canvas.width;
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(canvas.height, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  const out = ctx.createImageData(x1 - x0, y1 - y0);
  const d = out.data;
  const src = base.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
      let r = src[i * 4]!;
      let g = src[i * 4 + 1]!;
      let b = src[i * 4 + 2]!;
      let a = src[i * 4 + 3]!;
      const l = labels[i]!;
      if (a > 16 && view !== 'plain') {
        if (l === 0) {
          // Chưa thuộc vùng nào: sọc đỏ, để thấy ngay chỗ sẽ không bao giờ được xây.
          if (((x + y) >> 2) & 1) {
            r = 230;
            g = 30;
            b = 30;
            a = 255;
          }
        } else if (view === 'solo') {
          if (l !== selected) {
            r = r * 0.15;
            g = g * 0.15;
            b = b * 0.15;
          }
        } else if (!hidden.has(l)) {
          const c = colors[l - 1]!;
          r = r * (1 - opacity) + c[0] * opacity;
          g = g * (1 - opacity) + c[1] * opacity;
          b = b * (1 - opacity) + c[2] * opacity;
        }
      }
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = a;
    }
  }
  ctx.putImageData(out, x0, y0);
}

function applyZoom(): void {
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
  $('zoom-v').textContent = `×${zoom}`;
}

// ---------- Bảng bên phải ----------

function refreshPanel(): void {
  const counts = new Array<number>(parts.length + 1).fill(0);
  let opaque = 0;
  let unassigned = 0;
  for (let i = 0; i < labels.length; i++) {
    counts[labels[i]!]!++;
    if (alpha[i]! > 16) {
      opaque++;
      if (!labels[i]) unassigned++;
    }
  }
  $('parts').innerHTML = parts
    .map((p, k) => {
      const idx = k + 1;
      const pct = opaque ? ((100 * counts[idx]!) / opaque).toFixed(1) : '0';
      return `<div class="part${idx === selected ? ' sel' : ''}" data-idx="${idx}">
        <input type="checkbox" data-show="${idx}" ${hidden.has(idx) ? '' : 'checked'} title="Hiện màu vùng này">
        <span class="sw" style="background:${p.color}"></span>
        <span>${idx}. ${p.label}</span><small>${counts[idx] ? `${pct}%` : '–'}</small></div>`;
    })
    .join('');
  $('unassigned').innerHTML = unassigned
    ? `<span class="err">${unassigned.toLocaleString('vi-VN')} điểm ảnh chưa thuộc vùng nào (sọc đỏ): những chỗ này sẽ không bao giờ được xây.</span>`
    : '<span class="ok">Mọi điểm ảnh đều đã có vùng.</span>';
  const isDirty = dirty();
  $<HTMLButtonElement>('save').disabled = !isDirty && source !== 'unsaved';
  $<HTMLButtonElement>('revert').disabled = !isDirty;
  $<HTMLButtonElement>('undo').disabled = undoStack.length === 0;
  $<HTMLButtonElement>('redo').disabled = redoStack.length === 0;
  $('status').innerHTML = `Trạng thái: <b>${STATUS_TEXT[source]}</b>${isDirty ? ' · <span class="err">có thay đổi chưa lưu</span>' : ''}`;
}

// ---------- Tô ----------

let painting = false;
let last: { x: number; y: number } | null = null;
let strokeBox = { x0: 0, y0: 0, x1: 0, y1: 0 };

function toImage(ev: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * canvas.width, y: ((ev.clientY - r.top) / r.height) * canvas.height };
}

function stamp(cx: number, cy: number): void {
  const rad = size / 2;
  const value = tool === 'brush' ? selected : 0;
  const w = canvas.width;
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    if (y < 0 || y >= canvas.height) continue;
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (x < 0 || x >= w) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > rad * rad + 0.25) continue;
      const i = y * w + x;
      if (alpha[i]! > 16) labels[i] = value;
    }
  }
  strokeBox = {
    x0: Math.min(strokeBox.x0, cx - rad - 1),
    y0: Math.min(strokeBox.y0, cy - rad - 1),
    x1: Math.max(strokeBox.x1, cx + rad + 1),
    y1: Math.max(strokeBox.y1, cy + rad + 1),
  };
}

function paintTo(p: { x: number; y: number }): void {
  const from = last ?? p;
  const dist = Math.hypot(p.x - from.x, p.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, size / 4)));
  for (let k = 1; k <= steps; k++) stamp(from.x + ((p.x - from.x) * k) / steps, from.y + ((p.y - from.y) * k) / steps);
  last = p;
  render(strokeBox.x0, strokeBox.y0, strokeBox.x1, strokeBox.y1);
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!base) return;
  const p = toImage(ev);
  if (ev.altKey) {
    // Alt + bấm: lấy vùng tại chỗ này.
    const l = labels[Math.floor(p.y) * canvas.width + Math.floor(p.x)] ?? 0;
    if (l) selected = l;
    refreshPanel();
    return;
  }
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch {
    // một số trình duyệt / bút cảm ứng không cho giữ con trỏ: vẫn tô được bình thường
  }
  undoStack.push(labels.slice());
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  painting = true;
  last = null;
  strokeBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  paintTo(p);
});
canvas.addEventListener('pointermove', (ev) => {
  moveCursor(ev);
  if (painting) paintTo(toImage(ev));
});
canvas.addEventListener('pointerup', () => {
  if (!painting) return;
  painting = false;
  last = null;
  refreshPanel();
});
canvas.addEventListener('pointerleave', () => ($('cursor').style.display = 'none'));

function moveCursor(ev: PointerEvent): void {
  const c = $('cursor');
  const px = size * zoom;
  c.style.display = 'block';
  c.style.width = `${px}px`;
  c.style.height = `${px}px`;
  c.style.left = `${ev.clientX - px / 2}px`;
  c.style.top = `${ev.clientY - px / 2}px`;
  c.style.borderColor = tool === 'eraser' ? '#ff5252' : (parts[selected - 1]?.color ?? '#fff');
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(labels);
  labels = prev;
  render();
  refreshPanel();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(labels);
  labels = next;
  render();
  refreshPanel();
}

/** Điểm có hình mà chưa có vùng: lấy vùng của điểm gần nhất (loang đều). */
function fillRest(): void {
  const w = canvas.width;
  const h = canvas.height;
  undoStack.push(labels.slice());
  let frontier: number[] = [];
  for (let i = 0; i < labels.length; i++) if (alpha[i]! > 16 && labels[i]) frontier.push(i);
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1]) {
        if (j >= 0 && alpha[j]! > 16 && !labels[j]) {
          labels[j] = labels[i]!;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  render();
  refreshPanel();
}

async function save(): Promise<void> {
  if (!current) return;
  msg('Đang lưu…');
  const r = await fetch(`/api/tools/parts/${current.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels: encode(labels), edited: source === 'unsaved' && !undoStack.length ? false : true }),
  });
  const j = (await r.json()) as { error?: string; status?: PartsReply['source'] };
  if (!r.ok) {
    msg(`<span class="err">${j.error ?? 'Lỗi khi lưu'}</span>`);
    return;
  }
  saved = labels.slice();
  source = j.status ?? 'edited';
  refreshPanel();
  await loadList();
  msg('<span class="ok">Đã lưu vào assets/game/buildings/' + current.id + '/parts/</span>');
}

// ---------- Nút, phím ----------

function setTool(t: typeof tool): void {
  tool = t;
  $('tool-brush').classList.toggle('on', t === 'brush');
  $('tool-eraser').classList.toggle('on', t === 'eraser');
}

function setView(v: typeof view): void {
  view = v;
  for (const k of ['color', 'solo', 'plain']) $(`view-${k}`).classList.toggle('on', k === v);
  render();
}

function setSize(v: number): void {
  size = Math.max(1, Math.min(60, Math.round(v)));
  $<HTMLInputElement>('size').value = String(size);
  $('size-v').textContent = String(size);
}

$('parts').addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  const show = t.closest<HTMLInputElement>('input[data-show]');
  if (show) {
    const idx = Number(show.dataset.show);
    if (show.checked) hidden.delete(idx);
    else hidden.add(idx);
    render();
    return;
  }
  const row = t.closest<HTMLElement>('.part');
  if (row) {
    selected = Number(row.dataset.idx);
    setTool('brush');
    refreshPanel();
    if (view === 'solo') render();
  }
});
$('tool-brush').addEventListener('click', () => setTool('brush'));
$('tool-eraser').addEventListener('click', () => setTool('eraser'));
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('fill-rest').addEventListener('click', fillRest);
$('save').addEventListener('click', () => void save());
$('revert').addEventListener('click', () => {
  if (!dirty() || confirm('Bỏ mọi thay đổi chưa lưu?')) void open(current!.id);
});
$('propose').addEventListener('click', () => {
  if (confirm('Máy sẽ đề xuất lại toàn bộ vùng (chưa lưu ngay, bấm Lưu nếu muốn giữ). Tiếp tục?')) void open(current!.id, true);
});
$('view-color').addEventListener('click', () => setView('color'));
$('view-solo').addEventListener('click', () => setView('solo'));
$('view-plain').addEventListener('click', () => setView('plain'));
$<HTMLInputElement>('size').addEventListener('input', (e) => setSize(Number((e.target as HTMLInputElement).value)));
$<HTMLInputElement>('opacity').addEventListener('input', (e) => {
  opacity = Number((e.target as HTMLInputElement).value) / 100;
  $('opacity-v').textContent = `${Math.round(opacity * 100)}%`;
  render();
});
$<HTMLInputElement>('zoom').addEventListener('input', (e) => {
  zoom = Number((e.target as HTMLInputElement).value);
  applyZoom();
});
document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-bg]').forEach((x) => x.classList.toggle('on', x === b));
    $('wrap').className = `stagewrap ${b.dataset.bg}`;
  }),
);
$<HTMLSelectElement>('building').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  if (dirty() && !confirm('Có thay đổi chưa lưu. Bỏ và chuyển công trình?')) {
    (e.target as HTMLSelectElement).value = current!.id;
    return;
  }
  history.replaceState(null, '', `?id=${id}`);
  void open(id);
});
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  } else if (e.key === 'b' || e.key === 'B') setTool('brush');
  else if (e.key === 'e' || e.key === 'E') setTool('eraser');
  else if (e.key === '[') setSize(size - 2);
  else if (e.key === ']') setSize(size + 2);
  else if (/^[1-7]$/.test(e.key)) {
    selected = Number(e.key);
    refreshPanel();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

void (async () => {
  try {
    await loadList();
    if ($<HTMLSelectElement>('building').value) await open($<HTMLSelectElement>('building').value);
    else msg('<span class="err">Chưa có bản đồ (chạy npm run assets:map).</span>');
  } catch {
    msg('<span class="err">Không đọc được dữ liệu từ server.</span>');
  }
})();
