// Mục "Bản đồ quần thể chùa" trên trang /tools/assets (giai đoạn R2, mục 7 SPEC):
// - xem bản đồ ghép với từng công trình bật/tắt, so với ảnh gốc map_built (thanh trượt độ mờ);
// - chọn một công trình: kéo khung cắt (khung xanh: tách bằng rembg; khung cam: vùng nền), kéo đường chân baseY (đỏ),
//   bảo tháp kéo được mép từng tầng (tím); bấm "Cắt lại" để lưu vào assets/map-cuts.json và dựng lại bản đồ;
// - soi viền ảnh đã cắt trên 3 nền.
// Tọa độ khung cắt theo ảnh gốc (941×1672); bản đồ hiển thị theo hệ tọa độ bản đồ (× scale).

import { drawOrder, type MapBuilding, type MapManifest } from '../../../shared/map.js';
import { assetUrl } from '../../../shared/manifest.js';

type Box = [number, number, number, number];
interface CutPart {
  mode: 'object' | 'ground';
  box: Box;
  polygon?: [number, number][];
}
interface CutBuilding {
  id: string;
  items?: string[];
  parts: CutPart[];
  baseY?: number;
  tierLinesY?: number[];
}
interface MapCuts {
  buildings: CutBuilding[];
  [k: string]: unknown;
}
interface MapData {
  cuts: MapCuts;
  map: MapManifest | null;
  names: Record<string, string>;
  canSegment: boolean;
  missingSegments: string[];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', style: Partial<CSSStyleDeclaration> = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e.style, style);
  return e;
};

let data: MapData | null = null;
let version = Date.now().toString(36);
let zoom = 0.4;
const hidden = new Set<string>();
let selected: string | null = null;
/** Bản nháp đang sửa của công trình được chọn (chưa lưu). */
let draft: CutBuilding | null = null;
let busy = false;

function label(b: { id: string; items?: string[] }): string {
  const n = data!.names;
  const items = b.items ?? [b.id];
  if (items.length === 1) return n[items[0]!] ?? b.id;
  return `${n[items[0]!] ?? items[0]} … ${n[items.at(-1)!] ?? items.at(-1)} (${items.length} tầng)`;
}

function msg(html: string): void {
  $('m-msg').innerHTML = html;
}

async function load(): Promise<void> {
  data = (await (await fetch('/api/tools/map', { cache: 'no-store' })).json()) as MapData;
  version = Date.now().toString(36);
  if (selected && !data.cuts.buildings.some((b) => b.id === selected)) selected = null;
  draft = selected ? structuredClone(data.cuts.buildings.find((b) => b.id === selected)!) : null;
  const m = data.map;
  if (!m) {
    msg('<span class="err">Chưa dựng bản đồ. Chạy npm run assets:upscale, npm run assets:segment, npm run assets:map.</span>');
  } else {
    const warn = data.missingSegments.length ? ` · <span class="err">chưa tách nền: ${data.missingSegments.join(', ')}</span>` : '';
    msg(`Bản đồ ${m.width}×${m.height}, ${m.buildings.length} công trình · nền ${m.source === 'esrgan' ? 'phóng bằng AI' : '<span class="err">phóng thường (chưa có Real-ESRGAN)</span>'}${warn}`);
  }
  renderList();
  renderStage();
  renderEdit();
}

// ---------- Danh sách công trình ----------

function renderList(): void {
  const box = $('m-list');
  box.innerHTML = '';
  if (!data?.map) return;
  const built = new Map(data.map.buildings.map((b) => [b.id, b]));
  for (const c of data.cuts.buildings) {
    const row = el('div', `m-item${c.id === selected ? ' sel' : ''}`);
    const b = built.get(c.id);
    const layer = b ? (b.layer === 'ground' ? 'nền' : 'công trình') : 'chưa cắt';
    row.innerHTML = `<label><input type="checkbox" ${hidden.has(c.id) ? '' : 'checked'} data-id="${c.id}"></label><span class="nm">${esc(label(c))}</span><small>${layer}${b?.fg ? ' · có tiền cảnh' : ''}</small>`;
    row.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).tagName === 'INPUT') return;
      select(c.id === selected ? null : c.id);
    });
    row.querySelector('input')!.addEventListener('change', (ev) => {
      const on = (ev.target as HTMLInputElement).checked;
      if (on) hidden.delete(c.id);
      else hidden.add(c.id);
      renderStage();
    });
    box.appendChild(row);
  }
}

