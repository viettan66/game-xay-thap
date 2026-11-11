// Điểm khởi động server. Chạy bằng start.bat / start-test.bat, hoặc "npm start".
// Mã thoát: 0 = dừng bình thường, 3 = lỗi cần người sửa (không tự khởi động lại), khác = lỗi bất ngờ (tự khởi động lại).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from './config/store.js';
import { LegacyDbError } from './db/legacy.js';
import { createLogger } from './logger.js';
import { profilePaths, resolveProfile, type ProfileName } from './profile.js';
import { PortInUseError, startServer, type RunningServer } from './server.js';

const EXIT_FATAL = 3;
const rootDir = path.resolve(import.meta.dirname, '..');

function fatal(msg: string): never {
  console.error(`\n[LỖI] ${msg}\n`);
  process.exit(EXIT_FATAL);
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  fatal(`Node.js ${process.versions.node} quá cũ. Hãy cài Node.js 24 LTS tại https://nodejs.org rồi chạy lại.`);
}

let profile: ProfileName;
try {
  profile = resolveProfile(process.argv.slice(2), process.env);
} catch (e) {
  fatal((e as Error).message);
}

const envFile = path.join(rootDir, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const log = createLogger(profilePaths(rootDir, profile).logsDir);
if (major < 24) log.warn(`Đang dùng Node.js ${process.versions.node}. Nên cài Node.js 24 LTS.`);

let running: RunningServer;
try {
  running = await startServer({ rootDir, profile, logger: log });
} catch (e) {
  if (e instanceof ConfigError) {
    fatal(`Config chưa đúng, game chưa chạy được.\n${e.message}\n\nSửa file trong thư mục config\\ rồi chạy lại.`);
  }
  if (e instanceof LegacyDbError) fatal(e.message);
  if (e instanceof PortInUseError) {
    fatal(`Cổng ${e.message} đang bị chiếm. Có thể game đang chạy ở một cửa sổ khác, hãy đóng cửa sổ đó trước.`);
  }
  throw e;
}

const { core, live } = running;
for (const f of core.createdConfigFiles) log.info(`Đã tạo config\\${f} từ bản mặc định`);
const s = core.engine.status();
log.info(`Hồ sơ: ${profile.toUpperCase()} | ${s.lines.item} | ${s.lines.stage} – ${s.percent}% | ${s.lines.project}`);
log.info(`Nguồn sự kiện: ${live.mode() === 'simulator' ? 'giả lập' : core.config.liveSource} (${live.status().text})`);
log.info(`Trang trạng thái: ${running.url}/admin`);
log.info(`Overlay (OBS Browser Source 1080×1920): ${running.url}/overlay/`);
if (process.argv.includes('--open') && process.platform === 'win32' && !process.env.GAME_NO_BROWSER) {
  spawn('cmd', ['/c', 'start', '', `${running.url}/admin`], { detached: true, stdio: 'ignore' }).unref();
}

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info(`Đang tắt server (${signal})...`);
  await running.close();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sig, () => void shutdown(sig));

process.on('uncaughtException', (e) => {
  log.error('Lỗi bất ngờ, server sẽ tự khởi động lại', e);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  log.error('Lỗi bất ngờ (promise), server sẽ tự khởi động lại', e);
  process.exit(1);
});
