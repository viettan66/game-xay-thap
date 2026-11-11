// Khởi động toàn bộ server: lõi game, nguồn live, web, WebSocket cho overlay, tác vụ định kỳ.
// main.ts gọi hàm này; test cũng gọi để chạy server thật trên cổng ngẫu nhiên.

import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { defaultMapTools, type MapTools } from './assets/mapTools.js';
import { GameCore } from './core.js';
import { LiveService } from './live/service.js';
import type { Logger } from './logger.js';
import { StateBroadcaster } from './overlay/broadcaster.js';
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
  const live: LiveService = new LiveService(core, {
    logger: o.logger,
    onProcessed: (r) => {
      broadcaster.markDirty();
      if (r.progress) broadcaster.progress(r.progress.transitions);
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

  let closed = false;
  return {
    core,
    live,
    broadcaster,
    port,
    url: `http://127.0.0.1:${port}`,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      live.stop();
      broadcaster.close();
      await socket?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await core.close();
    },
  };
}
