// Trang /tools/paths (giai đoạn 4c, mục 9 SPEC): lối đi (đường nối các điểm), ô ghi danh trên bản đồ.
// Xem trước vị trí làm việc của từng hạng mục, đường đi từ mép dưới bản đồ vào, người / xe / tượng mẫu đúng tỉ lệ.
// Lưu vào assets/map-paths.json (server chép vào manifest.map để overlay dùng).

import { assetUrl, type ManifestEntry } from '../../../shared/manifest.js';
import { floorBand, itemRect, type MapBuilding, type MapTile } from '../../../shared/map.js';
import {
  buildGraph,
  CHAR_REF_HEIGHT,
  components,
  mainEntry,
  route,
  workSpots,
  type MapPath,
  type MapPaths,
  type PathPoint,
} from '../../../shared/paths.js';

interface Reply {
  paths: MapPaths | null;
  error: string | null;
  map: { width: number; height: number; tiles: MapTile[]; reference: string | null; buildings: MapBuilding[] } | null;
  names: Record<string, string>;
  characters: { heightMap: number };
  sprites: Record<string, ManifestEntry>;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;
let data: Reply;
let edit: MapPaths = { paths: [], honorSlots: [] };
let saved = '';
let zoom = 0.4;
let tool: 'move' | 'add' | 'slot' = 'move';
let sel = 0;
let drag: { kind: 'pt'; path: number; i: number } | { kind: 'slot'; i: number } | null = null;
const imgs = new Map<string, HTMLImageElement>();
let walker: { pts: PathPoint[]; t: number; len: number } | null = null;

function img(file: string): HTMLImageElement {
  let im = imgs.get(file);
  if (!im) {
    im = new Image();
    im.src = assetUrl(file);
    im.onload = () => draw();
    imgs.set(file, im);
  }
  return im;
}

const dirty = () => JSON.stringify(edit) !== saved;
function refreshButtons(): void {
  $<HTMLButtonElement>('save').disabled = !dirty();
  $<HTMLButtonElement>('revert').disabled = !dirty();
}

async function load(): Promise<void> {
  data = (await (await fetch('/api/tools/paths', { cache: 'no-store' })).json()) as Reply;
  if (data.error) $('error').textContent = data.error;
  edit = data.paths ? JSON.parse(JSON.stringify(data.paths)) : { paths: [], honorSlots: [] };
  saved = JSON.stringify(edit);
  if (!data.map) {
    $('error').textContent = 'Chưa có bản đồ (chạy npm run assets:map).';
    return;
  }
  const sel0 = $<HTMLSelectElement>('item');
  sel0.replaceChildren(...Object.entries(data.names).map(([id, name]) => new Option(name, id)));
  sel0.value = 'gac_chuong';
  resize();
  renderList();
  refreshButtons();
}

function resize(): void {
  if (!data.map) return;
  cv.width = Math.round(data.map.width * zoom);
  cv.height = Math.round(Math.min(data.map.height, 3800) * zoom);
  draw();
}

const toMap = (e: MouseEvent): PathPoint => {
  const r = cv.getBoundingClientRect();
  return [Math.round((e.clientX - r.left) / zoom), Math.round((e.clientY - r.top) / zoom)];
};
const d2 = (a: PathPoint, b: PathPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Người mẫu: đơn vị bản đồ trên mỗi điểm ảnh của ảnh nhân vật. */
const spriteScale = () => data.characters.heightMap / CHAR_REF_HEIGHT;

function drawSprite(key: string, x: number, y: number, flip = false, alpha = 1): void {
  const e = data.sprites[key];
  if (!e) return;
  const im = img(e.file);
  if (!im.complete || !im.naturalWidth) return;
  const k = spriteScale() * zoom;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x * zoom, y * zoom);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -e.anchor.x * k, -e.anchor.y * k, e.w * k, e.h * k);
  ctx.restore();
}

function selectedItem(): { rect: { x: number; y: number; w: number; h: number }; baseY: number; layer: string } | null {
  const id = $<HTMLSelectElement>('item').value;
  const map = data.map!;
  const r = itemRect(map as never, id);
  const b = map.buildings.find((x) => x.items.includes(id));
  if (!r || !b) return null;
  const k = b.items.indexOf(id);
  const baseY = b.items.length > 1 ? floorBand(b, k).bottom : b.baseY;
  return { rect: r, baseY, layer: b.layer };
}

