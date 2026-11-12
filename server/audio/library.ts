// Thư viện âm thanh (mục 10A): quét assets/audio khi khởi động và khi admin bấm "Quét lại".
// - Cây thư mục: music/<playlist>, sfx/<nhóm>, ambient/<nhóm>; mỗi thư mục có README.txt mô tả loại âm cần đặt vào.
//   Thiếu thư mục thì tự tạo (cả README.txt), không ghi đè README.txt đã có.
// - Nhận file .ogg / .mp3 (tên tiếng Việt có dấu đọc được). Thư mục / nhóm trống: im lặng, chỉ cảnh báo trên admin.
// - credits.json: mỗi file một dòng (file, nguồn, giấy phép, link); file chưa có dòng credits thì admin cảnh báo.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AMBIENT_GROUPS, AUDIO_EXT, MUSIC_PLAYLISTS, SFX_GROUPS } from '../../shared/audio.js';

export type AudioSection = 'music' | 'sfx' | 'ambient';

/** Danh sách file theo nhóm, đường dẫn tương đối với assets/audio, dùng dấu "/". */
export interface AudioLibrary {
  music: Record<string, string[]>;
  sfx: Record<string, string[]>;
  ambient: Record<string, string[]>;
}

export interface CreditLine {
  file: string;
  source: string;
  license: string;
  link: string;
}

export interface AudioScan {
  library: AudioLibrary;
  /** Mã đổi khi danh sách file đổi (overlay tải lại âm thanh). */
  version: string;
  /** Nhóm đã biết mà chưa có file nào. */
  empty: { section: AudioSection; group: string }[];
  /** File chưa có dòng trong credits.json. */
  missingCredits: string[];
  /** Thư mục lạ (không thuộc nhóm nào game dùng): vẫn được quét, chỉ để chủ dự án biết. */
  unknown: { section: AudioSection; group: string }[];
  credits: CreditLine[];
  /** credits.json sai cú pháp. */
  creditsError: string | null;
}

export function audioDir(rootDir: string): string {
  return path.join(rootDir, 'assets', 'audio');
}

const KNOWN: Record<AudioSection, Record<string, string>> = {
  music: MUSIC_PLAYLISTS,
  sfx: Object.fromEntries(Object.entries(SFX_GROUPS).map(([k, v]) => [k, v.desc])),
  ambient: AMBIENT_GROUPS,
};

const SECTION_TITLE: Record<AudioSection, string> = {
  music: 'Nhạc nền – playlist',
  sfx: 'Hiệu ứng âm thanh – nhóm',
  ambient: 'Âm thanh môi trường – nhóm',
};

function readmeFor(section: AudioSection, group: string, desc: string): string {
  const lines = [
    `${SECTION_TITLE[section]} "${group}"`,
    '',
    desc,
    '',
    section === 'music'
      ? 'Đặt các bài nhạc (.ogg hoặc .mp3) vào thư mục này. Game phát lần lượt theo cách chọn bài đặt trên trang Âm thanh của admin.'
      : section === 'sfx'
        ? 'Đặt các file .ogg hoặc .mp3 vào thư mục này. Nhiều file = nhiều biến thể (ví dụ 5 tiếng đóng đinh khác nhau); mỗi lần phát game chọn một file.'
        : 'Đặt file .ogg hoặc .mp3 vào thư mục này. Game phát lặp liên tục (chim hót: phát thưa thớt).',
    'Thư mục trống thì game im lặng, không lỗi. Thêm file xong bấm "Quét lại" trên trang Âm thanh (không cần tắt game).',
    '',
    'Bản quyền: chỉ dùng âm thanh tự làm, đã mua bản quyền, hoặc miễn phí có giấy phép cho phép livestream thương mại (CC0…).',
    'Mỗi file phải có một dòng trong assets/audio/credits.json: tên file, nguồn, loại giấy phép, link.',
    'KHÔNG dùng tiếng tụng kinh, niệm Phật, mõ, nhạc lễ Phật giáo. Nhạc nền: nhạc cụ dân tộc không lời.',
    '',
  ];
  return lines.join('\r\n');
}

