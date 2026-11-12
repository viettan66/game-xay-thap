// Lớp nhân vật trên bản đồ (mục 9, 9B; giai đoạn 4d, 4e): nhân vật người xem, người góp công cũ (khung tên bạc), dân phu
// không tên (nhãn nghề, làm chậm hơn), chữ trên đầu, "+công", xe trâu, voi, chuông, tượng võ tướng đá, đám đông vô danh
// (phòng rất đông), chim bay, xe trâu NPC. Danh sách ai có nhân vật do server quyết định (state.actors); lớp này lo đi vào,
// làm việc, đi ra.
// Nhân vật, xe, tượng vẽ trong lớp sắp theo chân (cùng lớp với công trình, mục 8: xen kẽ đúng thứ tự trước sau);
// chữ vẽ ở lớp màn hình, kích thước cố định.

import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { lookFor, type CharLook, type GiftEffect } from '../../../shared/characters.js';
import type { MapManifest, MapRect } from '../../../shared/map.js';
import { buildGraph, mainEntry, route, type PathGraph, type PathPoint } from '../../../shared/paths.js';
import type { ActorInfo, AnonCrowd, CharactersConfig, HonorInfo } from '../../../shared/protocol.js';
import { fillTemplate } from '../../../shared/project.js';
import type { Art } from '../art.js';
import { Actor, type ActorWorld } from './actor.js';
import { CharArt, placeholderFigure } from './charArt.js';
import { Effects, type FxWorld } from './effects.js';
import { HonorView } from './honors.js';
import { Birds, NpcCartTimer } from './ambient.js';
import { AnonCrowdView } from './crowd.js';
import { actorTag, npcTag, plusText, returningTag, type NameTag } from './labels.js';
import { scaffoldShare, workActions, type CarryKind, type WorkKind } from './sprites.js';
import { SpotPool, type Pt, type SiteGeom } from './spots.js';

/** Những gì lớp nhân vật cần biết về bản đồ và công trường (MapView cung cấp). */
export interface CharsContext {
  site(): SiteGeom | null;
  /** zIndex để vẽ người đứng trên giàn giáo trước công trình đang xây. */
  siteZ(): number;
  kind(): WorkKind;
  material(): CarryKind;
  dropAtPile(): void;
  /** Khung đang nhìn thấy (tọa độ bản đồ). */
  view(): MapRect;
  /** Tọa độ bản đồ → màn hình. */
  toScreen(x: number, y: number): Pt;
  /** Lia camera tới một chỗ rồi quay về (tượng mới). */
  peek(rect: MapRect): void;
  /** Vùng khung hình trên màn hình (giữa vùng an toàn trên và khu comment), cho chim bay. */
  screenView(): { left: number; right: number; top: number; bottom: number };
  /** Điểm (tọa độ bản đồ) bị thân một công trình đang hiện che khuất. */
  hidden(p: Pt): boolean;
}

/** Thứ tự ưu tiên hiện chữ khi chồng nhau: người xem, rồi người góp công cũ, rồi dân phu. */
const TAG_RANK: Record<ActorInfo['kind'], number> = { viewer: 0, returning: 1, npc: 2 };

function makeTag(info: ActorInfo): NameTag {
  if (info.kind === 'npc') return npcTag(info.name);
  if (info.kind === 'returning') return returningTag(info.id, info.name, info.note ?? null);
  return actorTag(info.id, info.name, info.title);
}

const tagKey = (i: ActorInfo) => `${i.kind}|${i.name}|${i.title ?? ''}|${i.note ?? ''}`;

interface Entry {
  actor: Actor;
  sprite: Sprite;
  ph: Graphics | null;
  tag: NameTag;
  info: ActorInfo;
  /** Lần có công gần nhất (để ưu tiên hiện chữ khi chồng nhau). */
  ping: number;
}

interface Plus {
  text: Text;
  actorId: string;
  t: number;
}

const LOOK_COLOR: Record<CharLook, number> = { danphu_nam: 0x5b7aa8, danphu_nu: 0xb06a8c, thomoc: 0x8a5a2e, thone: 0x7a7a6a, tusi: 0xd08a2a };
const PLUS_SEC = 1.3;
const PLUS_MAX = 14;

