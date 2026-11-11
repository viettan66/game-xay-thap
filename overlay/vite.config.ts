import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

// Overlay được đóng gói vào dist/overlay và server phục vụ ở http://127.0.0.1:3000/overlay/.
// Khi lập trình: "npm run dev:overlay" mở Vite ở cổng 5173, WebSocket chuyển tiếp sang server cổng 3000.
export default defineConfig({
  root: here,
  base: '/overlay/',
  build: {
    outDir: fileURLToPath(new URL('../dist/overlay', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    // Các trang: overlay (index.html), kiểm tra ảnh /tools/assets (tools.html), chia vùng /tools/parts (parts.html).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        tools: fileURLToPath(new URL('./tools.html', import.meta.url)),
        parts: fileURLToPath(new URL('./parts.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:3000', ws: true } },
  },
});
