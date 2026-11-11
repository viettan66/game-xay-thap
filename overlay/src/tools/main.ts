// Trang /tools/assets: soi ảnh đã cắt, so sánh nền A/B, xếp chồng thử tầng tháp và lưu điểm căn.
// Phần xếp chồng dùng đúng code vẽ của overlay (Backdrop, TowerView) nên thấy gì ở đây thì lên live y như vậy.

import { Application, Container } from 'pixi.js';
import { assetUrl, FLOOR_STAGE_KEYS, SPIRE_KEY, type Manifest, type ManifestEntry } from '../../../shared/manifest.js';
import { destroyArt, loadArt, type Art } from '../art.js';
import { STAGE_H, STAGE_W } from '../layout.js';
import { Backdrop } from '../scene/background.js';
import { TowerView, type TowerSceneInput } from '../scene/tower.js';
import { loadFonts } from '../theme.js';
import { cameraTargetFor, towerArtFrom } from '../towerLayout.js';

interface ToolsData {
  manifest: Manifest | null;
  missing: string[];
  config: { floor1WidthPx: number; towerTaper: number };
}

interface Edit {
  eave: number;
  tops: number[];
  spireEave: number;
  spireTop: number;
  w1: number;
  taper: number;
  spireScale: number;
  ax: number;
  ay: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let data: ToolsData = { manifest: null, missing: [], config: { floor1WidthPx: 520, towerTaper: 0.995 } };
let art: Art | null = null;
let edit: Edit | null = null;
let version = Date.now().toString(36);

async function fetchData(): Promise<void> {
  data = (await (await fetch('/api/tools/assets', { cache: 'no-store' })).json()) as ToolsData;
  version = Date.now().toString(36);
  const m = data.manifest;
  $('status').innerHTML = m
    ? `${Object.keys(m.images).length} ảnh trong manifest · ${data.missing.length ? `<span class="err">thiếu ${data.missing.length} file</span>` : '<span class="ok">đủ file</span>'}`
    : '<span class="err">Chưa có assets/manifest.json – chạy npm run assets:build</span>';
}

function editFromManifest(m: Manifest): Edit {
  const img = (k: string) => m.images[k]!;
  return {
    eave: img(FLOOR_STAGE_KEYS[0]!).eaveLineY ?? 0,
    tops: FLOOR_STAGE_KEYS.map((k) => img(k).topY ?? 0),
    spireEave: img(SPIRE_KEY).eaveLineY ?? 0,
    spireTop: img(SPIRE_KEY).topY ?? 0,
    w1: data.config.floor1WidthPx,
    taper: data.config.towerTaper,
    spireScale: m.tower.spireScale,
    ax: m.background.towerAnchor.x,
    ay: m.background.towerAnchor.y,
  };
}

/** Manifest kèm các giá trị đang chỉnh (chưa lưu), dùng để vẽ thử. */
function editedManifest(m: Manifest, e: Edit): Manifest {
  const next = structuredClone(m);
  FLOOR_STAGE_KEYS.forEach((k, i) => {
    next.images[k]!.eaveLineY = e.eave;
    next.images[k]!.topY = e.tops[i]!;
  });
  next.images[SPIRE_KEY]!.eaveLineY = e.spireEave;
  next.images[SPIRE_KEY]!.topY = e.spireTop;
  next.tower.spireScale = e.spireScale;
  next.background.towerAnchor = { x: e.ax, y: e.ay };
  return next;
}

// ---------- 1. So sánh nền A / B ----------
let focus = { x: 540, y: 1200 };

function buildCompare(): void {
  const m = data.manifest;
  const box = $('cmp');
  if (!m || m.background.variants.length === 0) {
    box.innerHTML = '<p class="err">Chưa có bản nền nào.</p>';
    return;
  }
  const what = $<HTMLSelectElement>('cmp-what').value;
  box.innerHTML = m.background.variants
    .map((v) => {
      const current = v.key === m.background.variant;
      const src = `${assetUrl(what === 'sky' ? v.sky : v.background)}?v=${version}`;
      return `<div><div class="vp${current ? ' current' : ''}" data-key="${esc(v.key)}"><img src="${src}" width="1080" height="1920" alt=""><span class="tag">${esc(v.label)}${current ? ' · ĐANG DÙNG' : ''}</span></div>
        <div class="row"><button data-use="${esc(v.key)}" ${current ? 'disabled' : ''}>${current ? 'Đang dùng' : 'Dùng bản này'}</button></div></div>`;
    })
    .join('');
  layoutCompare();
}

function layoutCompare(): void {
  const zoom = Number($<HTMLSelectElement>('cmp-zoom').value);
  const pixel = input('cmp-pixel').checked;
  for (const vp of document.querySelectorAll<HTMLElement>('.vp')) {
    vp.classList.toggle('pixel', pixel);
    const img = vp.querySelector('img')!;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const s = Math.min(vw / STAGE_W, vh / STAGE_H) * zoom;
    let tx = vw / 2 - focus.x * s;
    let ty = vh / 2 - focus.y * s;
    if (zoom === 1) {
      tx = (vw - STAGE_W * s) / 2;
      ty = (vh - STAGE_H * s) / 2;
    } else {
      tx = Math.min(0, Math.max(vw - STAGE_W * s, tx));
      ty = Math.min(0, Math.max(vh - STAGE_H * s, ty));
    }
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    img.dataset.tx = String(tx);
    img.dataset.ty = String(ty);
    img.dataset.s = String(s);
  }
}

function wireCompare(): void {
  $('cmp-what').addEventListener('change', buildCompare);
  $('cmp-zoom').addEventListener('change', layoutCompare);
  $('cmp-pixel').addEventListener('change', layoutCompare);
  window.addEventListener('resize', layoutCompare);
  $('cmp').addEventListener('mousemove', (ev) => {
    const vp = (ev.target as HTMLElement).closest<HTMLElement>('.vp');
    if (!vp || $<HTMLSelectElement>('cmp-zoom').value === '1') return;
    const img = vp.querySelector('img')!;
    const rect = vp.getBoundingClientRect();
    const s = Number(img.dataset.s);
    // Toạ độ trên ảnh tại chỗ con trỏ, rồi đặt điểm đó vào giữa cả ba khung.
    const ix = (ev.clientX - rect.left - Number(img.dataset.tx)) / s;
    const iy = (ev.clientY - rect.top - Number(img.dataset.ty)) / s;
    focus = { x: Math.max(0, Math.min(STAGE_W, ix)), y: Math.max(0, Math.min(STAGE_H, iy)) };
    layoutCompare();
  });
  $('cmp').addEventListener('click', async (ev) => {
    const key = (ev.target as HTMLElement).closest<HTMLElement>('[data-use]')?.dataset.use;
    if (!key) return;
    const r = await fetch('/api/tools/background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant: key }),
    });
    if (!r.ok) return alert(((await r.json()) as { error: string }).error);
    await fetchData();
    buildCompare();
    await reloadArt();
  });
}