export class CharactersView {
  /** Chữ trên đầu (lớp màn hình). */
  readonly screen = new Container();
  private art: CharArt | null = null;
  private rawArt: Art | null = null;
  private map: MapManifest | null = null;
  private graph: PathGraph = { nodes: [], adj: [] };
  private edges: Pt[] = [];
  private entry: Pt | null = null;
  private readonly entries = new Map<string, Entry>();
  private infos: ActorInfo[] = [];
  /** Nhân vật đang đi ra (đã bị server bỏ khỏi danh sách). */
  private leaving: Entry[] = [];
  private plus: Plus[] = [];
  private readonly pool = new SpotPool();
  private poolSig = '';
  private ctx: CharsContext | null = null;
  private cfg: CharactersConfig = {
    heightMap: 54,
    boostSec: 4,
    plusText: '+{points} {unit}',
    maxVehicles: 3,
    honorRotateSec: 20,
    npcPace: 0.75,
    birdsEverySec: 0,
    npcCartEverySec: 0,
    flags: true,
  };
  private readonly crowd: AnonCrowdView;
  private readonly birds = new Birds();
  private readonly cartTimer = new NpcCartTimer();
  private unit = '';
  private clock = 0;
  private loaded = false;
  private readonly tagLayer = new Container();
  private readonly plusLayer = new Container();
  private readonly fxScreen = new Container();
  private readonly world: ActorWorld;
  private effects: Effects | null = null;
  private readonly honors: HonorView;
  private rand = Math.random;

  constructor(
    private readonly depth: Container,
    private readonly fxLayer: Container,
  ) {
    this.screen.addChild(this.birds.container, this.fxScreen, this.tagLayer, this.plusLayer);
    this.honors = new HonorView(depth, this.fxScreen, null);
    this.crowd = new AnonCrowdView(depth, this.fxScreen);
    this.honors.onReveal = (r) => this.ctx?.peek(r);
    const self = this;
    this.world = {
      route: (from, to) => self.route(from, to),
      edgePoint: (rand) => self.edgePoint(rand),
      view: () => self.ctx?.view() ?? { x: 0, y: 0, w: 1, h: 1 },
      site: () => self.ctx?.site() ?? null,
      pool: this.pool,
      actions: (look) => workActions(self.art?.frames.get(look), self.ctx?.kind() ?? 'mason'),
      scaffoldShare: () => scaffoldShare(self.ctx?.kind() ?? 'mason'),
      material: () => self.ctx?.material() ?? 'basket',
      dropAtPile: () => self.ctx?.dropAtPile(),
      rand: () => self.rand(),
      get scale() {
        return self.cfg.heightMap / 54;
      },
    };
  }

  setContext(ctx: CharsContext): void {
    this.ctx = ctx;
  }

  setArt(art: Art): void {
    this.rawArt = art;
    this.art = new CharArt(art);
    this.map = art.manifest?.map ?? null;
    const paths = this.map?.paths ?? [];
    this.graph = buildGraph(paths);
    const e = mainEntry(paths);
    this.entry = e ? { x: e[0], y: e[1] } : this.map ? { x: this.map.width / 2, y: this.map.height - 10 } : null;
    // Lối vào từ mép bản đồ: đầu mút lối đi gần mép trái / phải / dưới, và đầu đường chính.
    const W = this.map?.width ?? 0;
    const H = this.map?.height ?? 0;
    this.edges = [];
    this.graph.nodes.forEach((n, i) => {
      if (this.graph.adj[i]!.length !== 1) return;
      if (n[0] < 220 || n[0] > W - 220 || n[1] > H - 220) this.edges.push({ x: n[0], y: n[1] });
    });
    if (this.entry && !this.edges.some((p) => p.x === this.entry!.x && p.y === this.entry!.y)) this.edges.push(this.entry);
    // Ảnh mới: dựng lại mọi nhân vật đứng sẵn ở chỗ làm.
    this.destroyAll();
    this.pool.update(null);
    this.poolSig = '';
    if (!this.effects) {
      this.effects = new Effects(this.depth, this.fxScreen, art, this.art, this.fxWorld());
    } else this.effects.setArt(art, this.art);
    this.honors.setArt(this.art, this.map?.honorSlots ?? []);
    this.crowd.setArt(this.art);
    if (this.map) {
      for (const info of this.infos) this.spawn(info, true);
      if (this.infos.length) this.loaded = true;
    }
  }

  private destroyAll(): void {
    for (const en of [...this.entries.values(), ...this.leaving]) this.destroyEntry(en);
    this.entries.clear();
    this.leaving = [];
    for (const p of this.plus.splice(0)) p.text.destroy();
  }

