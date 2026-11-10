# ĐẶC TẢ DỰ ÁN: BẢO THÁP THIÊN PHÚC – Game livestream xây tháp 100 tầng

> File này là nguồn sự thật duy nhất của dự án. Khi có mâu thuẫn giữa code và file này, hỏi chủ dự án trước khi tự quyết.

## 0. Tóm tắt

Overlay game cho livestream dọc 9:16 (1080×1920). Người xem tặng quà, thả tim, bình luận để "góp công đức". Điểm này dùng để xây dần một bảo tháp 100 tầng. Mỗi tầng có 5 giai đoạn thi công với đồ họa riêng. Người xem xuất hiện thành nhân vật mang avatar và tên của họ, đi lại xây tháp. Công đức được lưu vĩnh viễn để live liên tục nhiều tháng đến khi xong tháp.

**Nguyên tắc nội dung (bắt buộc):**
- Đây là TRÒ CHƠI MÔ PHỎNG. Luôn hiển thị dải chữ cố định: `Trò chơi mô phỏng xây tháp – không phải quyên góp tôn giáo`.
- Không có câu chữ nào hứa hẹn phước báu, may mắn, công đức thật. Lời thoại chỉ cảm ơn và ghi danh.
- Tượng Phật trong nền là tĩnh, không phản ứng với quà. Không dùng chữ "Thích" trong tên trụ trì.
- Không bao giờ hiển thị comment, người xem hay quà giả khi live thật (chế độ giả lập phải hiện nhãn "CHẾ ĐỘ THỬ").
- KHÔNG có bot giả làm người xem: không nhân vật nào mang tên hoặc avatar giả, không comment giả, không quà giả, không tên giả trên bảng xếp hạng. Phòng vắng được làm sống động bằng dân phu NPC không tên và "người góp công cũ" có thật (mục 9B).
- Từ ngữ nhà Phật KHÔNG được gắn với việc tặng quà. Khi nhận quà chỉ cảm ơn và ghi danh. Chi tiết ở mục 9C.

## 1. Công nghệ

- Node.js 24 LTS (tối thiểu 22.12), TypeScript, npm.
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
/data/<hồ sơ>/   game.db, avatars/, backups/, logs/ — mỗi hồ sơ (production, test) một thư mục (thêm vào .gitignore)
/config/defaults/       bản mặc định của các file config (có trên git)
/config/config.json     cấu hình game (sửa được qua admin, tạo từ bản mặc định ở lần chạy đầu, không đưa lên git, được backup cùng DB)
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
- "Giờ hoàng đạo": hệ số nhân (mặc định ×2), bật tay từ admin hoặc theo lịch trong config, có đồng hồ đếm ngược trên overlay. "Lịch" là các khung giờ chủ dự án tự đặt (ví dụ 20:00–21:00 thứ Sáu), KHÔNG tính theo can chi. Nhãn hiển thị mặc định: **"Giờ vàng"** (tránh nghĩa may mắn).
- Hệ số nhân (giờ vàng, sự kiện 14.11) áp dụng cho MỌI nguồn: quà, tim, comment.
- Trần 2.000/ngày tính trên điểm GỐC (trước khi nhân). Ví dụ giờ vàng ×2: người thả tim nhiều nhận tối đa 4.000 công trong ngày.
- Làm tròn sau khi nhân: làm tròn từng sự kiện, từ 0,5 trở lên làm tròn lên (1 tim × 1,5 = 2 công).
- Comment là lệnh tra cứu (14.9) vẫn được tính công như comment thường.
- Mọi phép cộng điểm đi qua MỘT hàm thuần trong `/shared` và có unit test.

## 5. Tiến độ xây tháp

- **Tầng 0 = nền móng**, 5 giai đoạn: dọn mặt bằng → đào móng → đóng cọc → xây bệ đá → hoàn thiện bệ.
- **Tầng 1–100**, mỗi tầng 5 giai đoạn: (1) sàn và mái hiên, (2) dựng cột, (3) xây tường, (4) lắp cửa, (5) hoàn thiện.
- Tỉ lệ giai đoạn mặc định `[20,20,20,20,20]` (% công đức của tầng).

Giá mỗi tầng:
- `foundationCost` mặc định 10.000.
- Tầng 1 = `baseFloorCost` (mặc định 20.000).
- Mỗi nhóm 10 tầng tăng `tierIncreasePct` (mặc định 25%) so với nhóm trước. Giá làm tròn đến hàng trăm (39.062,5 → 39.100). Với mặc định, cả tháp cần khoảng 6,66 triệu công (≈ 66.600 xu nếu chỉ tính quà).
- Cho phép ghi đè giá từng tầng bằng danh sách cụ thể trong config.
- Trang admin hiển thị tổng công đức cần cho cả tháp và ước tính số phiên live dựa trên trung bình thực tế.

