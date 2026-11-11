# ĐẶC TẢ DỰ ÁN: ĐẠI DANH LAM THIÊN PHÚC – Game livestream xây quần thể chùa

> File này là nguồn sự thật duy nhất của dự án. Khi có mâu thuẫn giữa code và file này, hỏi chủ dự án trước khi tự quyết.

> **ĐỔI HƯỚNG (quan trọng):** Dự án ban đầu là "tháp 100 tầng" và đã code tới giữa giai đoạn 4. Nay đổi thành **xây một quần thể chùa** gồm nhiều hạng mục (cổng tam quan, chính điện, gác chuông, bảo tháp 9 tầng…). Logic điểm, lưu trữ, phiên live, admin, kho thoại, âm thanh, lịch, thời tiết GIỮ NGUYÊN. Phần thay đổi: mô hình tiến độ (mục 5), dữ liệu đóng góp (mục 6), đồ họa (mục 7), bố cục và camera (mục 8), nhân vật trên công trường (mục 9), lễ (mục 10). Xem giai đoạn R trong mục 15.

## 0. Tóm tắt

Overlay game cho livestream dọc 9:16 (1080×1920). Người xem tặng quà, thả tim, bình luận để "góp công". Điểm này dùng để xây dần một **quần thể chùa** trên một khu đồi: lần lượt từng hạng mục, mỗi hạng mục qua nhiều giai đoạn thi công theo đúng quy trình xây chùa truyền thống, có tiến độ liên tục nhìn thấy được. Người xem xuất hiện thành nhân vật mang avatar và tên của họ, làm việc trên công trường. Công được lưu vĩnh viễn để live liên tục nhiều tháng, nhiều năm.

**Thuật ngữ:**
- **Công trình:** toàn bộ quần thể chùa.
- **Hạng mục:** một công trình con, ví dụ "Gác chuông", "Bảo tháp – Tầng 3".
- **Giai đoạn:** một bước thi công của hạng mục, ví dụ "Dựng cột".
- **Tiến độ:** phần trăm của giai đoạn đang làm.

**Nguyên tắc nội dung (bắt buộc):**
- Đây là TRÒ CHƠI MÔ PHỎNG. Luôn hiển thị dải chữ cố định: `Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo`.
- Không có câu chữ nào hứa hẹn phước báu, may mắn, công đức thật. Lời thoại chỉ cảm ơn và ghi danh.
- Tượng Phật trong nền là tĩnh, không phản ứng với quà. Không dùng chữ "Thích" trong tên trụ trì.
- Không bao giờ hiển thị comment, người xem hay quà giả khi live thật (chế độ giả lập phải hiện nhãn "CHẾ ĐỘ THỬ").
- KHÔNG có bot giả làm người xem: không nhân vật nào mang tên hoặc avatar giả, không comment giả, không quà giả, không tên giả trên bảng xếp hạng. Phòng vắng được làm sống động bằng dân phu NPC không tên và "người góp công cũ" có thật (mục 9B).
- Từ ngữ nhà Phật KHÔNG được gắn với việc tặng quà. Khi nhận quà chỉ cảm ơn và ghi danh. Chi tiết ở mục 9C.

## 1. Công nghệ

- Node.js 20+, TypeScript, npm.
- Backend: Express + `ws` (WebSocket), `better-sqlite3` (WAL mode), `zod` để kiểm tra config.
- Kết nối live: thư viện `tiktok-live-connector` dùng máy chủ ký của **Euler Stream** (eulerstream.com), kèm API key Euler để tăng giới hạn. Đây là giải pháp KHÔNG chính thức (TikTok không có API LIVE công khai), có thể hỏng khi TikTok cập nhật. Bắt buộc bọc sau adapter để thay thế được, có tự kết nối lại với backoff. Chi tiết ở mục 3.
- Bí mật (API key) để trong file `.env`, KHÔNG commit. Có `.env.example` mẫu. Không bao giờ ghi key ra log, gửi xuống overlay hay hiển thị trên admin (chỉ hiện "đã cấu hình / chưa cấu hình").
- Overlay: Vite + PixiJS (v8), một trang duy nhất, render 1080×1920, scale vừa cửa sổ.
- Test: vitest.
- Tất cả chạy cục bộ trên máy streamer. Server chỉ bind `127.0.0.1`.
- Font tiếng Việt có dấu, đóng gói cục bộ (không tải từ CDN khi chạy): `Be Vietnam Pro` cho chữ thường, một font serif có dấu tiếng Việt (ví dụ `Noto Serif`) cho tiêu đề.

Cách dùng khi live: mở `http://127.0.0.1:3000/overlay` làm Browser Source trong OBS (1080×1920), hoặc mở cửa sổ trình duyệt rồi dùng Window Capture trong TikTok LIVE Studio.

## 2. Cấu trúc thư mục

```
/server          backend: adapter live, logic game, DB, WebSocket, admin API
/overlay         frontend PixiJS
/admin           trang quản trị (HTML đơn giản, phục vụ bởi server)
/shared          kiểu dữ liệu và hàm tính điểm dùng chung
/assets/raw      ảnh gốc chủ dự án cung cấp (KHÔNG sửa)
/assets/game     ảnh đã tách nền, cắt sẵn, đặt tên theo manifest
/assets/manifest.json   khai báo file ảnh, kích thước, điểm neo
/assets/audio/music/<playlist>/   nhạc nền, mỗi thư mục con là một playlist (mục 10A)
/assets/audio/sfx/<nhóm>/         hiệu ứng âm thanh, mỗi thư mục con là một nhóm, chứa nhiều biến thể
/assets/audio/ambient/<nhóm>/     âm thanh môi trường chạy nền
/assets/audio/credits.json        nguồn và giấy phép của từng file âm thanh
/config/audio.json                cấu hình âm thanh (sửa được qua admin)
/config/events.json               lịch sự kiện dương lịch và âm lịch (mục 14.11)
/data            game.db, avatars/, backups/   (thêm vào .gitignore)
/config/config.json     cấu hình game (sửa được qua admin)
/config/project.json    danh sách hạng mục, mẫu giai đoạn, giá (mục 5)
/config/dialogues.json  kho lời thoại trụ trì (sửa được qua admin, mục 9C)
/scripts         công cụ phụ (cắt sprite sheet, backup, giả lập)
```

## 3. Sự kiện đầu vào (chuẩn hóa)

Adapter chuyển mọi nền tảng về một dạng chung:

```ts
type LiveEvent =
  | { type: 'gift'; user: LiveUser; giftId: string; giftName: string; coinValueEach: number; count: number; ts: number }
  | { type: 'like'; user: LiveUser; count: number; ts: number }
  | { type: 'comment'; user: LiveUser; text: string; ts: number }
  | { type: 'join'; user: LiveUser; ts: number }
  | { type: 'viewers'; count: number; ts: number };   // số người xem đồng thời, dùng cho mục 9A

type LiveUser = { platformId: string; uniqueId: string; nickname: string; avatarUrl?: string };
```

Lưu ý TikTok:
- Quà dạng combo (streak): chỉ tính khi combo kết thúc (`repeatEnd`), không tính từng nhịp, tránh cộng trùng.
- Tim đến theo lô (`likeCount`), cộng theo số lượng thực.
- Định danh người xem bằng `platformId` cố định, KHÔNG dùng nickname (người dùng đổi tên thường xuyên). Cập nhật nickname và avatar mới nhất mỗi lần thấy.

Các adapter, chọn bằng `liveSource` trong config:

| `liveSource` | Adapter | Ưu tiên |
|---|---|---|
| `tiktok-connector` | `TikTokConnectorAdapter`: dùng `tiktok-live-connector`, truyền `EULER_API_KEY` từ `.env` cho máy chủ ký Euler Stream. Nếu chưa có key vẫn chạy được ở mức miễn phí giới hạn. | Mặc định, làm trước |
| `simulator` | `SimulatorAdapter`: sinh người xem giả tên tiếng Việt, tốc độ chỉnh được, có nút bắn từng loại sự kiện từ admin, và 4 kịch bản sẵn mô phỏng phòng vắng / vừa / đông / rất đông (kể cả số người xem) để thử mục 9A. Overlay hiện nhãn "CHẾ ĐỘ THỬ". | Làm trước |
| `euler-ws` | `EulerWebSocketAdapter`: WebSocket có quản lý của Euler Stream, dùng khi cần ổn định hơn cho live dài hạn. Tra tài liệu và SDK chính thức hiện tại của Euler, không đoán API. | Làm sau, khi chủ dự án yêu cầu |
| `tikfinity` | `TikFinityAdapter`: nhận sự kiện do ứng dụng TikFinity chuyển tiếp trên máy. Tra tài liệu TikFinity hiện tại trước khi làm. | Dự phòng, làm khi được yêu cầu |

Yêu cầu chung cho mọi adapter:
- Xuất ra đúng kiểu `LiveEvent` ở trên; phần logic game không biết sự kiện đến từ đâu.
- Tự kết nối lại khi rớt mạng hoặc kênh tạm dừng live, backoff tăng dần (tối đa khoảng 60 giây).
- Báo trạng thái lên admin: `đã kết nối` / `đang thử lại (lần N)` / `kênh chưa live` / `lỗi`, kèm thông báo dễ hiểu cho các lỗi thường gặp: sai hoặc thiếu API key, hết hạn mức, kênh không tồn tại.
- Chống trùng: nếu cùng một sự kiện đến hai lần (do kết nối lại), chỉ tính một lần, dựa trên id sự kiện của nền tảng nếu có.

## 4. Quy đổi công đức

Đơn vị điểm duy nhất trong toàn game (số nguyên). Gạch, gỗ, voi chỉ là hình minh họa, không phải đơn vị.

Tên đơn vị hiển thị trên overlay lấy từ config `pointUnitLabel`, mặc định **"công"** (ví dụ "+120 công", "Bảng góp công"), để giảm màu tôn giáo. Chủ dự án có thể đổi lại thành "công đức". Mọi nhãn chữ trên overlay (tên bảng, tên bia, tên danh hiệu, dải miễn trừ) đều lấy từ config, KHÔNG viết cứng trong code. Trong tài liệu này, "công đức" chỉ là cách gọi nội bộ của điểm.

Mặc định (đều sửa được trong config):

| Nguồn | Công đức |
|---|---|
| Quà | `coinValueEach × count × 100` |
| 1 tim | 1 |
| 1 comment | 5, mỗi người tối đa 1 comment được tính trong 30 giây |
| Trần tim + comment | Tối đa 2.000 công đức/người/ngày từ tim và comment |

- Ngày tính theo múi giờ `Asia/Ho_Chi_Minh`.
- "Giờ hoàng đạo": hệ số nhân (mặc định ×2), bật tay từ admin hoặc theo lịch trong config, có đồng hồ đếm ngược trên overlay.
- Mọi phép cộng điểm đi qua MỘT hàm thuần trong `/shared` và có unit test.

## 5. Tiến độ xây quần thể chùa (3 cấp)

| Cấp | Đổi bao lâu một lần | Người xem thấy |
|---|---|---|
| Hạng mục | Vài tuần đến vài tháng | Công trình mới mọc lên trên bản đồ, lễ khánh thành |
| Giai đoạn | Vài phiên live | Hình công trình đổi rõ rệt; giai đoạn đặc biệt có lễ |
| Tiến độ liên tục | Mỗi lần có công | Từng viên gạch, viên ngói, thanh gỗ bay vào đúng chỗ; vật liệu chất lên rồi vơi đi (mục 7, "Xây từng mảnh") |

**Nguyên tắc nhịp:** phiên live trung bình nào cũng phải có ít nhất một giai đoạn hoàn thành. Trong phiên, cứ khoảng 2% tiến độ của giai đoạn phải có một thay đổi nhìn thấy được trên hình. Mọi tương tác được tính công đều phải có phản hồi nhìn thấy được trên công trường: mảnh bay vào công trình, hoặc vật liệu được khiêng ra đống. Admin cảnh báo khi giá một giai đoạn lớn hơn 1,5 lần số công trung bình của một phiên.

