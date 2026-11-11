# CLAUDE.md – Đại Danh Lam Thiên Phúc

Overlay game livestream dọc 1080×1920: người xem góp "công" (quà, tim, comment) để xây dần một **quần thể chùa** trên khu đồi, lần lượt từng hạng mục, mỗi hạng mục qua nhiều giai đoạn thi công.
**`SPEC.md` là nguồn sự thật duy nhất.** Code và SPEC mâu thuẫn → hỏi chủ dự án, không tự quyết.

> **Đổi hướng (2026-11-11):** dự án cũ "tháp 100 tầng" (xong giai đoạn 1–3) được gắn tag `thap-100-tang` (commit 8b88ad9). Mọi việc mới làm trên nhánh `quan-the-chua`. SPEC cũ lưu ở `SPEC_old.md`.

## Thuật ngữ (SPEC mục 0, 5)
- **Công trình:** toàn bộ quần thể chùa. **Hạng mục:** công trình con (Gác chuông, Bảo tháp – Tầng 3…). **Giai đoạn:** một bước thi công của hạng mục (Dựng cột…). **Tiến độ:** phần trăm của giai đoạn đang làm.
- Danh sách hạng mục, mẫu giai đoạn, giá: `config/project.json`. Hạng mục nhận diện bằng `id`, KHÔNG bằng số thứ tự.

## Làm việc với chủ dự án
- Chủ dự án không phải lập trình viên: luôn trả lời **tiếng Việt**, ngắn gọn, dễ hiểu (xưng "em", gọi "mình").
- Máy chạy **Windows 11**. Hướng dẫn phải là từng bước bấm/gõ cụ thể.
- Làm **từng giai đoạn** theo mục 15 của SPEC (trước hết R1 → R4, sau đó 4 → 8). Xong một giai đoạn thì: chạy toàn bộ test, cập nhật README, tóm tắt đã làm gì và cần kiểm tra gì, commit, rồi **dừng lại**. Không tự chuyển giai đoạn.
- Có điểm mơ hồ thì liệt kê, đánh số câu hỏi, chờ trả lời.
- `assets/raw/` là ảnh gốc: KHÔNG sửa, KHÔNG xóa, KHÔNG đổi tên (ảnh tháp cũ nằm trong `assets/raw/_old/`).
- Code hiển thị tháp cũ (`overlay/src/scene/tower.ts`, `scene/background.ts`, `towerLayout.ts`, phần tầng tháp trong `/tools/assets` và manifest): KHÔNG xóa cho tới khi xong R4 VÀ chủ dự án đồng ý.
- Không push lên GitHub khi chưa được đồng ý rõ ràng (repo đang công khai).