  private fxWorld(): FxWorld {
    const self = this;
    return {
      route: (a, b) => self.route(a, b),
      mainEntry: () => self.entry ?? { x: 0, y: 0 },
      view: () => self.ctx?.view() ?? { x: 0, y: 0, w: 1, h: 1 },
      pile: () => self.ctx?.site()?.pile ?? null,
      site: () => self.ctx?.site() ?? null,
      front: () => {
        const s = self.ctx?.site();
        if (!s) return null;
        if (s.flat) return { x: s.pile.x + self.cfg.heightMap * 2.2, y: s.pile.y + 10 };
        return { x: s.rect.x + s.rect.w / 2, y: s.baseY + self.cfg.heightMap * 0.9 };
      },
      dropAtPile: () => self.ctx?.dropAtPile(),
      heightMap: () => self.cfg.heightMap,
      fx: this.fxLayer,
    };
  }

  private route(from: Pt, to: Pt): PathPoint[] {
    return route(this.graph, [from.x, from.y], [to.x, to.y]);
  }

  /** Lối vào / ra ngẫu nhiên ở mép bản đồ, ưu tiên chỗ đang khuất khỏi màn hình. */
  private edgePoint(rand: () => number): Pt {
    const v = this.ctx?.view();
    const outside = v ? this.edges.filter((p) => p.x < v.x - 40 || p.x > v.x + v.w + 40 || p.y < v.y - 40 || p.y > v.y + v.h + 40) : this.edges;
    const list = outside.length ? outside : this.edges;
    if (!list.length) return this.entry ?? { x: 0, y: 0 };
    return list[Math.floor(rand() * list.length)]!;
  }

  /** Danh sách nhân vật từ server: người mới đi vào từ mép màn hình, người bị bỏ đi ra. Lần đầu: đứng sẵn ở chỗ làm. */
  setActors(list: ActorInfo[], cfg: CharactersConfig, unit: string): void {
    this.cfg = cfg;
    this.unit = unit;
    if (this.effects) this.effects.maxVehicles = cfg.maxVehicles;
    // Nhớ danh sách: chưa có bản đồ (hoặc đổi ảnh) thì dựng lại khi có.
    this.infos = list;
    if (!this.map || !this.art) return;
    const snap = !this.loaded;
    this.loaded = true;
    const ids = new Set(list.map((a) => a.id));
    for (const [id, en] of this.entries) {
      if (ids.has(id)) continue;
      this.entries.delete(id);
      en.actor.leave(this.world);
      this.leaving.push(en);
    }
    for (const info of list) {
      const en = this.entries.get(info.id);
      if (!en) this.spawn(info, snap);
      else if (tagKey(en.info) !== tagKey(info)) {
        // Đổi tên, danh hiệu, hoặc người góp công cũ vừa tương tác (thành người xem thật): giữ nhân vật, đổi chữ.
        en.info = info;
        en.actor.pace = info.kind === 'npc' ? this.cfg.npcPace : 1;
        en.tag.root.destroy({ children: true });
        en.tag = makeTag(info);
        this.tagLayer.addChild(en.tag.root);
      }
    }
  }

  private spawn(info: ActorInfo, snap: boolean): void {
    const look = info.look ?? lookFor(info.id);
    const actor = new Actor(info.id, look, this.art?.frames.get(look), this.entry ?? { x: 0, y: 0 });
    // Dân phu NPC làm chậm hơn người xem (mục 9B).
    actor.pace = info.kind === 'npc' ? this.cfg.npcPace : 1;
    actor.enter(this.world, snap);
    const sprite = new Sprite();
    this.depth.addChild(sprite);
    const tag = makeTag(info);
    this.tagLayer.addChild(tag.root);
    this.entries.set(info.id, { actor, sprite, ph: null, tag, info, ping: this.clock });
  }

  private destroyEntry(en: Entry): void {
    en.sprite.destroy();
    en.ph?.destroy();
    en.tag.root.destroy({ children: true });
    this.pool.release(en.actor.id);
  }

  setHonors(list: HonorInfo[]): void {
    this.honors.setHonors(list, this.cfg.heightMap);
  }

  /** Đám đông vô danh (chỉ phòng rất đông). */
  setAnonCrowd(c: AnonCrowd | null): void {
    this.crowd.set(c);
  }

