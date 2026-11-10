// Kết nối WebSocket tới server, tự kết nối lại (1s, 2s, 4s… tối đa 10s).
// Mỗi lần kết nối lại, server gửi lại toàn bộ trạng thái nên overlay không bị lệch.

import type { ServerMessage } from '../../shared/protocol.js';

export function connectServer(onMessage: (m: ServerMessage) => void, onConnection: (ok: boolean) => void): void {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let delay = 1000;

  const open = () => {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      delay = 1000;
      onConnection(true);
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // Bỏ qua tin nhắn hỏng.
      }
    };
    ws.onclose = () => {
      onConnection(false);
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 10_000);
    };
    ws.onerror = () => ws.close();
  };
  open();
}
