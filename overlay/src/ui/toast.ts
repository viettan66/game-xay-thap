// Thông báo quà (mục 8 SPEC): bật lên khoảng 4 giây kèm avatar, tên, ảnh vật phẩm. Có hàng đợi: quà lớn ưu tiên;
// cùng id = gộp vào thông báo đang chờ / đang hiện (quà nhỏ liên tiếp của cùng một người).
// Chip "+công" kèm tên (phòng đông, rất đông): bay lên rồi mờ dần.
// Server quyết định quà nào hiện kiểu nào (server/overlay/toasts.ts). Avatar tạm: vòng tròn màu có chữ cái đầu
// (ảnh avatar thật có từ giai đoạn 6). Câu chưa duyệt (chỉ ở giả lập) có viền cam.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { ServerMessage } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import type { Rect } from '../layout.js';
import { C, FONT_BODY } from '../theme.js';

type ToastMsg = Extract<ServerMessage, { type: 'toast' }>;

const QUEUE_MAX = 8;
const UNVERIFIED = 0xff8c1a;
const shadow = { color: 0x000000, alpha: 0.6, blur: 3, distance: 1, angle: Math.PI / 2 };

/** Màu ổn định cho avatar tạm theo mã người xem. */
export function avatarHue(platformId: string): number {
  let h = 0;
  for (const ch of platformId) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

export function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export class ToastView {
  readonly container = new Container();
  private readonly panel = new Container();
  private readonly bg = new Graphics();
  private readonly avatar = new Graphics();
  private readonly initial = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 28, fontWeight: '700', fill: 0xffffff } });
  private readonly name = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '700', fill: C.goldLight, dropShadow: shadow } });
  private readonly text = new Text({
    text: '',
    style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '600', fill: C.cream, wordWrap: true, wordWrapWidth: 260, lineHeight: 26, dropShadow: shadow },
  });
  private readonly icon = new Sprite();
  private readonly plusLayer = new Container();
  private icons = new Map<string, Texture>();
  private queue: ToastMsg[] = [];
  private current: { msg: ToastMsg; t: number; dur: number } | null = null;
  private slide = 0;
  private plus: { text: Text; t: number }[] = [];

  constructor(
    private rect: Rect,
    private plusRect: Rect,
    private durationSec = 4,
  ) {
    this.icon.anchor.set(0.5);
    this.initial.anchor.set(0.5);
    this.panel.addChild(this.bg, this.avatar, this.initial, this.name, this.text, this.icon);
    this.panel.visible = false;
    this.container.addChild(this.panel, this.plusLayer);
  }

  setArt(art: Art): void {
    this.icons.clear();
    for (const [k, t] of art.textures) if (k.startsWith('items/')) this.icons.set(k, t);
    if (this.current) this.render(this.current.msg);
  }

  setRects(rect: Rect, plusRect: Rect, durationSec: number): void {
    this.rect = rect;
    this.plusRect = plusRect;
    this.durationSec = durationSec;
  }

  push(msg: ToastMsg): void {
    if (msg.kind === 'plus') return this.spawnPlus(msg);
    if (this.current?.msg.id === msg.id) {
      // Gộp vào thông báo đang hiện: thay nội dung, hiện thêm ít nhất 2 giây.
      this.current.msg = msg;
      this.current.dur = Math.max(this.current.dur, this.current.t + 2);
      this.render(msg);
      return;
    }
    const same = this.queue.findIndex((q) => q.id === msg.id);
    if (same >= 0) this.queue[same] = msg;
    else this.queue.push(msg);
    // Quà lớn ưu tiên (ổn định theo thứ tự đến với quà bằng nhau).
    this.queue = this.queue.map((m, i) => ({ m, i })).sort((a, b) => b.m.coins - a.m.coins || a.i - b.i).map((x) => x.m);
    while (this.queue.length > QUEUE_MAX) this.queue.pop();
  }

  private render(msg: ToastMsg): void {
    const r = this.rect;
    const hasIcon = !!(msg.icon && this.icons.get(msg.icon));
    const textW = r.w - 96 - (hasIcon ? 84 : 16);
    this.text.style.wordWrapWidth = textW;
    this.name.text = msg.name;
    this.text.text = msg.text;
    while (this.name.width > textW && Number(this.name.style.fontSize) > 14) this.name.style.fontSize = Number(this.name.style.fontSize) - 1;
    const h = Math.max(r.h, 18 + this.name.height + this.text.height + 14);
    const border = msg.verified ? { width: 2, color: C.gold, alpha: 0.95 } : { width: 4, color: UNVERIFIED };
    this.bg.clear().roundRect(0, 0, r.w, h, 16).fill({ color: 0x1d130b, alpha: 0.86 }).stroke(border);
    this.avatar.clear().circle(48, h / 2, 32).fill(hsl(avatarHue(msg.platformId), 0.55, 0.45)).stroke({ width: 3, color: C.gold });
    this.initial.text = Array.from(msg.name.trim())[0]?.toUpperCase() ?? '?';
    this.initial.position.set(48, h / 2);
    this.name.position.set(96, 12);
    this.text.position.set(96, 14 + this.name.height);
    const tex = msg.icon ? this.icons.get(msg.icon) : undefined;
    this.icon.visible = !!tex;
    if (tex) {
      this.icon.texture = tex;
      const k = Math.min(70 / tex.width, 70 / tex.height);
      this.icon.scale.set(k);
      this.icon.position.set(r.w - 46, h / 2);
    }
  }

  private spawnPlus(msg: ToastMsg): void {
    const t = new Text({ text: msg.text, style: { fontFamily: FONT_BODY, fontSize: 21, fontWeight: '700', fill: C.goldLight, stroke: { color: 0x2a1a0e, width: 5 } } });
    t.position.set(this.plusRect.x + 4, this.plusRect.y + 4);
    this.plusLayer.addChild(t);
    // Chip cũ đẩy xuống dưới để không đè chữ; tối đa 4 chip.
    for (const p of this.plus) p.text.y += t.height + 2;
    this.plus.push({ text: t, t: 0 });
    while (this.plus.length > 4) this.plus.shift()!.text.destroy();
  }

  tick(dt: number): void {
    if (!this.current && this.queue.length) {
      const msg = this.queue.shift()!;
      this.current = { msg, t: 0, dur: this.durationSec };
      this.slide = 0;
      this.render(msg);
    }
    if (this.current) {
      const c = this.current;
      c.t += dt;
      // Trượt vào 0,25 giây, trượt ra 0,25 giây; còn hàng đợi thì rút ngắn chút cho kịp.
      const dur = this.queue.length > 2 ? Math.min(c.dur, 3) : c.dur;
      const target = c.t < dur ? 1 : 0;
      this.slide += (target - this.slide) * Math.min(1, dt * 10);
      if (c.t >= dur && this.slide < 0.02) this.current = null;
    } else this.slide = 0;
    this.panel.visible = this.slide > 0.01;
    this.panel.alpha = this.slide;
    this.panel.position.set(this.rect.x - (1 - this.slide) * 60, this.rect.y);
    for (let i = this.plus.length - 1; i >= 0; i--) {
      const p = this.plus[i]!;
      p.t += dt;
      p.text.y -= dt * 18;
      p.text.alpha = Math.max(0, Math.min(1, (2.2 - p.t) / 0.6));
      if (p.t >= 2.2) {
        p.text.destroy();
        this.plus.splice(i, 1);
      }
    }
  }
}
