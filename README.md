# ĐẠI DANH LAM THIÊN PHÚC – Game livestream xây quần thể chùa

Overlay game cho livestream dọc 1080×1920: người xem tặng quà, thả tim, bình luận để góp "công" xây dần một **quần thể chùa**
trên khu đồi. Công trình gồm 23 hạng mục (San nền, Bệ cây bồ đề, Cổng tam quan, Gác chuông, Chính điện, Bảo tháp 9 tầng…),
mỗi hạng mục qua nhiều giai đoạn thi công.
Đặc tả đầy đủ: [SPEC.md](SPEC.md). Bản cũ "tháp 100 tầng" được lưu ở git tag `thap-100-tang` và file [SPEC_old.md](SPEC_old.md).

> **Tiến độ:** đã xong **R1** (mô hình hạng mục và giai đoạn). Overlay đang vẽ **tạm bằng hình khối** cho từng hạng mục.
> Sắp tới: R2 bản đồ thật và cắt công trình từ ảnh, R3 hiển thị từng giai đoạn, R4 camera và bố cục mới.
> Chưa có nhân vật và trụ trì (giai đoạn 4), chưa kết nối TikTok (giai đoạn 6).

---

## 1. Cài đặt lần đầu (chỉ làm một lần)

### Cài Node.js 24 LTS
1. Tải file cài đặt: https://nodejs.org/dist/latest-v24.x/, chọn file có đuôi **`-x64.msi`** (ví dụ `node-v24.22.2-x64.msi`).
2. Mở file vừa tải, bấm **Next** liên tục rồi **Install**. Nếu Windows hỏi quyền thì chọn **Yes**.
3. Kiểm tra: bấm phím Windows, gõ `cmd`, Enter. Trong cửa sổ đen gõ `node --version` rồi Enter.
   Phải thấy `v24...`. Nếu vẫn thấy số cũ thì khởi động lại máy rồi thử lại.

### Lấy thư viện và đóng gói overlay
Không cần làm gì. Mỗi lần nhấp đúp file `.bat`, game tự kiểm tra:
- Thiếu thư viện thì tự cài (cần mạng Internet, khoảng 1–2 phút ở lần đầu).
- Code overlay mới hơn bản đã đóng gói thì tự đóng gói lại (vài giây).

---

## 2. Chạy game

| File (nhấp đúp) | Dùng khi | Dữ liệu | Nguồn sự kiện |
|---|---|---|---|
| `start-test.bat` | Thử nghiệm, tập dượt | `data\test\` | **Giả lập** (mặc định) hoặc live thật để diễn tập |
| `start.bat` | **Live thật** | `data\production\` | Live thật (kết nối TikTok làm ở giai đoạn 6) |

- Cửa sổ đen hiện ra và trình duyệt tự mở **trang trạng thái** `http://127.0.0.1:3000/admin`.
- Góc trên trang có nhãn **HỒ SƠ THỬ** (cam) hoặc **DỮ LIỆU THẬT** (đỏ). Luôn nhìn nhãn này trước khi live.
- Muốn tắt game: đóng cửa sổ đen. Nếu game gặp lỗi bất ngờ, nó tự khởi động lại sau 5 giây, dữ liệu không mất.

**Dữ liệu của bản tháp cũ:** lần đầu chạy bản quần thể chùa, game tự đổi tên file dữ liệu tháp cũ thành
`data\<hồ sơ>\game.thap-cu.db` (giữ lại, không xóa) rồi bắt đầu dữ liệu mới từ 0. Trong cửa sổ đen có dòng báo việc này.

---

## 3. Overlay và OBS

Overlay là trang `http://127.0.0.1:3000/overlay/`, khung dọc 1080×1920, tự co giãn vừa cửa sổ.
Trên trang trạng thái có nút **Mở overlay ↗** để xem nhanh.