Quy tắc chuyển tầng:
- Điểm dư khi xong một tầng chuyển sang tầng kế tiếp.
- Sự kiện vẫn được ghi nhận bình thường trong lúc diễn lễ hoàn thành; lễ chỉ là phần hiển thị.
- Mốc tầng 10, 20, …, 90: lễ lớn (hiệu ứng mạnh hơn, thời gian dài hơn).
- Tầng 100 xong: đặt chóp tháp, lễ khánh thành, sau đó cuộn danh sách TẤT CẢ người góp công như credit cuối phim.

## 6. Lưu trữ (phải chạy được cả năm)

SQLite WAL. Các bảng tối thiểu:

- `users(platform_id PK, unique_id, nickname, avatar_url, avatar_file, total_points, gift_points, like_points, comment_points, first_seen, last_seen)`
- `events(id, ts, session_id, platform_id, type, payload_json, points, floor, stage)`: nhật ký đầy đủ để tra soát khi có người hỏi "tôi tặng mà không thấy tên".
- `floor_contributions(floor, platform_id, points, PK(floor, platform_id))`
- `daily_caps(day, platform_id, like_comment_points)`
- `game_state(id=1, current_floor, current_stage, floor_points, total_points, started_at, completed_at)`
- `sessions(id, started_at, ended_at)`

Yêu cầu:
- Mỗi sự kiện được ghi trong một transaction, cập nhật user, contributions và state cùng lúc.
- Tắt máy rồi bật lại thì tiếp tục đúng tầng, đúng giai đoạn, đúng phần trăm.
- Backup tự động file DB mỗi ngày và mỗi khi kết thúc phiên vào `/data/<hồ sơ>/backups`, giữ tổng cộng 30 bản gần nhất (gồm cả bản hằng ngày và bản cuối phiên).
- Bảng bổ sung (ngoài danh sách trên): `session_contributions` (điểm theo phiên, cho "Top phiên này"), `floors` (giá tầng chốt lúc bắt đầu xây), `config_changes` (14.10). Bảng `events` lưu thêm mã sự kiện của nền tảng (chống trùng) và hệ số đã áp dụng (14.11).
- Admin có nút xuất JSON toàn bộ và nhập lại (có xác nhận).
- Avatar: tải về `/data/avatars/<platformId>.jpg` ở lần đầu thấy và làm mới định kỳ (link avatar của nền tảng hết hạn). Lỗi tải thì dùng avatar mặc định.

## 7. Đồ họa và manifest

Chủ dự án tự tách nền và cắt ảnh. Ảnh đặt trong `/assets/game` với tên như sau:

```
bg/background.png                 nền sạch có bệ móng (1080×1920)
bg/sky_upper.png                  trời nối phía trên nền
tower/floor_stage_1.png … floor_stage_5.png
tower/spire.png
tower/foundation_stage_1.png … 5 (nếu chưa có thì vẽ tạm bằng đạo cụ đá, gạch)
chars/worker_m_idle.png, worker_m_walk_1..3.png, worker_m_carry_brick.png, worker_m_carry_baskets.png
chars/worker_f_* (tương tự), chars/monk_* , chars/carpenter_1..2.png, chars/mason_1..2.png
abbot/abbot_pray.png, abbot_wave.png, abbot_bow.png, abbot_welcome.png
ui/banner.png, ui/progress_frame.png, ui/progress_fill.png, ui/step_empty.png, ui/step_current.png, ui/step_done.png
ui/panel_tall.png, ui/panel_square.png, ui/medal_gold.png, medal_silver.png, medal_bronze.png
ui/title_1.png … title_5.png, ui/avatar_frame.png
items/brick.png, logs.png, buffalo_cart.png, elephant.png, bell.png, guardian.png
stele/stele.png
```

`assets/manifest.json` khai báo cho mỗi ảnh: đường dẫn, **điểm neo** (anchor) và các thông số căn chỉnh. Riêng 5 ảnh tầng phải có:
- `eaveLineY`: vị trí mép dưới dải ngói (điểm neo chung).
- `topY`: mép trên phẳng, nơi tầng sau đặt lên.

Ảnh giai đoạn 5 có đèn lồng thòng xuống nên cao hơn các ảnh khác. Vì vậy căn theo `eaveLineY`, KHÔNG căn theo mép ảnh.

- Thiếu ảnh nào thì vẽ hình chữ nhật màu tạm kèm tên file, game không được crash.
- Viết `scripts/slice-sheet.ts` (dùng `sharp`): cắt một sprite sheet nền trong suốt thành các ảnh riêng, dựa trên khoảng trống trong suốt giữa các hình. Thêm tùy chọn đệm (padding) để mọi khung trong một nhóm có cùng kích thước và chân thẳng hàng.

## 8. Bố cục overlay (1080×1920)

**Vùng an toàn** (nền tảng tự vẽ giao diện ở đây, overlay KHÔNG đặt thông tin quan trọng):
- Trên: 180px.
- Dưới: 600px (khu comment của nền tảng).
- Phải: 150px.

