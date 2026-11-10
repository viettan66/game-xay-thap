# BẢO THÁP THIÊN PHÚC – Game livestream xây tháp 100 tầng

Overlay game cho livestream dọc 1080×1920: người xem tặng quà, thả tim, bình luận để góp "công" xây dần một bảo tháp 100 tầng.
Đặc tả đầy đủ: [SPEC.md](SPEC.md).

> **Tiến độ:** đã xong **giai đoạn 1** (tính điểm, tiến độ tháp, lưu trữ, phiên live, backup), **giai đoạn 2**
> (giả lập, WebSocket, overlay, bảng xếp hạng) và **giai đoạn 3** (đồ họa thật: tháp, nền, trời, bộ giao diện,
> trang kiểm tra ảnh `/tools/assets`). Chưa có nhân vật và trụ trì trên overlay (giai đoạn 4), chưa kết nối TikTok (giai đoạn 6).

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

---

## 3. Overlay và OBS

Overlay là trang `http://127.0.0.1:3000/overlay/`, khung dọc 1080×1920, tự co giãn vừa cửa sổ.
Trên trang trạng thái có nút **Mở overlay ↗** để xem nhanh.

**Thêm vào OBS:**
1. Trong OBS, ở ô **Sources** bấm **+** → **Browser**, đặt tên ví dụ `Bảo tháp`, bấm OK.
2. **URL:** `http://127.0.0.1:3000/overlay/`, **Width:** `1080`, **Height:** `1920`. Bấm OK.
3. Canvas của OBS nên đặt dọc 1080×1920: **Settings → Video → Base (Canvas) Resolution**.
4. Nếu sửa game mà overlay chưa đổi: chuột phải vào source → **Refresh**.

Trên overlay hiện có:
- Nền thật có bệ móng, trời nối phía trên. Khi camera lên cao: trời trôi chậm (×0,25), nền trôi vừa (×0,5), tháp đi cùng camera.
- Tháp bằng ảnh thật: tầng dưới dùng ảnh hoàn thiện (có đèn lồng), tầng đang xây dùng ảnh đúng giai đoạn.
  Các tầng xếp chồng theo mép dưới dải ngói (`eaveLineY`), mỗi tầng nhỏ dần một chút. Xong tầng 100 thì đặt chóp.
- Nền móng (tầng 0) chưa có ảnh riêng: vẽ tạm đá vụn, hố móng, cọc gỗ, đá xếp trên bệ móng của ảnh nền.
- Camera bám tầng đang xây (khoảng 45% chiều cao màn hình). Khi tháp còn thấp thì đứng yên ở mặt đất.
- Banner trên giữa (ảnh `ui/banner.png`): `Tầng 27/100`, tên giai đoạn, %; bên dưới là khung 5 bước. Chớp sáng nhẹ khi xong giai đoạn hoặc xong tầng.
- **Phím `D`** (bấm khi đang xem overlay): bật/tắt khung debug. Các vùng an toàn được tô màu, có vạch căn tầng (đỏ: `eaveLineY`, xanh: `topY`),
  số tầng và điểm đặt tháp (chấm vàng). Mở `http://127.0.0.1:3000/overlay/?debug=1` thì khung debug bật sẵn.
- Thiếu file ảnh nào thì chỗ đó hiện hình chữ nhật màu tím kèm tên file, overlay không bị dừng.
- Bảng phải đổi mỗi 15 giây: Top phiên này → Bảng góp công → Bia ghi danh tầng hiện tại. Bảng chưa có ai thì bỏ qua.
- Huy hiệu hệ số (ví dụ `Giờ vàng ×2`, `Ngày Rằm ×2`) khi đang có hệ số nhân.
- Nhãn **CHẾ ĐỘ THỬ** khi dùng giả lập, **DIỄN TẬP** khi hồ sơ thử dùng live thật. Live thật ở `start.bat` thì không có nhãn.
- Dải miễn trừ cố định ngay trên vùng comment của nền tảng.
- Chấm đỏ nhỏ góc trên bên phải nghĩa là overlay mất kết nối với game. Nó tự kết nối lại khi game chạy lại.

