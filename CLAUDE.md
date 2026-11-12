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
- Code hiển thị tháp cũ đã dọn sau R4 (chủ dự án đồng ý 2026-11-11). Bản cũ vẫn xem được ở tag `thap-100-tang`.
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
- Ảnh gốc mới có tên tiếng Việt mô tả (không trùng tên trong SPEC mục 7). Bảng ánh xạ tên SPEC → file thật: `assets/raw-files.json` (đọc qua `server/assets/rawFiles.ts`; Python đọc trực tiếp). Không đổi tên file gốc.
- Bản đồ (R2): `npm run assets:upscale` (Real-ESRGAN ×4 → `assets/work/esrgan`) → `assets:segment` (`scripts/assets/map_segment.py`, rembg từng khung object → `assets/work/map/rembg`) → `assets:map` (`server/assets/mapCut.ts`: nền ghép + dải .jpg, công trình `buildings/<id>/final.png`, tiền cảnh `fg/<id>.png`, `manifest.map`). Khung cắt (tọa độ ảnh gốc 941×1672) ở `assets/map-cuts.json`; tọa độ manifest theo hệ bản đồ rộng 1728. Mặt nạ thuần + test: `server/assets/mask.ts`. Kiểu + hàm thuần: `shared/map.ts`. Trang công cụ: `overlay/src/tools/map.ts` + API `/api/tools/map*` (`server/assets/mapTools.ts`, cắt lại tuần tự, lỗi thì trả file khung về cũ).
- Cắt object = mặt nạ rembg trừ cụm "giống hệt ảnh đồi trống" chạm mép hình (cây đứng trước → fg) + lấp lỗ kín + viền chân APRON 10px (chỗ khác biệt chưa thuộc ai). Ground = khác biệt mềm trong vùng, trừ object và ground đứng trước trong danh sách; `san_nen` cuối cùng = phần còn lại.
- sharp: ảnh xám vẫn có thể ra 3 kênh (`greyscale()` không đổi số kênh) → dùng `extractChannel(0)`; ghép lớp có alpha xong ảnh thành 4 kênh → `removeAlpha()` trước `.raw()`; `resize` chạy TRƯỚC `composite` trong cùng pipeline.
- Vùng xây từng mảnh (R3a): định nghĩa `shared/parts.ts` (nhãn 1..7: nen, cot, khung, mai, tuong, trangtri, nuoc); đề xuất + lưu/đọc `server/assets/parts.ts` (mái = màu ngói CÓ RÃNH hai chiều vì cột/xà cùng màu nhưng trơn; dùng ảnh loại điểm `assets/work/map/kinds/<id>.png` do assets:map ghi: viền chân, lỗ lấp → nền). Lưu `assets/game/buildings/<id>/parts/<vùng>.png` + `parts.json` (vị trí bản đồ để dời theo khi cắt lại; assets:map không xóa thư mục parts). Trang `overlay/parts.html` + `overlay/src/tools/parts.ts`, API `/api/tools/parts*` (giới hạn JSON 25MB riêng).
- Xây từng mảnh (R3b): `overlay/src/build/pieces.ts` (thuần, có test: cắt vùng thành mảnh theo vật liệu, chia mảnh cho giai đoạn theo `build` – dải hẹp ưu tiên, giai đoạn ghi đủ 7 vùng = phần còn lại xét sau cùng, mảnh full thừa dồn vào giai đoạn xây cuối; `pieceRange` công→mảnh; `clusterSize`; `scaffold`) và `overlay/src/build/builder.ts` (Builder: hàng đợi từ tin `contribution`, giới hạn maxPerSec, đối chiếu với state rồi dựng lại khi lệch; BuildSite: render texture cho mảnh đã đặt, mảnh bay, bụi, giàn giáo, đống vật liệu, hiệu ứng mặt đất, nhãn piece_burst). Server gửi `{type:'contribution', name, source, points, allocations}` (allocation có `from`, `cost`). `build` của giai đoạn trong `shared/project.ts` (`normalizeBuild`), mặc định trong `config/defaults/project.json`. Props: `npm run assets:nobg props` + `assets:props` → `assets/game/props/<loại>_<mức>.png`. Kho thoại tối thiểu `config/dialogues.json` (nhóm `piece_burst`); config `pieces`.
- Trang thử xây (R3c): `overlay/build.html` + `overlay/src/tools/build.ts` dùng `MapView` thật; lõi thuần `overlay/src/tools/sandbox.ts` (có test: `stateAt`, `trialPoints` qua `scoreEvent`, `Sandbox` qua `applyPoints`, `FpsMeter`). Tiến độ chỉ ở trong trang, không ghi DB. API `GET /api/tools/build`. `ProgressView` dựng bằng hàm thuần `shared/progressView.ts` (engine.status dùng chung). `MapView.resync()` / `Builder.resync()` bỏ hàng đợi và mảnh đang bay rồi dựng lại; `stats()` cho số liệu. Nhãn piece_burst tối đa 4, nhãn cũ bị che thì đẩy lên. Edge headless giới hạn ~30fps kể cả khi đứng yên: đo FPS thật phải trên trình duyệt thường.
- Overlay bản đồ: `overlay/src/scene/map.ts` (bản đồ, dải tầng tháp, chớp sáng, gắn camera).
- Camera + bố cục (R4): `overlay/src/camera.ts` (thuần, có test: tỉ lệ nhỏ nhất = bản đồ vừa bề ngang, lớn nhất ×maxZoom; site/overview/tour/ceremony; `CameraDirector` hẹn giờ theo chế độ độ đông, làm mượt theo tâm + log tỉ lệ, rung). `overlay/src/hudLayout.ts` (thuần, có test: khung giao diện trong vùng an toàn, 3 chỗ đặt bảng, `chooseBoardSlot` giữ chỗ cũ nếu không che). Khung vẽ: `ui/hud.ts` (ProgressPanel, CompactBoard, EventBox), `ui/minimap.ts` (ảnh thu nhỏ bằng createImageBitmap resizeQuality high), `ui/screenshot.ts` (phím D + kéo thả ảnh live để so). Server: `OverlayState` có `hud`, `camera` (đã chọn số giây theo `crowd`), `crowd` (tạm luôn "vua" tới giai đoạn 4, `currentCrowd` trong `server/overlay/state.ts`), `eventBox` (+`serverNow` để đếm ngược; `goldenHourEndsAt` trong `shared/events.ts`). Tin `camera` (POST `/api/camera`), tin `contribution` có `coins`. Chỉnh hiển thị: GET/POST `/api/display`. Lọc tên: `shared/names.ts` (`displayName`, NFKC, từ cấm so không dấu), áp dụng ở `overlayName` cho bảng và tin contribution. Mã `tam_quan` là điểm dừng của tour (`TOUR_TARGET_ID`).
- Ảnh game: `scripts/assets/remove_bg.py` (rembg birefnet-general-lite, cắt từng vật rồi mới tách nền, khử viền trắng) → `assets/work/nobg`; `scripts/assets/build.ts` (sharp, dùng `scripts/slice-sheet.ts` + `scripts/assets/measure.ts`) → `assets/game` + `assets/manifest.json`. Kiểu manifest: `shared/manifest.ts`; kiểm tra/lưu: `server/assets/`. Giá trị chỉnh tay (`tuned: true`, …) được giữ khi chạy lại build.
- Overlay R1 vẽ tạm bằng hình khối: `overlay/src/scene/site.ts` + `overlay/src/siteLayout.ts`; từ R2 chỉ dùng khi chưa có `manifest.map`.
- Độ đông (4a): `server/game/crowd.ts` (thuần, có test; `CrowdTracker` hai chỉ số, độ trễ, dồn dập). `core.crowd`, nạp sự kiện trong `core.processEvent`, ép tay `core.setCrowdForced` (settings `crowd_forced`), `core.bus` phát 'crowd', 'sessionStart', 'sessionEnd'. Server có nhịp nhanh 500 ms (`updateCrowd` + `abbot.tick`).
- Kho thoại (4a): `server/dialogue/rules.ts` (biến hợp lệ, từ cấm, từ hạn chế, từ tôn giáo cấm ở gift_*; `lineProblems`), `server/dialogue/selector.ts` (`DialogueSelector`: shuffle/sequential/random, lưu bảng `dialogue_state` (migration 2), cooldown, lọc tier/verified/biến). Kho mặc định `config/defaults/dialogues.json` (câu SPEC verified true, câu viết thêm false). Biến sai → lỗi khi đọc (schema superRefine).
- Trụ trì (4a): `server/abbot/director.ts` (`AbbotDirector`: luật chào/cảm ơn theo chế độ, gộp, hàng đợi ưu tiên, mốc tiến độ, thoại tự do; gửi tin `say` {text, pose, durationMs, verified}); `server/abbot/greeted.ts` (bảng `session_greeted`). Live thật kể cả diễn tập chỉ câu đã duyệt (`live.mode() !== 'simulator'`). Overlay: `overlay/src/ui/abbot.ts` (dáng, bong bóng, viền cam câu chưa duyệt, né sang phải `chooseAbbotSide`). Mức quà + tên vật phẩm: config `gifts.tiers`, `gifts.displayNames`; thông số trụ trì: config `abbot`.
- 4b: thông báo quà `server/overlay/toasts.ts` (`GiftToasts`: big/plus theo chế độ, gộp quà nhỏ cùng người trong mergeSec bằng cùng id, top% ở rất đông) → tin `toast`; overlay `ui/toast.ts` (hàng đợi ưu tiên xu, avatar tạm chữ cái đầu). Mức quà dùng chung `server/game/gifts.ts` (`giftTier`, `giftLabel`; config `gifts.tiers[].icon`). Mục tiêu tim `server/game/heartGoal.ts` (`HeartGoal` thuần có test + `HeartGoalService` đếm tim phiên từ bảng events, lưu settings `heart_goal`), `core.goals`, `core.setHeartGoal`, bus 'goal' → tin `festival` + `abbot.onGoalReached`; dòng `goal` trong ô sự kiện (goal_text cố định theo nấc). Múa lân `overlay/src/ui/festival.ts`, ảnh `npm run assets:nobg lion_dance` + `assets:festival` → `assets/game/festival/`. Trang Kho thoại `admin/dialogues.html` + API `/api/dialogues` (GET, POST lưu qua `core.saveDialogues` có backup `backups/dialogues/`, `/check`, `/say` nói thử dữ liệu mẫu, `/export`); `USED_GROUPS`, `unverifiedGroups` trong `server/dialogue/rules.ts` (cảnh báo trên admin). Nhóm toast_* cũng cấm từ tôn giáo.
- 4c: ảnh `scripts/assets/build-chars.ts` (`npm run assets:chars`; bảng `SHEETS` = thứ tự hình từng tấm; tên `chars/<loại>_<down|up|right>_<0..3>`, `<loại>_<brick_up|basket_up|wood_down>_<k>`, `<loại>_<việc>_<k>`; `vehicles/<cart|elephant>_<up|down>_<k>`; `honor/statue_<k>`; mọi ảnh thu về thước `CHAR_REF_HEIGHT`=120 điểm ảnh cho dáng đứng, overlay nhân `characters.heightMap / CHAR_REF_HEIGHT`). Mỗi tấm có thể đặt `minGap` (hình xếp sát), tên "-" (bỏ hình tách nền hỏng), `fit` (cân riêng một dáng vẽ to/nhỏ); tấm làm việc cân theo `tile_1`. Tách nền: thêm tấm vào `SHEETS` của remove_bg.py. Bộ dân phu tạm của bản tháp đã bỏ khỏi build.ts. Lối đi: `shared/paths.ts` (thuần, có test: `buildGraph` nối điểm trùng và đầu mút nằm trên đoạn, `route` Dijkstra, `mainEntry`, `components`, `workSpots`, `honorSlotFor`); file `assets/map-paths.json` (`server/assets/paths.ts`: validate, save, `syncManifestPaths` lúc server mở và khi lưu; `buildMap` giữ lại) → `manifest.map.paths`, `honorSlots`. Trang `overlay/paths.html` + `src/tools/paths.ts`, API `/api/tools/paths`.
- 4d (server): `server/game/roster.ts` (`CharacterRoster` thuần có test: `shouldSpawn` theo `characters.spawn`, `idleLimitMs`, `evictOrder` theo chế độ, rời dần `leaveGapSec`; người mới ưu tiên thấp nhất thì không sinh), `core.roster` (nạp ở `processEvent`, phiên mới đếm lại, `restoreRoster` dựng lại từ bảng events của phiên khi khởi động), nhịp 500 ms gọi `roster.tick`. Hàm dùng chung `shared/characters.ts` (`lookFor` không bao giờ là tusi, `giftEffect`/`tierEffect` suy từ `gifts.tiers[].icon` hoặc `effect`, `statueMinCoins`, `titleFor`, `shortName`). Tượng: migration 3 bảng `honor_statues`, ghi trong transaction của sự kiện quà (`ProcessResult.honorId`), `honorStatues` (seq = thứ tự toàn bộ). `OverlayState.actors`, `honors`, `characters`; tin `contribution` có `platformId`, `effect`. Nút giả lập `gift_logs`, `gift_elephant`, `gift_statue`.
- 4d (overlay): `overlay/src/chars/` — thuần có test: `sprites.ts` (catalog khung từ manifest, `workKind` theo `build`, `workActions`, `scaffoldShare`), `route.ts` (`Polyline`, `enterStart`/`exitEnd` cắt đoạn ngoài khung hình, `stopBefore` xe dừng trước công trình), `spots.ts` (`buildSpots`, `SpotPool`, `loiterPoints`), `actor.ts` (bộ não: vào, làm, khiêng `carryTrip`, trèo giàn giáo, đổi hạng mục, `leave`), `honorPages.ts`; vẽ: `view.ts` (`CharactersView`, chữ ở lớp màn hình, ẩn chữ chồng nhau theo người vừa có công), `effects.ts` (xe trâu, voi, chuông), `honors.ts`, `labels.ts`, `charArt.ts`. `MapView.buildings` sắp theo zIndex (nền `GROUND_Z`+i, công trình baseY, công trường baseY+0,25, người trên giàn giáo baseY+0,5, người dưới đất = chân y). "Khung nhìn" của nhân vật = vùng CamView (giữa vùng an toàn trên và khu comment). `BuildSite.geometry()` (chỗ đứng, thanh giàn giáo, đống vật liệu; công trình phẳng: đống vật liệu cạnh lối đi gần chân), `bumpPile`, `source` (mảnh bay từ tay người), sự kiện `carry` của Builder. `CameraDirector.peek` (lia tới tượng mới). `window.__overlay.stats()` cho kiểm tra tự động. 40 nhân vật giữ 60fps (Edge headless có GPU).
- 4e (server): `CharacterRoster` có 3 loại: người xem (`list`), người góp công cũ (`returningList`, ở `staySec`, `shownAt` + `cooldownMin`, tương tác thì thành người xem và gọi `onBack` → bus 'returning' → `abbot.onReturning` nhóm returning), dân phu (`npcList`, id "npc-<số>", kiểu gồm cả tusi). Mục tiêu số người chọn ngẫu nhiên trong khoảng `npc.count` / `returning.count` khi đổi chế độ; thêm dần (`fillGapSec`), rời dần (`leaveGapSec`); `total` ≤ maxCharacters, đầy thì dân phu rồi người góp công cũ nhường chỗ. Chọn người góp công cũ: `server/game/returning.ts` (`returningCandidates` = tổng công trừ công phiên này, `present`, `topItemId`; `pickReturning` theo trọng số điểm, ưu tiên người vắng mặt; loại trừ ở settings `returning_excluded`, `core.setReturningExcluded`). API `/api/returning`, `/api/returning/exclude`, `/api/users/search`; khung "Người góp công cũ" trên admin. `ActorInfo.kind` / `look` / `note`; `actorList`, `npcLabel` (nhóm npc_labels theo vị trí dòng: 1 dân phu, 2 thợ mộc, 3 thợ nề), `anonCrowd` (chỉ ratdong, nhóm crowd_counter) trong `server/overlay/state.ts`. Nhóm thoại mới: crowd_counter, npc_labels, returning_subtitle (và returning vào USED_GROUPS).
- 4e (overlay): `view.ts` thẻ tên theo loại (`returningTag` bạc mờ + dòng phụ, `npcTag` nhãn nghề), ưu tiên chữ người xem > góp công cũ > dân phu, `Actor.pace` (dân phu chậm hơn). `Actor.enter` khi công trường chưa sẵn sàng thì hoãn (`deferred`), không đặt người ở mép bản đồ. `crowd.ts` (`AnonCrowdView`, cỡ 0,8; chỗ đứng `crowdSpots` trong spots.ts: phần giữa khung hình, tránh khung công trình và chỗ bị công trình che `ctx.hidden`). `ambient.ts` (`Birds` lớp màn hình) + `schedule.ts` (`nextDelay`, `NpcCartTimer`: xe trâu NPC = `effects.vehicle('cart', null)`, không tên). Cờ đuôi nheo: `BuildSite.drawFlags` (cột cờ cạnh đống vật liệu, hai cột ngoài của giàn giáo; `ambient.flags`). Công trình phẳng: chỗ đứng ưu tiên vùng nền, tránh mặt nước. `window.__overlay.actors()` liệt kê vị trí nhân vật. Ánh sáng theo giờ (9B) để giai đoạn 5c.
- 5 (server): `server/game/ceremony.ts` (`ceremoniesFor` từ transitions: stage_ritual / stage_minor (bỏ giai đoạn cuối của hạng mục), item_complete (thời lượng theo cỡ, shortSec chỉ cho nhỏ), project_complete; `steleFor` top `ceremony.steleTop` + dòng others; `replayCeremony`; `steleEntries`; `creditsOf`). Chữ: `pickLine` trong `server/overlay/state.ts` (câu đầu dùng được, đủ biến, ưu tiên theo điều kiện; ceremony_title lễ giai đoạn ưu tiên dòng có {ritual}/{stage}), `ceremonyDeps`. Server gửi tin `ceremony` sau `progress` (server.ts). API `/api/steles`, `/api/steles/view`, `/api/steles/show` (gửi lễ replay), `/api/credits`; trang `admin/steles.html`. Trụ trì nói nhóm project_complete. Config `ceremony`; nhóm thoại ceremony_title, ceremony_others, project_complete, credits_title, credits_end.
- 5 (overlay): `overlay/src/ceremony/` — `queue.ts` (thuần: sẵn sàng khi `stageDone` hoặc `isPast` hoặc chờ quá MAX_WAIT_SEC; còn lễ phía sau thì dùng shortSec; replay sẵn sàng ngay; khánh thành sẵn sàng khi đứng đầu), `layout.ts` (thuần: `steleBox`, `steleProgress`, `creditLines`), `stele.ts` (bia lớp màn hình, chữ ≥ 32px, top 3 vàng đồng + huy chương, khắc chìm), `fx.ts` (Lanterns, Fireworks, LotusLanterns, StageBanner, DustRings), `credits.ts` (chỉ dựng dòng đang thấy), `director.ts` (kịch bản từng loại lễ, tạm dừng Builder `paused`, camera `request(mode, focus, sec, force)` / `release`, cảnh khánh thành `MapView.setFinale` luân phiên tour / overview). Bia hiện sau vài giây và thu trước khi hết lễ (bia che giữa màn hình). MapView: `isPast`, `doneObjectRects`, `pondWaters` (hồ sen `ho_sen`), `addWorldFx`, `toScreen`. `window.__overlay.ceremony()` cho kiểm tra tự động.
- Không viết `node -e "…"` có dấu backtick trong lệnh bash (bash chạy phần trong backtick, file hỏng một nửa): viết script ra file nháp bằng Write rồi chạy.
- Lệnh bash trong môi trường này nuốt dấu gạch chéo ngược của heredoc Python (\n thành xuống dòng thật, \b thành ký tự lùi): sửa chuỗi có gạch chéo ngược bằng công cụ Edit, hoặc viết script ra file nháp rồi chạy.
- Manifest/config của bản tháp cũ: `stripLegacyManifest` (server/assets/manifest.ts) bỏ `background`, `tower`, ảnh `tower/`, `bg/`, khóa căn tầng; `upgradeLegacyConfig` bỏ khóa tháp trong `overlay`. DB tháp cũ: `server/db/legacy.ts`.
- Máy chủ dự án dùng bảng mã cp932 khi ghi log: script Python phải `reconfigure(encoding='utf-8')` cho stdout.
- Tự kiểm tra hình overlay: chạy server với `GAME_NO_BROWSER=1`, chụp bằng Edge headless (`--headless=new --user-data-dir=<thư mục nháp> --use-angle=swiftshader --window-size=1080,1920`); nếu ảnh ra đen thì chụp qua CDP.