Ba giá trị này nằm trong config. Có phím tắt `D` để bật khung debug tô màu các vùng này.

Các lớp từ sau ra trước:
1. **Trời** (2 ảnh nối nhau): parallax 0.25 so với camera. Chỗ nối chồng nhau khoảng 150px, có mặt nạ mờ dần để không lộ vệt.
2. **Nền**: parallax 0.5.
3. **Tháp**: các tầng xếp chồng. Tầng n được scale `towerTaper^n` (mặc định 0.995) so với tầng 1, căn giữa theo trục dọc. Tầng đang xây hiển thị đúng ảnh giai đoạn hiện tại, các tầng dưới dùng ảnh giai đoạn 5. Khi đổi giai đoạn: hiệu ứng bụi và chớp sáng nhẹ.
4. **Nhân vật và đạo cụ.**
5. **Hiệu ứng**: chữ "+công" bay lên, cánh hoa, hoa đăng, hào quang.
6. **Giao diện.**

**Camera:** bám theo tầng đang xây, giữ tầng đó ở khoảng 45% chiều cao màn hình, chuyển động mượt (lerp). Khi tháp còn thấp, camera đứng yên ở cảnh nền.

**Giao diện** (chữ do code vẽ, không dùng chữ trong ảnh):
- **Banner trên giữa:** `Tầng 27/100`, tên giai đoạn, thanh 5 bước, % của tầng.
- **Minimap trái:** hình tháp thu nhỏ, đánh dấu tầng hiện tại, vạch mốc mỗi 10 tầng.
- **Bảng phải, luân phiên 15 giây:** Top phiên này (top 5, tính theo phiên live hiện tại, xem mục 14.3) → Top tổng (top 10) → Bia ghi danh tầng hiện tại (top 5). Mỗi dòng có avatar tròn, tên, điểm, huy chương cho top 3.
- **Ô sự kiện:** mục tiêu tim của phiên (ví dụ 10.000 tim mở khóa hiệu ứng lễ hội), hoặc đồng hồ giờ hoàng đạo.
- **Thông báo quà lớn:** bật lên khoảng 4 giây kèm avatar và tên người tặng. Có hàng đợi; quà lớn được ưu tiên, quà nhỏ liên tiếp của cùng một người được gộp lại.
- **Dải miễn trừ cố định**, đặt ngay trên vùng an toàn phía dưới.
- **Lọc tên:** danh sách từ cấm trong config. Tên vi phạm hiển thị `Thiện hữu ẩn danh`.

## 9. Nhân vật

- Khi nào tạo nhân vật cho người xem phụ thuộc chế độ độ đông (mục 9A). Nhân vật có giới tính và kiểu ngẫu nhiên nhưng cố định theo `platformId`, đi từ mép màn hình vào công trường.
- Trên đầu nhân vật: avatar tròn, tên (cắt bớt nếu dài hơn 14 ký tự), huy hiệu danh hiệu.
- Hành vi: đi lại giữa đống vật liệu và tầng đang xây, mang gạch hoặc gỗ, làm động tác phù hợp với giai đoạn (dựng cột → khiêng gỗ, xây tường → thợ nề…).
- Thả tim: nhân vật đó làm nhanh hơn trong vài giây, có chữ "+công" bay lên.
- Không tương tác quá thời gian quy định của chế độ hiện tại (mục 9A): nhân vật đi ra khỏi màn hình.
- Tối đa `maxCharacters` (mặc định 40) cùng lúc, tính cả NPC và người góp công cũ. Khi đầy: NPC rời trước, rồi người góp công cũ, rồi người thật tương tác lâu nhất và góp ít nhất.

**Danh hiệu** theo tổng công đức tích lũy (sửa được trong config). Dùng từ công trường cổ trang, không dùng từ nhà Phật vì danh hiệu đạt được chủ yếu nhờ tặng quà (mục 0):
- Thợ phụ: ≥ 1.000
- Thợ cả: ≥ 10.000
- Đốc công: ≥ 100.000
- Đại đốc công: ≥ 1.000.000
- Tổng công trình sư: ≥ 10.000.000

**Hiệu ứng theo giá trị một lần tặng** (đơn vị xu nền tảng, sửa được):
- < 10: nhân vật khiêng một viên gạch.
- 10–99: bó gỗ.
- 100–499: xe trâu chở đá chạy ngang công trường.
- 500–999: voi chở gỗ.
- 1.000–4.999: đúc đại hồng chung; chuông lắc và ngân.
- ≥ 5.000: tượng nghê đá mang tên người tặng (ảnh `items/guardian.png`), đặt vĩnh viễn cạnh chân tháp. Lưu vào DB, tối đa một số lượng nhất định, xoay vòng hiển thị.