Overlay không đặt thông tin vào các vùng nền tảng tự vẽ: trên 180px, dưới 600px, phải 150px (sửa trong `config.json`, mục `overlay.safeArea`).

---

## 3b. Ảnh game và trang kiểm tra `/tools/assets`

Ảnh gốc trong `assets\raw\` (không sửa) đã được tách nền, cắt và đặt tên theo mục 7 của SPEC, nằm trong `assets\game\`.
Thông số từng ảnh nằm trong `assets\manifest.json`.

Mở trang kiểm tra: trên trang trạng thái bấm **Kiểm tra ảnh ↗**, hoặc vào `http://127.0.0.1:3000/tools/assets`.

1. **So sánh nền A / B**: A là phóng to thường (Lanczos), B là phóng to bằng AI (Real-ESRGAN) rồi thu về 1080×1920, B2 là Real-ESRGAN bản anime.
   - Chọn **Phóng to ×4 / ×8** rồi rê chuột lên một ảnh: cả ba ảnh cùng phóng đúng chỗ đó để so chi tiết.
   - Bấm **Dùng bản này** để chọn làm chính thức. Overlay đang mở đổi ngay. Hiện đang dùng **B**.
2. **Ảnh đã cắt**: mọi ảnh hiện trên 3 nền (ô caro, trắng, tối) để soi viền. Bấm vào ảnh để phóng to.
3. **Xếp chồng thử**: 0–10 tầng + chóp trên nền thật, vẽ bằng đúng code của overlay. Các thanh trượt:
   - `eaveLineY` (chung cho 5 ảnh tầng), `topY` (từng ảnh), và chóp;
   - bề rộng tầng 1, độ thu nhỏ mỗi tầng, độ rộng chóp, vị trí tháp trên bệ móng.

   Bấm **Lưu** để ghi: điểm căn và vị trí tháp vào `assets\manifest.json`, còn bề rộng tầng 1 và độ thu nhỏ vào `config\config.json`.
   Overlay đang mở cập nhật ngay. **Về giá trị máy đo** đặt lại theo số máy tự đo; **Bỏ thay đổi** nạp lại từ file.

### Làm lại ảnh từ ảnh gốc (chỉ khi thay ảnh trong `assets\raw\`)
Cần Python 3 (máy đã có 3.13) và mạng Internet ở lần đầu để tải model.
1. Mở cửa sổ lệnh tại thư mục dự án. Tạo môi trường Python riêng và cài rembg (chỉ một lần):
   ```
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install "rembg[cpu]"
   ```
   Nếu máy chưa có Python: tải bản 3.13 tại https://www.python.org/downloads/windows/, khi cài nhớ tick **Add python.exe to PATH**.