function select(id: string | null): void {
  selected = id;
  draft = id ? structuredClone(data!.cuts.buildings.find((b) => b.id === id)!) : null;
  renderList();
  renderStage();
  renderEdit();
  if (id && data?.map) {
    const b = data.map.buildings.find((x) => x.id === id);
    if (b) {
      const vp = $('m-vp');
      vp.scrollTo({ top: Math.max(0, (b.y + b.h / 2) * zoom - vp.clientHeight / 2), left: Math.max(0, (b.x + b.w / 2) * zoom - vp.clientWidth / 2), behavior: 'smooth' });
    }
  }
}

// ---------- Bản đồ ----------

function renderStage(): void {
  const stage = $('m-stage');
  stage.innerHTML = '';
  const m = data?.map;
  if (!m) return;
  stage.style.width = `${m.width}px`;
  stage.style.height = `${m.height}px`;
  stage.style.transform = `scale(${zoom})`;
  $('m-sizer').style.width = `${m.width * zoom}px`;
  $('m-sizer').style.height = `${m.height * zoom}px`;
  const img = (file: string, x: number, y: number, cls = '') => {
    const i = el('img', cls, { left: `${x}px`, top: `${y}px` });
    i.src = `${assetUrl(file)}?v=${version}`;
    i.draggable = false;
    stage.appendChild(i);
    return i;
  };
  for (const t of m.tiles) img(t.file, 0, t.y);
  for (const b of drawOrder(m.buildings)) if (!hidden.has(b.id)) img(b.file, b.x, b.y);
  if ($<HTMLInputElement>('m-fg').checked) for (const b of m.buildings) if (b.fg) img(b.fg.file, b.fg.x, b.fg.y);
  if (m.reference) {
    const ref = img(m.reference, 0, 0, 'ref');
    ref.style.opacity = String(Number($<HTMLInputElement>('m-ref').value) / 100);
  }
  if ($<HTMLInputElement>('m-outline').checked) {
    for (const b of m.buildings) {
      if (hidden.has(b.id)) continue;
      const o = el('div', `m-outline${b.id === selected ? ' sel' : ''}`, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      o.title = label({ id: b.id, items: b.items });
      o.addEventListener('click', () => select(b.id));
      stage.appendChild(o);
    }
  }
  if (draft) drawHandles(stage, m);
}

/** Khung cắt, đường chân và mép tầng của công trình đang chọn, kéo được bằng chuột. */
function drawHandles(stage: HTMLElement, m: MapManifest): void {
  const s = m.scale;
  const b = m.buildings.find((x) => x.id === draft!.id);
  const hs = 12 / zoom; // tay nắm luôn khoảng 12 điểm ảnh trên màn hình
  draft!.parts.forEach((p, k) => {
    const [x0, y0, x1, y1] = p.box;
    const r = el('div', `m-box ${p.mode}`, { left: `${x0 * s}px`, top: `${y0 * s}px`, width: `${(x1 - x0) * s}px`, height: `${(y1 - y0) * s}px`, borderWidth: `${2 / zoom}px` });
    r.title = `${p.mode === 'object' ? 'Khung tách rembg' : 'Vùng nền'} #${k + 1} – kéo để di chuyển`;
    stage.appendChild(r);
    dragOn(r, (dx, dy) => movePart(k, dx / s, dy / s, 'move'));
    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      const h = el('div', `m-handle ${corner}`, { width: `${hs}px`, height: `${hs}px`, margin: `${-hs / 2}px` });
      r.appendChild(h);
      dragOn(h, (dx, dy) => movePart(k, dx / s, dy / s, corner));
    }
    if (p.polygon) {
      const pts = p.polygon.map(([x, y]) => `${x * s},${y * s}`).join(' ');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'm-poly');
      svg.setAttribute('width', String(m.width));
      svg.setAttribute('height', String(m.height));
      svg.innerHTML = `<polygon points="${pts}" fill="none" stroke="#ff9800" stroke-width="${2 / zoom}" stroke-dasharray="${8 / zoom}"/>`;
      stage.appendChild(svg);
    }
  });
  if (!b) return;
  const lineEl = (y: number, cls: string, title: string, onDrag: (dy: number) => void) => {
    const l = el('div', `m-line ${cls}`, { left: `${b.x - 20}px`, top: `${y}px`, width: `${b.w + 40}px`, height: `${Math.max(2, 3 / zoom)}px` });
    l.title = title;
    stage.appendChild(l);
    dragOn(l, (_dx, dy) => onDrag(dy));
  };
  const baseY = draft!.baseY !== undefined ? draft!.baseY * s : b.baseY;
  lineEl(baseY, 'base', 'Đường chân (baseY) – kéo lên xuống', (dy) => {
    draft!.baseY = Math.round(((draft!.baseY !== undefined ? draft!.baseY * s : b.baseY) + dy) / s);
  });
  if (b.items.length > 1) {
    const lines = draft!.tierLinesY ? draft!.tierLinesY.map((v) => v * s) : (b.tierLinesY ?? []);
    lines.forEach((y, k) =>
      lineEl(y, 'tier', `Mép trên tầng ${k + 1} – kéo lên xuống`, (dy) => {
        const cur = draft!.tierLinesY ? draft!.tierLinesY.map((v) => v * s) : (b.tierLinesY ?? []);
        draft!.tierLinesY = cur.map((v, i) => Math.round((i === k ? v + dy : v) / s));
      }),
    );
  }
}

