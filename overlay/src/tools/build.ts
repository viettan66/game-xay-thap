// Trang /tools/build (giai đoạn R3c, mục 15 SPEC): thử xây từng mảnh.
// Chọn hạng mục và giai đoạn bắt đầu; nút "thả 10 tim", "tặng quà nhỏ / lớn / cực lớn"; hiện FPS.
// Dùng đúng phần vẽ của overlay (MapView + Builder) và đúng hàm tính công, cộng điểm của game,
// nhưng tiến độ chỉ nằm trong trang này (sandbox.ts): không ghi vào dữ liệu game, không hiện trên overlay.

import { Application } from 'pixi.js';
import type { PointRules } from '../../../shared/points.js';
import type { ResolvedProject } from '../../../shared/project.js';
import type { ProgressLabels } from '../../../shared/progressView.js';
import type { PiecesConfig, SafeArea } from '../../../shared/protocol.js';
import { PARTS } from '../../../shared/parts.js';
import { destroyArt, loadArt } from '../art.js';
import { STAGE_H, STAGE_W, uiRects } from '../layout.js';
import { MapView } from '../scene/map.js';
import { loadFonts } from '../theme.js';
import { Badge, Disclaimer } from '../ui/chrome.js';
import { DEFAULT_COINS, FpsMeter, pickAuto, Sandbox, trialPoints, TRIAL_ACTIONS, type TrialAction } from './sandbox.js';

type CrowdKey = 'vang' | 'vua' | 'dong' | 'ratdong';
const CROWDS: { key: CrowdKey; label: string }[] = [
  { key: 'vang', label: 'Phòng vắng' },
  { key: 'vua', label: 'Phòng vừa' },
  { key: 'dong', label: 'Phòng đông' },
  { key: 'ratdong', label: 'Phòng rất đông' },
];
const LOOK_TEXT: Record<string, string> = { full: 'màu thật', wood: 'gỗ thô', coc: 'cọc và dây', dao: 'đào đất', dong: 'đống vật liệu' };