**Trụ trì (NPC):** đứng góc trái, phía trên vùng comment. Không có tên riêng, hiển thị "Thầy trụ trì" (config `abbotName`).
- Mặc định dáng chắp tay.
- Quà ≥ 100 xu: dáng vẫy chào và bong bóng thoại cảm ơn.
- Xong tầng: dáng dang tay.
- Cảm ơn quà rất lớn (mặc định ≥ 1.000 xu, sửa trong config): dáng cúi chào.

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
| Thoại tự do (kể chuyện, kiến thức, hướng dẫn) | Mỗi 60–90 giây | Mỗi 2–3 phút | Mỗi 5 phút, chủ yếu báo tiến độ | Chỉ khi tới mốc % của tầng |
| Thông báo quà dạng lớn | Mọi quà, trụ trì cúi chào | Mọi quà, gộp quà nhỏ liên tiếp | Quà ≥ 100 xu; quà nhỏ chỉ hiện "+công" kèm tên | Quà thuộc top 10% giá trị trong 5 phút gần nhất, tối thiểu 500 xu |
| Mục tiêu tim của phiên | 500 | 5.000 | 10.000 | 50.000, nhiều nấc |
| Dân phu NPC | 6–8 | 3–4 | 0 | 0 |
| Người góp công cũ | 5–10 | 2–3 | 0 | 0 |
| Hiệu ứng | Đầy đủ, chậm rãi | Đầy đủ | Rút gọn, gộp | Tối giản, ưu tiên 60fps |
| Camera | Thỉnh thoảng lia toàn tháp (mỗi 3 phút) | Bám tầng đang xây | Bám tầng đang xây | Bám tầng, rung nhẹ khi có quà lớn |

Mục tiêu tim: khi bắt đầu phiên, lấy theo chế độ lúc đó. Nếu chế độ tăng trong phiên và mục tiêu đã đạt, mở nấc mục tiêu tiếp theo của chế độ mới. Mục tiêu đặt tay từ admin luôn được ưu tiên.

## 9B. Dân phu NPC và người góp công cũ (thay cho bot)

**Dân phu NPC:**
- Nhân vật nền của game: không avatar, không tên người. Nhãn trên đầu, nếu có, chỉ là nghề: "Dân phu", "Thợ mộc", "Thợ nề".
- Làm việc theo giai đoạn thi công như nhân vật người xem nhưng chậm hơn. KHÔNG đóng góp điểm, KHÔNG xuất hiện trên bảng xếp hạng, KHÔNG nói, KHÔNG được trụ trì chào.

**Người góp công cũ:**
- Người xem THẬT có tổng đóng góp từ phiên trước, chọn ngẫu nhiên có trọng số theo điểm, ưu tiên người không có mặt trong phiên hiện tại.
- Hiển thị khác biệt rõ: khung tên màu bạc mờ, avatar hơi trong suốt, dòng phụ "đã góp tầng {floor}" (tầng họ góp nhiều nhất).
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
- Chữ trong lễ hoàn thành, ví dụ `ceremony_title`: "Bia ghi danh – Tầng {floor}", và `ceremony_others`: "…và {n} thiện hữu khác".
- Chữ mục tiêu tim, ví dụ `goal_text`: "Đủ {target} tim mở khóa {reward}".
- Bộ đếm đám đông `crowd_counter`, nhãn nghề của NPC `npc_labels`, dòng phụ của người góp công cũ `returning_subtitle`.
- Credit cuối tháp và dải miễn trừ.

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

Biến trong câu: `{name}`, `{names}` (gộp nhiều tên), `{n}`, `{gift}`, `{floor}`, `{percent}`, `{count}`, `{target}`, `{reward}`. Biến không hợp lệ phải bị báo lỗi ngay khi lưu trên admin.

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
| "thiện hữu", "quý vị", "các con", "thầy" (trụ trì tự xưng), "hoan hỷ", từ ngữ công trường cổ trang | "A Di Đà Phật": chỉ trong nhóm `session_start`, `session_end`, `floor_complete`, `milestone` và các nhóm thoại sự kiện `event_*` (mục 14.11). "Tùy hỷ": chỉ khi xong tầng hoặc mốc. "Thí chủ": dùng được vì là game cổ trang | "công đức vô lượng", "phước báu", "tích phúc", "tiêu tai giải nạn", "cầu an", "hồi hướng", "gieo duyên lành", mọi lời hứa may mắn hay bình an; "bần tăng", "bần đạo" |

Quy tắc cứng: các nhóm `gift_*` KHÔNG chứa bất kỳ từ ngữ tôn giáo nào ("A Di Đà Phật", "Phật", "tùy hỷ", "công đức"…). Viết unit test quét kho thoại mặc định theo danh sách từ cấm và từ hạn chế.

**Các nhóm thoại và câu mặc định:**