**Khai báo trong `config/project.json`** (sửa được qua admin):
- `name`: tên quần thể, mặc định "Đại Danh Lam Thiên Phúc".
- `stageTemplates`: các mẫu danh sách giai đoạn.
- `items`: danh sách hạng mục THEO THỨ TỰ xây. Mỗi hạng mục có:
  - `id`, `name`, `cost` (tổng công), `template` hoặc danh sách `stages` riêng.
  - `area`: khu vực trên bản đồ (camera dùng để lấy khung hình).
  - `size`: `nho` / `vua` / `lon` (ảnh hưởng độ dài lễ).
- Mỗi giai đoạn có:
  - `name`.
  - `weight`: tỉ trọng công trong hạng mục; mặc định chia đều.
  - `ritual` (tùy chọn): tên lễ nếu là giai đoạn đặc biệt, ví dụ "Lễ dựng cột".
  - `build`: giai đoạn này xây vùng nào của công trình và hiện ra sao (mục 7, "Xây từng mảnh"):
    - `part`: một vùng (`nen`, `cot`, `khung`, `mai`, `tuong`, `trangtri`, `nuoc`) hoặc danh sách vùng. Giai đoạn chỉ tác động mặt đất (cắm mốc, đào móng, đào hồ, tập kết vật liệu) dùng `matdat`.
    - `look`: `full` (màu thật) hoặc `wood` (gỗ thô, cho giai đoạn dựng khung). Với `matdat`: `coc` (cọc, dây căng), `dao` (đất đào lõm, đống đất), `dong` (đống vật liệu cao dần).
    - `band` (tùy chọn): `[từ, đến]` phần trăm chiều cao của vùng tính từ dưới lên, để chia một vùng cho nhiều giai đoạn (ví dụ mái `[0, 50]` rồi `[50, 100]`). Mặc định `[0, 100]`.
    - Vùng đã xây `wood` ở giai đoạn trước, giai đoạn sau xây lại cùng vùng với `full`: từng mảnh gỗ được thay bằng màu thật.
    - Claude Code đặt sẵn `build` mặc định cho mọi mẫu giai đoạn; chủ dự án sửa được trong admin.

**Mẫu giai đoạn mặc định:**

`lon` (16 giai đoạn, cho Chính điện & Tiền đường):
1. Phát quang, cắm mốc (lễ khởi công)
2. Đào móng
3. Đổ móng, kè đá
4. Xây bó nền, bậc thềm
5. Kê chân tảng
6. Dựng cột cái, cột quân (lễ dựng cột)
7. Lắp xà, kèo, vì kèo
8. Thượng lương (lễ thượng lương)
9. Lắp hoành, rui, mè
10. Lợp ngói
11. Đắp bờ nóc, đầu đao
12. Xây tường, lắp cửa bức bàn
13. Lát nền gạch
14. Chạm khắc, sơn son thếp vàng
15. Treo hoành phi, câu đối, đèn lồng
16. Hoàn thiện

`vua` (10 giai đoạn, cho Tam quan, Gác chuông, Gác trống, Hành lang, Nhà tổ):
1. Phát quang, cắm mốc
2. Đào và đổ móng
3. Xây bó nền, bậc thềm
4. Kê chân tảng
5. Dựng cột (lễ dựng cột)
6. Lắp khung xà kèo, thượng lương (lễ thượng lương)
7. Lợp ngói
8. Xây tường, lắp cửa
9. Trang trí, sơn son
10. Hoàn thiện

`nho` (5 giai đoạn), đặt tên riêng theo hạng mục. Ví dụ Hồ sen: Đào hồ → Kè đá bờ hồ → Dẫn nước → Trồng sen → Hoàn thiện.

`thap_tang` (6 giai đoạn, cho mỗi tầng bảo tháp):
1. Tập kết gạch
2. Xây thân tầng
3. Trổ cửa vòm
4. Lợp mái hiên
5. Gắn đèn, chuông gió
6. Hoàn thành tầng

Tầng 1 thêm 2 giai đoạn đầu: "Đắp nền tháp", "Xây bậc đá". Tầng 9 thêm giai đoạn cuối "Đặt chóp tháp" (lễ).

**Danh sách hạng mục mặc định** (chủ dự án chỉnh thứ tự và giá trong admin):

| # | Hạng mục | Mẫu | Ghi chú |
|---|---|---|---|
| 1 | San nền công trường | nho | Lễ khởi công toàn công trình |
| 2 | Bệ cây bồ đề | nho | Bệ đá bát giác quanh cây cổ thụ có sẵn |
| 3 | Sân gạch | nho | |
| 4 | Cổng tam quan | vua | |
| 5 | Hồ sen | nho | Khu phía trước, camera hạ xuống |
| 6 | Cầu đá | nho | |
| 7 | Tường bao | nho | |
| 8 | Gác chuông | vua | |
| 9 | Gác trống | vua | |
| 10 | Đôi sư tử đá | nho | |
| 11 | Chính điện & Tiền đường | lon | Gộp vì hai công trình chồng nhau trên hình |
| 12 | Hành lang Tây | vua | |
| 13 | Hành lang Đông | vua | |
| 14 | Nhà tổ | vua | |
| 15–23 | Bảo tháp – Tầng 1 … Tầng 9 | thap_tang | Mỗi tầng một hạng mục |

**Giá:**
- Đặt theo bội số của `baseUnit` (mặc định 20.000 công): `nho` 2–3 đơn vị, `vua` 6–10, `lon` 40, mỗi tầng tháp 4.
- Admin hiện tổng công cả công trình, số công còn lại, và ước tính số phiên còn lại theo trung bình thực tế.

**Quy tắc chuyển tiếp:**
- Điểm dư khi xong một giai đoạn hoặc hạng mục chuyển sang cái kế tiếp.
- Sự kiện vẫn được ghi nhận bình thường trong lúc diễn lễ; lễ chỉ là phần hiển thị.
- Xong hạng mục cuối cùng: lễ khánh thành toàn công trình, rồi cuộn danh sách TẤT CẢ người góp công như credit cuối phim (mục 14.12).
- Danh sách hạng mục có thể được NỐI THÊM sau khi khánh thành để mở rộng chùa; giai đoạn và tiến độ đã có không bị ảnh hưởng.

## 6. Lưu trữ (phải chạy được cả năm)

SQLite WAL. Các bảng tối thiểu:

- `users(platform_id PK, unique_id, nickname, avatar_url, avatar_file, total_points, gift_points, like_points, comment_points, first_seen, last_seen)`
- `events(id, ts, session_id, platform_id, type, payload_json, points, item_id, stage_index)`: nhật ký đầy đủ để tra soát khi có người hỏi "tôi tặng mà không thấy tên".
- `item_contributions(item_id, platform_id, points, PK(item_id, platform_id))`
- `stage_contributions(item_id, stage_index, platform_id, points, PK(...))`: dùng cho bia của các giai đoạn có lễ.
- `daily_caps(day, platform_id, like_comment_points)`
- `game_state(id=1, current_item_index, current_stage_index, stage_points, total_points, started_at, completed_at)`
- `sessions(id, started_at, ended_at)`

Yêu cầu:
- Mỗi sự kiện được ghi trong một transaction, cập nhật user, contributions và state cùng lúc.
- Tắt máy rồi bật lại thì tiếp tục đúng hạng mục, đúng giai đoạn, đúng phần trăm.
- Hạng mục được nhận diện bằng `id`, không bằng số thứ tự, để đổi thứ tự hay chèn hạng mục mới không làm sai dữ liệu cũ.
- Backup tự động file DB mỗi ngày và mỗi khi kết thúc phiên vào `/data/backups`, giữ 30 bản gần nhất.
- Admin có nút xuất JSON toàn bộ và nhập lại (có xác nhận).
- Avatar: tải về `/data/avatars/<platformId>.jpg` ở lần đầu thấy và làm mới định kỳ (link avatar của nền tảng hết hạn). Lỗi tải thì dùng avatar mặc định.

## 7. Đồ họa và manifest

**Ảnh gốc** trong `/assets/raw/` (KHÔNG sửa):

| File | Nội dung |
|---|---|
| `map_built.png` | Bức tổng thể quần thể chùa hoàn thiện, nhìn chéo từ trên cao (941×1672). Bản đồ gốc quyết định vị trí và góc nhìn của mọi thứ. Tháp trong ảnh có 8 tầng, chỉ dùng để xác định vị trí. |
| `map_empty.png` | Cùng khung hình, đã xóa hết công trình: đồi đất trống, cây cối, cây bồ đề cổ thụ, núi, trời. |
| `map_ground_ext.png` | Mặt đất nối dài phía dưới. **Chồng lên đáy hai ảnh trên 308px** (theo kích thước gốc): ghép chồng và làm mờ dần phần chồng, KHÔNG nối thẳng mép. |
| `abbot_poses.png`, `chars_workers.png`, `ui_kit.png`, `stele.png` | Như trước |
| `thap_9tang.png` | (Sẽ có sau) Bảo tháp 9 tầng vẽ riêng, độ phân giải cao |

Ảnh nền tháp cũ (`bg_background`, `bg_sky_upper`, `tower_*`) không dùng nữa; chuyển sang `assets/raw/_old/`.

**Tọa độ bản đồ:**
- Bản đồ ghép = `map_empty` + `map_ground_ext`, cao 1672 + 1672 − 308 = 3036px theo ảnh gốc.
- Phóng to bằng AI (Real-ESRGAN) lên ít nhất ×2, rồi quy về hệ tọa độ thống nhất có chiều rộng 1080 × hệ số zoom tối đa.
- Mọi vị trí trong manifest tính theo hệ tọa độ bản đồ đã thống nhất.

**Tách công trình:**
- Claude Code cắt từng hạng mục từ `map_built.png` (so với `map_empty.png` để tìm phần khác biệt, rồi tinh chỉnh bằng tay trên trang công cụ). Mỗi hạng mục lưu vào `buildings/<itemId>/final.png`, kèm `x, y, w, h` và `baseY` (đường chân công trình, dùng để sắp lớp trước sau) trong manifest.
- Thứ đứng TRƯỚC công trình (tán cây, cành hoa che một phần mái…) tách thành lớp tiền cảnh `fg/<tên>.png`, vẽ đè lên công trình để cây vẫn ở phía trước.
- Chính điện và tiền đường gộp chung một ảnh. Tam quan cắt kèm đoạn tường nối liền nếu không tách được sạch.
- Bảo tháp: khi có `thap_9tang.png` thì đặt đúng vị trí và kích thước chân tháp trong `map_built`. Manifest lưu `tierLinesY` (9 ranh giới tầng). Trước khi có ảnh này: dùng tháp 8 tầng cắt từ bản đồ, chia tạm 9 dải đều.

**Ảnh giai đoạn (tùy chọn, làm dần):**
- `buildings/<itemId>/key_<n>.png`: ảnh mốc, ví dụ "chỉ còn khung gỗ", "mái chưa trang trí". Cùng kích thước khung và căn khớp với `final.png`.
- `buildings/<itemId>/stage_<k>.png`: ảnh riêng cho đúng giai đoạn k, ưu tiên cao nhất.
- Thả file vào thư mục là game tự dùng, không phải sửa code. Có ảnh này thì mảnh của giai đoạn lấy từ ảnh đó thay vì `final.png` (xem "Xây từng mảnh").

**Xây từng mảnh** (cách hiển thị tiến độ giai đoạn; KHÔNG dùng kiểu hiện mờ dần hay lộ dần): mỗi lần người xem tặng quà, thả tim hoặc bình luận được tính công, công trình được thêm từng viên gạch, viên ngói, đoạn cột, thanh xà… vào đúng chỗ.

