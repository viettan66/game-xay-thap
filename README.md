# BẢO THÁP THIÊN PHÚC – Game livestream xây tháp 100 tầng

Overlay game cho livestream dọc 1080×1920: người xem tặng quà, thả tim, bình luận để góp "công" xây dần một bảo tháp 100 tầng.
Đặc tả đầy đủ: [SPEC.md](SPEC.md).

> **Tiến độ:** đã xong **giai đoạn 1** (khung dự án, tính điểm, tiến độ tháp, lưu trữ, phiên live, backup).
> Chưa có overlay, chưa kết nối TikTok. Trang trên trình duyệt hiện chỉ là **trang trạng thái tạm**.

---

## 1. Cài đặt lần đầu (chỉ làm một lần)

### Cài Node.js 24 LTS
1. Tải file cài đặt: https://nodejs.org/dist/latest-v24.x/, chọn file có đuôi **`-x64.msi`** (ví dụ `node-v24.22.2-x64.msi`).
2. Mở file vừa tải, bấm **Next** liên tục rồi **Install**. Nếu Windows hỏi quyền thì chọn **Yes**.
3. Kiểm tra: bấm phím Windows, gõ `cmd`, Enter. Trong cửa sổ đen gõ `node --version` rồi Enter.
   Phải thấy `v24...`. Nếu vẫn thấy số cũ thì khởi động lại máy rồi thử lại.

> Lưu ý: các dự án khác trên máy cũng dùng chung Node.js này. Node 24 chạy được hầu hết code viết cho Node 22.

### Lấy thư viện
Không cần làm gì: lần đầu nhấp đúp `start-test.bat`, game tự cài thư viện (cần mạng Internet, khoảng 1–2 phút).

---

## 2. Chạy game

| File (nhấp đúp) | Dùng khi | Dữ liệu |
|---|---|---|
| `start-test.bat` | Thử nghiệm, tập dượt | `data\test\` |
| `start.bat` | **Live thật** | `data\production\` |

- Cửa sổ đen hiện ra và trình duyệt tự mở trang `http://127.0.0.1:3000/admin`.
- Góc trên trang có nhãn **HỒ SƠ THỬ** (cam) hoặc **DỮ LIỆU THẬT** (đỏ). Luôn nhìn nhãn này trước khi live.
- Muốn tắt game: đóng cửa sổ đen.
- Nếu game gặp lỗi bất ngờ, nó tự khởi động lại sau 5 giây, dữ liệu không mất.
- Hai hồ sơ tách biệt hoàn toàn: thử thoải mái ở hồ sơ test, không ảnh hưởng dữ liệu thật.

---

## 3. Tự kiểm tra giai đoạn 1

Mở cửa sổ lệnh **tại thư mục dự án**: mở thư mục `game-xay-thap` trong File Explorer, bấm vào thanh địa chỉ, gõ `cmd` rồi Enter.

**a) Chạy toàn bộ test tự động**
```
npm test
```
Kết quả đúng: dòng cuối có `passed`, không có `failed`.

**b) Chạy thử lõi game với sự kiện mẫu** (chỉ ghi vào hồ sơ test)
```
npm run demo -- --reset
```
Màn hình in ra từng sự kiện: thả tim, comment, tặng quà, và tháp lên tầng thế nào. Những điều nên thấy:
- Comment lần 2 sau 10 giây **không** được tính (phải cách nhau 30 giây).
- Thả tim quá 2.000 trong ngày thì chỉ tính phần còn lại.
- Quà 2.000 xu xây xong **10 tầng một lúc**.
- Quà bị gửi trùng (do mất mạng, kết nối lại) **không** được cộng lần hai.

`--reset` xóa dữ liệu thử cũ trước khi chạy. Bỏ `-- --reset` thì demo cộng tiếp vào dữ liệu đang có.
Nếu báo không xóa được thì đóng cửa sổ `start-test.bat` trước.

**c) Xem trên trình duyệt và thử tắt/bật lại**
1. Nhấp đúp `start-test.bat`. Trang trạng thái hiện tầng, giai đoạn, %, bảng xếp hạng của dữ liệu demo.
2. Đóng cửa sổ đen, nhấp đúp `start-test.bat` lần nữa. Tầng, giai đoạn, % phải **giữ nguyên**.
3. Nhấp đúp `start.bat`. Nhãn đỏ **DỮ LIỆU THẬT** và mọi thứ ở 0 (dữ liệu thử không lẫn sang).

---

## 4. Chỉnh cấu hình

- `config\config.json`: điểm quy đổi, giá tầng, trần ngày, giờ vàng, nhãn chữ, danh hiệu…
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

---

## 5. Dữ liệu và backup

- Dữ liệu nằm trong `data\<hồ sơ>\`: `game.db` (điểm, tiến độ), `logs\` (nhật ký theo ngày), `backups\`, `avatars\`.
- Backup tự động: mỗi ngày lúc 04:00 (nếu game đang chạy) và mỗi khi kết thúc một phiên live. Giữ 30 bản gần nhất.
  Mỗi bản là một thư mục chứa `game.db` cùng `config.json`, `events.json` lúc đó.
- Khôi phục một bản backup: tắt game, chép `game.db` trong thư mục backup đè lên `data\<hồ sơ>\game.db`
  (xóa thêm `game.db-wal` và `game.db-shm` nếu có), rồi bật lại game.
- Thư mục `data\` và file `.env` (API key) **không** được đưa lên GitHub.

---

## 6. Dành cho người lập trình

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy toàn bộ unit test (vitest) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run dev` | Server hồ sơ test, tự chạy lại khi sửa code |
| `npm start` / `npm run start:test` | Chạy server không qua file .bat |
| `npm run demo` | Bắn sự kiện mẫu vào hồ sơ test |

Cấu trúc thư mục và quy tắc làm việc: xem [CLAUDE.md](CLAUDE.md) và mục 2 của [SPEC.md](SPEC.md).

Sẽ bổ sung ở các giai đoạn sau: thêm ảnh (giai đoạn 3), thêm âm thanh (5b), cấu hình OBS và TikTok LIVE Studio (2, 6).
