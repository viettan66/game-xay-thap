// Kiểu dữ liệu chung cho mọi phần của game (mục 3 SPEC).

export type LiveUser = {
  platformId: string;
  uniqueId: string;
  nickname: string;
  avatarUrl?: string;
};

type EventBase = {
  ts: number;
  /** Mã sự kiện của nền tảng (nếu có), dùng để chống tính trùng khi kết nối lại. */
  eventId?: string;
};

export type GiftEvent = EventBase & {
  type: 'gift';
  user: LiveUser;
  giftId: string;
  giftName: string;
  coinValueEach: number;
  count: number;
};
export type LikeEvent = EventBase & { type: 'like'; user: LiveUser; count: number };
export type CommentEvent = EventBase & { type: 'comment'; user: LiveUser; text: string };
export type JoinEvent = EventBase & { type: 'join'; user: LiveUser };
export type ViewersEvent = EventBase & { type: 'viewers'; count: number };

export type LiveEvent = GiftEvent | LikeEvent | CommentEvent | JoinEvent | ViewersEvent;
export type UserLiveEvent = Exclude<LiveEvent, ViewersEvent>;

export function hasUser(ev: LiveEvent): ev is UserLiveEvent {
  return ev.type !== 'viewers';
}