1. **Vùng (parts).**
   - Mỗi công trình có mặt nạ các vùng:
     - `nen`: nền, móng, bậc;
     - `cot`: cột;
     - `khung`: xà, kèo;
     - `mai`: mái ngói;
     - `tuong`: tường, cửa;
     - `trangtri`: bờ nóc, đầu đao, hoành phi, đèn;
     - `nuoc`: mặt nước (hồ sen).
   - Claude Code tự đề xuất vùng theo màu và vị trí (cột đỏ đứng, tường kem, mái ngói nâu đỏ phía trên).
   - Chủ dự án chỉnh lại trên trang `/tools/parts` bằng cọ tô, tẩy, và xem từng vùng.
   - Mặt nạ lưu vào `buildings/<mã công trình>/parts/<vùng>.png`. Vùng không có thì bỏ qua.
2. **Mảnh (pieces).** Mỗi vùng tự cắt thành mảnh theo vật liệu (kích thước mảnh sửa trong config):

   | Vùng | Mảnh | Thứ tự đặt |
   |---|---|---|
   | `nen` | Khối đá to xếp so le | Từng hàng từ dưới lên |
   | `cot` | Đoạn cột | Từng cột một, từ chân lên đỉnh |
   | `khung` | Thanh gỗ ngang, dọc, màu gỗ thô | Từng thanh |
   | `tuong` | Viên gạch so le | Từng hàng từ dưới lên, trái sang phải, xen chút ngẫu nhiên |
   | `mai` | Viên ngói theo hàng | Từ mép hiên lên nóc, như lợp ngói thật |
   | `trangtri` | Mảng nhỏ | Rải dần, mỗi mảng lóe ánh vàng khi hiện |
   | `nuoc` | Mảng nước | Lan dần từ mép bờ vào giữa |

   - Thứ tự mảnh sinh cố định theo mã hạng mục (có seed), nên chỉ cần lưu tiến độ giai đoạn là dựng lại đúng hình. KHÔNG lưu từng mảnh vào DB.
   - Đường cắt mảnh không cần trùng viên gạch vẽ trong tranh.
3. **Giai đoạn gắn với vùng.**
   - Mỗi giai đoạn có `build: { part, look }` (định dạng ở mục 5).
   - Một vùng có thể chia cho nhiều giai đoạn theo dải chiều cao (`band`).
   - Look `wood` dùng cho giai đoạn dựng khung; giai đoạn sau thay dần bằng màu thật theo từng mảnh.
   - Giai đoạn không xây lên công trình (`part: matdat`) dùng hiệu ứng mặt đất: cọc và dây căng hiện từng cái, đất đào lõm dần từng mảng, đống đất cao dần.
   - Có ảnh mốc hoặc ảnh giai đoạn riêng (`key_<n>.png`, `stage_<k>.png`) thì mảnh lấy từ ảnh đó thay vì `final.png`.
4. **Quy đổi công → mảnh.**
   - Số mảnh của giai đoạn tính từ diện tích vùng; công mỗi mảnh = giá giai đoạn ÷ số mảnh.
   - Công lẻ cộng dồn, đủ thì đặt mảnh.
5. **Hiệu ứng đặt mảnh.**
   - Mảnh vật liệu tương ứng (gạch, ngói, gỗ, đá; lấy từ `props` đã chỉnh màu) bay theo đường vòng cung vào đúng vị trí, từ đống vật liệu gần nhất hoặc từ tay một dân phu đứng gần.
   - Khi đặt: khớp vào, nảy nhẹ, bụi nhỏ, âm `brick_lay` / `tile_place` / `wood_hammer` theo giới hạn chống ồn hiện có (mục 10A).
   - Thả tim, bình luận chưa đủ một mảnh: dân phu khiêng vật liệu ra đống, đống to dần.
   - Quà: số mảnh tương ứng bay vào thành một đợt. Vùng vừa xây sáng viền khoảng 3 giây, kèm nhãn nhỏ lấy từ nhóm câu `piece_burst` (mục 9C).
   - Tốc độ đặt tối đa `maxPiecesPerSec`, theo chế độ độ đông (mục 9A): `vang` 20, `vua` 20, `dong` 14, `ratdong` 10 mảnh/giây (sửa trong config). Hàng đợi quá dài thì đặt theo cụm 4–9 mảnh.
   - Lễ chỉ bắt đầu khi mảnh cuối của giai đoạn đã đặt xong.
6. **Hiệu năng.** Mảnh đã đặt vẽ dồn vào render texture của công trình; chỉ mảnh đang bay là sprite riêng. Công trình hàng nghìn mảnh vẫn giữ 60fps.
7. **Ngoài mảnh.**
   - **Giàn giáo tre** vẽ bằng code theo khung bao vùng đang xây, cao dần theo tiến độ, tháo dần ở giai đoạn cuối.
   - **Đống vật liệu** dùng `props` (3 mức: to, vừa, nhỏ), đặt tự động quanh công trình đang xây. To lên khi có quà và tim, vơi đi khi mảnh được đặt.
   - **Bảo tháp:** vùng và mảnh của mỗi tầng chỉ nằm trong dải của tầng đó.

**Ảnh trong không gian màn hình (giữ như cũ):**
```
abbot/abbot_pray.png, abbot_wave.png, abbot_bow.png, abbot_welcome.png
ui/... (khung, thanh tiến độ, huy chương, huy hiệu, khung avatar)
items/brick.png, logs.png, buffalo_cart.png, elephant.png, bell.png, guardian.png   (CHỈ dùng làm icon trong thông báo quà)
stele/stele.png
```

**Ảnh trong không gian bản đồ (LÀM MỚI, cùng góc nhìn chéo từ trên cao và cùng phong cách với `map_built`):**

Bộ dân phu cũ (`chars_workers.png`, chỉ có hướng ngang) chuyển vào `assets/raw/_old/`. Ảnh mới:
- `raw/chars_<loại>_walk.png`: mỗi loại nhân vật (dân phu nam, dân phu nữ, tu sĩ, thợ mộc, thợ nề) đi theo 3 hướng: đi xuống (thấy mặt), đi lên (thấy lưng), đi ngang sang phải (sang trái thì code lật ảnh). Mỗi hướng 3 khung, kèm dáng đứng yên.
- `raw/chars_<loại>_work.png`: dáng làm việc theo loại: khiêng gạch, gánh quang gánh, vác gỗ, cuốc đất, cưa gỗ, đóng búa, xây gạch, kéo dây, chuyền ngói.
- `raw/vehicles.png`: xe trâu chở vật liệu và voi chở gỗ, mỗi loại 2 hướng: đi lên (thấy lưng) và đi xuống (thấy mặt), mỗi hướng 2–3 khung bước đi.
- `raw/props.png`: đống gạch, chồng gỗ, chồng ngói, khối đá, đống cát, giá cưa có súc gỗ, giá ròng rọc ba chân, thang tre, quang gánh đặt dưới đất, xe cút kít gỗ; mỗi đống vật liệu có 3 mức: nhiều, vừa, ít.
- `raw/honor_statues.png`: tượng hộ pháp đá nhỏ trên bệ (đặt ở ô ghi danh), 2–3 kiểu.

Quy ước tên sau khi cắt: `chars/<loại>_<hướng hoặc việc>_<khung>.png`, `vehicles/<loại>_<hướng>_<khung>.png`, `props/<tên>_<mức>.png`, `honor/statue_<kiểu>.png`.

Tỉ lệ: một người cao khoảng 1/8 chiều cao gác chuông trên bản đồ. Tên và avatar trên đầu nhân vật vẽ ở kích thước màn hình, không bị thu nhỏ theo zoom camera.

Trong lúc chưa có ảnh mới: dùng tạm bộ dân phu cũ, đi dọc thì giữ ảnh đi ngang và chỉ nhún lên xuống; đống vật liệu dùng tạm icon trong UI kit.

- Thiếu ảnh nào thì vẽ hình tạm kèm tên file, game không được crash.
- Giữ `scripts/slice-sheet.ts` cho các sprite sheet.
- Trang công cụ `/tools/assets` mở rộng thêm: xem bản đồ với từng công trình bật/tắt, kéo chỉnh khung cắt và `baseY`. Trang `/tools/parts`: chia vùng của từng công trình (xem "Xây từng mảnh").

## 8. Bố cục overlay (1080×1920) và camera

**Vùng an toàn** (nền tảng tự vẽ giao diện ở đây, overlay KHÔNG đặt thông tin quan trọng):
- Trên: 180px.
- Dưới: 600px (khu comment của nền tảng).
- Phải: 150px.

Ba giá trị này nằm trong config. Phím tắt `D` bật khung debug tô màu các vùng này.

Các lớp từ sau ra trước (trong không gian bản đồ):
1. **Bản đồ nền** (`map_empty` + mặt đất nối dài).
2. **Công trình**, sắp theo `baseY` (chân công trình xa vẽ trước), xen kẽ đúng thứ tự với nhân vật và đạo cụ.
3. **Lớp tiền cảnh** (`fg/`).
4. **Hiệu ứng thời tiết** (14.14).
5. **Hiệu ứng** "+công", cánh hoa, hoa đăng.

Giao diện và trụ trì vẽ trong không gian màn hình, không đi theo camera.

**Camera** (zoom tối đa `maxZoom` mặc định 1,6; không bao giờ để lộ ngoài mép bản đồ):

| Chế độ | Khi nào | Mô tả |
|---|---|---|
| `site` (mặc định) | Luôn luôn | Khung hình bao hạng mục đang xây và khoảng đất xung quanh. Công trình chiếm 45–60% bề ngang, nằm giữa vùng nhìn thấy (giữa 180px trên và 600px dưới). Nhờ phần mặt đất nối dài, khu tam quan và hồ sen cũng được đẩy lên trên vùng comment |
| `overview` | Định kỳ (mặc định 3 phút ở `vang`, 6 phút ở `vua`, không tự động ở `dong` và `ratdong`) và khi admin bấm | Thu toàn cảnh quần thể trong 8–10 giây; các bảng giao diện mờ xuống 30%, chỉ còn thanh tiến độ |
| `ceremony` | Khi có lễ | Đẩy chậm vào công trình đang làm lễ |
| `tour` | Chỉ ở `vang`, mỗi 10 phút | Lia chậm từ trời xuống cổng tam quan, giới thiệu những gì đã xây |

- Chuyển chế độ mượt (lerp hoặc easing), không giật.
- Quà lớn: rung nhẹ, hoặc lia ngắn tới chỗ vật phẩm xuất hiện rồi quay về.

**Giao diện** (chữ do code vẽ; mọi khung có thanh chỉnh độ trong suốt trong admin):
- **Thanh tiến độ** (mặc định góc trên phải, nằm trên vùng núi, dưới vùng an toàn trên):
  - Dòng 1: `Hạng mục 7/23 · Gác chuông`.
  - Dòng 2: `Giai đoạn 5/10: Dựng cột`, thanh tiến độ liên tục của giai đoạn, phần trăm.
  - Dòng nhỏ: `Toàn công trình 23%`.
  - Nếu hạng mục có ≤ 10 giai đoạn: thêm hàng chấm các giai đoạn.
- **Bảng xếp hạng thu gọn**, nền mờ, luân phiên 15 giây: Top phiên này (top 5, mục 14.3) → Top tổng (top 5) → Bia hạng mục hiện tại (top 5). Có 3 vị trí đặt sẵn (trái giữa, phải giữa, trái trên); tự chọn vị trí KHÔNG che hạng mục đang xây trên màn hình.
- **Bản đồ thu nhỏ** (tùy chọn, mặc định chỉ hiện ở chế độ `overview`): ảnh thu nhỏ quần thể, công trình đã xong có màu, chưa xây là bóng xám, hạng mục đang xây nhấp nháy.
- **Ô sự kiện:** mục tiêu tim của phiên, đồng hồ giờ hoàng đạo, sự kiện lịch.
- **Thông báo quà lớn:** bật lên khoảng 4 giây kèm avatar và tên. Có hàng đợi; quà lớn ưu tiên, quà nhỏ liên tiếp của cùng một người được gộp.
- **Dải miễn trừ cố định**, nhỏ, nền mờ, đặt ngay trên vùng an toàn phía dưới.
- **Lọc tên:** danh sách từ cấm trong config. Tên vi phạm hiển thị `Thiện hữu ẩn danh`.

