# assets/game/

Ảnh game đã tách nền và cắt sẵn, đặt tên theo mục 7 của SPEC. **Không sửa tay**: các file này được tạo lại bằng script.
Thông số từng ảnh (kích thước, điểm neo, vị trí trên bản đồ, baseY…) nằm trong `assets/manifest.json`.

Bản đồ quần thể chùa (giai đoạn R2), tạo bằng `npm run assets:upscale`, `npm run assets:segment`, `npm run assets:map`:
- `map/bg_*.jpg`: ảnh nền ghép (đồi trống + đường đá nối dài), cắt thành dải ngang. `map/reference_built.jpg`: ảnh chùa hoàn chỉnh
  cùng hệ tọa độ, chỉ để so khớp trên trang /tools/assets.
- `buildings/<mã>/final.png`: từng công trình cắt từ ảnh chùa hoàn chỉnh. Sau này thêm `key_<n>.png`, `stage_<k>.png` (R3).
- `fg/<mã>.png`: cây, cành đứng trước công trình, vẽ đè lên trên.
- `buildings/<mã>/parts/<vùng>.png` + `parts.json`: vùng xây từng mảnh (máy đề xuất khi chạy assets:map, chỉnh tay trên /tools/parts).
- Khung cắt nằm ở `assets/map-cuts.json`, chỉnh trên trang http://127.0.0.1:3000/tools/assets.
- `props/<loại>_<mức>.png`: đống vật liệu (gạch, gỗ, ngói, đá – lớn/vừa/nhỏ; cát, giá cưa, ròng rọc, thang tre, quang gánh, xe cút kít),
  tạo bằng `npm run assets:nobg props` rồi `npm run assets:props`.

Trụ trì, giao diện, vật phẩm, bia, nhân vật tạm, tạo bằng `npm run assets:nobg` rồi `npm run assets:build`:
- `abbot/`, `ui/`, `items/`, `stele/`, `chars/`. (Ảnh tầng tháp, nền tháp của bản cũ đã bỏ sau R4; ảnh gốc vẫn ở `assets/raw/_old/`.)
