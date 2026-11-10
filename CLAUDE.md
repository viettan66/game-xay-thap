# CLAUDE.md – Bảo Tháp Thiên Phúc

Overlay game livestream dọc 1080×1920: người xem góp "công" (quà, tim, comment) để xây tháp 100 tầng.
**`SPEC.md` là nguồn sự thật duy nhất.** Code và SPEC mâu thuẫn → hỏi chủ dự án, không tự quyết.

## Làm việc với chủ dự án
- Chủ dự án không phải lập trình viên: luôn trả lời **tiếng Việt**, ngắn gọn, dễ hiểu (xưng "em", gọi "mình").
- Máy chạy **Windows 11**. Hướng dẫn phải là từng bước bấm/gõ cụ thể.
- Làm **từng giai đoạn** theo mục 15 của SPEC. Xong một giai đoạn thì: chạy toàn bộ test, cập nhật README, tóm tắt đã làm gì và cần kiểm tra gì, commit, rồi **dừng lại**. Không tự chuyển giai đoạn.
- Có điểm mơ hồ thì liệt kê, đánh số câu hỏi, chờ trả lời.
- `assets/raw/` là ảnh gốc: KHÔNG sửa, KHÔNG xóa.

## Nguyên tắc nội dung (mục 0, bắt buộc)
- Đây là trò chơi mô phỏng. Luôn hiện dải: `Trò chơi mô phỏng xây tháp – không phải quyên góp tôn giáo`.
- Không câu chữ nào hứa phước báu, may mắn, công đức thật. Khi nhận quà chỉ cảm ơn và ghi danh.
- Từ ngữ nhà Phật KHÔNG gắn với việc tặng quà. Nhóm thoại `gift_*` không chứa từ tôn giáo. Bảng từ cấm và từ hạn chế ở mục 9C.
- Tượng Phật trong nền là tĩnh. Tên trụ trì không có chữ "Thích".
- KHÔNG có bot giả làm người xem: không tên, avatar, comment, quà giả hay tên giả trên bảng xếp hạng. Phòng vắng chỉ dùng dân phu NPC không tên và "người góp công cũ" có thật (9B).
- Simulator chỉ chạy ở hồ sơ `test` và overlay phải hiện nhãn "CHẾ ĐỘ THỬ". Chế độ diễn tập hiện nhãn "DIỄN TẬP".
- Mọi chữ người xem đọc được lấy từ `config/config.json` hoặc `config/dialogues.json`, không viết cứng trong code.

## Công nghệ
- Node.js LTS + TypeScript + npm. Test bằng **vitest**.
- Backend: Express + `ws`, `better-sqlite3` (WAL), `zod` kiểm tra config.
- Overlay: Vite + PixiJS v8, render 1080×1920. Âm thanh: Howler.js. Font đóng gói cục bộ (Be Vietnam Pro, Noto Serif).
- Kết nối live qua adapter (`tiktok-connector` dùng Euler Stream, `simulator`, …); logic game không biết nguồn sự kiện.
- Server chỉ bind `127.0.0.1`. Bí mật ở `.env` (không commit, không ghi log, không gửi xuống overlay/admin).
- Đường dẫn dùng `path.join`, không viết cứng `/`. Ưu tiên thư viện có bản dựng sẵn cho Windows.

## Cấu trúc thư mục
```
server/   adapter live, logic game, DB, WebSocket, admin API
overlay/  frontend PixiJS
admin/    trang quản trị (HTML đơn giản)
shared/   kiểu dữ liệu + hàm tính điểm thuần (mọi phép cộng điểm đi qua đây, có unit test)
assets/raw/   ảnh gốc (không sửa)    assets/game/  ảnh đã cắt    assets/manifest.json
assets/audio/ nhạc, sfx, ambient, credits.json
config/   config.json, dialogues.json, events.json, audio.json
data/     DB, avatar, backup, log theo hồ sơ (không commit)
scripts/  công cụ phụ (cắt sprite, backup, giả lập)
```

## Quy tắc kỹ thuật dễ quên
- Định danh người xem bằng `platformId`, không dùng nickname.
- Quà combo chỉ tính khi kết thúc combo (`repeatEnd`). Tim cộng theo số lượng thực. Chống trùng sự kiện khi kết nối lại.
- Mỗi sự kiện ghi trong MỘT transaction (user + contributions + state). Tắt máy bật lại phải đúng tầng, giai đoạn, phần trăm.
- Ngày tính theo `Asia/Ho_Chi_Minh`. Âm lịch dùng thuật toán Hồ Ngọc Đức theo UTC+7, không dùng lịch Trung Quốc (UTC+8).
- Hòa điểm: ai đạt mức điểm đó trước thì xếp trên.
- Thiếu ảnh hoặc âm thanh thì vẽ tạm hoặc im lặng, không được crash.

