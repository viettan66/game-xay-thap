// Chữ trên đầu nhân vật, xe, tượng (mục 9): vẽ ở kích thước màn hình, không thu nhỏ theo zoom camera.
// - Nhân vật: avatar tròn (tạm: chữ cái đầu trên nền màu theo mã người xem, ảnh thật có từ giai đoạn 6), tên (cắt bớt
//   nếu dài hơn 14 ký tự), huy hiệu danh hiệu.
// - Xe trâu, voi, chuông: tên người tặng. Tượng võ tướng đá: bảng tên khắc trên bệ.
// - "+công" bay lên khi thả tim, bình luận được tính công.

import { Container, Graphics, Text } from 'pixi.js';
import { shortName } from '../../../shared/characters.js';
import { C, FONT_BODY } from '../theme.js';
import { avatarHue, hsl } from '../ui/toast.js';

const stroke = { color: 0x2a170b, width: 4, join: 'round' as const };

export interface NameTag {
  root: Container;
  w: number;
  h: number;
  key: string;
  /** Độ hiện (0–1) khi tự ẩn bớt chữ chồng lên nhau. */
  vis: number;
}

/** Nhãn nhân vật: [danh hiệu] ở trên, [avatar] tên ở dưới; điểm neo = giữa đáy. */
export function actorTag(id: string, name: string, title: string | null): NameTag {
  const root = new Container();
  const short = shortName(name, 14);
  const nameText = new Text({ text: short, style: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', fill: C.cream, stroke } });
  const r = 11;
  const pad = 6;
  const w = r * 2 + 5 + nameText.width + pad * 2;
  const h = 26;
  const bg = new Graphics().roundRect(-w / 2, -h, w, h, h / 2).fill({ color: 0x2a170b, alpha: 0.55 });
  const avatar = new Graphics().circle(-w / 2 + pad + r, -h / 2, r).fill(hsl(avatarHue(id), 0.55, 0.45)).stroke({ width: 1.5, color: C.goldLight });
  const initial = new Text({
    text: Array.from(name.trim())[0]?.toUpperCase() ?? '?',
    style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700', fill: 0xffffff },
  });
  initial.anchor.set(0.5);
  initial.position.set(-w / 2 + pad + r, -h / 2);
  nameText.anchor.set(0, 0.5);
  nameText.position.set(-w / 2 + pad + r * 2 + 5, -h / 2);
  root.addChild(bg, avatar, initial, nameText);
  let total = h;
  if (title) {
    const t = new Text({ text: title, style: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '700', fill: C.ink } });
    const tw = t.width + 12;
    const pill = new Graphics().roundRect(-tw / 2, -h - 18, tw, 16, 8).fill(C.gold).stroke({ width: 1, color: C.goldLight });
    t.anchor.set(0.5);
    t.position.set(0, -h - 10);
    root.addChild(pill, t);
    total += 18;
  }
  return { root, w: Math.max(w, 0), h: total, key: `${name}|${title ?? ''}`, vis: 0 };
}

/** Tên người tặng trên xe trâu, voi, chuông: nền đỏ son, chữ vàng (khác nhãn nhân vật). Điểm neo = giữa đáy. */
export function giftTag(name: string): NameTag {
  const root = new Container();
  const t = new Text({ text: shortName(name, 14), style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700', fill: C.goldLight } });
  const w = t.width + 16;
  const h = 24;
  root.addChild(new Graphics().roundRect(-w / 2, -h, w, h, h / 2).fill({ color: C.red, alpha: 0.85 }).stroke({ width: 1.5, color: C.gold }));
  t.anchor.set(0.5);
  t.position.set(0, -h / 2);
  root.addChild(t);
  return { root, w, h, key: name, vis: 1 };
}

/** Bảng tên trên bệ tượng võ tướng đá. */
export function plaque(name: string): NameTag {
  const root = new Container();
  const t = new Text({ text: shortName(name, 16), style: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700', fill: C.goldLight } });
  const w = t.width + 14;
  const h = 22;
  root.addChild(new Graphics().roundRect(-w / 2, 0, w, h, 4).fill({ color: 0x3b3328, alpha: 0.82 }).stroke({ width: 1.5, color: 0xb59a5a }));
  t.anchor.set(0.5);
  t.position.set(0, h / 2);
  root.addChild(t);
  return { root, w, h, key: name, vis: 1 };
}

/** "+công" bay lên rồi mờ dần (theo nhân vật). */
export function plusText(text: string): Text {
  const t = new Text({ text, style: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700', fill: 0xffe082, stroke } });
  t.anchor.set(0.5, 1);
  return t;
}

/**
 * Người góp công cũ (mục 9B): khác biệt rõ với người xem đang tương tác: khung tên màu bạc mờ, avatar hơi trong suốt,
 * dòng phụ nhỏ "đã góp {item}" ngay dưới tên. Điểm neo = giữa đáy.
 */
export function returningTag(id: string, name: string, note: string | null): NameTag {
  const root = new Container();
  const nameText = new Text({ text: shortName(name, 14), style: { fontFamily: FONT_BODY, fontSize: 16, fontWeight: '600', fill: 0xe9ecf1, stroke: { color: 0x2d3138, width: 3, join: 'round' } } });
  const r = 10;
  const pad = 6;
  const w = r * 2 + 5 + nameText.width + pad * 2;
  const h = 24;
  const noteH = note ? 16 : 0;
  const top = -h - noteH;
  root.addChild(new Graphics().roundRect(-w / 2, top, w, h, h / 2).fill({ color: 0x59606b, alpha: 0.5 }).stroke({ width: 1.5, color: 0xd5dae2, alpha: 0.7 }));
  const avatar = new Graphics().circle(-w / 2 + pad + r, top + h / 2, r).fill(hsl(avatarHue(id), 0.25, 0.55)).stroke({ width: 1.5, color: 0xd5dae2 });
  avatar.alpha = 0.6;
  const initial = new Text({ text: Array.from(name.trim())[0]?.toUpperCase() ?? '?', style: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '700', fill: 0xffffff } });
  initial.anchor.set(0.5);
  initial.alpha = 0.75;
  initial.position.set(-w / 2 + pad + r, top + h / 2);
  nameText.anchor.set(0, 0.5);
  nameText.position.set(-w / 2 + pad + r * 2 + 5, top + h / 2);
  root.addChild(avatar, initial, nameText);
  let width = w;
  if (note) {
    const n = new Text({ text: note, style: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '600', fill: 0xdfe3e9, stroke: { color: 0x2d3138, width: 3, join: 'round' } } });
    n.anchor.set(0.5, 1);
    n.position.set(0, -1);
    root.addChild(n);
    width = Math.max(width, n.width);
  }
  return { root, w: width, h: h + noteH, key: `r|${name}|${note ?? ''}`, vis: 0 };
}

/** Dân phu NPC (mục 9B): chỉ nhãn nghề nhỏ, mờ ("Dân phu", "Thợ mộc", "Thợ nề"); không có tên, không avatar. Rỗng = không nhãn. */
export function npcTag(role: string): NameTag {
  const root = new Container();
  if (!role) return { root, w: 0, h: 0, key: 'npc|', vis: 0 };
  const t = new Text({ text: role, style: { fontFamily: FONT_BODY, fontSize: 13, fontWeight: '600', fill: 0xf3e4c4 } });
  const w = t.width + 12;
  const h = 18;
  root.addChild(new Graphics().roundRect(-w / 2, -h, w, h, h / 2).fill({ color: 0x2a170b, alpha: 0.35 }));
  t.anchor.set(0.5);
  t.position.set(0, -h / 2);
  t.alpha = 0.85;
  root.addChild(t);
  return { root, w, h, key: `npc|${role}`, vis: 0 };
}