Các câu bên dưới chỉ là mẫu khởi tạo. Khi tạo `dialogues.json` lần đầu, Claude Code viết thêm để mỗi nhóm có 5–10 câu (nhóm `idle_story` khoảng 15 câu), đúng giọng thầy trụ trì hiền từ, câu ngắn (dưới khoảng 20 chữ), tuân thủ bảng nguyên tắc ngôn ngữ. Tất cả câu do Claude Code viết thêm đặt `verified: false` để chủ dự án duyệt. Mọi nhóm mặc định dùng `mode: "shuffle"`.

`session_start`:
- "A Di Đà Phật. Chào các thiện hữu, hôm nay công trường tiếp tục dựng tầng {floor}."
- "Trời hôm nay đẹp, thợ đã vào việc. Mời quý vị cùng góp một tay."

`greet_single` (chỉ `vang`, `vua`):
- "Chào {name}, mời vào xem công trường."
- "{name} đến rồi! Thầy đang thiếu người khiêng gạch đây."

`greet_group` (`vua`):
- "Chào {names} và {n} thiện hữu vừa ghé."

`returning` (người góp công cũ quay lại):
- "{name} đã trở lại! Công trường nhớ con lắm."
- "Mừng {name} quay về, tầng {floor} đang chờ con."

`gift_small`:
- "Cảm ơn {name} đã góp {gift}!"
- "Thêm gạch từ {name}, cảm ơn con!"

`gift_medium`:
- "Xe trâu của {name} vừa chở đá tới, cảm ơn con!"

`gift_large`:
- "Cảm tạ {name}! Đoàn voi chở gỗ quý đã về công trường."

`gift_huge`:
- "Đại hồng chung mang tên {name} sẽ treo trên tháp. Thầy thay mặt công trường cảm tạ."

`gift_thanks_group` (`dong`, `ratdong`):
- "Cảm ơn {n} thiện hữu vừa góp sức!"

`progress` (`dong`, `ratdong`, khi tầng đạt 50%, 80%, 95%):
- "Tầng {floor} đã xong {percent}%, gắng thêm chút nữa!"
- "Thợ đang lợp ngói rồi, sắp hoàn thành tầng!"

`floor_complete`:
- "Tầng {floor} đã hoàn thành. Thầy hoan hỷ cảm ơn {count} thiện hữu đã góp công!"

`milestone` (tầng 10, 20, …):
- "A Di Đà Phật. Tầng {floor} hoàn thành, đại hồng chung sẽ được treo lên. Tùy hỷ cùng tất cả quý vị."

`idle_story` (thoại tự do, chủ yếu `vang`, `vua`):
- "Ngày xưa, người thợ dựng tháp phải đục từng viên đá bằng tay, mất nhiều tháng mới xong một tầng."
- "Mái chùa cong lên ở bốn góc gọi là đầu đao, vừa đẹp vừa giúp nước mưa thoát nhanh."
- "Tháp Phổ Minh ở Nam Định được dựng từ thời Trần, đến nay đã hơn bảy trăm năm."

`idle_howto`:
- "Ai mới vào: tặng quà, thả tim hay bình luận đều được tính công, tên sẽ được khắc lên bia khi xong tầng."
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

## 10. Lễ hoàn thành tầng

Diễn khoảng 10 giây (khoảng 20 giây ở các mốc chục tầng):
1. Camera dừng ở tầng vừa xong, giàn giáo biến mất, đèn lồng sáng.
2. Bia đá (`stele.png`) trồi lên trước tháp, kèm bụi đá và bóng đổ dưới chân.
3. Trên bia: `Bia ghi danh – Tầng X`, top 10 người góp nhiều nhất của tầng đó, dòng cuối `…và N thiện hữu khác`. Top 3 màu vàng đồng kèm huy chương; hạng 4–10 màu nâu đỏ sẫm, có hiệu ứng khắc chìm. Cỡ chữ không nhỏ hơn 32px.
4. Hoa đăng bay lên, cánh hoa rơi, trụ trì dang tay.
5. Bia thu lại, camera lia lên tầng mới.

Admin có trang xem lại bia của mọi tầng đã xong. Overlay có lệnh (từ admin) để chiếu lại bia của một tầng bất kỳ.

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
| Lễ hoàn thành tầng | `ceremony/` | Đoạn ngắn 10–20 giây, phát đè lên nhạc đang chạy |
| Mốc chục tầng | `milestone/` | |
| Lễ hội mở khóa (mục tiêu tim) | `festival/` | |
| Khánh thành tầng 100 + credit | `finale/` | |

- Chuyển playlist hoặc chuyển bài: crossfade 2–3 giây.
- Thứ tự phát dùng chế độ `shuffle` / `sequential` / `random`, đặt riêng cho từng playlist; vị trí lưu vào DB.
- Đổi chế độ độ đông thì đổi playlist ở cuối bài đang phát, không cắt ngang.
- Admin hiện bài đang phát, có nút chuyển bài và tạm dừng.

### Hiệu ứng âm thanh

Mỗi dòng là một thư mục trong `/assets/audio/sfx/`.

**Thi công** (gắn với hoạt ảnh nhân vật và giai đoạn đang xây):