## 9. Nhân vật

- Khi nào tạo nhân vật cho người xem phụ thuộc chế độ độ đông (mục 9A). Nhân vật có giới tính và kiểu ngẫu nhiên nhưng cố định theo `platformId`, đi từ mép màn hình vào công trường.
- Trên đầu nhân vật: avatar tròn, tên (cắt bớt nếu dài hơn 14 ký tự), huy hiệu danh hiệu.
- Hành vi: đi theo các lối đi trên bản đồ (khai báo trong manifest dưới dạng đường nối các điểm) tới hạng mục đang xây, đi lại giữa đống vật liệu và công trình, làm động tác hợp với giai đoạn: cắm mốc, đào → cuốc xẻng; dựng cột, khung → khiêng gỗ, kéo dây; xây tường, lát nền → thợ nề; lợp ngói → chuyền ngói lên giàn giáo.
- Vị trí làm việc sinh tự động quanh chân công trình và trên các sàn giàn giáo. Bảo tháp: thợ đứng trên giàn giáo ở độ cao tầng đang xây.
- Thả tim: nhân vật đó làm nhanh hơn trong vài giây, có chữ "+công" bay lên.
- Không tương tác quá thời gian quy định của chế độ hiện tại (mục 9A): nhân vật đi ra khỏi màn hình.
- Tối đa `maxCharacters` (mặc định 40) cùng lúc, tính cả NPC và người góp công cũ. Khi đầy: NPC rời trước, rồi người góp công cũ, rồi người thật tương tác lâu nhất và góp ít nhất.

**Danh hiệu** theo tổng công đức tích lũy (sửa được trong config):
- Thí chủ: ≥ 1.000
- Cư sĩ: ≥ 10.000
- Hộ pháp: ≥ 100.000
- Đại hộ pháp: ≥ 1.000.000
- Công đức chủ: ≥ 10.000.000

**Hiệu ứng theo giá trị một lần tặng** (đơn vị xu nền tảng, sửa được):
- < 10: nhân vật khiêng một viên gạch.
- 10–99: bó gỗ.
- 100–499: xe trâu chở đá chạy ngang công trường.
- 500–999: voi chở gỗ.
- 1.000–4.999: đúc đại hồng chung; chuông lắc và ngân.
- ≥ 5.000: tượng hộ pháp nhỏ mang tên người tặng, đặt vĩnh viễn ở các ô ghi danh dọc đường vào chùa (danh sách ô khai báo trong manifest). Lưu vào DB; hết ô thì xoay vòng hiển thị.
- Xe trâu, voi đi theo đường chính từ mép bản đồ phía dưới vào tới công trình đang xây, đổ vật liệu, rồi quay ra.

**Trụ trì (NPC):** vẽ trong không gian màn hình (không theo camera), đứng góc trái phía trên vùng comment; tự né sang phải nếu che hạng mục đang xây.
- Mặc định dáng chắp tay.
- Quà ≥ 100 xu: dáng vẫy chào và bong bóng thoại cảm ơn.
- Xong giai đoạn có lễ hoặc xong hạng mục: dáng dang tay.
- Cảm ơn quà rất lớn: dáng cúi chào.

Lời thoại của trụ trì: xem mục 9C.

## 9A. Chế độ theo độ đông của phòng

Game tự đổi cách vận hành theo 4 chế độ: `vang`, `vua`, `dong`, `ratdong`.

**Cách xác định chế độ:**
- Dùng hai chỉ số, tính trong cửa sổ trượt 5 phút: số người xem đồng thời (sự kiện `viewers`) và số người có tương tác thật (comment, tim, quà).
- Chế độ = mức cao hơn trong hai cách tính, để phòng đông người tương tác vẫn được xử lý đúng dù số mắt xem báo thấp.
- Nếu adapter không có số người xem: chỉ dùng số người tương tác.

| Chế độ | Người xem (mặc định) | Người tương tác / 5 phút (mặc định) |
|---|---|---|
| `vang` | ≤ 5 | ≤ 3 |
| `vua` | 6–50 | 4–30 |
| `dong` | 51–300 | 31–150 |
| `ratdong` | > 300 | > 150 |

- **Độ trễ chuyển chế độ:** phải ở mức mới liên tục `tierHysteresisSec` (mặc định 120 giây) mới đổi. Riêng chuyển LÊN mức đông hơn khi có đợt dồn dập (quá 100 sự kiện/10 giây) thì đổi ngay để giữ hiệu năng.
- Chuyển chế độ không làm nhân vật biến mất đột ngột: nhân vật thừa đi ra khỏi màn hình dần dần.
- Admin hiện chế độ hiện tại và có nút ép chế độ thủ công (hoặc "tự động").
- Mọi con số trong mục này nằm trong config theo từng chế độ.

**Bảng hành vi (giá trị mặc định):**

| Hạng mục | `vang` | `vua` | `dong` | `ratdong` |
|---|---|---|---|---|
| Sinh nhân vật khi | Vào phòng (`join`) | Comment, tim hoặc quà đầu tiên | Quà, hoặc ≥ 50 tim, hoặc ≥ 3 comment trong phiên | Chỉ khi tặng quà |
| Rời màn hình sau khi không tương tác | 30 phút | 10 phút | 5 phút | 3 phút (người tặng ≥ 1.000 xu: 10 phút) |
| Ưu tiên giữ khi đầy chỗ | — | Tương tác gần nhất | Người tặng quà | Người tặng nhiều nhất trong 10 phút gần đây |
| Đám đông vô danh | Không | Không | Không | Có: nhóm sprite nhỏ không tên ở hậu cảnh kèm bộ đếm "N người đang góp sức" (N = số người tương tác 5 phút) |
| Trụ trì chào người mới | Từng người, theo tên | Lần đầu trong phiên, gộp nhóm, tối đa 1 câu/10 giây | Không chào khi vào; cảm ơn người tặng quà lần đầu | Không |
| Thoại tự do (kể chuyện, kiến thức, hướng dẫn) | Mỗi 60–90 giây | Mỗi 2–3 phút | Mỗi 5 phút, chủ yếu báo tiến độ | Chỉ khi tới mốc % của giai đoạn |
| Thông báo quà dạng lớn | Mọi quà, trụ trì cúi chào | Mọi quà, gộp quà nhỏ liên tiếp | Quà ≥ 100 xu; quà nhỏ chỉ hiện "+công" kèm tên | Quà thuộc top 10% giá trị trong 5 phút gần nhất, tối thiểu 500 xu |
| Mục tiêu tim của phiên | 500 | 5.000 | 10.000 | 50.000, nhiều nấc |
| Dân phu NPC | 6–8 | 3–4 | 0 | 0 |
| Người góp công cũ | 5–10 | 2–3 | 0 | 0 |
| Hiệu ứng | Đầy đủ, chậm rãi | Đầy đủ | Rút gọn, gộp | Tối giản, ưu tiên 60fps |
| Camera | `site`; `overview` mỗi 3 phút; `tour` mỗi 10 phút | `site`; `overview` mỗi 6 phút | `site` | `site`, rung nhẹ khi có quà lớn |

Mục tiêu tim: khi bắt đầu phiên, lấy theo chế độ lúc đó. Nếu chế độ tăng trong phiên và mục tiêu đã đạt, mở nấc mục tiêu tiếp theo của chế độ mới. Mục tiêu đặt tay từ admin luôn được ưu tiên.

## 9B. Dân phu NPC và người góp công cũ (thay cho bot)

**Dân phu NPC:**
- Nhân vật nền của game: không avatar, không tên người. Nhãn trên đầu, nếu có, chỉ là nghề: "Dân phu", "Thợ mộc", "Thợ nề".
- Làm việc theo giai đoạn thi công như nhân vật người xem nhưng chậm hơn. KHÔNG đóng góp điểm, KHÔNG xuất hiện trên bảng xếp hạng, KHÔNG nói, KHÔNG được trụ trì chào.

**Người góp công cũ:**
- Người xem THẬT có tổng đóng góp từ phiên trước, chọn ngẫu nhiên có trọng số theo điểm, ưu tiên người không có mặt trong phiên hiện tại.
- Hiển thị khác biệt rõ: khung tên màu bạc mờ, avatar hơi trong suốt, dòng phụ "đã góp {item}" (hạng mục họ góp nhiều nhất).
- Không tạo sự kiện, không cộng điểm, không được chào như người mới vào.
- Ở lại 5–10 phút rồi đổi người khác.
- Nếu chính người đó vào phòng và tương tác: nhân vật chuyển sang trạng thái người xem thật, kèm lời chào riêng (mục 9C, nhóm `returning`).
- Người xem có thể không muốn hiện lại: admin có danh sách loại trừ.

**Công trường tự chạy** (mọi chế độ, giảm dần khi đông): cờ bay, chim bay ngang, xe trâu NPC chở vật liệu chạy qua mỗi vài phút (khác với xe trâu do quà), ánh sáng thay đổi nhẹ theo giờ thật trong ngày.

## 9C. Lời thoại trụ trì

**Kỹ thuật:**

KHÔNG có câu nói nào viết cứng trong code. Mọi câu chữ mà người xem đọc được đều nằm trong `config/dialogues.json` dưới dạng nhóm, mỗi nhóm chứa **danh sách câu không giới hạn số lượng**. Phạm vi gồm:
- Thoại trụ trì (các nhóm liệt kê bên dưới).
- Mẫu thông báo quà, ví dụ `toast_gift`: "{name} vừa góp {gift}".
- Nhãn nhỏ trên công trường khi một đợt mảnh vừa bay vào công trình (không phải thoại trụ trì), nhóm `piece_burst`. Biến `{material}` là "viên gạch", "viên ngói", "thanh gỗ", "khối đá"… Giống nhóm `gift_*`: không chứa từ ngữ tôn giáo. Câu mặc định:
  - "{name} vừa xây {n} {material}"
  - "+{n} {material} từ {name}"
- Chữ trong lễ hoàn thành, ví dụ `ceremony_title`: "Bia công đức – {item}", và `ceremony_others`: "…và {n} thiện hữu khác".
- Chữ mục tiêu tim, ví dụ `goal_text`: "Đủ {target} tim mở khóa {reward}".
- Bộ đếm đám đông `crowd_counter`, nhãn nghề của NPC `npc_labels`, dòng phụ của người góp công cũ `returning_subtitle`.
- Credit cuối công trình và dải miễn trừ.

Nhãn cố định (tên bảng, tên danh hiệu, tên giai đoạn, tên đơn vị) vẫn nằm trong `config.json` như mục 4.

Cấu trúc một nhóm:

```json
"greet_single": {
  "mode": "shuffle",
  "cooldownSec": 10,
  "lines": [
    { "text": "Chào {name}, mời vào xem công trường.", "tiers": [], "weight": 1, "enabled": true, "verified": true },
    { "text": "{name} đến rồi! Thầy đang thiếu người khiêng gạch đây.", "tiers": ["vang"], "weight": 2, "enabled": true, "verified": true }
  ]
}
```

Các trường của một câu:
- `text`: nội dung câu.
- `tiers`: các chế độ được dùng câu này (mảng rỗng = mọi chế độ).
- `weight`: trọng số, chỉ dùng ở chế độ `random`.
- `enabled`: tắt tạm một câu mà không cần xóa.
- `verified`: câu kiến thức đã được chủ dự án kiểm tra hay chưa.

Chế độ chọn câu `mode`, đặt riêng cho từng nhóm:
- `shuffle` (mặc định): xáo trộn danh sách, dùng lần lượt hết một vòng rồi xáo lại. Không lặp câu cho đến khi dùng hết, và câu cuối vòng cũ không được là câu đầu vòng mới.
- `sequential`: lần lượt theo đúng thứ tự trong danh sách, hết thì quay lại câu đầu.
- `random`: ngẫu nhiên theo `weight`, tránh lặp lại câu vừa nói.