function draw(): void {
  if (!data?.map) return;
  const map = data.map;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (const t of map.tiles) {
    const im = img(t.file);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, 0, t.y * zoom, map.width * zoom, t.h * zoom);
  }
  if ($<HTMLInputElement>('built').checked && map.reference) {
    const im = img(map.reference);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, 0, 0, map.width * zoom, (im.naturalHeight * map.width * zoom) / im.naturalWidth);
  }
  // Hạng mục đang thử: khung, vị trí làm việc, đường đi từ cổng vào, người mẫu.
  const it = selectedItem();
  const g = buildGraph(edit.paths);
  const entry = mainEntry(edit.paths);
  if (it) {
    const { rect, baseY, layer } = it;
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(rect.x * zoom, rect.y * zoom, rect.w * zoom, rect.h * zoom);
    const levels = layer === 'object' ? [baseY - rect.h * 0.35, baseY - rect.h * 0.65] : [];
    for (const s of workSpots(rect, baseY, { scaffoldLevels: levels })) {
      ctx.fillStyle = s.kind === 'ground' ? '#ff9800' : '#ffcc80';
      ctx.beginPath();
      ctx.arc(s.x * zoom, s.y * zoom, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (entry) {
      const r = route(g, entry, [rect.x + rect.w / 2, baseY + 8]);
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      r.forEach(([x, y], i) => (i ? ctx.lineTo(x * zoom, y * zoom) : ctx.moveTo(x * zoom, y * zoom)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if ($<HTMLInputElement>('showSprites').checked) drawSprite('chars/danphu_nam_down_0', rect.x + rect.w / 2 + 20, baseY + 10);
  }
  // Lối đi.
  edit.paths.forEach((p, pi) => {
    ctx.strokeStyle = p.kind === 'main' ? '#00e5ff' : '#7CFC00';
    ctx.lineWidth = pi === sel ? 5 : 3;
    ctx.beginPath();
    p.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * zoom, y * zoom) : ctx.moveTo(x * zoom, y * zoom)));
    ctx.stroke();
    for (const [x, y] of p.points) {
      ctx.fillStyle = pi === sel ? '#fff' : '#ddd';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x * zoom, y * zoom, pi === sel ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });
  // Ô ghi danh (kèm tượng mẫu).
  edit.honorSlots.forEach((s, i) => {
    if ($<HTMLInputElement>('showSprites').checked) drawSprite(`honor/statue_${(i % 3) + 1}`, s.x, s.y, false, 0.9);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(s.x * zoom - 6, s.y * zoom - 6, 12, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(i + 1), s.x * zoom + 8, s.y * zoom + 4);
  });
  // Xe trâu mẫu ở đầu đường chính.
  if (entry && $<HTMLInputElement>('showSprites').checked) drawSprite('vehicles/cart_up_1', entry[0] + 40, entry[1] - 600);
  // Người đang đi thử.
  if (walker) {
    let left = walker.t;
    for (let i = 1; i < walker.pts.length; i++) {
      const a = walker.pts[i - 1]!;
      const b = walker.pts[i]!;
      const seg = d2(a, b);
      if (left <= seg || i === walker.pts.length - 1) {
        const k = Math.min(1, left / Math.max(1, seg));
        const x = a[0] + (b[0] - a[0]) * k;
        const y = a[1] + (b[1] - a[1]) * k;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dir = Math.abs(dx) > Math.abs(dy) ? 'right' : dy < 0 ? 'up' : 'down';
        const frame = 1 + (Math.floor(walker.t / 14) % 3);
        drawSprite(`chars/danphu_nam_${dir}_${frame}`, x, y, dir === 'right' && dx < 0);
        break;
      }
      left -= seg;
    }
  }
  const n = components(g);
  $('net').innerHTML = edit.paths.length
    ? n === 1
      ? '<span class="ok">Mọi lối đi nối liền nhau.</span>'
      : `<span class="err">Có ${n} cụm lối đi rời nhau: nối chúng lại (cho điểm trùng nhau).</span>`
    : '';
}

function renderList(): void {
  $('list').innerHTML = edit.paths
    .map(
      (p, i) =>
        `<div class="p ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="sw" style="background:${p.kind === 'main' ? '#00e5ff' : '#7CFC00'}"></span><span>${p.id}</span><small class="note">${p.kind === 'main' ? 'đường chính' : 'lối đi bộ'} · ${p.points.length} điểm</small></div>`,
    )
    .join('');
  const p = edit.paths[sel];
  $('path-edit').innerHTML = p
    ? `<label>Mã <input id="pid" value="${p.id}" style="width:150px"></label>
       <label>Loại <select id="pkind"><option value="walk">Lối đi bộ</option><option value="main">Đường chính (xe đi)</option></select></label>`
    : '';
  if (p) $<HTMLSelectElement>('pkind').value = p.kind;
}

function changed(): void {
  refreshButtons();
  renderList();
  draw();
  $('msg').textContent = dirty() ? 'Có thay đổi chưa lưu.' : '';
}

$('list').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
  if (!el) return;
  sel = Number(el.dataset.i);
  renderList();
  draw();
});
$('path-edit').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  const p = edit.paths[sel];
  if (!p) return;
  if (t.id === 'pid') p.id = t.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') || p.id;
  if (t.id === 'pkind') p.kind = t.value as MapPath['kind'];
  changed();
});

