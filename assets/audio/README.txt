Âm thanh của game (SPEC mục 10A)

music\<playlist>\  nhạc nền theo tình huống (phòng vắng, vừa, đông, giờ hoàng đạo, lễ, lễ hội, khánh thành).
sfx\<nhóm>\        hiệu ứng (thi công, quà, giao diện, lễ). Nhiều file trong một nhóm = nhiều biến thể.
ambient\<nhóm>\    âm thanh môi trường chạy lặp (gió, chim, chuông gió, công trường xa, côn trùng ban đêm).

Định dạng: .ogg hoặc .mp3. Mỗi thư mục có README.txt mô tả loại âm cần đặt vào.
Thêm file xong: trang Âm thanh của admin → "Quét lại". Thư mục trống thì game im lặng, không lỗi.

credits.json: mỗi file một dòng, ví dụ
  { "file": "sfx/brick_lay/dat-gach-1.ogg", "source": "Tự thu âm", "license": "CC0", "link": "" }
File chưa có dòng credits thì trang Âm thanh cảnh báo. Nhạc vi phạm bản quyền có thể khiến nền tảng tắt tiếng hoặc chặn live.

File âm thanh KHÔNG được đưa lên git (repo công khai, bản quyền riêng): chép tay khi chuyển máy.