// ---------- 2. Thư viện ảnh ----------
function buildGallery(): void {
  const m = data.manifest;
  $('missing').innerHTML = data.missing.length
    ? `<p class="err">Thiếu file: ${data.missing.map(esc).join(', ')}</p>`
    : '';
  if (!m) return;
  const groups = new Map<string, [string, ManifestEntry][]>();
  for (const [key, e] of Object.entries(m.images)) {
    const g = key.split('/')[0]!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([key, e]);
  }
  const names: Record<string, string> = { tower: 'Tháp', chars: 'Nhân vật', abbot: 'Trụ trì', ui: 'Giao diện', items: 'Vật phẩm', stele: 'Bia đá', bg: 'Nền và trời' };
  $('groups').innerHTML = [...groups.entries()]
    .map(
      ([g, items]) => `<h3>${esc(names[g] ?? g)} (${items.length})</h3><div class="grid">${items
        .map(([key, e]) => {
          const missing = data.missing.includes(e.file);
          const src = `${assetUrl(e.file)}?v=${version}`;
          const thumb = (cls: string) =>
            missing ? `<div class="thumb missing">thiếu file</div>` : `<div class="thumb ${cls}" data-zoom="${src}"><img loading="lazy" src="${src}" alt=""></div>`;
          const extra = e.eaveLineY !== undefined ? ` · eaveLineY ${e.eaveLineY}, topY ${e.topY}${e.tuned ? ' (đã chỉnh tay)' : ''}` : '';
          return `<div class="card"><div class="name">${esc(e.file)}</div><div class="meta">${e.w}×${e.h}px${extra}</div>
            <div class="thumbs">${thumb('checker')}${thumb('white')}${thumb('dark')}</div></div>`;
        })
        .join('')}</div>`,
    )
    .join('');
}