## Tiến độ
Bản tháp cũ (tag `thap-100-tang`):
- [x] Giai đoạn 1: khung dự án (2026-11-10)
- [x] Giai đoạn 2: simulator + WebSocket + overlay tối giản (2026-11-10)
- [x] Giai đoạn 3: đồ họa tháp, manifest, script cắt sprite, parallax, debug D, /tools/assets (2026-11-10)

Quần thể chùa (nhánh `quan-the-chua`):
- [x] R1: mô hình dữ liệu hạng mục + giai đoạn, `project.json`, DB mới, simulator + overlay hình khối tạm (2026-11-11)
- [x] R2: ghép bản đồ, phóng to, cắt công trình, lớp tiền cảnh, manifest, `/tools/assets` mở rộng (2026-11-11)
- [ ] R3: xây từng mảnh (SPEC mục 7; thay cách hiện mờ dần)
  - [x] R3a: trang `/tools/parts` chia vùng, thử với Gác chuông (2026-11-11), chờ chủ dự án xem
  - [x] R3b: cắt mảnh, `build` của giai đoạn, mảnh bay vào, công lẻ, đống vật liệu, giàn giáo, hiệu ứng mặt đất; xóa code mờ dần (2026-11-11)
  - [x] R3c: trang thử `/tools/build` (chọn hạng mục, giai đoạn, nút tim/quà, bắn liên tục, FPS) (2026-11-11)
