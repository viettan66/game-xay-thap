// Các bước nâng cấp cấu trúc DB (migration). Chỉ THÊM bước mới ở cuối, không sửa bước cũ,
// vì DB của chủ dự án đã chạy các bước cũ rồi. Số phiên bản lưu trong PRAGMA user_version.

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'Khởi tạo bảng (giai đoạn 1)',
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
        floor           INTEGER,
        stage           INTEGER,
        note            TEXT
      );
      CREATE INDEX events_user ON events (platform_id, ts);
      CREATE INDEX events_ts ON events (ts);

      CREATE TABLE floors (
        floor        INTEGER PRIMARY KEY,
        cost         INTEGER NOT NULL,
        started_at   INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE floor_contributions (
        floor       INTEGER NOT NULL,
        platform_id TEXT NOT NULL,
        points      INTEGER NOT NULL DEFAULT 0,
        reached_seq INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (floor, platform_id)
      );
      CREATE INDEX floor_contributions_rank ON floor_contributions (floor, points DESC, reached_seq ASC);

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

      CREATE TABLE game_state (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),
        current_floor       INTEGER NOT NULL,
        current_stage       INTEGER NOT NULL,
        floor_points        INTEGER NOT NULL,
        floor_cost          INTEGER NOT NULL,
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
    `,
  },
  {
    version: 2,
    name: 'Thiết lập riêng của từng hồ sơ (giai đoạn 2)',
    sql: `
      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `,
  },
];