function wireZoom(): void {
  const zoom = $('zoom');
  const img = $<HTMLImageElement>('zoom-img');
  $('groups').addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
    if (!t) return;
    img.src = t.dataset.zoom!;
    img.onload = () => {
      const k = Math.min(3, Math.max(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)));
      img.style.width = `${img.naturalWidth * k}px`;
    };
    const box = zoom.querySelector<HTMLElement>('.box')!;
    box.className = `box ${[...t.classList].find((c) => ['checker', 'white', 'dark'].includes(c))}`;
    zoom.classList.add('show');
  });
  zoom.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-bg]');
    if (b) zoom.querySelector<HTMLElement>('.box')!.className = `box ${b.dataset.bg}`;
    if ((ev.target as HTMLElement).id === 'zoom-close' || ev.target === zoom) zoom.classList.remove('show');
  });
}

// ---------- 3. Xếp chồng thử ----------
let app: Application;
const root = new Container();
const backdrop = new Backdrop();
const world = new Container();
const tower = new TowerView();

function fakeState(e: Edit): TowerSceneInput {
  const floors = Number($<HTMLSelectElement>('floors').value);
  const spire = input('withSpire').checked && floors > 0;
  return {
    tower: { floor: floors, totalFloors: floors, stage: Number($<HTMLSelectElement>('topStage').value), completed: spire },
    layout: {
      safeArea: { top: 180, bottom: 600, right: 150 },
      floor1WidthPx: e.w1,
      towerTaper: e.taper,
      towerCenterX: e.ax,
      towerBaseY: e.ay,
      boardRotateSec: 15,
    },
  };
}

function render(): void {
  const m = data.manifest;
  if (!m || !edit || !art) return;
  tower.setTowerArt(towerArtFrom(editedManifest(m, edit)));
  tower.update(fakeState(edit), {
    anchor: { x: edit.ax, y: edit.ay },
    floor1WidthPx: edit.w1,
    towerTaper: edit.taper,
    spireScale: edit.spireScale,
  });
  const placement = tower.currentPlacement();
  if (input('fitAll').checked) {
    // Thu nhỏ để thấy cả tháp, giữ nguyên tỉ lệ.
    const top = placement.spire?.topY ?? placement.floors.at(-1)?.topY ?? edit.ay - 300;
    const minY = Math.min(0, top - 60);
    const k = STAGE_H / (STAGE_H - minY);
    root.scale.set(k);
    root.position.set((STAGE_W - STAGE_W * k) / 2, -minY * k);
    world.y = 0;
    backdrop.update(0);
  } else {
    root.scale.set(1);
    root.position.set(0, 0);
    const cam = cameraTargetFor(placement);
    world.y = cam;
    backdrop.update(cam);
  }
  drawPiece();
}

function selected(): { key: string; eave: number; top: number } {
  const v = $<HTMLSelectElement>('editStage').value;
  if (v === 'spire') return { key: SPIRE_KEY, eave: edit!.spireEave, top: edit!.spireTop };
  return { key: FLOOR_STAGE_KEYS[Number(v) - 1]!, eave: edit!.eave, top: edit!.tops[Number(v) - 1]! };
}

/** Ảnh đang chỉnh, vẽ to kèm vạch eaveLineY (đỏ), topY (xanh), trục giữa (vàng). */
function drawPiece(): void {
  const cv = $<HTMLCanvasElement>('piece');
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const sel = selected();
  const bmp = art?.bitmaps.get(sel.key);
  const e = data.manifest?.images[sel.key];
  if (!bmp || !e) return;
  const k = Math.min(cv.width / bmp.width, cv.height / bmp.height);
  const ox = (cv.width - bmp.width * k) / 2;
  const oy = (cv.height - bmp.height * k) / 2;
  ctx.drawImage(bmp, ox, oy, bmp.width * k, bmp.height * k);
  const line = (y: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, oy + y * k);
    ctx.lineTo(cv.width, oy + y * k);
    ctx.stroke();
  };
  line(sel.eave, '#ff3030');
  line(sel.top, '#3c8cff');
  ctx.strokeStyle = '#ffe000';
  ctx.beginPath();
  ctx.moveTo(ox + e.anchor.x * k, 0);
  ctx.lineTo(ox + e.anchor.x * k, cv.height);
  ctx.stroke();
}

function syncControls(): void {
  if (!edit || !data.manifest) return;
  const sel = selected();
  const e = data.manifest.images[sel.key]!;
  const set = (id: string, v: number, min?: number, max?: number) => {
    const el = input(id);
    if (min !== undefined) el.min = String(min);
    if (max !== undefined) el.max = String(max);
    el.value = String(v);
    $(`${id}-v`).textContent = id === 'taper' ? v.toFixed(3) : id === 'spireScale' ? v.toFixed(2) : String(Math.round(v));
  };
  set('eave', sel.eave, 0, e.h);
  set('top', sel.top, 0, e.h);
  $('eave-hint').textContent = sel.key === SPIRE_KEY ? '' : '(chung cho 5 ảnh)';
  $('auto-note').textContent = e.auto ? `Máy đo: eaveLineY ${e.auto.eaveLineY}, topY ${e.auto.topY}${e.tuned ? ' · ảnh này đã được chỉnh tay' : ''}` : '';
  set('w1', edit.w1);
  set('taper', edit.taper);
  set('spireScale', edit.spireScale);
  set('ax', edit.ax);
  set('ay', edit.ay);
}

