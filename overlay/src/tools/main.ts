// Trang /tools/assets: bản đồ quần thể chùa và khung cắt công trình (tools/map.ts, R2),
// thư viện ảnh đã cắt (trụ trì, giao diện, vật phẩm, bia, đống vật liệu…) soi viền trên 3 nền.

import { assetUrl, type Manifest, type ManifestEntry } from '../../../shared/manifest.js';
import { initMapTool } from './map.js';

interface ToolsData {
  manifest: Manifest | null;
  missing: string[];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let data: ToolsData = { manifest: null, missing: [] };
let version = Date.now().toString(36);

async function fetchData(): Promise<void> {
  data = (await (await fetch('/api/tools/assets', { cache: 'no-store' })).json()) as ToolsData;
  version = Date.now().toString(36);
  const m = data.manifest;
  $('status').innerHTML = m
    ? `${Object.keys(m.images).length} ảnh trong manifest · ${data.missing.length ? `<span class="err">thiếu ${data.missing.length} file</span>` : '<span class="ok">đủ file</span>'}`
    : '<span class="err">Chưa có assets/manifest.json – chạy npm run assets:build</span>';
}

function buildGallery(): void {
  const m = data.manifest;
  $('missing').innerHTML = data.missing.length ? `<p class="err">Thiếu file: ${data.missing.map(esc).join(', ')}</p>` : '';
  if (!m) return;
  const groups = new Map<string, [string, ManifestEntry][]>();
  for (const [key, e] of Object.entries(m.images)) {
    const g = key.split('/')[0]!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push([key, e]);
  }
  const names: Record<string, string> = { chars: 'Nhân vật', abbot: 'Trụ trì', ui: 'Giao diện', items: 'Vật phẩm', stele: 'Bia đá', props: 'Đống vật liệu' };
  $('groups').innerHTML = [...groups.entries()]
    .map(
      ([g, items]) => `<h3>${esc(names[g] ?? g)} (${items.length})</h3><div class="grid">${items
        .map(([, e]) => {
          const missing = data.missing.includes(e.file);
          const src = `${assetUrl(e.file)}?v=${version}`;
          const thumb = (cls: string) =>
            missing ? `<div class="thumb missing">thiếu file</div>` : `<div class="thumb ${cls}" data-zoom="${src}"><img loading="lazy" src="${src}" alt=""></div>`;
          return `<div class="card"><div class="name">${esc(e.file)}</div><div class="meta">${e.w}×${e.h}px</div>
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

async function boot(): Promise<void> {
  void initMapTool();
  await fetchData();
  buildGallery();
  wireZoom();
}

void boot();
