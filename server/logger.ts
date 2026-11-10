// Ghi log ra màn hình và file data/<hồ sơ>/logs/YYYY-MM-DD.log (mục 12 SPEC).
// Tự che các giá trị bí mật (API key) nếu lỡ xuất hiện trong log.

import fs from 'node:fs';
import path from 'node:path';
import { vnDayKey, vnParts } from '../shared/time.js';

export interface Logger {
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

function secretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([k, v]) => /KEY|SECRET|TOKEN|PASSWORD/i.test(k) && typeof v === 'string' && v.length >= 6)
    .map(([, v]) => v as string);
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('***');
  return out;
}

export function createLogger(logsDir: string, opts: { now?: () => number; console?: boolean } = {}): Logger {
  const now = opts.now ?? Date.now;
  const toConsole = opts.console ?? true;
  fs.mkdirSync(logsDir, { recursive: true });

  const write = (level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown) => {
    const ts = now();
    const p = vnParts(ts);
    const time = [p.hour, p.minute, p.second].map((n) => String(n).padStart(2, '0')).join(':');
    let detail = '';
    if (extra instanceof Error) detail = ` ${extra.stack ?? extra.message}`;
    else if (extra !== undefined) detail = ` ${JSON.stringify(extra)}`;
    const line = redact(`[${time}] [${level}] ${msg}${detail}`, secretValues(process.env));
    if (toConsole) (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(line);
    try {
      fs.appendFileSync(path.join(logsDir, `${vnDayKey(ts)}.log`), line + '\n', 'utf8');
    } catch {
      // Không ghi được log thì thôi, không để game dừng vì việc này.
    }
  };

  return {
    info: (m, e) => write('INFO', m, e),
    warn: (m, e) => write('WARN', m, e),
    error: (m, e) => write('ERROR', m, e),
  };
}