## Nguyên tắc nội dung (mục 0, bắt buộc)
- Đây là trò chơi mô phỏng. Luôn hiện dải: `Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo`.
- Không câu chữ nào hứa phước báu, may mắn, công đức thật. Khi nhận quà chỉ cảm ơn và ghi danh.
- Từ ngữ nhà Phật KHÔNG gắn với việc tặng quà. Nhóm thoại `gift_*` không chứa từ tôn giáo. Bảng từ cấm và từ hạn chế ở mục 9C.
- Tượng Phật trong nền là tĩnh. Tên trụ trì không có chữ "Thích".
- KHÔNG có bot giả làm người xem: không tên, avatar, comment, quà giả hay tên giả trên bảng xếp hạng. Phòng vắng chỉ dùng dân phu NPC không tên và "người góp công cũ" có thật (9B).
- Simulator chỉ chạy ở hồ sơ `test` và overlay phải hiện nhãn "CHẾ ĐỘ THỬ". Chế độ diễn tập hiện nhãn "DIỄN TẬP".
- Mọi chữ người xem đọc được lấy từ `config/config.json`, `config/project.json` hoặc `config/dialogues.json`, không viết cứng trong code.

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
shared/   kiểu dữ liệu + hàm tính điểm/tiến độ thuần (mọi phép cộng điểm đi qua đây, có unit test)
assets/raw/   ảnh gốc (không sửa; _old/ = ảnh tháp cũ)    assets/game/  ảnh đã cắt    assets/manifest.json
assets/audio/ nhạc, sfx, ambient, credits.json
config/   config.json, project.json, dialogues.json, events.json, audio.json
data/     DB, avatar, backup, log theo hồ sơ (không commit)
scripts/  công cụ phụ (cắt sprite, backup, giả lập)
```

## Quy tắc kỹ thuật dễ quên
- Định danh người xem bằng `platformId`, không dùng nickname.
- Quà combo chỉ tính khi kết thúc combo (`repeatEnd`). Tim cộng theo số lượng thực. Chống trùng sự kiện khi kết nối lại.
- Mỗi sự kiện ghi trong MỘT transaction (user + item_contributions + stage_contributions + state). Tắt máy bật lại phải đúng hạng mục, giai đoạn, phần trăm.
- Điểm dư khi xong giai đoạn/hạng mục chuyển sang cái kế tiếp. Quà lớn vượt nhiều giai đoạn/hạng mục: ghi công cho TỪNG giai đoạn và hạng mục theo phần điểm rơi vào đó (14.4).
- Không đổi thứ tự hay xóa hạng mục đã bắt đầu. Đổi giá chỉ áp dụng cho giai đoạn chưa bắt đầu; giai đoạn đang xây phải hỏi xác nhận (14.10). Danh sách hạng mục được nối thêm sau khánh thành.
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
- Chạy TypeScript bằng `tsx` (`node --import tsx`). Cần Node ≥ 22.12 (vitest 5); khuyến nghị Node 24 LTS (SPEC mới ghi "Node 20+", nhưng code cần ≥ 22.12).
- Mã thoát của server: 0 = dừng bình thường, 3 = lỗi cần người sửa (run.bat dừng, không lặp), khác = tự khởi động lại.
- Config: `config/defaults/*.json` là bản mặc định (có trên git); `config/*.json` là bản đang dùng (không lên git), được trộn với bản mặc định khi đọc. Khóa config mới: thêm vào `server/config/schema.ts` VÀ `config/defaults/config.json`.
- DB: thêm bảng/cột bằng migration MỚI ở cuối `server/db/migrations.ts`, không sửa migration cũ. (R1 đã viết lại cấu trúc từ version 1 cho quần thể chùa, được chủ dự án cho phép vì chưa có dữ liệu production thật; từ nay chỉ thêm version mới.)
- Quyết định đã chốt với chủ dự án: SPEC.md mục 16 (ưu tiên hơn chữ ở các mục trên: danh hiệu công trường, "Bia ghi danh", "tượng võ tướng đá", Node 24, Tết từ ngày cuối tháng Chạp…).
- Tiến độ công trình (thuần, có test): `shared/project.ts` (ghép mẫu giai đoạn, chia giá, cộng điểm tràn giai đoạn/hạng mục, đổi giá, nối thêm hạng mục, kiểm tra sửa danh sách). Lõi có DB: `server/game/engine.ts`; bia: `topItem`, `topStage` trong `server/game/queries.ts`. Lưu `project.json` qua `GameCore.saveProject` (kiểm tra hạng mục đã xây, xác nhận đổi giá).
- DB tháp cũ (có bảng `floors`) được `server/db/legacy.ts` đổi tên thành `game.thap-cu.db` khi mở; `config.json` cũ được `upgradeLegacyConfig` dọn khóa tháp.
- Server: `server/server.ts` (`startServer`) ghép lõi game + nguồn live + Express + WebSocket `/ws`; `main.ts` chỉ là điểm khởi động. Test chạy server thật bằng `startServer({ port: 0 })`.
- Nguồn live: `server/live/` (giao diện `LiveAdapter`, `SimulatorAdapter`, `LiveService`). Hồ sơ test chọn giả lập/live thật (lưu trong bảng `settings`); production không bao giờ chạy giả lập.
- Overlay: `overlay/src/` (PixiJS v8). Tính toán bố cục thuần trong `overlay/src/layout.ts` (có test); dữ liệu server gửi xuống định nghĩa ở `shared/protocol.ts`. Không viết cứng chữ người xem đọc được trong overlay, mọi chữ lấy từ state (config).
- API POST chỉ nhận JSON và Origin của chính game (chống trang web lạ gửi lệnh tới 127.0.0.1); WebSocket cũng kiểm tra Origin.
- Ảnh gốc mới có tên tiếng Việt mô tả (không trùng tên trong SPEC mục 7, ví dụ `map_built` = `Chín tầng tháp giữa quần thể chùa.png`). Script dựng ảnh dùng bảng ánh xạ tên SPEC → file thật, không đổi tên file gốc.
- Ảnh game: `scripts/assets/remove_bg.py` (rembg birefnet-general-lite, cắt từng vật rồi mới tách nền, khử viền trắng) → `assets/work/nobg`; `scripts/assets/build.ts` (sharp, dùng `scripts/slice-sheet.ts` + `scripts/assets/measure.ts`) → `assets/game` + `assets/manifest.json`. Kiểu manifest: `shared/manifest.ts`; kiểm tra/lưu: `server/assets/`. Giá trị chỉnh tay (`tuned: true`, …) được giữ khi chạy lại build.
- Overlay R1 vẽ tạm bằng hình khối: `overlay/src/scene/site.ts` + `overlay/src/siteLayout.ts` (thuần, có test), thay ở R2–R4.
- (Tháp cũ, chờ dọn sau R4) Xếp chồng tầng: `overlay/src/towerLayout.ts`, `scene/tower.ts` (nhận `TowerSceneInput`), `scene/background.ts`; chỉ trang `/tools/assets` (`overlay/tools.html` + `overlay/src/tools/main.ts`) còn dùng.
- Máy chủ dự án dùng bảng mã cp932 khi ghi log: script Python phải `reconfigure(encoding='utf-8')` cho stdout.
- Tự kiểm tra hình overlay: chạy server với `GAME_NO_BROWSER=1`, chụp bằng Edge headless (`--headless=new --user-data-dir=<thư mục nháp> --use-angle=swiftshader --window-size=1080,1920`); nếu ảnh ra đen thì chụp qua CDP.

## Tiến độ
Bản tháp cũ (tag `thap-100-tang`):
- [x] Giai đoạn 1: khung dự án (2026-11-10)
- [x] Giai đoạn 2: simulator + WebSocket + overlay tối giản (2026-11-10)
- [x] Giai đoạn 3: đồ họa tháp, manifest, script cắt sprite, parallax, debug D, /tools/assets (2026-11-10)

Quần thể chùa (nhánh `quan-the-chua`):
- [x] R1: mô hình dữ liệu hạng mục + giai đoạn, `project.json`, DB mới, simulator + overlay hình khối tạm (2026-11-11)
- [ ] R2: ghép bản đồ, phóng to, cắt công trình, lớp tiền cảnh, manifest, `/tools/assets` mở rộng
- [ ] R3: hiển thị giai đoạn (`visual.kind`), giàn giáo, đống vật liệu, ảnh mốc
- [ ] R4: camera và bố cục giao diện mới
- [ ] Giai đoạn 4 → 8 (mục 15)