function wirePreview(): void {
  const floors = $<HTMLSelectElement>('floors');
  floors.innerHTML = Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${i === 10 ? 'selected' : ''}>${i === 0 ? '0 (nền móng)' : i}</option>`).join('');
  for (const id of ['floors', 'topStage', 'withSpire', 'fitAll']) $(id).addEventListener('change', render);
  $('editStage').addEventListener('change', () => {
    syncControls();
    drawPiece();
  });
  const onSlide = (id: string, apply: (v: number) => void) =>
    input(id).addEventListener('input', () => {
      if (!edit) return;
      apply(Number(input(id).value));
      syncControls();
      render();
    });
  onSlide('eave', (v) => {
    const s = $<HTMLSelectElement>('editStage').value;
    if (s === 'spire') edit!.spireEave = v;
    else edit!.eave = v;
  });
  onSlide('top', (v) => {
    const s = $<HTMLSelectElement>('editStage').value;
    if (s === 'spire') edit!.spireTop = v;
    else edit!.tops[Number(s) - 1] = v;
  });
  onSlide('w1', (v) => (edit!.w1 = v));
  onSlide('taper', (v) => (edit!.taper = v));
  onSlide('spireScale', (v) => (edit!.spireScale = v));
  onSlide('ax', (v) => (edit!.ax = v));
  onSlide('ay', (v) => (edit!.ay = v));

  $('reset-auto').addEventListener('click', () => {
    const m = data.manifest;
    if (!m || !edit) return;
    const auto = (k: string) => m.images[k]!.auto;
    edit.eave = auto(FLOOR_STAGE_KEYS[0]!)?.eaveLineY ?? edit.eave;
    edit.tops = FLOOR_STAGE_KEYS.map((k, i) => auto(k)?.topY ?? edit!.tops[i]!);
    edit.spireEave = auto(SPIRE_KEY)?.eaveLineY ?? edit.spireEave;
    edit.spireTop = auto(SPIRE_KEY)?.topY ?? edit.spireTop;
    syncControls();
    render();
  });
  $('reload').addEventListener('click', async () => {
    await fetchData();
    edit = data.manifest ? editFromManifest(data.manifest) : null;
    syncControls();
    render();
  });
  $('save').addEventListener('click', async () => {
    if (!edit) return;
    const pieces: Record<string, { eaveLineY: number; topY: number }> = {};
    FLOOR_STAGE_KEYS.forEach((k, i) => (pieces[k] = { eaveLineY: edit!.eave, topY: edit!.tops[i]! }));
    pieces[SPIRE_KEY] = { eaveLineY: edit.spireEave, topY: edit.spireTop };
    const r = await fetch('/api/tools/manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pieces,
        towerAnchor: { x: edit.ax, y: edit.ay },
        spireScale: edit.spireScale,
        floor1WidthPx: Math.round(edit.w1),
        towerTaper: edit.taper,
      }),
    });
    const msg = $('save-msg');
    if (!r.ok) {
      msg.innerHTML = `<span class="err">${esc(((await r.json()) as { error: string }).error)}</span>`;
      return;
    }
    msg.innerHTML = '<span class="ok">Đã lưu. Overlay đang mở sẽ cập nhật ngay.</span>';
    await fetchData();
    buildGallery();
  });
}

async function reloadArt(): Promise<void> {
  const next = await loadArt(version);
  if (art) destroyArt(art);
  art = next;
  backdrop.build(art, edit?.ay ?? 1215);
  tower.setArt(art);
  render();
}

async function boot(): Promise<void> {
  await loadFonts();
  await fetchData();
  edit = data.manifest ? editFromManifest(data.manifest) : null;
  buildCompare();
  wireCompare();
  buildGallery();
  wireZoom();

  app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x000000, antialias: true, resolution: 0.5 });
  $('preview').appendChild(app.canvas);
  world.addChild(tower.container);
  root.addChild(backdrop.sky, backdrop.land, world);
  app.stage.addChild(root);
  tower.setDebug(true);
  wirePreview();
  syncControls();
  await reloadArt();
}

void boot();