## Lệnh
- `npm install`: cài thư viện (`.npmrc` đặt `ignore-scripts=true`; better-sqlite3 v13 có sẵn bản dựng N-API, không cần build tools)
- `npm test`: chạy toàn bộ unit test (vitest, thư mục `tests/`)
- `npm run typecheck`: kiểm tra kiểu TypeScript (`tsc --noEmit`)
- `npm run dev`: server hồ sơ test, tự chạy lại khi sửa code
- `npm run demo -- --reset`: bắn sự kiện mẫu vào hồ sơ test
- `npm run build`: đóng gói overlay + trang /tools/assets (Vite) vào `dist/overlay`; `npm run dev:overlay`: Vite dev server cổng 5173
- `npm run assets:nobg` (cần `.venv` có rembg) rồi `npm run assets:build`: làm lại ảnh game từ `assets/raw`
- `start.bat` (production) / `start-test.bat` (test): người dùng nhấp đúp; gọi `scripts/windows/run.bat` → `scripts/prepare.mjs` (kiểm tra Node, tự `npm install` khi thiếu thư viện, tự `npm run build` khi code overlay/shared mới hơn bản đóng gói), rồi chạy server, tự khởi động lại khi crash
- Biến `GAME_NO_BROWSER=1`: không tự mở trình duyệt (dùng khi tự kiểm tra server)

## Ghi chú kỹ thuật
- Chạy TypeScript bằng `tsx` (`node --import tsx`). Cần Node ≥ 22.12 (vitest 5); khuyến nghị Node 24 LTS.
- Mã thoát của server: 0 = dừng bình thường, 3 = lỗi cần người sửa (run.bat dừng, không lặp), khác = tự khởi động lại.
- Config: `config/defaults/*.json` là bản mặc định (có trên git); `config/*.json` là bản đang dùng (không lên git), được trộn với bản mặc định khi đọc. Khóa config mới: thêm vào `server/config/schema.ts` VÀ `config/defaults/config.json`.
- DB: thêm bảng/cột bằng migration MỚI ở cuối `server/db/migrations.ts`, không sửa migration cũ.
- Quyết định đã chốt với chủ dự án: SPEC.md mục 16.
- Server: `server/server.ts` (`startServer`) ghép lõi game + nguồn live + Express + WebSocket `/ws`; `main.ts` chỉ là điểm khởi động. Test chạy server thật bằng `startServer({ port: 0 })`.
- Nguồn live: `server/live/` (giao diện `LiveAdapter`, `SimulatorAdapter`, `LiveService`). Hồ sơ test chọn giả lập/live thật (lưu trong bảng `settings`); production không bao giờ chạy giả lập.
- Overlay: `overlay/src/` (PixiJS v8). Tính toán bố cục thuần trong `overlay/src/layout.ts` (có test); dữ liệu server gửi xuống định nghĩa ở `shared/protocol.ts`. Không viết cứng chữ người xem đọc được trong overlay, mọi chữ lấy từ state (config).
- API POST chỉ nhận JSON và Origin của chính game (chống trang web lạ gửi lệnh tới 127.0.0.1); WebSocket cũng kiểm tra Origin.
- Ảnh game: `scripts/assets/remove_bg.py` (rembg birefnet-general-lite, cắt từng vật rồi mới tách nền, khử viền trắng) → `assets/work/nobg`; `scripts/assets/build.ts` (sharp, dùng `scripts/slice-sheet.ts` + `scripts/assets/measure.ts`) → `assets/game` + `assets/manifest.json`. Kiểu manifest: `shared/manifest.ts`; kiểm tra/lưu: `server/assets/`. Giá trị chỉnh tay (`tuned: true`, bản nền, towerAnchor, spireScale) được giữ khi chạy lại build.
- Xếp chồng tầng: `overlay/src/towerLayout.ts` (thuần, có test). Tầng 1: bottomY đặt lên towerAnchor; tầng n+1: eaveLineY đặt lên topY tầng n.
- Trang `/tools/assets` = `overlay/tools.html` + `overlay/src/tools/main.ts` (Vite đóng gói chung với overlay, dùng lại Backdrop/TowerView).
- Máy chủ dự án dùng bảng mã cp932 khi ghi log: script Python phải `reconfigure(encoding='utf-8')` cho stdout.
- Tự kiểm tra hình overlay: chạy server với `GAME_NO_BROWSER=1`, chụp bằng Edge headless (`--headless=new --user-data-dir=<thư mục nháp> --use-angle=swiftshader --window-size=1080,1920 --screenshot=...`).

## Tiến độ
- [x] Giai đoạn 1: khung dự án (2026-11-10)
- [x] Giai đoạn 2: simulator + WebSocket + overlay tối giản (2026-11-10)
- [x] Giai đoạn 3: đồ họa thật, manifest, script cắt sprite, xếp chồng theo eaveLineY, parallax, debug D, /tools/assets (2026-11-10)
- [ ] Giai đoạn 4: nhân vật, trụ trì, hiệu ứng quà, hàng đợi thông báo