  /** Một lần có công của người xem: làm nhanh hơn, "+công", hiệu ứng quà theo mức. */
  contribution(m: { platformId: string; name: string; source: 'gift' | 'like' | 'comment'; points: number; effect: GiftEffect | null }): void {
    const en = this.entries.get(m.platformId);
    if (en) {
      en.ping = this.clock;
      if (m.source !== 'gift') {
        en.actor.boost(this.cfg.boostSec);
        this.addPlus(m.platformId, fillTemplate(this.cfg.plusText, { points: m.points.toLocaleString('vi-VN'), unit: this.unit }));
      }
    }
    switch (m.effect) {
      case 'brick':
        en?.actor.carryTrip(this.world, 'brick');
        break;
      case 'logs':
        en?.actor.carryTrip(this.world, 'wood');
        break;
      case 'cart':
      case 'elephant':
        this.effects?.vehicle(m.effect, m.name);
        break;
      case 'bell':
        this.effects?.bell(m.name);
        break;
      default:
        break;
    }
  }

  /** Tim / bình luận chưa đủ một mảnh: nhân vật của người đó khiêng vật liệu ra đống. Không có nhân vật thì trả false. */
  carryFor(platformId: string | null, kind: CarryKind): boolean {
    if (!platformId) return false;
    const a = this.entries.get(platformId)?.actor;
    if (!a) return false;
    a.carryTrip(this.world, kind);
    return true;
  }

  /** Tay một dân phu đang làm ở công trường (mảnh vật liệu bay từ tay người đứng gần, mục 7.5); không có thì null. */
  handNear(): Pt | null {
    const list = [...this.entries.values()].filter((e) => e.actor.working);
    if (!list.length || this.rand() < 0.4) return null;
    return list[Math.floor(this.rand() * list.length)]!.actor.hand(this.cfg.heightMap);
  }

  private addPlus(actorId: string, text: string): void {
    while (this.plus.length >= PLUS_MAX) this.plus.shift()!.text.destroy();
    // Mỗi người tối đa một chữ đang bay (chữ cũ bị thay).
    const old = this.plus.findIndex((p) => p.actorId === actorId);
    if (old >= 0) this.plus.splice(old, 1)[0]!.text.destroy();
    const t = plusText(text);
    this.plusLayer.addChild(t);
    this.plus.push({ text: t, actorId, t: 0 });
  }

  /** Số nhân vật đang hiện (kể cả đang đi ra), xe đang chạy (cho trang công cụ, test). */
  stats(): { actors: number; leaving: number; vehicles: number; honors: number; npcs: number; returning: number; crowd: number; birds: number } {
    const kinds = [...this.entries.values()].map((e) => e.info.kind);
    return {
      actors: this.entries.size,
      leaving: this.leaving.length,
      vehicles: this.effects?.busy ?? 0,
      honors: this.honors.count,
      npcs: kinds.filter((k) => k === 'npc').length,
      returning: kinds.filter((k) => k === 'returning').length,
      crowd: this.crowd.count,
      birds: this.birds.flying,
    };
  }

  /** Vị trí từng nhân vật (cho kiểm tra tự động). */
  debug(): { id: string; kind: string; x: number; y: number; leaving: boolean; working: boolean }[] {
    return [...this.entries.values(), ...this.leaving].map((e) => ({
      id: e.info.id,
      kind: e.info.kind,
      x: Math.round(e.actor.x),
      y: Math.round(e.actor.y),
      leaving: e.actor.leaving,
      working: e.actor.working,
    }));
  }

  /** Cho một đàn chim bay qua ngay (trang thử). */
  launchBirds(): void {
    if (this.ctx) this.birds.launch(this.ctx.screenView());
  }