Quy tắc chọn:
- Chỉ chọn trong các câu có `enabled: true`, đúng chế độ độ đông hiện tại, và đủ dữ liệu cho các biến trong câu (ví dụ câu có `{percent}` chỉ dùng khi có giá trị).
- Vị trí đang dùng của `shuffle` và `sequential` được lưu vào DB (bảng `dialogue_state(group, order_json, position)`), nên khởi động lại máy vẫn nói tiếp chứ không quay về câu đầu.
- Khi sửa danh sách câu của một nhóm, vòng của nhóm đó được tạo lại.
- `cooldownSec`: khoảng nghỉ tối thiểu giữa hai lần nói cùng nhóm.
- Nhóm không còn câu hợp lệ: bỏ qua, ghi cảnh báo vào log, không crash.

Biến trong câu: `{name}`, `{names}` (gộp nhiều tên), `{n}`, `{gift}`, `{material}` (tên vật liệu, nhóm `piece_burst`), `{item}` (tên hạng mục), `{stage}` (tên giai đoạn), `{ritual}` (tên lễ), `{itemIndex}`, `{itemTotal}`, `{percent}`, `{count}`, `{target}`, `{reward}`. Biến không hợp lệ phải bị báo lỗi ngay khi lưu trên admin.

Mỗi người chỉ được chào bằng tên tối đa 1 lần/phiên.
- Bong bóng thoại hiện 4–6 giây tùy độ dài. Có hàng đợi; thoại cảm ơn quà ưu tiên hơn thoại tự do. Thoại tự do bị bỏ nếu hàng đợi đang dài.
- Tên người xem trong thoại cũng đi qua bộ lọc tên.
- Admin có trang **Kho thoại**:
  - Danh sách nhóm; trong mỗi nhóm thêm, sửa, xóa, bật/tắt, kéo thả sắp xếp thứ tự câu.
  - Chọn `mode` và `cooldownSec` cho nhóm, chọn `tiers` và `weight` cho từng câu.
  - Nút "nói thử" cho từng câu (hiện trên overlay với dữ liệu mẫu).
  - Cảnh báo ngay khi câu chứa từ cấm (bảng bên dưới) hoặc biến sai.
  - Xuất và nhập kho thoại dạng JSON. Tự backup bản cũ trước mỗi lần lưu.
  - Thay đổi có hiệu lực ngay, không cần khởi động lại.

**Nguyên tắc ngôn ngữ** (Claude Code phải kiểm tra kho thoại mặc định theo các quy tắc này):

| Được dùng | Dùng hạn chế | Cấm |
|---|---|---|
| "thiện hữu", "quý vị", "các con", "thầy" (trụ trì tự xưng), "hoan hỷ", từ ngữ công trường cổ trang | "A Di Đà Phật": chỉ trong nhóm `session_start`, `session_end`, `stage_ritual`, `item_complete` và các nhóm thoại sự kiện `event_*` (mục 14.11). "Tùy hỷ": chỉ khi xong tầng hoặc mốc. "Thí chủ": dùng được vì là game cổ trang | "công đức vô lượng", "phước báu", "tích phúc", "tiêu tai giải nạn", "cầu an", "hồi hướng", "gieo duyên lành", mọi lời hứa may mắn hay bình an; "bần tăng", "bần đạo" |

Quy tắc cứng: các nhóm `gift_*` KHÔNG chứa bất kỳ từ ngữ tôn giáo nào ("A Di Đà Phật", "Phật", "tùy hỷ", "công đức"…). Viết unit test quét kho thoại mặc định theo danh sách từ cấm và từ hạn chế.

**Các nhóm thoại và câu mặc định:**

Các câu bên dưới chỉ là mẫu khởi tạo. Khi tạo `dialogues.json` lần đầu, Claude Code viết thêm để mỗi nhóm có 5–10 câu (nhóm `idle_story` khoảng 15 câu), đúng giọng thầy trụ trì hiền từ, câu ngắn (dưới khoảng 20 chữ), tuân thủ bảng nguyên tắc ngôn ngữ. Tất cả câu do Claude Code viết thêm đặt `verified: false` để chủ dự án duyệt. Mọi nhóm mặc định dùng `mode: "shuffle"`.

`session_start`:
- "A Di Đà Phật. Chào các thiện hữu, hôm nay công trường tiếp tục {item}: {stage}."
- "Trời hôm nay đẹp, thợ đã vào việc. Mời quý vị cùng góp một tay."

`greet_single` (chỉ `vang`, `vua`):
- "Chào {name}, mời vào xem công trường."
- "{name} đến rồi! Thầy đang thiếu người khiêng gạch đây."

`greet_group` (`vua`):
- "Chào {names} và {n} thiện hữu vừa ghé."

`returning` (người góp công cũ quay lại):
- "{name} đã trở lại! Công trường nhớ con lắm."
- "Mừng {name} quay về, {item} đang chờ con."

`gift_small`:
- "Cảm ơn {name} đã góp {gift}!"
- "Thêm gạch từ {name}, cảm ơn con!"

`gift_medium`:
- "Xe trâu của {name} vừa chở đá tới, cảm ơn con!"

`gift_large`:
- "Cảm tạ {name}! Đoàn voi chở gỗ quý đã về công trường."

`gift_huge`:
- "Đại hồng chung mang tên {name} sẽ treo ở gác chuông. Thầy thay mặt công trường cảm tạ."

`gift_thanks_group` (`dong`, `ratdong`):
- "Cảm ơn {n} thiện hữu vừa góp sức!"

`progress` (`dong`, `ratdong`, khi giai đoạn đạt 50%, 80%, 95%):
- "{item}: {stage} đã xong {percent}%, gắng thêm chút nữa!"
- "Giai đoạn {stage} sắp xong rồi, các con cố lên!"

`item_complete`:
- "{item} đã hoàn thành. Thầy hoan hỷ cảm ơn {count} thiện hữu đã góp công!"

`stage_ritual` (giai đoạn có lễ):
- "A Di Đà Phật. Hôm nay công trường làm {ritual} cho {item}. Tùy hỷ cùng tất cả quý vị."
- "Ngày xưa, lễ thượng lương là ngày quan trọng nhất khi dựng một ngôi nhà gỗ."

`idle_story` (thoại tự do, chủ yếu `vang`, `vua`):
- "Ngày xưa, người thợ dựng chùa phải đục từng viên đá bằng tay, mất nhiều tháng mới xong một gian."
- "Mái chùa cong lên ở bốn góc gọi là đầu đao, vừa đẹp vừa giúp nước mưa thoát nhanh."
- "Tháp Phổ Minh ở Nam Định được dựng từ thời Trần, đến nay đã hơn bảy trăm năm."

`idle_howto`:
- "Ai mới vào: tặng quà, thả tim hay bình luận đều được tính công, tên sẽ được khắc lên bia khi xong hạng mục."
- "Đây là trò chơi mô phỏng, mỗi viên gạch quý vị góp sẽ hiện thành công sức trên công trường."

`session_end`:
- "Hôm nay công trường nghỉ sớm. Cảm ơn quý vị đã ghé, hẹn gặp lại ngày mai."
- "Tạm biệt các thiện hữu. A Di Đà Phật."

**Duyệt câu:**
- Khi live thật, chỉ câu có `verified: true` mới được nói. Ở chế độ giả lập thì dùng tất cả, nhưng câu chưa duyệt hiện viền màu cam để dễ nhận ra.
- Admin hiện số câu chưa duyệt của từng nhóm, có nút duyệt từng câu hoặc duyệt cả nhóm.
- Nhóm kiến thức lịch sử (`idle_story`) phải được chủ dự án kiểm tra nội dung kỹ trước khi duyệt.
- Câu do chủ dự án tự thêm qua admin mặc định là đã duyệt.
- Khi live thật mà một nhóm cần dùng chưa có câu nào được duyệt, admin hiện cảnh báo trước khi bắt đầu phiên.

## 10. Các loại lễ

| Loại | Khi nào | Thời lượng | Nội dung |
|---|---|---|---|
| `stage_minor` | Xong một giai đoạn thường | 2–3 giây | Bụi, ánh sáng lóe nhẹ, âm `stage_complete`, tên giai đoạn mới hiện ngắn |
| `stage_ritual` | Xong giai đoạn có `ritual` (khởi công, dựng cột, thượng lương, đặt chóp tháp…) | Khoảng 10 giây | Camera `ceremony`, trụ trì dang tay, bia ghi top 10 người góp trong giai đoạn đó |
| `item_complete` | Xong hạng mục | `nho` 8 giây, `vua` 15 giây, `lon` và tầng 9 bảo tháp 25 giây | Giàn giáo tháo, đèn lồng sáng, bia ghi top 10 người góp của hạng mục; hạng mục `lon` thêm múa lân, pháo hoa, hoa đăng |
| `project_complete` | Xong hạng mục cuối | 60 giây trở lên | Camera `tour` toàn quần thể, lễ khánh thành, credit (14.12) |

**Bia** (`stele.png`):
- Trồi lên trước công trình, kèm bụi đá và bóng đổ dưới chân.
- Tiêu đề lấy từ kho thoại `ceremony_title`, có biến `{item}`, `{stage}`.
- Top 10 người góp nhiều nhất, dòng cuối `…và N thiện hữu khác`. Top 3 màu vàng đồng kèm huy chương; hạng 4–10 màu nâu đỏ sẫm, khắc chìm. Cỡ chữ không nhỏ hơn 32px.
- Kết thúc: bia thu lại, camera chuyển sang hạng mục hoặc giai đoạn kế tiếp.

Admin có trang xem lại bia của mọi giai đoạn có lễ và mọi hạng mục đã xong. Overlay có lệnh (từ admin) để chiếu lại một bia bất kỳ.

## 10A. Âm thanh

**Nguyên tắc chung:**
- Mọi âm thanh nằm trong `/assets/audio`. Chủ dự án chỉ cần **thả file vào đúng thư mục**: game tự quét khi khởi động, và admin có nút "Quét lại" để nhận file mới không cần khởi động lại. Định dạng `.ogg` hoặc `.mp3`.
- Thư mục hoặc nhóm trống thì im lặng, không lỗi. Cảnh báo hiện trên admin.
- Mỗi nhóm hiệu ứng chứa NHIỀU biến thể (ví dụ 5 tiếng đóng đinh khác nhau). Mỗi lần phát chọn một biến thể theo chế độ `shuffle` / `sequential` / `random` như kho thoại (mục 9C), kèm lệch cao độ ngẫu nhiên nhẹ (±5%) để không nghe máy móc.
- Thư viện: Howler.js, đóng gói cục bộ.
- Âm thanh phát từ trang overlay. Hướng dẫn trong README: OBS Browser Source bật "Control audio via OBS". Nếu mở bằng trình duyệt thường, overlay hiện nút "Bật âm thanh" một lần vì trình duyệt chặn tự phát.

**Nội dung bị cấm trong mọi âm thanh:** tiếng tụng kinh, niệm Phật, mõ, nhạc lễ Phật giáo. Nhạc nền dùng nhạc cụ dân tộc không lời (đàn tranh, sáo trúc, đàn bầu, đàn nguyệt, trống). Tiếng chuông chùa chỉ dùng cho mốc hoàn thành tầng và các mốc lớn, KHÔNG dùng làm tiếng nhận quà (riêng nhóm quà `gift_huge` dùng tiếng đúc kim loại và tiếng chuông đồng ngắn, vì món quà là "đúc chuông").

**Bản quyền:** chỉ dùng âm thanh có giấy phép rõ ràng (tự sáng tác, mua bản quyền, hoặc CC0/miễn phí bản quyền có điều khoản cho phép livestream thương mại). Mỗi file phải có một dòng trong `credits.json` (tên file, nguồn, loại giấy phép, link). Admin cảnh báo file chưa có dòng credits. Nhạc vi phạm bản quyền có thể khiến nền tảng tắt tiếng hoặc chặn live.