- [x] R4: camera (site, overview, tour, ceremony, rung) và bố cục mới (thanh tiến độ, bảng thu gọn tự tránh, ô sự kiện, bản đồ thu nhỏ, lọc tên, chỉnh hiển thị, so ảnh live) (2026-11-11). Chủ dự án duyệt; đã dọn code tháp cũ
- [x] Giai đoạn 4 (chủ dự án chọn chia nhỏ, dừng sau mỗi phần; xong 4e ngày 2026-11-12):
  - [x] 4a: chế độ độ đông (9A), kho thoại + bộ chọn thoại (9C), trụ trì trên overlay, tên quà theo mức (14.6) (2026-11-11)
  - [x] 4b: thông báo quà (hàng đợi, gộp, theo chế độ), mục tiêu tim của phiên + múa lân, trang Kho thoại trên admin (2026-11-11)
  - [x] 4c: cắt ảnh nhân vật / xe trâu / voi / tượng; lối đi, vị trí làm việc, ô ghi danh trong manifest; trang /tools/paths (2026-11-11)
  - [x] 4d: nhân vật người xem trên bản đồ (9), hiệu ứng quà theo mức (2026-11-12)
  - [x] 4e: dân phu NPC, người góp công cũ (9B), đám đông vô danh, công trường tự chạy (cờ, chim, xe trâu NPC); tính chung maxCharacters (2026-11-12)
- [x] Giai đoạn 5: các loại lễ và bia (mục 10), lễ khánh thành toàn công trình, credit (14.12), trang Bia ghi danh (2026-11-12)
- [ ] Giai đoạn 5b (âm thanh), 5c (ngày đêm, thời tiết), 6 → 8 (mục 15)