  tick(dt: number): void {
    this.clock += dt;
    const ctx = this.ctx;
    if (!ctx || !this.art || !this.map) return;
    // Chỗ đứng theo công trường hiện tại (đổi hạng mục, giàn giáo cao lên / thấp xuống).
    const site = ctx.site();
    const sig = site ? `${site.key}:${site.ledgers.length}:${site.floor.length}:${Math.round(site.pile.x)}` : '';
    if (sig !== this.poolSig) {
      this.poolSig = sig;
      this.pool.update(site);
    }
    const h = this.cfg.heightMap;
    const siteZ = ctx.siteZ();
    const view = ctx.view();
    const all = [...this.entries.values(), ...this.leaving];
    for (const en of all) {
      en.actor.update(dt, this.world);
      const p = en.actor.pose();
      this.draw(en, p, h, siteZ);
    }
    // Đi ra xong: mờ dần rồi bỏ.
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const en = this.leaving[i]!;
      if (en.actor.gone && en.actor.fade(dt)) {
        this.destroyEntry(en);
        this.leaving.splice(i, 1);
      }
    }
    this.effects?.tick(dt, (x, y) => ctx.toScreen(x, y));
    this.layoutTags([...this.entries.values(), ...this.leaving], view, dt);
    // "+công" bay lên theo nhân vật.
    for (let i = this.plus.length - 1; i >= 0; i--) {
      const p = this.plus[i]!;
      p.t += dt;
      const a = this.entries.get(p.actorId)?.actor;
      if (!a || p.t >= PLUS_SEC) {
        p.text.destroy();
        this.plus.splice(i, 1);
        continue;
      }
      const s = ctx.toScreen(a.x, a.y - h * 1.1);
      const k = p.t / PLUS_SEC;
      p.text.position.set(s.x + 26, s.y - 30 - 46 * k);
      p.text.alpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    }
    this.honors.tick(dt, this.cfg.honorRotateSec, (x, y) => ctx.toScreen(x, y), view, this.fxLayer);
    this.crowd.tick(dt, {
      paths: this.map.paths ?? [],
      site: site ? { key: site.key, rect: site.rect, baseY: site.baseY } : null,
      view,
      toScreen: (x, y) => ctx.toScreen(x, y),
      heightMap: h,
      hidden: (p) => ctx.hidden(p),
    });
    // Công trường tự chạy (mục 9B): chim bay ngang, xe trâu NPC chở vật liệu chạy qua (không tên người tặng).
    this.birds.tick(dt, this.cfg.birdsEverySec, ctx.screenView());
    if (this.cartTimer.tick(dt, this.cfg.npcCartEverySec) && site) this.effects?.vehicle('cart', null);
  }

  private draw(en: Entry, p: ReturnType<Actor['pose']>, h: number, siteZ: number): void {
    const ok = this.art!.apply(en.sprite, p.sprite, h, p.flip);
    if (!ok) {
      if (!en.ph) {
        en.ph = placeholderFigure(LOOK_COLOR[en.actor.look], h);
        this.depth.addChild(en.ph);
      }
      en.ph.position.set(p.x, p.y + p.bob);
      en.ph.zIndex = p.scaffold ? siteZ : p.y;
      en.ph.alpha = p.alpha;
    } else {
      if (en.ph) {
        en.ph.destroy();
        en.ph = null;
      }
      en.sprite.position.set(p.x, p.y + p.bob);
      en.sprite.zIndex = p.scaffold ? siteZ : p.y;
      en.sprite.alpha = p.alpha;
    }
  }

  /** Đặt chữ trên đầu; chữ chồng lên nhau thì giữ người vừa có công gần nhất, ẩn bớt người khác. */
  private layoutTags(all: Entry[], view: MapRect, dt: number): void {
    const ctx = this.ctx!;
    const h = this.cfg.heightMap;
    // Tên người tặng trên xe, voi, chuông được ưu tiên; chữ nhân vật chồng lên thì ẩn bớt.
    const placed: { x: number; y: number; w: number; h: number }[] = this.effects?.tagRects() ?? [];
    const order = [...all].sort(
      (a, b) => Number(a.actor.leaving) - Number(b.actor.leaving) || TAG_RANK[a.info.kind] - TAG_RANK[b.info.kind] || b.ping - a.ping,
    );
    for (const en of order) {
      const a = en.actor;
      const on = a.x > view.x - 30 && a.x < view.x + view.w + 30 && a.y > view.y && a.y < view.y + view.h + h;
      const s = ctx.toScreen(a.x, a.y - h * 1.08);
      const r = { x: s.x - en.tag.w / 2 - 2, y: s.y - en.tag.h - 2, w: en.tag.w + 4, h: en.tag.h + 4 };
      const free = on && en.tag.w > 0 && !placed.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
      if (free) placed.push(r);
      const want = free ? 1 : 0;
      en.tag.vis += (want - en.tag.vis) * Math.min(1, dt * 8);
      en.tag.root.position.set(s.x, s.y);
      en.tag.root.alpha = en.tag.vis * a.pose().alpha;
      en.tag.root.visible = en.tag.vis > 0.02;
    }
  }

  /** Bỏ mọi hình (trước khi bản đồ đổi ảnh); danh sách nhân vật, tượng vẫn nhớ để dựng lại. */
  clear(): void {
    this.destroyAll();
    this.effects?.clear();
    this.honors.clear();
    this.crowd.clear();
    this.birds.clear();
  }
}