**Kênh âm lượng** (trong `audio.json`, chỉnh trên admin, có hiệu lực ngay):
- `master`, `music`, `sfx_construction`, `sfx_gift`, `sfx_ui`, `sfx_ceremony`, `ambient`.
- Từng nhóm còn có âm lượng riêng và nút bật/tắt.

**Ducking (hạ nhạc nền):** khi có quà lớn, lễ hoàn thành, múa lân hoặc thông báo quan trọng, nhạc nền tự giảm về khoảng 30% rồi tăng lại mượt trong 1–2 giây.

### Nhạc nền

Mỗi playlist là một thư mục con trong `/assets/audio/music/`. `audio.json` gán playlist cho từng tình huống:

| Tình huống | Playlist mặc định | Ghi chú |
|---|---|---|
| Phòng vắng | `calm/` | Chậm, thư thái |
| Phòng vừa | `normal/` | |
| Phòng đông, rất đông | `lively/` | Nhịp nhanh, có trống |
| Giờ hoàng đạo | `golden_hour/` | |
| Lễ giai đoạn đặc biệt, xong hạng mục | `ceremony/` | Đoạn ngắn 10–20 giây, phát đè lên nhạc đang chạy |
| Khánh thành hạng mục lớn | `milestone/` | |
| Lễ hội mở khóa (mục tiêu tim) | `festival/` | |
| Khánh thành toàn công trình + credit | `finale/` | |

- Chuyển playlist hoặc chuyển bài: crossfade 2–3 giây.
- Thứ tự phát dùng chế độ `shuffle` / `sequential` / `random`, đặt riêng cho từng playlist; vị trí lưu vào DB.
- Đổi chế độ độ đông thì đổi playlist ở cuối bài đang phát, không cắt ngang.
- Admin hiện bài đang phát, có nút chuyển bài và tạm dừng.

### Hiệu ứng âm thanh

Mỗi dòng là một thư mục trong `/assets/audio/sfx/`.

**Thi công** (gắn với hoạt ảnh nhân vật và giai đoạn đang xây):

| Nhóm | Khi phát |
|---|---|
| `dig_shovel` | Đào móng, đào hồ |
| `stone_chisel` | Đục, đập đá: nền móng, đá kê chân cột |
| `wood_saw` | Cưa xẻ gỗ |
| `wood_hammer` | Đóng gỗ, dựng cột (giai đoạn 2) |
| `nail_hammer` | Đóng đinh (thợ mộc) |
| `brick_lay` | Đặt gạch, trát vữa (giai đoạn 3) |
| `pulley_rope` | Ròng rọc, kéo dây khi dựng cột hoặc kéo vật liệu lên cao |
| `tile_place` | Lợp ngói (giai đoạn 4–5) |
| `carry_drop` | Đặt vật liệu xuống đống |
| `scaffold_remove` | Tháo giàn giáo khi xong hạng mục |
| `footsteps` | Nhân vật mới đi vào (chỉ ở chế độ `vang`, `vua`) |

**Quà và tương tác:**

| Nhóm | Khi phát |
|---|---|
| `gift_small` | Quà < 10 xu |
| `gift_logs` | Quà 10–99 xu: tiếng bó gỗ đặt xuống |
| `gift_buffalo` | Xe trâu: bánh xe lăn, tiếng trâu |
| `gift_elephant` | Voi: tiếng voi, bước chân nặng |
| `gift_huge` | Đúc chuông: tiếng kim loại, chuông đồng ngân ngắn |
| `gift_guardian` | Đặt tượng hộ pháp: tiếng đá nặng, trống |
| `like_pop` | Tim: tiếng nhỏ, nhẹ, giới hạn chặt (xem bên dưới) |
| `comment_tick` | Comment được tính công: rất nhẹ, mặc định TẮT |
| `rank_up` | Người xem lên danh hiệu mới |
| `top_change` | Có người mới vào top 3 |

**Giao diện và sự kiện:**

| Nhóm | Khi phát |
|---|---|
| `toast_in` | Thông báo quà lớn hiện ra |
| `abbot_speak` | Bong bóng thoại trụ trì hiện ra (tiếng chuông gió nhẹ) |
| `stage_complete` | Xong một giai đoạn |
| `item_complete` | Xong hạng mục |
| `stele_rise` | Bia đá trồi lên |
| `milestone_bell` | Lễ giai đoạn đặc biệt và khánh thành hạng mục lớn: chuông chùa ngân |
| `lion_dance` | Múa lân khi đạt mục tiêu tim: trống lân, chiêng, chập chả |
| `lantern_release` | Thả hoa đăng |
| `golden_hour_start`, `golden_hour_end` | Bắt đầu, kết thúc giờ hoàng đạo (tiếng cồng) |
| `goal_reached` | Đạt mục tiêu tim |
| `session_start`, `session_end` | Mở, kết phiên |
| `project_complete` | Khánh thành toàn công trình |

### Âm thanh môi trường

Chạy lặp liên tục, mỗi nhóm một thư mục trong `/assets/audio/ambient/`:
- `wind`: gió.
- `birds`: chim hót, phát ngẫu nhiên thưa thớt.
- `wind_chime`: chuông gió xa.
- `site_murmur`: tiếng công trường xa (người nói lao xao, lách cách). Âm lượng tăng theo chế độ độ đông, tắt ở `vang`.
- `night`: côn trùng, dùng khi giờ thật trong ngày là buổi tối (theo `Asia/Ho_Chi_Minh`).

### Giới hạn chống ồn (theo chế độ độ đông)

| Giới hạn | `vang` | `vua` | `dong` | `ratdong` |
|---|---|---|---|---|
| Số hiệu ứng phát cùng lúc tối đa | 6 | 8 | 8 | 8 |
| Âm thi công | Theo từng hoạt ảnh | Tối đa 3 âm/giây | Tối đa 2 âm/giây | Thay bằng `site_murmur` lớn, thi thoảng 1 âm nổi bật |
| `like_pop` | Mỗi lô tim 1 lần | Tối đa 1 lần/2 giây | Tối đa 1 lần/5 giây | Tắt |
| Âm quà | Mọi quà | Mọi quà, gộp quà nhỏ liên tiếp | Quà ≥ 10 xu | Theo cùng ngưỡng của thông báo quà lớn (mục 9A) |

- Mỗi nhóm có `cooldownMs` và `maxConcurrent` riêng.
- Khi vượt giới hạn: bỏ âm có độ ưu tiên thấp. Thứ tự ưu tiên: lễ, mốc > quà lớn > giao diện > quà nhỏ > thi công > tim.
- Hiệu ứng tải sẵn khi mở overlay; nhạc nền phát dạng stream.

## 11. Trang quản trị (`/admin`)

- Chọn nguồn live (`liveSource`), trạng thái kết nối, nhập username kênh, nút kết nối và ngắt. Hiện API key Euler "đã cấu hình / chưa cấu hình", không hiện giá trị key.
- Bật/tắt chế độ giả lập, chỉnh tốc độ; nút bắn thử: quà nhỏ, quà vừa, quà lớn, 1000 tim, comment.
- Sửa toàn bộ config qua form, kiểm tra bằng zod, áp dụng ngay không cần khởi động lại.
- Hiện chế độ độ đông hiện tại và hai chỉ số đầu vào; nút ép chế độ hoặc để tự động (mục 9A).
- Trang Kho thoại: thêm, sửa, xóa, sắp xếp không giới hạn câu cho mỗi nhóm; chọn chế độ `shuffle` / `sequential` / `random`; nói thử; duyệt câu (mục 9C).
- Danh sách người xem không muốn hiện lại dưới dạng người góp công cũ (mục 9B).
- Trang Âm thanh (mục 10A):
  - Thanh trượt âm lượng cho từng kênh và từng nhóm; bật/tắt nhóm.
  - Nút nghe thử từng nhóm và từng file.
  - Gán playlist cho từng tình huống; chọn chế độ phát.
  - Bài đang phát, chuyển bài, tạm dừng nhạc; nút tắt tiếng toàn bộ khẩn cấp.
  - Nút "Quét lại" thư mục âm thanh, danh sách nhóm trống và file thiếu credits.
- Bật giờ hoàng đạo thủ công.
- Đặt mục tiêu tim của phiên.
- Bắt đầu và kết thúc phiên live.
- Thống kê: tổng công đức, hạng mục và giai đoạn hiện tại, trung bình công đức mỗi phiên, ước tính số phiên còn lại.
- Tra cứu người xem theo tên: lịch sử sự kiện, điểm theo từng hạng mục.
- Backup ngay, tải file backup, xuất và nhập JSON.
- Điều chỉnh tay (cộng hoặc trừ điểm cho một người). Phải nhập lý do và được ghi vào bảng events với type `manual`.

## 12. Hiệu năng và ổn định

- Overlay chạy 60fps ổn định với 40 nhân vật; chạy liên tục 8 giờ không rò rỉ bộ nhớ (pool sprite, hủy texture không dùng).
- Backend xử lý được đợt dồn 200 sự kiện/giây mà không mất sự kiện. Hàng đợi hiệu ứng ở overlay có giới hạn và gộp sự kiện khi quá tải.
- Overlay mất kết nối WebSocket: tự kết nối lại và nhận lại toàn bộ state hiện tại.
- Mọi lỗi được ghi log ra file `/data/logs` theo ngày.

## 14. Bổ sung vận hành

**14.1. Môi trường chạy.**
- Máy chạy chính là **Windows 10/11** (đã chốt). Không bắt buộc hỗ trợ macOS/Linux.
- Dùng Node.js bản LTS cài bằng trình cài đặt chính thức. Ưu tiên thư viện có bản dựng sẵn cho Windows, để người dùng không phải cài Visual Studio Build Tools; nếu bắt buộc phải cài thì README hướng dẫn từng bước.
- Đường dẫn file xử lý đúng kiểu Windows (dùng `path.join`, không viết cứng `/`); tên file tiếng Việt có dấu phải đọc được.
- Có file `start.bat` để chạy bằng một cú nhấp đúp; tự mở trang admin trong trình duyệt. Server tự khởi động lại khi bị crash.
- README viết cho người không biết lập trình: cài Node, chạy lần đầu, thêm ảnh, thêm âm thanh, cấu hình OBS.

**14.2. Hồ sơ dữ liệu.**
- Hai hồ sơ tách biệt hoàn toàn: `production` (dữ liệu thật) và `test`, mỗi hồ sơ có DB, avatar và backup riêng. Chọn hồ sơ khi khởi động; admin hiện rõ đang ở hồ sơ nào.
- **Chế độ diễn tập:** dùng hồ sơ `test` kết nối vào live của một kênh bất kỳ để thử với dữ liệu thật mà không làm bẩn dữ liệu chính. Overlay hiện nhãn "DIỄN TẬP".
- Simulator chỉ được chạy ở hồ sơ `test`.

**14.3. Phiên live.**
- Phiên tự bắt đầu khi adapter kết nối được và kênh đang live. Phiên tự kết thúc khi kênh tắt live quá 15 phút (sửa được). Admin vẫn bắt đầu và kết thúc tay được.
- Phiên kết thúc thì trụ trì nói nhóm `session_end`, rồi backup.
- "Top phiên này" tính theo phiên. Trần điểm tim và comment vẫn tính theo ngày (mục 4).

**14.4. Vượt nhiều giai đoạn hoặc nhiều hạng mục một lúc** (quà rất lớn).
- Logic cộng điểm xử lý đúng ngay lập tức. Người tặng được ghi vào `item_contributions` và `stage_contributions` của TỪNG giai đoạn và hạng mục, theo phần điểm rơi vào đó.
- Phần hiển thị phát lần lượt: mỗi giai đoạn thường khoảng 1 giây. Các giai đoạn bị vượt qua thì đặt mảnh theo cụm lớn để mỗi giai đoạn chỉ mất khoảng 1 giây (mục 7, "Xây từng mảnh"). Nếu hàng đợi có nhiều hơn 1 lễ, lễ `stage_ritual` và `item_complete` loại `nho` rút gọn còn khoảng 4 giây. Lễ hạng mục `vua`, `lon` luôn diễn đầy đủ.

