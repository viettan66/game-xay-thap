// Các bước nâng cấp cấu trúc DB (migration). Chỉ THÊM bước mới ở cuối, không sửa bước cũ,
// vì DB của chủ dự án đã chạy các bước cũ rồi. Số phiên bản lưu trong PRAGMA user_version.
//
// Lịch sử: bản tháp 100 tầng (tag thap-100-tang) có cấu trúc khác (bảng floors…). Khi đổi sang quần thể chùa
// (giai đoạn R1, 2026-11-11) chưa có dữ liệu production thật nên cấu trúc được viết lại từ đầu; DB tháp cũ
// được đổi tên giữ lại, không nâng cấp (xem legacy.ts).

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'Khởi tạo bảng quần thể chùa (giai đoạn R1)',
    sql: `
      CREATE TABLE users (
        platform_id             TEXT PRIMARY KEY,
        unique_id               TEXT NOT NULL DEFAULT '',
        nickname                TEXT NOT NULL DEFAULT '',
        avatar_url              TEXT,
        avatar_file             TEXT,
        total_points            INTEGER NOT NULL DEFAULT 0,
        gift_points             INTEGER NOT NULL DEFAULT 0,
        like_points             INTEGER NOT NULL DEFAULT 0,
        comment_points          INTEGER NOT NULL DEFAULT 0,
        reached_seq             INTEGER NOT NULL DEFAULT 0,
        last_comment_counted_at INTEGER,
        first_seen              INTEGER NOT NULL,
        last_seen               INTEGER NOT NULL
      );
      CREATE INDEX users_rank ON users (total_points DESC, reached_seq ASC);

      CREATE TABLE sessions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at   INTEGER NOT NULL,
        ended_at     INTEGER,
        start_reason TEXT NOT NULL,
        end_reason   TEXT
      );

      -- Nhật ký đầy đủ để tra soát. item_id, stage_index: hạng mục và giai đoạn đang xây lúc sự kiện đến.
      CREATE TABLE events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ts              INTEGER NOT NULL,
        session_id      INTEGER REFERENCES sessions (id),
        platform_id     TEXT,
        type            TEXT NOT NULL,
        source_event_id TEXT UNIQUE,
        payload_json    TEXT NOT NULL,
        base_points     INTEGER NOT NULL DEFAULT 0,
        multiplier      REAL NOT NULL DEFAULT 1,
        points          INTEGER NOT NULL DEFAULT 0,
        item_id         TEXT,
        stage_index     INTEGER,
        note            TEXT
      );
      CREATE INDEX events_user ON events (platform_id, ts);
      CREATE INDEX events_ts ON events (ts);

      -- Hạng mục và giai đoạn đã bắt đầu (thứ tự dòng = thứ tự xây), kèm giá đã chốt của từng giai đoạn.
      CREATE TABLE items (
        item_id      TEXT PRIMARY KEY,
        stage_count  INTEGER NOT NULL,
        started_at   INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE stages (
        item_id      TEXT NOT NULL,
        stage_index  INTEGER NOT NULL,
        cost         INTEGER NOT NULL,
        started_at   INTEGER NOT NULL,
        completed_at INTEGER,
        PRIMARY KEY (item_id, stage_index)
      );

      CREATE TABLE item_contributions (
        item_id     TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        points      INTEGER NOT NULL DEFAULT 0,
        reached_seq INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, platform_id)
      );
      CREATE INDEX item_contributions_rank ON item_contributions (item_id, points DESC, reached_seq ASC);

      -- Dùng cho bia của các giai đoạn có lễ (mục 10).
      CREATE TABLE stage_contributions (
        item_id     TEXT NOT NULL,
        stage_index INTEGER NOT NULL,
        platform_id TEXT NOT NULL,
        points      INTEGER NOT NULL DEFAULT 0,
        reached_seq INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, stage_index, platform_id)
      );
      CREATE INDEX stage_contributions_rank ON stage_contributions (item_id, stage_index, points DESC, reached_seq ASC);

      CREATE TABLE session_contributions (
        session_id  INTEGER NOT NULL REFERENCES sessions (id),
        platform_id TEXT NOT NULL,
        points      INTEGER NOT NULL DEFAULT 0,
        reached_seq INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, platform_id)
      );
      CREATE INDEX session_contributions_rank ON session_contributions (session_id, points DESC, reached_seq ASC);

      CREATE TABLE daily_caps (
        day                 TEXT NOT NULL,
        platform_id         TEXT NOT NULL,
        like_comment_points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, platform_id)
      );

      -- Hạng mục đang xây lưu bằng id (không bằng số thứ tự) để đổi thứ tự hay chèn hạng mục không làm lệch.
      CREATE TABLE game_state (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        current_item_id     TEXT NOT NULL,
        current_stage_index INTEGER NOT NULL,
        stage_points        INTEGER NOT NULL,
        stage_cost          INTEGER NOT NULL,
        total_points        INTEGER NOT NULL,
        started_at          INTEGER NOT NULL,
        completed_at        INTEGER,
        golden_manual_until INTEGER
      );

      CREATE TABLE config_changes (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        ts       INTEGER NOT NULL,
        file     TEXT NOT NULL,
        path     TEXT NOT NULL,
        old_json TEXT,
        new_json TEXT,
        source   TEXT NOT NULL
      );

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'Kho thoại và trụ trì (giai đoạn 4a)',
    sql: `
      -- Vị trí đang dùng của nhóm thoại kiểu shuffle / sequential (mục 9C): khởi động lại vẫn nói tiếp.
      CREATE TABLE dialogue_state (
        group_key  TEXT PRIMARY KEY,
        order_json TEXT NOT NULL,
        position   INTEGER NOT NULL,
        lines_hash TEXT NOT NULL,
        last_index INTEGER
      );

      -- Người đã được trụ trì chào bằng tên trong phiên (mỗi người tối đa 1 lần/phiên, mục 9C).
      CREATE TABLE session_greeted (
        session_id  INTEGER NOT NULL,
        platform_id TEXT NOT NULL,
        PRIMARY KEY (session_id, platform_id)
      );
    `,
  },
  {
    version: 3,
    name: 'Tượng võ tướng đá ở ô ghi danh (giai đoạn 4d)',
    sql: `
      -- Mỗi lần tặng quà từ mức "tượng" (mặc định 5.000 xu) được một tượng mang tên người tặng, đặt vĩnh viễn (mục 9).
      -- Thứ tự tượng (id) quyết định ô ghi danh; hết ô thì overlay xoay vòng hiển thị.
      CREATE TABLE honor_statues (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        platform_id TEXT NOT NULL,
        event_id    INTEGER NOT NULL REFERENCES events (id),
        coins       INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
      );
    `,
  },
];