| Nhóm | Khi phát |
|---|---|
| `dig_shovel` | Đào móng (tầng 0) |
| `stone_chisel` | Đục, đập đá: nền móng, đá kê chân cột |
| `wood_saw` | Cưa xẻ gỗ |
| `wood_hammer` | Đóng gỗ, dựng cột (giai đoạn 2) |
| `nail_hammer` | Đóng đinh (thợ mộc) |
| `brick_lay` | Đặt gạch, trát vữa (giai đoạn 3) |
| `pulley_rope` | Ròng rọc, kéo dây khi dựng cột hoặc kéo vật liệu lên cao |
| `tile_place` | Lợp ngói (giai đoạn 4–5) |
| `carry_drop` | Đặt vật liệu xuống đống |
| `scaffold_remove` | Tháo giàn giáo khi xong tầng |
| `footsteps` | Nhân vật mới đi vào (chỉ ở chế độ `vang`, `vua`) |

**Quà và tương tác:**

| Nhóm | Khi phát |
|---|---|
| `gift_small` | Quà < 10 xu |
| `gift_logs` | Quà 10–99 xu: tiếng bó gỗ đặt xuống |
| `gift_buffalo` | Xe trâu: bánh xe lăn, tiếng trâu |
| `gift_elephant` | Voi: tiếng voi, bước chân nặng |
| `gift_huge` | Đúc chuông: tiếng kim loại, chuông đồng ngân ngắn |
| `gift_guardian` | Đặt tượng nghê đá: tiếng đá nặng, trống |
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
| `floor_complete` | Xong tầng |
| `stele_rise` | Bia đá trồi lên |
| `milestone_bell` | Mốc chục tầng: chuông chùa ngân |
| `lion_dance` | Múa lân khi đạt mục tiêu tim: trống lân, chiêng, chập chả |
| `lantern_release` | Thả hoa đăng |
| `golden_hour_start`, `golden_hour_end` | Bắt đầu, kết thúc giờ hoàng đạo (tiếng cồng) |
| `goal_reached` | Đạt mục tiêu tim |
| `session_start`, `session_end` | Mở, kết phiên |
| `tower_complete` | Hoàn thành tầng 100 |

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
- Thống kê: tổng công đức, tầng hiện tại, trung bình công đức mỗi phiên, ước tính số phiên còn lại.
- Tra cứu người xem theo tên: lịch sử sự kiện, điểm theo từng tầng.
- Backup ngay, tải file backup, xuất và nhập JSON.
- Điều chỉnh tay (cộng hoặc trừ điểm cho một người). Phải nhập lý do và được ghi vào bảng events với type `manual`.
  - Cộng tay có ô "tính vào tháp" (mặc định bật, dùng khi bù quà bị sót): bật thì điểm cũng đẩy tiến độ tháp như quà thường.
  - Trừ tay chỉ trừ điểm trên bảng xếp hạng, KHÔNG làm tháp lùi.

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
- Hai hồ sơ tách biệt hoàn toàn: `production` (dữ liệu thật) và `test`, mỗi hồ sơ có DB, avatar, backup và log riêng trong `data/production/` và `data/test/`. Config (`/config`) dùng chung cho cả hai. Chọn hồ sơ khi khởi động bằng hai file nhấp đúp: `start.bat` (thật) và `start-test.bat` (thử); admin hiện rõ đang ở hồ sơ nào.
- **Chế độ diễn tập:** dùng hồ sơ `test` kết nối vào live của một kênh bất kỳ để thử với dữ liệu thật mà không làm bẩn dữ liệu chính. Overlay hiện nhãn "DIỄN TẬP".
- Simulator chỉ được chạy ở hồ sơ `test`.

**14.3. Phiên live.**
- Phiên tự bắt đầu khi adapter kết nối được và kênh đang live. Phiên tự kết thúc khi kênh tắt live quá 15 phút (sửa được). Admin vẫn bắt đầu và kết thúc tay được.
- Phiên kết thúc thì trụ trì nói nhóm `session_end`, rồi backup.
- "Top phiên này" tính theo phiên. Trần điểm tim và comment vẫn tính theo ngày (mục 4).

**14.4. Vượt nhiều giai đoạn hoặc nhiều tầng một lúc** (quà rất lớn).
- Logic cộng điểm và chia điểm cho từng tầng xử lý đúng ngay lập tức; người tặng được ghi vào `floor_contributions` của TỪNG tầng theo phần điểm rơi vào tầng đó.
- Phần hiển thị phát lần lượt: mỗi giai đoạn khoảng 1 giây. Nếu đang có nhiều hơn 1 lễ trong hàng đợi, lễ hoàn thành rút gọn còn khoảng 4 giây. Lễ mốc chục tầng luôn diễn đầy đủ.
- Tầng 0 (nền móng) cũng có lễ ngắn "Khởi công".

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
- **Ẩn danh theo yêu cầu:** người xem nhờ ẩn tên thì admin bật ẩn danh vĩnh viễn cho người đó. Áp dụng cả trên bia của các tầng cũ và trong credit. Điểm vẫn giữ.
- **Danh sách chặn hiển thị** (người phá rối): không sinh nhân vật, không hiện tên hay avatar ở bất kỳ đâu, trụ trì không nhắc tên. Sự kiện và điểm vẫn ghi để minh bạch.