function movePart(k: number, dx: number, dy: number, how: 'move' | 'nw' | 'ne' | 'sw' | 'se'): void {
  const p = draft!.parts[k]!;
  let [x0, y0, x1, y1] = p.box;
  if (how === 'move') {
    x0 += dx;
    x1 += dx;
    y0 += dy;
    y1 += dy;
    if (p.polygon) p.polygon = p.polygon.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)]);
  } else {
    if (how.includes('w')) x0 += dx;
    if (how.includes('e')) x1 += dx;
    if (how.includes('n')) y0 += dy;
    if (how.includes('s')) y1 += dy;
  }
  p.box = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)].map((v) => Math.max(0, v)) as Box;
}

/** Kéo chuột trên phần tử: gọi onMove với độ dời (tọa độ bản đồ) sau mỗi lần nhả chuột rồi vẽ lại. */
function dragOn(target: HTMLElement, onMove: (dx: number, dy: number) => void): void {
  target.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = target.offsetLeft;
    const oy = target.offsetTop;
    target.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      target.style.left = `${ox + (e.clientX - sx) / zoom}px`;
      target.style.top = `${oy + (e.clientY - sy) / zoom}px`;
    };
    const up = (e: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      const dx = (e.clientX - sx) / zoom;
      const dy = (e.clientY - sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        onMove(dx, dy);
        renderStage();
        renderEdit();
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  });
}

// ---------- Bảng chỉnh công trình đang chọn ----------