**Thêm vào OBS:**
1. Trong OBS, ở ô **Sources** bấm **+** → **Browser**, đặt tên ví dụ `Quần thể chùa`, bấm OK.
2. **URL:** `http://127.0.0.1:3000/overlay/`, **Width:** `1080`, **Height:** `1920`. Bấm OK.
3. Canvas của OBS nên đặt dọc 1080×1920: **Settings → Video → Base (Canvas) Resolution**.
4. Nếu sửa game mà overlay chưa đổi: chuột phải vào source → **Refresh**.

Trên overlay hiện có (bản **tạm** của R1, R2–R4 sẽ thay bằng bản đồ chùa thật):
- **Công trường bằng hình khối:** mỗi hạng mục là một khối có tên. Khối **đỏ son** là đã xong, khối **đang xây** có phần vàng
  dâng lên theo % của hạng mục và nhấp nháy nhẹ, khối mờ là chưa xây. Bảo tháp 9 tầng xếp chồng thành một cột bên trái.
  Xong một giai đoạn thì khối chớp sáng nhẹ, xong hạng mục thì chớp mạnh.
- **Banner trên giữa:**
  - dòng 1 `Hạng mục 4/23 · Cổng tam quan`;
  - dòng 2 `Giai đoạn 5/10: Dựng cột` kèm % của giai đoạn;
  - thanh tiến độ của giai đoạn;
  - bên dưới: hàng chấm các giai đoạn (chỉ khi hạng mục có tối đa 10 giai đoạn) và dòng `Toàn công trình 7%`.
- **Bảng phải** đổi mỗi 15 giây: Top phiên này → Bảng góp công → **Bia ghi danh – (hạng mục đang xây)**. Bảng chưa có ai thì bỏ qua.
- Huy hiệu hệ số (ví dụ `Giờ vàng ×2`, `Ngày Rằm ×2`) khi đang có hệ số nhân.
- Nhãn **CHẾ ĐỘ THỬ** khi dùng giả lập, **DIỄN TẬP** khi hồ sơ thử dùng live thật. Live thật ở `start.bat` thì không có nhãn.
- Dải miễn trừ cố định `Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo` ngay trên vùng comment của nền tảng.
- **Phím `D`** (bấm khi đang xem overlay): bật/tắt khung tô màu các vùng an toàn. Mở `.../overlay/?debug=1` thì bật sẵn.
- Chấm đỏ nhỏ góc trên bên phải nghĩa là overlay mất kết nối với game. Nó tự kết nối lại khi game chạy lại.

Overlay không đặt thông tin vào các vùng nền tảng tự vẽ: trên 180px, dưới 600px, phải 150px (sửa trong `config.json`, mục `overlay.safeArea`).

---

## 3b. Ảnh game và trang kiểm tra `/tools/assets`

> Trang này hiện vẫn là bản của **tháp cũ** (xếp chồng tầng tháp). Ở R2 trang được làm lại cho bản đồ chùa:
> xem bản đồ, bật/tắt từng công trình, kéo chỉnh khung cắt. Code tháp cũ chỉ được dọn sau R4 khi mình đồng ý.

Ảnh gốc trong `assets\raw\` (không sửa, không đổi tên). Ảnh tháp cũ nằm trong `assets\raw\_old\`.
Ảnh đã tách nền, cắt sẵn nằm trong `assets\game\`; thông số từng ảnh nằm trong `assets\manifest.json`.

Mở trang kiểm tra: trên trang trạng thái bấm **Kiểm tra ảnh ↗**, hoặc vào `http://127.0.0.1:3000/tools/assets`.

### Làm lại ảnh từ ảnh gốc (chỉ khi thay ảnh trong `assets\raw\`)
Cần Python 3 (máy đã có 3.13) và mạng Internet ở lần đầu để tải model.
1. Mở cửa sổ lệnh tại thư mục dự án. Tạo môi trường Python riêng và cài rembg (chỉ một lần):
   ```
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install "rembg[cpu]"
   ```
   Nếu máy chưa có Python: tải bản 3.13 tại https://www.python.org/downloads/windows/, khi cài nhớ tick **Add python.exe to PATH**.
