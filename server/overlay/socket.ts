// WebSocket cho overlay (đường /ws). Kết nối (lại) là nhận ngay toàn bộ trạng thái hiện tại.
// Chỉ nhận kết nối từ trang của chính game (kiểm tra Origin), để trang web lạ không đọc trộm được.

import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/protocol.js';
import type { Logger } from '../logger.js';

export interface OverlaySocket {
  broadcast(msg: ServerMessage): void;
  clientCount(): number;
  close(): Promise<void>;
}

export function attachOverlaySocket(
  server: Server,
  opts: {
    isAllowedOrigin: (origin: string | undefined) => boolean;
    snapshot: () => ServerMessage;
    logger: Logger;
    heartbeatMs?: number;
  },
): OverlaySocket {
  const wss = new WebSocketServer({ noServer: true });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (!opts.isAllowedOrigin(req.headers.origin)) {
      opts.logger.warn(`Từ chối kết nối WebSocket từ ${req.headers.origin}`);
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('error', () => ws.terminate());
    ws.send(JSON.stringify(opts.snapshot()));
  });

  // Ngắt các kết nối "chết" (ví dụ OBS tắt đột ngột) để không rò rỉ bộ nhớ khi chạy nhiều giờ.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, opts.heartbeatMs ?? 30_000);

  return {
    broadcast(msg) {
      const data = JSON.stringify(msg);
      for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(data);
    },
    clientCount: () => wss.clients.size,
    close: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}