function renderEdit(): void {
  const box = $('m-edit');
  if (!draft || !data?.map) {
    box.innerHTML = '<p class="note">Bấm vào một công trình (trong danh sách hoặc trên bản đồ) để chỉnh khung cắt.</p>';
    return;
  }
  const m = data.map;
  const b = m.buildings.find((x) => x.id === draft!.id);
  const saved = data.cuts.buildings.find((x) => x.id === draft!.id)!;
  const changed = JSON.stringify(saved) !== JSON.stringify(draft);
  const parts = draft.parts
    .map(
      (p, k) => `<div class="m-part"><b>${p.mode === 'object' ? 'Khung tách rembg' : 'Vùng nền'} #${k + 1}</b>
      ${['x0', 'y0', 'x1', 'y1'].map((n, i) => `<label>${n}<input type="number" data-part="${k}" data-i="${i}" value="${p.box[i]}"></label>`).join('')}
      ${p.polygon ? '<small>(có đa giác: sửa trong assets/map-cuts.json)</small>' : ''}</div>`,
    )
    .join('');
  const baseRaw = draft.baseY ?? (b ? Math.round(b.baseY / m.scale) : 0);
  box.innerHTML = `
    <h3>${esc(label(draft))}</h3>
    <p class="note">Tọa độ theo ảnh gốc 941×1672. Khung xanh: vùng tách công trình bằng rembg (đổi khung thì máy tách lại, khoảng 10–60 giây).
    Khung cam: vùng lấy phần nền khác biệt. Đường đỏ: chân công trình (baseY), quyết định công trình nào che công trình nào.</p>
    ${parts}
    <div class="m-part"><label>baseY <input type="number" id="m-basey" value="${Math.round(baseRaw)}"></label>
      <label><input type="checkbox" id="m-baseauto" ${draft.baseY === undefined ? 'checked' : ''}> máy tự đo</label></div>
    ${b && b.items.length > 1 ? `<div class="m-part"><label><input type="checkbox" id="m-tierauto" ${draft.tierLinesY === undefined ? 'checked' : ''}> chia tầng đều (tạm, chờ ảnh bảo tháp 9 tầng)</label></div>` : ''}
    <div class="row">
      <button class="primary" id="m-save" ${changed && !busy ? '' : 'disabled'}>Cắt lại công trình này</button>
      <button id="m-undo" ${changed && !busy ? '' : 'disabled'}>Bỏ thay đổi</button>
      ${data.canSegment ? '' : '<span class="err">Chưa cài .venv (rembg): chỉ chỉnh được baseY và vùng nền.</span>'}
    </div>
    ${b ? `<div class="thumbs">${['checker', 'dark', 'white'].map((bg) => `<div class="thumb ${bg}" style="height:220px"><img src="${assetUrl(b.file)}?v=${version}"></div>`).join('')}</div>
      <p class="note">${b.w}×${b.h} điểm ảnh bản đồ, đặt tại (${b.x}, ${b.y}), baseY ${b.baseY}${b.fg ? '. Có lớp tiền cảnh (cây đứng trước).' : '.'}</p>` : ''}`;
  box.querySelectorAll<HTMLInputElement>('input[data-part]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const p = draft!.parts[Number(inp.dataset.part)]!;
      p.box[Number(inp.dataset.i)] = Math.round(Number(inp.value));
      renderStage();
      renderEdit();
    }),
  );
  $<HTMLInputElement>('m-basey').addEventListener('change', (e) => {
    draft!.baseY = Math.round(Number((e.target as HTMLInputElement).value));
    renderStage();
    renderEdit();
  });
  $<HTMLInputElement>('m-baseauto').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) delete draft!.baseY;
    else draft!.baseY = Math.round(baseRaw);
    renderStage();
    renderEdit();
  });
  document.getElementById('m-tierauto')?.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) delete draft!.tierLinesY;
    else if (b?.tierLinesY) draft!.tierLinesY = b.tierLinesY.map((v) => Math.round(v / m.scale));
    renderStage();
    renderEdit();
  });
  $('m-undo').addEventListener('click', () => select(draft!.id));
  $('m-save').addEventListener('click', () => void save());
}

async function save(): Promise<void> {
  if (!draft || busy) return;
  busy = true;
  renderEdit();
  msg('Đang cắt lại… (đổi khung tách thì mất khoảng 10–60 giây)');
  try {
    const r = await fetch('/api/tools/map/building', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ building: draft }),
    });
    const j = (await r.json()) as { error?: string };
    busy = false;
    if (!r.ok) {
      msg(`<span class="err">${esc(j.error ?? 'Lỗi')}</span>`);
      renderEdit();
      return;
    }
    await load();
    msg('<span class="ok">Đã cắt lại và lưu. Overlay đang mở tự cập nhật.</span>');
  } catch {
    busy = false;
    msg('<span class="err">Không gửi được lệnh tới server.</span>');
    renderEdit();
  }
}

export async function initMapTool(): Promise<void> {
  $<HTMLSelectElement>('m-zoom').addEventListener('change', (e) => {
    zoom = Number((e.target as HTMLSelectElement).value);
    renderStage();
  });
  $<HTMLInputElement>('m-ref').addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    $('m-ref-v').textContent = `${v}%`;
    const ref = document.querySelector<HTMLElement>('#m-stage img.ref');
    if (ref) ref.style.opacity = String(v / 100);
  });
  for (const id of ['m-outline', 'm-fg']) $(id).addEventListener('change', renderStage);
  $('m-all').addEventListener('click', () => {
    hidden.clear();
    renderList();
    renderStage();
  });
  $('m-none').addEventListener('click', () => {
    for (const b of data?.cuts.buildings ?? []) hidden.add(b.id);
    renderList();
    renderStage();
  });
  $('m-ground').addEventListener('click', () => {
    hidden.clear();
    for (const b of data?.map?.buildings ?? []) if (b.layer === 'object') hidden.add(b.id);
    renderList();
    renderStage();
  });
  try {
    await load();
  } catch {
    msg('<span class="err">Không đọc được dữ liệu bản đồ từ server.</span>');
  }
}

export type { MapBuilding };