interface BuildReply {
  project: ResolvedProject;
  current: { itemId: string; stageIndex: number; completed: boolean };
  progressLabels: ProgressLabels;
  points: PointRules;
  pieces: { size: PiecesConfig['size']; maxPerSec: Record<CrowdKey, number>; materials: Record<string, string>; burstSec: number };
  texts: { pieceBurst: string[] };
  labels: { badge: string; disclaimer: string; pointUnit: string };
  safeArea: SafeArea;
  assetsVersion: string;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN');

async function boot(): Promise<void> {
  const res = await fetch('/api/tools/build', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không đọc được dữ liệu (${res.status})`);
  const cfg = (await res.json()) as BuildReply;
  const project = cfg.project;
  const unit = cfg.labels.pointUnit;

  await loadFonts();
  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x000000, antialias: true, resolution: 1 });
  $('stage').prepend(app.canvas);

  // Cùng khung nhìn với overlay: phần giữa khối giao diện phía trên và dải miễn trừ.
  const r = uiRects(cfg.safeArea);
  const mapView = new MapView({ top: r.chip.y + r.chip.h, bottom: r.disclaimer.y }, app.renderer);
  const badge = new Badge(r.badge);
  const disclaimer = new Disclaimer(r.disclaimer);
  badge.update(cfg.labels.badge);
  disclaimer.update(cfg.labels.disclaimer);
  app.stage.addChild(mapView.container, disclaimer.container, badge.container);

  const art = await loadArt(cfg.assetsVersion);
  mapView.setArt(art);
  window.addEventListener('beforeunload', () => destroyArt(art));
  const msg = $('stage-msg');
  if (!mapView.ready) msg.textContent = 'Chưa có bản đồ. Làm ảnh bản đồ trước (README mục 3b: npm run assets:map), rồi tải lại trang.';
  else msg.remove();

  // ---- Chỗ bắt đầu ----
  const qs = new URLSearchParams(location.search);
  const start = (() => {
    const id = qs.get('item');
    if (id && project.items.some((i) => i.id === id)) return { itemId: id, stageIndex: Number(qs.get('stage') ?? 0) || 0 };
    if (!cfg.current.completed) return { itemId: cfg.current.itemId, stageIndex: cfg.current.stageIndex };
    return { itemId: project.items[0]!.id, stageIndex: 0 };
  })();
  const sandbox = new Sandbox(project, cfg.progressLabels, start.itemId, start.stageIndex);

  const itemSel = $<HTMLSelectElement>('item');
  const stageSel = $<HTMLSelectElement>('stage-sel');
  project.items.forEach((it, i) => itemSel.add(new Option(`${i + 1}. ${it.name}`, it.id)));
  const fillStages = () => {
    const item = project.items.find((i) => i.id === itemSel.value)!;
    stageSel.replaceChildren(...item.stages.map((s, k) => new Option(`${k + 1}. ${s.name}`, String(k))));
  };
  itemSel.value = sandbox.progress.itemId;
  fillStages();
  stageSel.value = String(sandbox.progress.stageIndex);

  const stageInfo = () => {
    const item = project.items.find((i) => i.id === itemSel.value)!;
    const st = item.stages[Number(stageSel.value)]!;
    const parts = st.build.parts.length
      ? st.build.parts.length === PARTS.length
        ? 'mọi vùng còn lại'
        : st.build.parts.map((k) => PARTS.find((p) => p.key === k)?.label ?? k).join(', ')
      : 'mặt đất';
    const band = st.build.band[0] !== 0 || st.build.band[1] !== 100 ? `, dải ${st.build.band[0]}–${st.build.band[1]}% chiều cao` : '';
    $('stage-info').textContent = `Giá giai đoạn: ${fmt(st.cost)} ${unit}. Xây: ${parts} (${LOOK_TEXT[st.build.look] ?? st.build.look}${band}).`;
  };

  const restart = () => {
    sandbox.select(itemSel.value, Number(stageSel.value));
    mapView.update(sandbox.view());
    mapView.resync();
    stageInfo();
    const url = new URL(location.href);
    url.searchParams.set('item', itemSel.value);
    url.searchParams.set('stage', stageSel.value);
    history.replaceState(null, '', url);
  };
  itemSel.addEventListener('change', () => {
    fillStages();
    restart();
  });
  stageSel.addEventListener('change', restart);
  $('restart').addEventListener('click', restart);
  mapView.update(sandbox.view());
  stageInfo();

  // ---- Góp công ----
  const coinsInput = (a: Exclude<TrialAction, 'like10'>) => $<HTMLInputElement>(`coins-${a}`);
  for (const a of ['small', 'large', 'huge'] as const) coinsInput(a).value = String(DEFAULT_COINS[a]);
  const coinsOf = (a: TrialAction) => (a === 'like10' ? 0 : Math.max(1, Math.floor(Number(coinsInput(a).value) || DEFAULT_COINS[a])));
  const showPoints = () => {
    for (const a of TRIAL_ACTIONS) $(`pts-${a}`).textContent = `= ${fmt(trialPoints(a, coinsOf(a), cfg.points).points)} ${unit}`;
  };
  for (const a of ['small', 'large', 'huge'] as const) coinsInput(a).addEventListener('input', showPoints);
  showPoints();

  let clicks = 0;
  const act = (a: TrialAction) => {
    const { source, points } = trialPoints(a, coinsOf(a), cfg.points, Date.now());
    const name = $<HTMLInputElement>('name').value.trim() || 'Khách thử';
    const c = sandbox.give(name, source, points);
    if (!c) return;
    clicks++;
    mapView.update(sandbox.view());
    mapView.contribution(c);
  };
  document.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act as TrialAction)));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const a = TRIAL_ACTIONS[Number(e.key) - 1];
    if (a) act(a);
  });

  // ---- Bắn liên tục, tốc độ đặt mảnh ----
  let auto = false;
  let autoAcc = 0;
  const autoBtn = $<HTMLButtonElement>('auto');
  autoBtn.addEventListener('click', () => {
    auto = !auto;
    autoAcc = 0;
    autoBtn.textContent = auto ? '■ Dừng' : '▶ Bắn liên tục';
    autoBtn.classList.toggle('on', auto);
  });
  const crowdSel = $<HTMLSelectElement>('crowd');
  for (const c of CROWDS) crowdSel.add(new Option(`${c.label}: ${cfg.pieces.maxPerSec[c.key]} mảnh/giây`, c.key));
  crowdSel.value = 'vua';
  const piecesCfg = (): PiecesConfig => ({
    size: cfg.pieces.size,
    maxPerSec: cfg.pieces.maxPerSec[crowdSel.value as CrowdKey] ?? cfg.pieces.maxPerSec.vua,
    materials: cfg.pieces.materials,
    burstSec: cfg.pieces.burstSec,
  });

  // ---- Số liệu ----
  const fps = new FpsMeter();
  const fpsEl = $('fps');
  let uiTimer = 0;
  const showStats = () => {
    fpsEl.textContent = fps.fps.toFixed(0);
    fpsEl.className = `fps ${fps.fps >= 55 ? 'good' : fps.fps >= 40 ? 'warn' : 'bad'}`;
    $('fps-low').textContent = `thấp nhất 10 giây qua: ${fps.low.toFixed(0)}`;
    $('fps-badge').textContent = `${fps.fps.toFixed(0)} FPS`;
    const s = mapView.stats();
    const item = project.items.find((i) => i.id === s.itemId);
    $('st-shown').textContent = item ? `${item.name}, giai đoạn ${s.stage + 1}/${item.stages.length}: ${item.stages[s.stage]?.name ?? ''}${s.done ? ' (xong)' : ''}` : '–';
    $('st-pieces').textContent = s.count ? `${fmt(s.placed)} / ${fmt(s.count)} mảnh của giai đoạn` : '–';
    $('st-queue').textContent = `${fmt(s.pending)} mảnh chờ, ${fmt(s.flying)} đang bay`;
    const v = sandbox.view();
    $('st-progress').textContent = v.completed
      ? 'Công trình đã xong hết. Chọn lại chỗ bắt đầu.'
      : `${v.item.name}, giai đoạn ${v.stage.number}/${v.stage.count}: ${fmt(v.stagePoints)} / ${fmt(v.stageCost)} ${unit} (${v.percent}%)`;
    $('st-total').textContent = `${fmt(v.totalPoints)} ${unit}, ${fmt(clicks)} lần bấm`;
  };

  app.ticker.add((t) => {
    const dt = Math.min(0.1, t.deltaMS / 1000);
    fps.frame(performance.now());
    if (auto) {
      autoAcc += dt * Number($<HTMLSelectElement>('auto-rate').value);
      while (autoAcc >= 1) {
        autoAcc -= 1;
        act(pickAuto(Math.random()));
      }
    }
    mapView.tick(dt, piecesCfg(), cfg.texts.pieceBurst);
    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.25;
      showStats();
    }
  });
}

boot().catch((e: unknown) => {
  console.error(e);
  $('error').textContent = e instanceof Error ? e.message : String(e);
});