2. Real-ESRGAN (phóng to nền bằng AI, chỉ cần cho bản B/B2): tải
   https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip
   và giải nén vào thư mục `.tools\realesrgan\` trong dự án. Rồi chạy:
   ```
   .tools\realesrgan\realesrgan-ncnn-vulkan.exe -i assets\raw\bg_background.png -o assets\work\esrgan\bg_background_realesrgan-x4plus.png -n realesrgan-x4plus
   .tools\realesrgan\realesrgan-ncnn-vulkan.exe -i assets\raw\bg_sky_upper.png -o assets\work\esrgan\bg_sky_upper_realesrgan-x4plus.png -n realesrgan-x4plus
   ```
   Bản B2: thay `realesrgan-x4plus` bằng `realesrgan-x4plus-anime` ở cả tên model lẫn tên file. Không có Real-ESRGAN thì chỉ có bản A.
3. `npm run assets:nobg`: tách nền (khoảng 5–10 phút; lần đầu tải model khoảng 200MB).
4. `npm run assets:build`: cắt, đặt tên, đo điểm căn, tạo bản nền 1080×1920, ghi manifest.
   Những gì đã chỉnh và lưu trên trang `/tools/assets` được giữ nguyên.

Thư mục `.venv\`, `.tools\`, `assets\work\` là đồ trung gian, không đưa lên git.

---

## 4. Giả lập (chỉ ở `start-test.bat`)

Trên trang trạng thái, khung **Giả lập**:
- **▶ Chạy / ■ Dừng**: bật tắt dòng sự kiện giả. Bật thì phiên live tự bắt đầu. Dừng quá 15 phút thì phiên tự kết thúc, như khi kênh tắt live.
- **Kịch bản:** Phòng vắng (2–5 người xem), Phòng vừa (10–45), Phòng đông (70–280), Phòng rất đông (400–1.500). Số người xem và số người tương tác khớp ngưỡng mục 9A.
- **Tốc độ:** ×0,25 đến ×10.
- **Nút bắn thử:** quà nhỏ, quà vừa (100 xu), quà lớn (1.000 xu), 1.000 tim, comment, người vào phòng, đợt dồn dập (150 sự kiện một lúc).
- Hai nút **Giả lập / Live thật (diễn tập)** chọn nguồn sự kiện của hồ sơ thử. Live thật chỉ hoạt động từ giai đoạn 6.

Người xem giả có tên tiếng Việt và chỉ tồn tại trong hồ sơ thử. `start.bat` (dữ liệu thật) không bao giờ chạy giả lập.
Game nhớ kịch bản, tốc độ và việc đang chạy hay dừng. Lần mở `start-test.bat` sau, nếu lần trước đang chạy thì giả lập tự chạy tiếp.

---

## 5. Tự kiểm tra

Mở cửa sổ lệnh **tại thư mục dự án**: mở thư mục `game-xay-thap` trong File Explorer, bấm vào thanh địa chỉ, gõ `cmd` rồi Enter.

**a) Test tự động:** gõ `npm test`. Kết quả đúng là dòng cuối có `passed`, không có `failed`.

**b) Giai đoạn 2: giả lập và overlay**
1. Nhấp đúp `start-test.bat`. Trang trạng thái mở ra, bấm **Mở overlay ↗**.
2. Ở khung Giả lập chọn **Phòng vừa**, tốc độ **×5**, bấm **▶ Chạy**. Trên overlay nên thấy:
   - Bảng xếp hạng có tên tiếng Việt, điểm tăng dần.
   - % trên banner chạy lên. Xong giai đoạn thì chấm bước chuyển sang dấu ✓ và tháp chớp sáng.
3. Bấm **Quà lớn (1.000 xu)** vài lần: tháp lên nhiều tầng một lúc, camera lia lên theo.
4. Đổi kịch bản sang **Phòng rất đông** rồi bấm **Đợt dồn dập**: overlay vẫn mượt, số người xem trên trang trạng thái lên hàng trăm.
5. Đóng cửa sổ đen trong khi overlay vẫn mở: góc phải overlay hiện chấm đỏ. Mở lại `start-test.bat`: chấm đỏ tự tắt và overlay hiện đúng tầng như trước.
6. Đóng cửa sổ đen, nhấp đúp `start.bat`. Trang trạng thái có nhãn đỏ **DỮ LIỆU THẬT** và không có khung Giả lập. Trên overlay không có nhãn CHẾ ĐỘ THỬ.

**c) Giai đoạn 3: đồ họa thật**
1. Nhấp đúp `start-test.bat`, mở overlay. Tháp, nền, trời, banner, khung 5 bước, bảng xếp hạng đều là ảnh thật.
2. Bấm phím `D` trên overlay: vùng an toàn hiện màu (đỏ trên, xanh dưới, xanh lá phải), các tầng có vạch đỏ/xanh và số tầng. Bấm `D` lần nữa để tắt.
3. Chạy giả lập rồi bấm **Quà lớn** vài lần: tầng mới xếp khít lên tầng dưới, camera lia lên, trời và nền trôi chậm hơn tháp.
4. Trên trang trạng thái bấm **Kiểm tra ảnh ↗**:
   - Mục 1: so 3 bản nền, phóng ×4 rê chuột để so chi tiết, thử **Dùng bản này** rồi xem overlay đổi nền.
   - Mục 2: soi viền từng ảnh trên nền tối (tìm viền trắng) và nền trắng (tìm chỗ bị ăn lẹm), nhất là bia đá, trụ trì, chóp tháp.
   - Mục 3: kéo thử `eaveLineY`, `topY`, độ thu nhỏ, vị trí tháp; bấm **Lưu** rồi xem overlay cập nhật.

**d) Giai đoạn 1: lõi game** (vẫn dùng được). `npm run demo -- --reset` xóa dữ liệu thử rồi chạy một chuỗi sự kiện mẫu, in kết quả ra màn hình. Nhớ đóng `start-test.bat` trước khi chạy.

---

## 6. Chỉnh cấu hình

- `config\config.json`: điểm quy đổi, giá tầng, trần ngày, giờ vàng, nhãn chữ, danh hiệu, bố cục overlay…
- `config\events.json`: lịch sự kiện dương lịch, âm lịch (Mùng 1, Rằm, Tết…).
- Hai file này được tạo tự động ở lần chạy đầu, từ bản mặc định trong `config\defaults\`.
  Mở bằng Notepad để sửa, lưu lại rồi tắt và bật lại game. Từ giai đoạn 7, sửa trực tiếp trên trang admin.
- Ghi sai thì game không chạy và báo rõ dòng nào sai, ví dụ:
  `tower.baseFloorCost: Đầu vào không hợp lệ: mong đợi số, nhận được string`.
- Muốn về mặc định: xóa file trong `config\` (KHÔNG xóa thư mục `defaults`), rồi chạy lại game.

Ví dụ đặt giờ vàng ×2 mỗi tối thứ Sáu 20:00–21:00 (0 = Chủ nhật, 1 = Thứ hai, …, 6 = Thứ bảy):
```json
"goldenHour": { "multiplier": 2, "schedule": [ { "weekdays": [5], "from": "20:00", "to": "21:00" } ] }
```

Mục `overlay` trong `config.json`:

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `safeArea` | trên 180, dưới 600, phải 150 | Vùng nền tảng tự vẽ, overlay không đặt thông tin vào |
| `floor1WidthPx` | 520 | Bề rộng tầng 1 trên khung 1080 |
| `towerTaper` | 0,995 | Mỗi tầng nhỏ lại bao nhiêu so với tầng dưới |
| `towerCenterX`, `towerBaseY` | 510, 1215 | Vị trí trục tháp và mặt đất (chỉnh lại khi có ảnh nền thật ở giai đoạn 3) |
| `boardRotateSec` | 15 | Số giây mỗi bảng xếp hạng hiện trước khi đổi |

---

## 7. Dữ liệu và backup

- Dữ liệu nằm trong `data\<hồ sơ>\`: `game.db` (điểm, tiến độ), `logs\` (nhật ký theo ngày), `backups\`, `avatars\`.
- Backup tự động: mỗi ngày lúc 04:00 (nếu game đang chạy) và mỗi khi kết thúc một phiên live. Giữ 30 bản gần nhất.
  Mỗi bản là một thư mục chứa `game.db` cùng `config.json`, `events.json` lúc đó.
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
| `npm run assets:build` | Cắt ảnh, đo điểm căn, tạo bản nền → `assets/game` + `assets/manifest.json` |
| `node --import tsx scripts/slice-sheet.ts <sheet.png> <thư_mục> --names a,b --equal` | Cắt một sprite sheet nền trong suốt bất kỳ |

Cấu trúc thư mục và quy tắc làm việc: xem [CLAUDE.md](CLAUDE.md) và mục 2 của [SPEC.md](SPEC.md).

Sẽ bổ sung ở các giai đoạn sau: nhân vật và trụ trì (giai đoạn 4), thêm âm thanh (5b), kết nối TikTok và TikTok LIVE Studio (6).