**14.5. Hòa điểm.** Trên mọi bảng và bia, người bằng điểm thì ai đạt mức điểm đó trước được xếp trên.

**14.6. Tên quà hiển thị.**
- Biến `{gift}` trong câu là tên vật phẩm trong game theo mức quà, ví dụ "một xe trâu chở đá", không phải tên quà gốc của TikTok (thường là tiếng Anh).
- Tên vật phẩm theo từng mức nằm trong config.
- Có bảng tùy chọn `giftDisplayNames` ánh xạ `giftId` sang tên tiếng Việt, nếu muốn thông báo nhắc cả tên quà gốc.

**14.7. Tên người xem đặc biệt.**
- Chuẩn hóa Unicode (NFKC) để chữ kiểu như "𝓜𝓲𝓷𝓱" hiển thị được.
- Có font dự phòng cho emoji; ký tự không hiển thị được thì bỏ.
- Tên rỗng sau khi lọc hiện `Thiện hữu ẩn danh`.

**14.8. Quản lý người xem** (trên admin).
- **Ẩn danh theo yêu cầu:** người xem nhờ ẩn tên thì admin bật ẩn danh vĩnh viễn cho người đó. Áp dụng cả trên bia cũ và trong credit. Điểm vẫn giữ.
- **Danh sách chặn hiển thị** (người phá rối): không sinh nhân vật, không hiện tên hay avatar ở bất kỳ đâu, trụ trì không nhắc tên. Sự kiện và điểm vẫn ghi để minh bạch.

**14.9. Lệnh bình luận tra cứu.**
- Người xem bình luận một từ khóa (mặc định `hạng` hoặc `công`, sửa trong config) thì overlay hiện thẻ nhỏ khoảng 5 giây: hạng tổng, tổng điểm, hạng mục góp nhiều nhất.
- Mỗi người tối đa 1 lần/60 giây. Bật/tắt được.
- Giúp người xem tự kiểm tra điểm của mình và giảm thắc mắc "tôi tặng mà không thấy tên".

**14.10. Nhật ký thay đổi cấu hình.**
- Mọi thay đổi config (tỉ lệ quy đổi, giá hạng mục, thứ tự hạng mục, ngưỡng…) được ghi lại: thời gian, giá trị cũ, giá trị mới.
- Đổi tỉ lệ quy đổi KHÔNG tính lại điểm đã có.
- Đổi giá chỉ áp dụng cho giai đoạn chưa bắt đầu. Riêng giai đoạn đang xây: admin hỏi xác nhận, và phần trăm tiến độ được tính lại theo giá mới. Không được đổi thứ tự hay xóa hạng mục đã bắt đầu.

**14.11. Lịch sự kiện (có âm lịch).**

Sự kiện khai báo trong `config/events.json`, sửa được trên admin. Mỗi sự kiện có:
- `key`, tên hiển thị.
- Ngày: dương lịch (`solar: "MM-DD"`) hoặc âm lịch (`lunar: "MM-DD"`), hoặc lặp hàng tháng theo âm lịch (`lunarMonthlyDay: 1` hoặc `15`).
- Thời gian: cả ngày (00:00–23:59 giờ Việt Nam) hoặc khung giờ cụ thể.
- `multiplier`: hệ số nhân điểm (mặc định 1 = không thưởng).
- `theme`: trang trí (đèn lồng, hoa sen, trăng tròn trên trời, pháo hoa…).
- `playlist`: playlist nhạc riêng (mục 10A).
- Nhóm thoại riêng: `event_<key>_announce`, `event_<key>_start`, `event_<key>_end` (mục 9C).
- Mục tiêu tim riêng (tùy chọn), hiệu ứng riêng (ví dụ thả hoa đăng định kỳ).

Sự kiện mặc định (chủ dự án chỉnh lại hệ số):

| Sự kiện | Ngày | Hệ số mặc định | Trang trí |
|---|---|---|---|
| Mùng 1 | 1 âm lịch hàng tháng | ×1,5 | Đèn lồng, hoa sen |
| Ngày Rằm | 15 âm lịch hàng tháng | ×2 | Trăng tròn trên trời (khi tối), đèn lồng, thả hoa đăng |
| Rằm tháng Giêng | 15/1 âm | ×3 | Trăng tròn, hoa đăng, pháo hoa |
| Phật Đản | 15/4 âm | ×3 | Hoa sen, đèn lồng, cờ |
| Vu Lan | 15/7 âm | ×2 | Hoa hồng, đèn lồng |
| Tết Trung Thu | 15/8 âm | ×2 | Trăng, đèn ông sao, múa lân |
| Tết Nguyên Đán | 30 tháng Chạp – mùng 3 tháng Giêng âm | ×2 | Hoa đào, câu đối, pháo hoa |
| Cuối tuần | Thứ 7, Chủ nhật, 20:00–22:00 | ×1,5 | — |

Quy tắc:
- **Chuyển đổi âm lịch** dùng thuật toán lịch Việt Nam tính theo múi giờ UTC+7 (thuật toán Hồ Ngọc Đức), chạy offline. KHÔNG dùng thư viện lịch Trung Quốc tính theo UTC+8, vì có những năm lệch ngày so với lịch Việt Nam. Unit test với các ngày đã biết trong 2025–2030, bao gồm tháng nhuận.
- **Nhiều sự kiện trùng ngày** (ví dụ Rằm tháng Giêng cũng là ngày Rằm): lấy hệ số cao nhất, không cộng dồn (sửa được trong config). Trang trí và thoại lấy theo sự kiện có độ ưu tiên cao hơn.
- **Hệ số sự kiện và giờ hoàng đạo:** mặc định nhân với nhau, có trần `maxTotalMultiplier` (mặc định ×4).
- **Báo trước:** từ 1 ngày trước, banner nhỏ đếm ngược "Còn 1 ngày đến Rằm – ×2 công". Trụ trì nói nhóm `event_<key>_announce` vài lần trong phiên.
- Overlay hiện huy hiệu sự kiện đang diễn ra kèm hệ số.
- **Ghi nhận:** mỗi sự kiện trong bảng `events` lưu hệ số đã áp dụng, để tra soát về sau.
- **Admin:** trang Lịch hiện các sự kiện trong 60 ngày tới (cả ngày dương và âm), bật/tắt từng sự kiện, nút "giả lập ngày" để xem thử trang trí và thoại của một sự kiện ở hồ sơ `test`.

Đồ họa sự kiện thêm (tùy chọn, thiếu thì bỏ qua trang trí đó): `bg/moon.png`, `fx/lantern_string.png`, `fx/lotus_lantern.png`, `fx/firework_*.png`, `fx/peach_blossom.png`, `fx/star_lantern.png`.

**14.12. Sau khi xong toàn công trình.**
- Overlay chuyển sang cảnh khánh thành lặp: camera `tour` chậm qua quần thể, credit cuộn chậm.
- Sự kiện vẫn được ghi, với nhãn "sau khánh thành".
- Admin có hai lựa chọn: **Mở rộng chùa** (nối thêm hạng mục mới vào danh sách, cần ảnh bản đồ mở rộng) hoặc **Bắt đầu công trình mới** (lưu trữ toàn bộ dữ liệu cũ, giữ nguyên danh sách người góp công).

**14.13. Kích thước hiển thị.** Thay cho thông số tầng tháp cũ: `maxZoom`, tỉ lệ công trình trong khung hình ở chế độ `site`, vị trí và độ trong suốt các bảng giao diện. Admin có thanh trượt chỉnh trực tiếp và xem ngay trên overlay.

**14.14. Thời tiết và ngày đêm (theo Hà Nội, tự động).**

**Ngày đêm** — tính offline, không cần internet:
- Dùng thư viện `suncalc` với tọa độ Hà Nội (21.0285, 105.8542, đặt trong config).
- Tính giờ mặt trời mọc, lặn và chạng vạng mỗi ngày. Các pha: `rạng sáng` → `ngày` → `hoàng hôn` → `đêm`, chuyển dần mượt trong khoảng 20–40 phút quanh các mốc.
- **Pha mặt trăng** tính bằng `suncalc` theo ngày thật. Đêm Rằm tự có trăng tròn, đầu tháng có trăng khuyết — khớp tự nhiên với lịch sự kiện 14.11.

**Thời tiết** — lấy từ API:
- Server gọi API thời tiết mỗi 15 phút (sửa được). Overlay không gọi trực tiếp.
- Dịch vụ đặt sau một adapter. Mặc định Open-Meteo (không cần key). Lưu ý: gói miễn phí của Open-Meteo, theo hiểu biết hiện tại, chỉ cho mục đích phi thương mại. Kiểm tra điều khoản hiện hành; nếu cần thì dùng gói trả phí hoặc dịch vụ khác có key (key để trong `.env`).
- Chuyển mã thời tiết và tốc độ gió thành trạng thái game:

| Trạng thái | Điều kiện (gợi ý, sửa trong config) |
|---|---|
| `nang` | Trời quang, ban ngày |
| `it_may`, `nhieu_may` | Theo mây che phủ |
| `suong_mu` | Mã sương mù |
| `mua_phun` | Mưa phùn (kiểu mưa xuân Hà Nội) |
| `mua`, `mua_to` | Theo lượng mưa |
| `giong` | Mã dông, sấm sét |
| `bao` | Gió ≥ 60 km/h, hoặc dông kèm mưa to và gió mạnh |

- Cường độ gió (`lặng`, `nhẹ`, `mạnh`) là thông số riêng, kết hợp được với mọi trạng thái.

**Hiển thị** (code vẽ, hầu như không cần ảnh mới):
- **Pha trong ngày:** lớp màu phủ lên trời và nền (sáng vàng, ngày trong, hoàng hôn cam tím, đêm xanh thẫm). Ban đêm: đèn lồng và cửa sổ các công trình đã xong sáng lên, có quầng sáng.
- **Sao:** hạt lấp lánh khi đêm quang mây.
- **Trăng** (`bg/moon.png`, hoặc code tự vẽ nếu thiếu ảnh): mọc và lặn theo giờ, hình dạng theo pha.
- **Mây:** lớp mây trôi, dày mỏng theo độ che phủ, tốc độ theo gió.
- **Mưa:** hạt mưa xiên theo gió, bắn tóe dưới đất; nền tối và bão hòa màu giảm nhẹ.
- **Sương mù:** dải mờ ở chân núi và len giữa các công trình.
- **Gió:** cánh hoa đào bay nhanh và xa hơn, cờ phần phật, cành cây rung.
- **Dông, bão:** chớp lóe sáng toàn màn hình (ngắn, không nhấp nháy liên tục), rung camera rất nhẹ, mưa dày. Màn hình KHÔNG nhấp nháy quá 3 lần/giây, để an toàn cho người nhạy cảm ánh sáng.
- **Nhân vật khi mưa:** đội nón lá và áo tơi. Dùng ảnh phụ `chars/overlay_nonla.png` gắn lên đầu; thiếu ảnh thì bỏ qua.

**Giới hạn:**
- Các bảng giao diện, bia và chữ KHÔNG bị lớp màu thời tiết phủ lên, luôn rõ ràng. Có `maxDarkness` (mặc định 45%) để đêm và bão không làm tối công trình quá mức.
- Thời tiết chỉ là hình ảnh và âm thanh, KHÔNG ảnh hưởng điểm hay tốc độ xây.
- Chuyển trạng thái thời tiết dần dần trong 30–60 giây.
- Số hạt mưa, sao, cánh hoa giảm theo chế độ độ đông (mục 9A) để giữ 60fps.

