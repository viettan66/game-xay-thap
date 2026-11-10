// Hồ sơ dữ liệu (mục 14.2 SPEC): production (thật) và test (thử) tách biệt hoàn toàn.
// Mỗi hồ sơ có DB, avatar, backup, log riêng trong data/<hồ sơ>/. Config dùng chung.

import fs from 'node:fs';
import path from 'node:path';

export const PROFILES = ['production', 'test'] as const;
export type ProfileName = (typeof PROFILES)[number];

export interface ProfilePaths {
  profile: ProfileName;
  dataDir: string;
  dbFile: string;
  avatarsDir: string;
  backupsDir: string;
  logsDir: string;
}

/** Đọc hồ sơ từ tham số "--profile=test" hoặc biến môi trường GAME_PROFILE. Mặc định: test (an toàn). */
export function resolveProfile(argv: string[], env: NodeJS.ProcessEnv): ProfileName {
  const arg = argv.find((a) => a.startsWith('--profile='))?.slice('--profile='.length);
  const value = (arg ?? env.GAME_PROFILE ?? 'test').trim().toLowerCase();
  if (!(PROFILES as readonly string[]).includes(value)) {
    throw new Error(`Hồ sơ "${value}" không hợp lệ. Chỉ dùng: ${PROFILES.join(', ')}`);
  }
  return value as ProfileName;
}

export function profilePaths(rootDir: string, profile: ProfileName): ProfilePaths {
  const dataDir = path.join(rootDir, 'data', profile);
  return {
    profile,
    dataDir,
    dbFile: path.join(dataDir, 'game.db'),
    avatarsDir: path.join(dataDir, 'avatars'),
    backupsDir: path.join(dataDir, 'backups'),
    logsDir: path.join(dataDir, 'logs'),
  };
}

export function ensureProfileDirs(p: ProfilePaths): void {
  for (const dir of [p.dataDir, p.avatarsDir, p.backupsDir, p.logsDir]) fs.mkdirSync(dir, { recursive: true });
}
