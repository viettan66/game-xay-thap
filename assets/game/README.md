# assets/game/

Ảnh game đã tách nền và cắt sẵn, đặt tên theo mục 7 của SPEC. **Không sửa tay**: các file này được tạo lại bằng script.

- Tạo từ ảnh gốc trong `assets/raw/` (không sửa, không xóa) bằng `npm run assets:nobg` rồi `npm run assets:build`.
- Thông số từng ảnh (kích thước, điểm neo, eaveLineY, topY…) nằm trong `assets/manifest.json`.
- `bg/variants/`: các bản nền và trời A / B / B2 để so sánh. `bg/background.png`, `bg/sky_upper.png` là bản đang dùng
  (chọn trên trang http://127.0.0.1:3000/tools/assets).