const README_ROOT = [
  'Âm thanh của game (SPEC mục 10A)',
  '',
  'music\\<playlist>\\  nhạc nền theo tình huống (phòng vắng, vừa, đông, giờ hoàng đạo, lễ, lễ hội, khánh thành).',
  'sfx\\<nhóm>\\        hiệu ứng (thi công, quà, giao diện, lễ). Nhiều file trong một nhóm = nhiều biến thể.',
  'ambient\\<nhóm>\\    âm thanh môi trường chạy lặp (gió, chim, chuông gió, công trường xa, côn trùng ban đêm).',
  '',
  'Định dạng: .ogg hoặc .mp3. Mỗi thư mục có README.txt mô tả loại âm cần đặt vào.',
  'Thêm file xong: trang Âm thanh của admin → "Quét lại". Thư mục trống thì game im lặng, không lỗi.',
  '',
  'credits.json: mỗi file một dòng, ví dụ',
  '  { "file": "sfx/brick_lay/dat-gach-1.ogg", "source": "Tự thu âm", "license": "CC0", "link": "" }',
  'File chưa có dòng credits thì trang Âm thanh cảnh báo. Nhạc vi phạm bản quyền có thể khiến nền tảng tắt tiếng hoặc chặn live.',
  '',
  'File âm thanh KHÔNG được đưa lên git (repo công khai, bản quyền riêng): chép tay khi chuyển máy.',
  '',
].join('\r\n');

/** Tạo các thư mục còn thiếu (kèm README.txt) và credits.json mẫu. Trả về số thư mục vừa tạo. */
export function ensureAudioTree(rootDir: string): number {
  const base = audioDir(rootDir);
  let made = 0;
  fs.mkdirSync(base, { recursive: true });
  const rootReadme = path.join(base, 'README.txt');
  if (!fs.existsSync(rootReadme)) fs.writeFileSync(rootReadme, README_ROOT, 'utf8');
  const credits = path.join(base, 'credits.json');
  if (!fs.existsSync(credits)) fs.writeFileSync(credits, JSON.stringify({ files: [] }, null, 2) + '\n', 'utf8');
  for (const section of Object.keys(KNOWN) as AudioSection[]) {
    for (const [group, desc] of Object.entries(KNOWN[section])) {
      const dir = path.join(base, section, group);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        made++;
      }
      const readme = path.join(dir, 'README.txt');
      if (!fs.existsSync(readme)) fs.writeFileSync(readme, readmeFor(section, group, desc), 'utf8');
    }
  }
  return made;
}

const isAudio = (f: string) => AUDIO_EXT.includes(path.extname(f).toLowerCase());

function readCredits(base: string): { credits: CreditLine[]; error: string | null } {
  const file = path.join(base, 'credits.json');
  if (!fs.existsSync(file)) return { credits: [], error: null };
  try {
    // Notepad có thể lưu kèm BOM ở đầu file.
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown;
    const list = Array.isArray(raw) ? raw : (raw as { files?: unknown }).files;
    if (!Array.isArray(list)) return { credits: [], error: 'credits.json phải có dạng { "files": [ … ] }' };
    const credits = list
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({ file: String(x.file ?? '').replace(/\\/g, '/'), source: String(x.source ?? ''), license: String(x.license ?? ''), link: String(x.link ?? '') }))
      .filter((x) => x.file);
    return { credits, error: null };
  } catch (e) {
    return { credits: [], error: `credits.json sai cú pháp: ${(e as Error).message}` };
  }
}

/** Quét thư viện âm thanh. Không có thư mục thì trả về thư viện rỗng (game im lặng). */
export function scanAudio(rootDir: string): AudioScan {
  const base = audioDir(rootDir);
  const library: AudioLibrary = { music: {}, sfx: {}, ambient: {} };
  const empty: AudioScan['empty'] = [];
  const unknown: AudioScan['unknown'] = [];
  for (const section of Object.keys(KNOWN) as AudioSection[]) {
    const dir = path.join(base, section);
    const groups = new Set(Object.keys(KNOWN[section]));
    if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) groups.add(d.name);
    for (const g of [...groups].sort()) {
      const gdir = path.join(dir, g);
      const files = fs.existsSync(gdir)
        ? fs
            .readdirSync(gdir, { withFileTypes: true })
            .filter((f) => f.isFile() && isAudio(f.name))
            .map((f) => `${section}/${g}/${f.name.normalize('NFC')}`)
            .sort((a, b) => a.localeCompare(b, 'vi'))
        : [];
      library[section][g] = files;
      if (!(g in KNOWN[section])) unknown.push({ section, group: g });
      else if (!files.length) empty.push({ section, group: g });
    }
  }
  const { credits, error } = readCredits(base);
  const credited = new Set(credits.map((c) => c.file.normalize('NFC').toLowerCase()));
  const all = (Object.keys(library) as AudioSection[]).flatMap((s) => Object.values(library[s]).flat());
  const missingCredits = all.filter((f) => !credited.has(f.toLowerCase()));
  const sig = all.map((f) => {
    try {
      const st = fs.statSync(path.join(base, ...f.split('/')));
      return `${f}:${st.size}:${Math.round(st.mtimeMs)}`;
    } catch {
      return f;
    }
  });
  const version = crypto.createHash('sha1').update(sig.join('|')).digest('hex').slice(0, 12);
  return { library, version, empty, missingCredits, unknown, credits, creditsError: error };
}
