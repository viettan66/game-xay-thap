// Khởi động toàn bộ server: lõi game, nguồn live, web, WebSocket cho overlay, tác vụ định kỳ.
// main.ts gọi hàm này; test cũng gọi để chạy server thật trên cổng ngẫu nhiên.

import type { AddressInfo } from 'node:net';
import { giftEffect } from '../shared/characters.js';
import { AbbotDirector } from './abbot/director.js';
import { dbGreetStore } from './abbot/greeted.js';
import { createApp } from './app.js';
import { defaultMapTools, type MapTools } from './assets/mapTools.js';
import { GameCore } from './core.js';
import { DialogueSelector } from './dialogue/selector.js';
import { itemContributorCount } from './game/queries.js';
import { LiveService } from './live/service.js';
import type { Logger } from './logger.js';
import { StateBroadcaster } from './overlay/broadcaster.js';
import { GiftToasts } from './overlay/toasts.js';
import { ceremonyDeps, overlayName } from './overlay/state.js';
import { ceremoniesFor, totalContributorCount } from './game/ceremony.js';
import { attachOverlaySocket } from './overlay/socket.js';
import { buildOverlayState } from './overlay/state.js';
import type { ProfileName } from './profile.js';

export interface ServerOptions {
  rootDir: string;
  profile: ProfileName;
  logger: Logger;
  /** Ghi đè cổng trong config (test dùng 0 = cổng ngẫu nhiên). */
  port?: number;
  configDir?: string;
  now?: () => number;
  simulatorTimer?: boolean;
  seed?: number;
  /** Cắt lại bản đồ trên /tools/assets; mặc định gọi Python + bộ cắt thật. */
  mapTools?: MapTools;
}

export interface RunningServer {
  core: GameCore;
  live: LiveService;
  abbot: AbbotDirector;
  broadcaster: StateBroadcaster;
  port: number;
  url: string;
  close(): Promise<void>;
}

export class PortInUseError extends Error {}

/** Origin được phép: trang của chính game, và Vite dev server khi lập trình. */
export function makeOriginCheck(getPort: () => number): (origin: string | undefined) => boolean {
  return (origin) => {
    if (!origin) return true; // không phải trình duyệt (OBS cũ, công cụ dòng lệnh)
    const port = getPort();
    return [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ].includes(origin);
  };
}