**14.9. Lệnh bình luận tra cứu.**
- Người xem bình luận một từ khóa (mặc định `hạng` hoặc `công`, sửa trong config) thì overlay hiện thẻ nhỏ khoảng 5 giây: hạng tổng, tổng điểm, tầng góp nhiều nhất.
- Mỗi người tối đa 1 lần/60 giây. Bật/tắt được.
- Giúp người xem tự kiểm tra điểm của mình và giảm thắc mắc "tôi tặng mà không thấy tên".

**14.10. Nhật ký thay đổi cấu hình.**
- Mọi thay đổi config (tỉ lệ quy đổi, giá tầng, ngưỡng…) được ghi lại: thời gian, giá trị cũ, giá trị mới.
- Đổi tỉ lệ quy đổi KHÔNG tính lại điểm đã có.
- Đổi giá tầng chỉ áp dụng cho tầng chưa bắt đầu. Riêng tầng đang xây: admin hỏi xác nhận, và phần trăm tiến độ được tính lại theo giá mới:
  - Giá mới thấp hơn số điểm đã góp: tầng xong ngay, điểm dư chuyển sang tầng sau.
  - Giá mới cao hơn làm phần trăm tụt: giai đoạn được phép lùi theo đúng điểm.

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
| Tết Nguyên Đán | Ngày cuối tháng Chạp (29 hoặc 30) – mùng 3 tháng Giêng âm | ×2 | Hoa đào, câu đối, pháo hoa |
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

**14.12. Sau khi xong tháp.**
- Overlay chuyển sang cảnh khánh thành lặp: tháp hoàn chỉnh, credit cuộn chậm.
- Sự kiện vẫn được ghi, với nhãn "sau khánh thành".
- Admin có nút "Bắt đầu công trình mới": lưu trữ toàn bộ dữ liệu tháp cũ, giữ nguyên danh sách người góp công. Nội dung công trình mới chủ dự án quyết định sau.

**14.13. Kích thước tháp trên màn hình.**
- Config `floor1WidthPx` (mặc định 520px trên khung 1080), chiều cao suy ra theo tỉ lệ ảnh.
- Admin có thanh trượt chỉnh trực tiếp và xem ngay trên overlay.

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
- **Pha trong ngày:** lớp màu phủ lên trời và nền (sáng vàng, ngày trong, hoàng hôn cam tím, đêm xanh thẫm). Ban đêm: đèn lồng và cửa sổ các tầng sáng lên, có quầng sáng.
- **Sao:** hạt lấp lánh khi đêm quang mây.
- **Trăng** (`bg/moon.png`, hoặc code tự vẽ nếu thiếu ảnh): mọc và lặn theo giờ, hình dạng theo pha.
- **Mây:** lớp mây trôi, dày mỏng theo độ che phủ, tốc độ theo gió.
- **Mưa:** hạt mưa xiên theo gió, bắn tóe dưới đất; nền tối và bão hòa màu giảm nhẹ.
- **Sương mù:** dải mờ ở chân núi và quanh chân tháp.
- **Gió:** cánh hoa đào bay nhanh và xa hơn, cờ phần phật, cành cây rung.
- **Dông, bão:** chớp lóe sáng toàn màn hình (ngắn, không nhấp nháy liên tục), rung camera rất nhẹ, mưa dày. Màn hình KHÔNG nhấp nháy quá 3 lần/giây, để an toàn cho người nhạy cảm ánh sáng.
- **Nhân vật khi mưa:** đội nón lá và áo tơi. Dùng ảnh phụ `chars/overlay_nonla.png` gắn lên đầu; thiếu ảnh thì bỏ qua.

**Giới hạn:**
- Các bảng giao diện, bia và chữ KHÔNG bị lớp màu thời tiết phủ lên, luôn rõ ràng. Có `maxDarkness` (mặc định 45%) để đêm và bão không làm tối tháp quá mức.
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