**Âm thanh và thoại** (bổ sung cho 10A và 9C):
- Ambient mới: `rain_light`, `rain_heavy`, `storm_wind`.
- SFX mới: `thunder`.
- Gió nền to nhỏ theo cường độ gió; ban đêm dùng `night`.
- Có thể gán playlist nhạc riêng cho đêm và cho mưa.
- Nhóm thoại mới: `weather_morning`, `weather_night`, `weather_rain_start`, `weather_storm`, `weather_clear_after_rain`, `weather_full_moon`. Ví dụ: "Trời đổ mưa rồi, các con đội nón vào nhé!", "Đêm nay trăng sáng quá, công trường thắp đèn làm tiếp."

**Lỗi và dự phòng:**
- API lỗi hoặc mất mạng: giữ trạng thái cũ.
- Quá 2 giờ không lấy được dữ liệu: chỉ chạy ngày đêm (offline) với trời quang, và admin hiện cảnh báo.

**Admin:**
- Hiện thời tiết hiện tại, nguồn dữ liệu, lần cập nhật gần nhất.
- Chọn `tự động` hoặc ép một trạng thái thủ công (để thử, hoặc chọn không khí theo ý).
- Thanh trượt cường độ hiệu ứng; bật/tắt từng loại (ví dụ tắt chớp).
- Nút "giả lập giờ" để xem thử đêm hoặc hoàng hôn ở hồ sơ `test`.

## 15. Lộ trình làm (từng giai đoạn, xong một giai đoạn thì dừng lại cho chủ dự án kiểm tra)

**Hiện trạng:** giai đoạn 1, 2, 3 đã xong theo hướng tháp cũ; giai đoạn 4 đang làm dở.

**R. Chuyển hướng sang quần thể chùa** (làm NGAY, trước mọi việc khác):
- **R1. Mô hình dữ liệu:** thay tầng bằng hạng mục và giai đoạn (mục 5, 6), `project.json` với mẫu giai đoạn và danh sách mặc định, migration DB. Nếu chưa có dữ liệu `production` thật thì được phép xóa và tạo lại DB; nếu đã có thì viết migration chuyển đổi. Cập nhật mọi unit test (vượt nhiều giai đoạn hoặc hạng mục, bia giai đoạn, đổi thứ tự hạng mục, nối thêm hạng mục). Cập nhật kho thoại và tên nhóm âm thanh theo thuật ngữ mới. Simulator và overlay tối giản (hình khối tạm) chạy được với mô hình mới.
- **R2. Đồ họa bản đồ:** ghép bản đồ (chồng 308px), phóng to bằng AI, cắt công trình từ `map_built`, lớp tiền cảnh, manifest, trang `/tools/assets` mở rộng (mục 7). Dừng lại cho chủ dự án kiểm tra viền cắt và vị trí.
- **R3. Xây từng mảnh** (mục 7):
  - **R3a.** Trang `/tools/parts`: tự đề xuất vùng theo màu và vị trí, chỉnh bằng cọ tô, tẩy, xem từng vùng. Làm thử với Gác chuông trước, rồi dừng lại cho chủ dự án xem kết quả chia vùng.
  - **R3b.** Sau khi chủ dự án đồng ý: cắt mảnh, gắn giai đoạn với vùng (`build`), mảnh bay vào, cộng dồn công lẻ, đống vật liệu, giàn giáo, hiệu ứng mặt đất. Thay hẳn cách hiện mờ dần của R2 (xóa code không còn dùng).
  - **R3c.** Trang thử: chọn hạng mục và giai đoạn; nút "thả 10 tim", "tặng quà nhỏ", "tặng quà lớn", "tặng quà cực lớn"; hiện số FPS.
- **R4. Camera và bố cục giao diện mới** (mục 8). Kiểm tra với ảnh chụp màn hình live thật.

Sau đó tiếp tục:

4. **Nhân vật, trụ trì, hiệu ứng quà, hàng đợi thông báo** trên bản đồ mới. Gồm: lối đi và vị trí làm việc, chế độ độ đông (9A), dân phu NPC và người góp công cũ (9B), kho thoại và bộ chọn thoại (9C), tên quà hiển thị (14.6), tên đặc biệt (14.7). Phần đã làm của giai đoạn 4 cũ được giữ lại và chuyển sang bản đồ mới.
5. **Các loại lễ và bia (mục 10)**, lễ khánh thành toàn công trình và credit.
5b. **Âm thanh (mục 10A):** quét thư mục, nhạc nền theo playlist và crossfade, hiệu ứng gắn với hoạt ảnh và sự kiện, ducking, giới hạn chống ồn theo chế độ. Có unit test cho bộ chọn biến thể và giới hạn tần suất. Tạo sẵn đủ cây thư mục rỗng kèm `README.txt` trong mỗi thư mục mô tả loại âm thanh cần đặt vào. KHÔNG tự tải âm thanh từ internet.
5c. **Ngày đêm và thời tiết (mục 14.14):** ngày đêm và pha trăng offline trước, rồi adapter thời tiết, hiệu ứng mưa, gió, sương, dông, bão, giới hạn hiển thị và dự phòng khi lỗi. Unit test cho phép chuyển mã thời tiết và cách tính pha trong ngày.
6. **Kết nối TikTok thật:** `TikTokConnectorAdapter` với API key Euler Stream từ `.env`, kết nối lại, chống trùng, xử lý combo quà, tải avatar, hiển thị trạng thái và lỗi trên admin. Thử với một kênh đang live bất kỳ (hồ sơ `test`) trước khi dùng cho kênh chính. Adapter `euler-ws` và `tikfinity` chỉ làm khi chủ dự án yêu cầu.
7. **Trang admin, backup, xuất/nhập**, quản lý người xem (14.8), lệnh bình luận tra cứu (14.9), lịch sự kiện (14.11), sau khánh thành và mở rộng (14.12), chỉnh hiển thị (14.13), trình sửa danh sách hạng mục và giai đoạn.
8. **Kiểm thử chịu tải:** simulator chạy 8 giờ, đo fps và bộ nhớ, sửa lỗi.

Sau mỗi giai đoạn: chạy test, cập nhật `README.md`, commit git, tóm tắt cho chủ dự án những gì đã làm và cần kiểm tra gì.

## 16. Nhật ký quyết định

Các quyết định dưới đây được ưu tiên hơn chữ ở các mục trên nếu hai bên khác nhau.

**2026-11-10 (bản tháp cũ, chủ dự án xác nhận giữ nguyên cho quần thể chùa ngày 2026-11-11):**
1. Node.js 24 LTS (code cần tối thiểu 22.12, nên mục 1 ghi "Node.js 20+" không còn đúng).
2. Hệ số nhân áp dụng cho mọi nguồn; trần tim + comment tính trên điểm gốc (mục 4).
3. Làm tròn từng sự kiện, từ 0,5 trở lên làm tròn lên (mục 4).
4. Giá làm tròn đến hàng trăm: nay là giá từng giai đoạn (`costRoundTo` trong `project.json`).
5. Giữ cân đối điểm; quà rất lớn vẫn được vượt nhiều giai đoạn và hạng mục (14.4).
6. "Giờ hoàng đạo" là khung giờ tự đặt; nhãn mặc định "Giờ vàng" (mục 4).
7. Danh hiệu dùng từ công trường: Thợ phụ, Thợ cả, Đốc công, Đại đốc công, Tổng công trình sư (thay cho Thí chủ, Cư sĩ, Hộ pháp… ở mục 9, vì danh hiệu lên theo quà không được dùng từ nhà Phật). "Bia công đức" → "Bia ghi danh" (mục 9C, 10). Vẫn đổi được trong config.
8. Dữ liệu tách theo hồ sơ `data/production/`, `data/test/`, mỗi hồ sơ có `backups/` riêng; config dùng chung; `start.bat` và `start-test.bat` (14.2).
9. Không làm `start.sh` (14.1).
10. Đổi giá giai đoạn đang xây (14.10): điểm đã góp giữ nguyên; giá mới ≤ điểm đã có thì giai đoạn xong ngay, phần dư chuyển sang giai đoạn sau; giá mới cao hơn thì phần trăm tụt. Không xác nhận thì giai đoạn đang xây giữ giá cũ, giai đoạn sau dùng giá mới.
11. Tết tính từ ngày cuối tháng Chạp (có năm tháng Chạp chỉ có 29 ngày), không viết cứng "30 tháng Chạp" (14.11).
12. Cộng điểm tay có ô "tính vào công trình"; trừ tay không làm công trình lùi (mục 11).
13. Trụ trì hiển thị "Thầy trụ trì", không tên riêng (mục 9).
14. Không có mục 13 (đánh số nhảy, không sót nội dung).
- Mặc định khác: config mặc định trong `config/defaults/`; giữ 30 bản backup; comment lệnh tra cứu vẫn tính công; ngưỡng "quà rất lớn" ≥ 1.000 xu.

**2026-11-11 (đổi hướng sang quần thể chùa, trước R1):**
15. Tượng ghi danh cho quà ≥ 5.000 xu hiển thị là "tượng võ tướng đá" (ảnh `honor_statues` là 3 tượng võ tướng), không dùng "tượng hộ pháp" vì gắn với quà.
16. `game_state` lưu hạng mục đang xây bằng `current_item_id` (không bằng số thứ tự), đúng tinh thần "nhận diện bằng id" của mục 6.
17. Giá mặc định (đơn vị 20.000 công): San nền 2, Bệ cây bồ đề 2, Sân gạch 3, Cổng tam quan 8, Hồ sen 3, Cầu đá 2, Tường bao 3, Gác chuông 6, Gác trống 6, Đôi sư tử đá 2, Chính điện & Tiền đường 40, Hành lang Tây 6, Hành lang Đông 6, Nhà tổ 8, mỗi tầng bảo tháp 4. Tổng 133 đơn vị = 2.660.000 công, 168 giai đoạn.
18. Tên 5 giai đoạn của từng hạng mục `nho` và cách hiển thị mặc định của từng giai đoạn (nay là `build`, xem quyết định 24) do Claude Code đặt (sửa được trong `project.json`). Tầng 9 bảo tháp dùng `size: lon` để lễ xong hạng mục dài 25 giây như mục 10.
19. Chú tiểu (tu sĩ) chỉ dùng làm NPC không tên; nhân vật của người xem không dùng hình chú tiểu.
20. Ảnh gốc giữ nguyên tên tiếng Việt trong `assets/raw/`; script dựng ảnh dùng bảng ánh xạ tên ở mục 7 → file thật. `tower_spire.png` còn ở thư mục gốc: bỏ qua, không dùng. `promo_ceremony.png` chỉ là ảnh tham khảo.
21. Ghi chú "đã code tới giữa giai đoạn 4" ở đầu file không đúng: bản tháp mới xong giai đoạn 3 (tag `thap-100-tang`), không có phần giai đoạn 4 cũ để chuyển sang.
22. R1: chưa có dữ liệu production thật nên DB tháp cũ được đổi tên thành `game.thap-cu.db` (giữ lại), game tạo DB mới; `config.json` cũ tự được dọn các khóa của tháp.
23. Không đưa code lên GitHub khi chưa được chủ dự án đồng ý (repo đang công khai).

**2026-11-11 (sau R2):**
24. Đổi cách hiển thị tiến độ giai đoạn: bỏ kiểu hiện mờ dần / lộ dần (`visual.kind`), chuyển sang **xây từng mảnh** (mục 7). Trường `visual` của giai đoạn thay bằng `build` (mục 5). Lộ trình R3 sửa theo (mục 15).
25. `build` có thêm: `part` ghi được nhiều vùng; `part: matdat` với `look` = `coc` / `dao` / `dong`; `band` chia vùng theo chiều cao. Thêm vùng `nuoc` (mặt nước hồ sen). Quà rất lớn vượt nhiều giai đoạn: đặt mảnh theo cụm lớn, mỗi giai đoạn khoảng 1 giây (14.4). Tốc độ đặt mảnh: `vang` 20, `vua` 20, `dong` 14, `ratdong` 10 mảnh/giây.
26. Trong R3 chưa có nhân vật: mảnh bay từ đống vật liệu; tim, bình luận chưa đủ một mảnh thì vật liệu bay từ mép công trường ra đống. Dân phu khiêng làm ở giai đoạn 4.