export async function startServer(o: ServerOptions): Promise<RunningServer> {
  const core = GameCore.open({
    rootDir: o.rootDir,
    profile: o.profile,
    logger: o.logger,
    ...(o.configDir ? { configDir: o.configDir } : {}),
    ...(o.now ? { now: o.now } : {}),
  });

  let port = o.port ?? core.config.server.port;
  const isAllowedOrigin = makeOriginCheck(() => port);

  let socket: ReturnType<typeof attachOverlaySocket> | undefined;
  // Trụ trì (mục 9, 9C): chọn câu trong kho thoại, gửi tin "say" xuống overlay.
  const selector = new DialogueSelector(core.db, () => core.configStore.getDialogues().groups, o.logger);
  const abbot = new AbbotDirector({
    selector,
    config: () => core.config,
    tier: () => core.crowd.tier,
    // Live thật (kể cả diễn tập ở hồ sơ thử) chỉ nói câu đã duyệt; giả lập dùng tất cả.
    verifiedOnly: () => live.mode() !== 'simulator',
    progress: () => core.engine.status(),
    name: (raw) => overlayName(core, raw),
    sessionId: () => core.sessions.currentId(),
    greeted: dbGreetStore(core.db),
    itemContributors: (itemId) => itemContributorCount(core.db, itemId),
    totalContributors: () => totalContributorCount(core.db),
    projectName: () => core.project.name,
    send: (msg) => socket?.broadcast(msg),
    now: core.now,
  });
  // Thông báo quà (mục 8, bảng 9A).
  const toasts = new GiftToasts({
    config: () => core.config,
    tier: () => core.crowd.tier,
    selector,
    verifiedOnly: () => live.mode() !== 'simulator',
    send: (msg) => socket?.broadcast(msg),
    now: core.now,
  });
  // Đủ mục tiêu tim: múa lân trên overlay, trụ trì mời xem.
  core.bus.on('goal', (target: number) => {
    socket?.broadcast({ type: 'festival', target, durationMs: core.config.heartGoal.festivalSec * 1000 });
    abbot.onGoalReached(target);
    broadcaster.markDirty();
  });
  core.bus.on('sessionStart', () => abbot.onSessionStart());
  core.bus.on('sessionEnd', () => abbot.onSessionEnd());
  // Người góp công cũ quay lại tương tác: trụ trì chào riêng (mục 9B, nhóm returning).
  core.bus.on('returning', (m: { id: string; name: string }) => abbot.onReturning(m.id, m.name));
  core.bus.on('crowd', () => broadcaster.markDirty());
  const live: LiveService = new LiveService(core, {
    logger: o.logger,
    onProcessed: (r, ev) => {
      abbot.onEvent(ev, r);
      if (ev.type === 'gift' && r.status === 'counted' && r.score) {
        toasts.onGift(ev.user.platformId, overlayName(core, ev.user.nickname), Math.max(0, ev.coinValueEach) * Math.max(0, ev.count), r.score.points, ev.giftId);
      }
      broadcaster.markDirty();
      if (r.status === 'counted' && r.score && ev.type !== 'viewers' && r.score.source !== 'none') {
        broadcaster.contribution({
          type: 'contribution',
          name: overlayName(core, ev.user.nickname),
          source: r.score.source,
          points: r.score.points,
          coins: ev.type === 'gift' ? Math.max(0, ev.coinValueEach) * Math.max(0, ev.count) : 0,
          allocations: r.progress?.allocations ?? [],
          platformId: ev.user.platformId,
          effect: ev.type === 'gift' ? giftEffect(core.config.gifts.tiers, Math.max(0, ev.coinValueEach) * Math.max(0, ev.count)) : null,
        });
      }
      if (r.progress) {
        broadcaster.progress(r.progress.transitions);
        // Lễ (mục 10): bia tính ngay lúc xong; overlay xếp hàng, diễn khi mảnh cuối đã đặt xong.
        for (const c of ceremoniesFor(r.progress.transitions, ceremonyDeps(core, live.mode() !== 'simulator'))) socket?.broadcast({ type: 'ceremony', ceremony: c });
      }
    },
    onStatus: () => broadcaster.markDirty(),
    ...(o.simulatorTimer !== undefined ? { simulatorTimer: o.simulatorTimer } : {}),
    ...(o.seed !== undefined ? { seed: o.seed } : {}),
  });
  const broadcaster = new StateBroadcaster(
    () => buildOverlayState(core, live.badge()),
    (msg) => socket?.broadcast(msg),
  );
  core.configStore.onChange(() => broadcaster.markDirty());

  const app = createApp({
    core,
    live,
    broadcaster,
    abbot,
    sendOverlay: (msg) => socket?.broadcast(msg),
    rootDir: o.rootDir,
    isAllowedOrigin,
    mapTools: o.mapTools ?? defaultMapTools(o.rootDir),
  });
  const server = await new Promise<import('node:http').Server>((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1');
    s.once('listening', () => resolve(s));
    s.once('error', (e: NodeJS.ErrnoException) => {
      void core.close();
      reject(e.code === 'EADDRINUSE' ? new PortInUseError(String(port)) : e);
    });
  });
  port = (server.address() as AddressInfo).port;
  socket = attachOverlaySocket(server, { isAllowedOrigin, snapshot: () => broadcaster.snapshot(), logger: o.logger });

  live.start();

  // Tác vụ định kỳ: tự kết thúc phiên, backup hằng ngày, cập nhật hệ số theo giờ (giờ vàng).
  const timer = setInterval(() => {
    try {
      core.tick();
      broadcaster.markDirty();
    } catch (e) {
      o.logger.error('Lỗi khi chạy tác vụ định kỳ', e);
    }
  }, 30_000);
  // Nhịp nhanh: độ đông (độ trễ 120 giây cần đếm giây) và hàng đợi thoại trụ trì.
  const fast = setInterval(() => {
    try {
      core.updateCrowd();
      abbot.tick();
      // Nhân vật hết giờ đi ra dần (mục 9, 9A).
      if (core.roster.tick(core.now())) broadcaster.markDirty();
    } catch (e) {
      o.logger.error('Lỗi khi chạy nhịp trụ trì', e);
    }
  }, 500);

  let closed = false;
  return {
    core,
    live,
    abbot,
    broadcaster,
    port,
    url: `http://127.0.0.1:${port}`,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(fast);
      live.stop();
      broadcaster.close();
      await socket?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await core.close();
    },
  };
}