1. **Khung dự án:** cấu trúc thư mục, config + zod, DB + migration, hồ sơ `production`/`test` (14.2), hàm tính điểm, máy trạng thái tiến độ tháp, phiên live (14.3), nhật ký thay đổi config (14.10), `start.bat`/`start-test.bat` (14.1, không làm `start.sh`). Unit test cho: tính điểm, trần ngày, cooldown comment, chuyển giai đoạn, chuyển tầng, điểm dư, vượt nhiều tầng một lúc với ghi nhận đúng cho từng tầng (14.4), hòa điểm (14.5), đổi giá tầng giữa chừng, chuyển đổi âm lịch và hệ số sự kiện kèm trần nhân (14.11).
2. **Simulator + WebSocket + overlay tối giản:** tháp vẽ bằng hình khối tạm, banner tiến độ, bảng xếp hạng chạy theo dữ liệu thật từ DB.
3. **Đưa đồ họa thật vào:** manifest, script cắt sprite, xếp chồng tầng theo `eaveLineY`, taper, camera, parallax trời, khung debug vùng an toàn.
4. **Nhân vật, trụ trì, hiệu ứng quà, hàng đợi thông báo.** Gồm: chế độ độ đông (9A) có unit test cho ngưỡng và độ trễ, dân phu NPC và người góp công cũ (9B), kho thoại và bộ chọn thoại (9C) có unit test quét từ cấm. Thử đủ 4 kịch bản simulator.
5. **Lễ hoàn thành tầng, bia ghi danh, mốc chục tầng, kết thúc tầng 100 và credit.**
5b. **Âm thanh (mục 10A):** quét thư mục, nhạc nền theo playlist và crossfade, hiệu ứng gắn với hoạt ảnh và sự kiện, ducking, giới hạn chống ồn theo chế độ. Có unit test cho bộ chọn biến thể và giới hạn tần suất. Tạo sẵn đủ cây thư mục rỗng kèm file `README.txt` trong mỗi thư mục mô tả loại âm thanh cần đặt vào. KHÔNG tự tải âm thanh từ internet.
5c. **Ngày đêm và thời tiết (mục 14.14):** ngày đêm và pha trăng offline trước, rồi đến adapter thời tiết, hiệu ứng mưa, gió, sương, dông, bão, giới hạn hiển thị và dự phòng khi lỗi. Unit test cho phép chuyển mã thời tiết thành trạng thái game và cho cách tính pha trong ngày.
6. **Kết nối TikTok thật:** `TikTokConnectorAdapter` với API key Euler Stream từ `.env`, kết nối lại, chống trùng, xử lý combo quà, tải avatar, hiển thị trạng thái và lỗi trên admin. Thử với một kênh đang live bất kỳ trước khi dùng cho kênh chính. Các adapter `euler-ws` và `tikfinity` chỉ làm khi chủ dự án yêu cầu.
7. **Trang admin, backup, xuất/nhập**, cùng quản lý người xem (14.8), lệnh bình luận tra cứu (14.9), lịch sự kiện (14.11), cảnh sau khánh thành (14.12), chỉnh kích thước tháp (14.13). Tên quà hiển thị (14.6) và tên đặc biệt (14.7) làm ngay ở giai đoạn 4.
8. **Kiểm thử chịu tải:** simulator chạy 8 giờ, đo fps và bộ nhớ, sửa lỗi.

Sau mỗi giai đoạn: chạy test, cập nhật `README.md` (cách cài, cách chạy, cách thêm ảnh), tóm tắt cho chủ dự án những gì đã làm và cần kiểm tra gì.

## 16. Nhật ký quyết định

**2026-11-10 (trước giai đoạn 1)**, chủ dự án đồng ý các đề xuất sau (đã sửa vào các mục tương ứng ở trên):
1. Node.js 24 LTS (mục 1).
2. Hệ số nhân áp dụng cho mọi nguồn; trần tim + comment tính trên điểm gốc (mục 4).
3. Làm tròn từng sự kiện, từ 0,5 trở lên làm tròn lên (mục 4).
4. Giá tầng làm tròn đến hàng trăm (mục 5).
5. Giữ nguyên cân đối điểm như SPEC; quà rất lớn vẫn được vượt nhiều tầng (14.4). Giá chỉnh trong config khi cần.
6. "Giờ hoàng đạo" là khung giờ tự đặt; nhãn mặc định "Giờ vàng" (mục 4).
7. Danh hiệu dùng từ công trường; "tượng hộ pháp" → "tượng nghê đá"; "Bia công đức" → "Bia ghi danh" (mục 8, 9, 9C, 10, 10A). Vẫn đổi được trong config.
8. Dữ liệu tách theo hồ sơ `data/production/`, `data/test/`; config dùng chung; `start.bat` và `start-test.bat` (14.2).
9. Không làm `start.sh` (14.1, 15).
10. Đổi giá tầng đang xây: tính lại đúng theo điểm, xong ngay nếu đủ, cho phép lùi giai đoạn (14.10).
11. Tết tính từ ngày cuối tháng Chạp (14.11).
12. Cộng điểm tay có ô "tính vào tháp"; trừ tay không làm tháp lùi (mục 11).
13. Trụ trì hiển thị "Thầy trụ trì", không tên riêng (mục 9).
14. Không có mục 13 (đánh số nhảy, không sót nội dung).
- Mặc định khác: config mặc định trong `config/defaults/`; giữ tổng 30 bản backup; comment lệnh tra cứu vẫn tính công; ngưỡng "quà rất lớn" ≥ 1.000 xu.