function setTool(t: typeof tool): void {
  tool = t;
  for (const [id, v] of [['tool-move', 'move'], ['tool-add', 'add'], ['tool-slot', 'slot']] as const) $(id).classList.toggle('on', v === t);
}
$('tool-move').addEventListener('click', () => setTool('move'));
$('tool-add').addEventListener('click', () => setTool('add'));
$('tool-slot').addEventListener('click', () => setTool('slot'));
$('new-path').addEventListener('click', () => {
  let k = edit.paths.length + 1;
  while (edit.paths.some((p) => p.id === `loi_${k}`)) k++;
  edit.paths.push({ id: `loi_${k}`, kind: 'walk', points: [] });
  sel = edit.paths.length - 1;
  setTool('add');
  $('msg').textContent = 'Bấm lên bản đồ để thêm điểm cho lối mới (ít nhất 2 điểm).';
  changed();
});
$('del-path').addEventListener('click', () => {
  const p = edit.paths[sel];
  if (!p || !confirm(`Xóa lối đi "${p.id}"?`)) return;
  edit.paths.splice(sel, 1);
  sel = Math.max(0, sel - 1);
  changed();
});

/** Điểm hoặc ô ghi danh dưới con trỏ. */
function hit(p: PathPoint): typeof drag {
  const r = 9 / zoom;
  for (let i = 0; i < edit.honorSlots.length; i++) if (d2([edit.honorSlots[i]!.x, edit.honorSlots[i]!.y], p) <= r) return { kind: 'slot', i };
  // Ưu tiên điểm của lối đang chọn.
  const order = [sel, ...edit.paths.map((_, i) => i).filter((i) => i !== sel)];
  for (const pi of order) {
    const pts = edit.paths[pi]?.points ?? [];
    for (let i = 0; i < pts.length; i++) if (d2(pts[i]!, p) <= r) return { kind: 'pt', path: pi, i };
  }
  return null;
}

cv.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const h = hit(toMap(e));
  if (!h) return;
  if (h.kind === 'slot') edit.honorSlots.splice(h.i, 1);
  else edit.paths[h.path]!.points.splice(h.i, 1);
  changed();
});

cv.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = toMap(e);
  if (tool === 'slot') {
    edit.honorSlots.push({ x: p[0], y: p[1] });
    changed();
    return;
  }
  if (tool === 'add') {
    const path = edit.paths[sel];
    if (!path) return;
    // Bấm gần một đoạn: chèn vào giữa; không thì nối vào cuối.
    let best = -1;
    let bd = 14 / zoom;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1]!;
      const b = path.points[i]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const dd = d2([a[0] + t * dx, a[1] + t * dy], p);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best > 0) path.points.splice(best, 0, p);
    else path.points.push(p);
    changed();
    return;
  }
  drag = hit(p);
  if (drag?.kind === 'pt') sel = drag.path;
  renderList();
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const p = toMap(e);
  if (drag.kind === 'slot') edit.honorSlots[drag.i] = { x: p[0], y: p[1] };
  else edit.paths[drag.path]!.points[drag.i] = p;
  draw();
});
window.addEventListener('mouseup', () => {
  if (drag) {
    drag = null;
    changed();
  }
});

$('zoom').addEventListener('change', () => {
  zoom = Number($<HTMLSelectElement>('zoom').value);
  resize();
});
for (const id of ['built', 'showSprites', 'item']) $(id).addEventListener('change', () => draw());

$('walk').addEventListener('click', () => {
  const it = selectedItem();
  const entry = mainEntry(edit.paths);
  if (!it || !entry) return;
  // Bắt đầu gần chỗ đang xem (đầu đường chính rất xa phía dưới): từ cổng tam quan.
  const g = buildGraph(edit.paths);
  const pts = route(g, [860, 2600], [it.rect.x + it.rect.w / 2, it.baseY + 8]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += d2(pts[i - 1]!, pts[i]!);
  walker = { pts, t: 0, len };
  const step = () => {
    if (!walker) return;
    walker.t += 2.2; // khoảng 66 đơn vị bản đồ mỗi giây
    draw();
    if (walker.t < walker.len) requestAnimationFrame(step);
    else setTimeout(() => {
      walker = null;
      draw();
    }, 1500);
  };
  requestAnimationFrame(step);
  const vp = $('vp');
  vp.scrollTop = Math.max(0, it.baseY * zoom - vp.clientHeight / 2);
});

$('save').addEventListener('click', async () => {
  // Bỏ lối đi chưa đủ 2 điểm.
  edit.paths = edit.paths.filter((p) => p.points.length >= 2);
  const r = await fetch('/api/tools/paths', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) });
  const j = (await r.json()) as { ok?: boolean; error?: string; paths?: MapPaths };
  if (!r.ok) {
    $('msg').innerHTML = `<span class="err">Chưa lưu: ${j.error ?? 'Lỗi'}</span>`;
    return;
  }
  edit = j.paths!;
  saved = JSON.stringify(edit);
  changed();
  $('msg').innerHTML = '<span class="ok">Đã lưu vào assets/map-paths.json.</span>';
});
$('revert').addEventListener('click', () => {
  if (!confirm('Bỏ mọi thay đổi chưa lưu?')) return;
  edit = JSON.parse(saved) as MapPaths;
  changed();
});
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

void load();