2. Real-ESRGAN (phóng to ảnh bằng AI): tải
   https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip
   và giải nén vào thư mục `.tools\realesrgan\` trong dự án.
3. `npm run assets:nobg`: tách nền (khoảng 5–10 phút; lần đầu tải model khoảng 200MB).
4. `npm run assets:build`: cắt, đặt tên, đo điểm căn, ghi manifest. Những gì đã chỉnh và lưu trên trang `/tools/assets` được giữ nguyên.

Thư mục `.venv\`, `.tools\`, `assets\work\` là đồ trung gian, không đưa lên git.

---

## 4. Giả lập (chỉ ở `start-test.bat`)

Trên trang trạng thái, khung **Giả lập**:
- **▶ Chạy / ■ Dừng**: bật tắt dòng sự kiện giả. Bật thì phiên live tự bắt đầu. Dừng quá 15 phút thì phiên tự kết thúc, như khi kênh tắt live.
- **Kịch bản:** Phòng vắng (2–5 người xem), Phòng vừa (10–45), Phòng đông (70–280), Phòng rất đông (400–1.500). Số người xem và số người tương tác khớp ngưỡng mục 9A.
- **Tốc độ:** ×0,25 đến ×10.
- **Nút bắn thử:** quà nhỏ (1 xu = 100 công), quà vừa (100 xu = 10.000 công), quà lớn (1.000 xu = 100.000 công), 1.000 tim, comment,
  người vào phòng, đợt dồn dập (150 sự kiện một lúc).
- Hai nút **Giả lập / Live thật (diễn tập)** chọn nguồn sự kiện của hồ sơ thử. Live thật chỉ hoạt động từ giai đoạn 6.

Người xem giả có tên tiếng Việt và chỉ tồn tại trong hồ sơ thử. `start.bat` (dữ liệu thật) không bao giờ chạy giả lập.
Game nhớ kịch bản, tốc độ và việc đang chạy hay dừng. Lần mở `start-test.bat` sau, nếu lần trước đang chạy thì giả lập tự chạy tiếp.

---

## 5. Tự kiểm tra

Mở cửa sổ lệnh **tại thư mục dự án**: mở thư mục `game-xay-thap` trong File Explorer, bấm vào thanh địa chỉ, gõ `cmd` rồi Enter.

**a) Test tự động:** gõ `npm test`. Kết quả đúng là dòng cuối có `passed`, không có `failed`.

**b) R1: hạng mục và giai đoạn (bằng giả lập)**
1. Nhấp đúp `start-test.bat`. Trang trạng thái mở ra:
   - khung **Tiến độ công trình** ghi `Hạng mục 1/23 · San nền công trường`, `Giai đoạn 1/5: Phát quang, cắm mốc (có Lễ khởi công)`;
   - cuối trang là **Danh sách hạng mục** đủ 23 mục.
2. Bấm **Mở overlay ↗**. Thấy công trường hình khối: khối "San nền công trường" viền vàng (đang xây), các khối khác mờ.
3. Bấm **Quà vừa (100 xu)** = 10.000 công:
   - giai đoạn 1 xong (cần 8.000), sang `Giai đoạn 2/5: San ủi mặt bằng` với 2.000 công;
   - trên overlay khối chớp sáng, chấm giai đoạn 1 thành dấu ✓.
4. Bấm **Quà lớn (1.000 xu)** = 100.000 công: vượt nhiều giai đoạn và nhiều hạng mục một lúc.
   - San nền và Bệ cây bồ đề chuyển sang đỏ son (đã xong), Sân gạch đang xây.
   - Trên trang trạng thái, danh sách hạng mục có dấu ✓ ở các mục đã xong.
5. Bấm **Quà lớn** thêm vài lần, đến khi sang **Cổng tam quan** (10 giai đoạn), rồi **Chính điện** (16 giai đoạn).
   Chính điện có hơn 10 giai đoạn nên overlay không hiện hàng chấm, chỉ có thanh tiến độ và dòng `Toàn công trình …%`.
6. Chọn **Phòng vừa**, tốc độ **×5**, bấm **▶ Chạy**: % trên banner chạy lên đều, bảng xếp hạng đổi dần, "Bia ghi danh" mang tên hạng mục đang xây.
7. Đóng cửa sổ đen rồi mở lại `start-test.bat`: overlay hiện **đúng hạng mục, đúng giai đoạn, đúng phần trăm** như trước khi tắt.
8. (Tùy chọn) Đổi giá hoặc thêm hạng mục bằng cách sửa `config\project.json` (xem mục 6), lưu, tắt rồi bật lại game.

**c) Lõi game không cần trình duyệt.** Đóng `start-test.bat` trước, rồi gõ `npm run demo -- --reset`.
Lệnh này xóa dữ liệu thử và chạy một chuỗi sự kiện mẫu. Màn hình in từng giai đoạn, từng hạng mục vừa xong, kèm các bảng xếp hạng.

---

## 6. Chỉnh cấu hình

Ba file được tạo tự động ở lần chạy đầu, từ bản mặc định trong `config\defaults\`:

| File | Nội dung |
|---|---|
| `config\config.json` | Điểm quy đổi, trần ngày, giờ vàng, nhãn chữ trên overlay, danh hiệu, bố cục overlay… |
| `config\project.json` | **Danh sách hạng mục** theo thứ tự xây, giá, các mẫu giai đoạn (mục 5 của SPEC) |
| `config\events.json` | Lịch sự kiện dương lịch, âm lịch (Mùng 1, Rằm, Tết…) |

- Mở bằng Notepad để sửa, lưu lại rồi tắt và bật lại game. Từ giai đoạn 7, sửa trực tiếp trên trang admin.
- Ghi sai thì game không chạy và báo rõ chỗ sai, ví dụ: `items: Hạng mục "tam_quan": không có mẫu giai đoạn "vuaa"`.
- Muốn về mặc định: xóa file trong `config\` (KHÔNG xóa thư mục `defaults`), rồi chạy lại game.

### `config\project.json`: hạng mục và giai đoạn
Mỗi hạng mục trong `items` có:

| Khóa | Ý nghĩa |
|---|---|
| `id` | Mã hạng mục, chữ thường không dấu (ví dụ `gac_chuong`). Dữ liệu đóng góp gắn với mã này, **đừng đổi mã** hạng mục đã xây |
| `name` | Tên hiện trên overlay |
| `cost` | Tổng công của hạng mục, chia đều cho các giai đoạn (giai đoạn có `weight` lớn hơn thì nhận phần lớn hơn) |
| `size` | `nho` / `vua` / `lon`: độ dài lễ khi xong hạng mục |
| `area` | Khu vực trên bản đồ (camera dùng để lấy khung hình) |
| `template` hoặc `stages` | Dùng một mẫu giai đoạn có sẵn (`lon`, `vua`, `nho`, `thap_tang`) hoặc tự liệt kê giai đoạn riêng |
| `stagesBefore`, `stagesAfter` | Giai đoạn thêm vào trước / sau mẫu (ví dụ tầng 1 bảo tháp thêm "Đắp nền tháp") |

Mỗi giai đoạn có `name`, có thể có `ritual` (tên lễ, ví dụ "Lễ dựng cột") và `visual` (cách vẽ ở R3).

Giá mặc định theo đơn vị 20.000 công:
- nhỏ 2–3 đơn vị, vừa 6–8, Chính điện 40, mỗi tầng tháp 4;
- cả công trình 2.660.000 công, khoảng 168 giai đoạn.

**Quy tắc khi sửa danh sách** (game kiểm tra và báo lỗi nếu vi phạm):
- Hạng mục **đã bắt đầu xây** (kể cả đang xây) không được xóa, đổi thứ tự hay đổi số giai đoạn.
- Hạng mục **chưa xây** thì thoải mái đổi thứ tự, đổi giá, chèn thêm, xóa bớt.
- Đổi giá hạng mục đang xây: giai đoạn đang làm **giữ giá cũ**, các giai đoạn sau dùng giá mới.
  Trang admin ở giai đoạn 7 sẽ có lựa chọn tính lại ngay giai đoạn đang làm (đã có sẵn trong lõi game).
- Xây xong cả công trình mà nối thêm hạng mục vào cuối danh sách thì game tự xây tiếp hạng mục mới (mở rộng chùa).

### `config\config.json`
Ví dụ đặt giờ vàng ×2 mỗi tối thứ Sáu 20:00–21:00 (0 = Chủ nhật, 1 = Thứ hai, …, 6 = Thứ bảy):
```json
"goldenHour": { "multiplier": 2, "schedule": [ { "weekdays": [5], "from": "20:00", "to": "21:00" } ] }
```

Chữ trên thanh tiến độ nằm ở `labels.progress` (đổi được câu chữ, giữ các chỗ `{...}`):

| Khóa | Mặc định |
|---|---|
| `item` | `Hạng mục {number}/{count} · {item}` |
| `stage` | `Giai đoạn {number}/{count}: {stage}` |
| `project` | `Toàn công trình {percent}%` |
| `completed` | `{project} đã hoàn thành` |

Tên bia trên bảng phải: `labels.boards.itemTop`, mặc định `Bia ghi danh – {item}`.

File `config.json` cũ của bản tháp (có mục `tower`, tên tầng…) được game **tự dọn** ở lần chạy đầu, phần mình đã chỉnh khác được giữ nguyên.
Riêng các khóa `floor1WidthPx`, `towerTaper`, `towerCenterX`, `towerBaseY` trong mục `overlay` chỉ còn dùng cho trang `/tools/assets` cũ.

---

## 7. Dữ liệu và backup

- Dữ liệu nằm trong `data\<hồ sơ>\`: `game.db` (điểm, tiến độ), `logs\` (nhật ký theo ngày), `backups\`, `avatars\`.
- Backup tự động: mỗi ngày lúc 04:00 (nếu game đang chạy) và mỗi khi kết thúc một phiên live. Giữ 30 bản gần nhất.
  Mỗi bản là một thư mục chứa `game.db` cùng các file config lúc đó.
- Khôi phục một bản backup: tắt game, chép `game.db` trong thư mục backup đè lên `data\<hồ sơ>\game.db`
  (xóa thêm `game.db-wal` và `game.db-shm` nếu có), rồi bật lại game.
- Thư mục `data\` và file `.env` (API key) **không** được đưa lên GitHub.

---

## 8. Dành cho người lập trình

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy toàn bộ unit test (vitest) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript (server và overlay) |
| `npm run build` | Đóng gói overlay vào `dist/overlay` |
| `npm run dev` | Server hồ sơ test, tự chạy lại khi sửa code |
| `npm run dev:overlay` | Vite dev server cho overlay ở cổng 5173 (cần `npm run dev` chạy song song) |
| `npm start` / `npm run start:test` | Chạy server không qua file .bat |
| `npm run demo` | Bắn sự kiện mẫu vào hồ sơ test |
| `npm run assets:nobg` | Tách nền ảnh gốc bằng rembg → `assets/work/nobg` |
| `npm run assets:build` | Cắt ảnh, đo điểm căn → `assets/game` + `assets/manifest.json` |
| `node --import tsx scripts/slice-sheet.ts <sheet.png> <thư_mục> --names a,b --equal` | Cắt một sprite sheet nền trong suốt bất kỳ |

Cấu trúc thư mục và quy tắc làm việc: xem [CLAUDE.md](CLAUDE.md) và mục 2 của [SPEC.md](SPEC.md).
