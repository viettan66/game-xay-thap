# ĐẠI DANH LAM THIÊN PHÚC – Game livestream xây quần thể chùa

Overlay game cho livestream dọc 1080×1920: người xem tặng quà, thả tim, bình luận để góp "công" xây dần một **quần thể chùa**
trên khu đồi. Công trình gồm 23 hạng mục (San nền, Bệ cây bồ đề, Cổng tam quan, Gác chuông, Chính điện, Bảo tháp 9 tầng…),
mỗi hạng mục qua nhiều giai đoạn thi công.
Đặc tả đầy đủ: [SPEC.md](SPEC.md). Bản cũ "tháp 100 tầng" được lưu ở git tag `thap-100-tang` và file [SPEC_old.md](SPEC_old.md).

> **Tiến độ:** đã xong **R1** (mô hình hạng mục và giai đoạn), **R2** (bản đồ chùa thật: ghép nền, phóng to bằng AI,
> cắt từng công trình từ ảnh, lớp tiền cảnh, trang chỉnh khung cắt), **R3a** (trang chia vùng `/tools/parts`), **R3b**
> ("xây từng mảnh": mỗi lần có công, từng viên gạch, viên ngói, thanh gỗ bay vào đúng chỗ), **R3c** (trang thử xây
> `/tools/build`: chọn hạng mục, giai đoạn, nút tim và quà, đo FPS) và **R4** (camera phóng to, toàn cảnh, lia giới thiệu;
> giao diện mới: thanh tiến độ góc trên phải, bảng xếp hạng thu gọn tự tránh công trình, ô sự kiện, bản đồ thu nhỏ, lọc tên).
> Giai đoạn 4 làm từng phần: đã xong **4a** (chế độ độ đông của phòng, kho thoại, trụ trì nói chuyện trên overlay, tên quà theo mức),
> **4b** (thông báo quà, mục tiêu tim của phiên với phần thưởng múa lân, trang Kho thoại) và **4c** (ảnh nhân vật, xe trâu,
> voi, tượng võ tướng đá; lối đi, vị trí làm việc, ô ghi danh trên bản đồ; trang `/tools/paths`).
> Sắp tới: 4d (nhân vật người xem đi lại, làm việc trên bản đồ; hiệu ứng quà), 4e (dân phu, người góp công cũ).
> Chưa kết nối TikTok (giai đoạn 6).

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

Trên overlay hiện có:
- **Bản đồ quần thể chùa** (đồi, núi, trời, đường đá nối dài phía dưới). Mỗi hạng mục là một công trình cắt từ ảnh chùa hoàn chỉnh:
  - **đã xong:** hiện đầy đủ;
  - **đang xây:** **xây từng mảnh** (xem dưới);
  - **chưa xây:** chưa có, chỗ đó là đất trống. Riêng sân gạch chừa sẵn các ô đất đúng chỗ sẽ xây công trình.
  - Bảo tháp: mỗi tầng một dải, mảnh của tầng nào chỉ nằm trong dải tầng đó.
- **Xây từng mảnh** (SPEC mục 7). Mỗi lần có quà, tim, bình luận được tính công:
  - **Mảnh bay:** viên gạch, viên ngói, thanh gỗ, khối đá… bay vòng cung từ **đống vật liệu** cạnh công trình vào đúng chỗ,
    nảy nhẹ, tung bụi.
  - **Thứ tự đặt:** nền từng hàng từ dưới lên; cột từng cây từ chân lên; mái từ mép hiên lên nóc; trang trí rải dần;
    nước lan từ mép bờ vào.
  - **Công lẻ:** cộng dồn, đủ một mảnh mới đặt. Tim, bình luận chưa đủ một mảnh thì vật liệu bay ra đống, đống to dần.
  - **Quà:** số mảnh tương ứng bay vào thành một đợt. Vùng vừa xây sáng viền vàng khoảng 3 giây, kèm nhãn nhỏ
    `Lan vừa xây 85 khối đá` hoặc `+85 khối đá từ Lan`.
  - **Tốc độ:** tối đa 20 mảnh/giây. Quà rất lớn thì mảnh bay theo cụm; giai đoạn bị vượt qua chỉ mất khoảng 1 giây.
  - **Gỗ thô:** giai đoạn dựng cột, dựng khung hiện màu **gỗ thô**. Giai đoạn "sơn son", "hoàn thiện" thay dần bằng màu thật.
  - **Giai đoạn mặt đất:**
    - cắm mốc: **cọc và dây căng** hiện từng cái;
    - đào móng, đào hồ: **đất lõm** từng mảng, **đống đất** cao dần;
    - tập kết vật liệu: đống vật liệu to dần.
  - **Giàn giáo tre** dựng quanh thân công trình, cao dần theo phần đã xây, tháo dần ở giai đoạn cuối.
  - Xong giai đoạn thì công trình chớp sáng nhẹ, xong hạng mục thì chớp mạnh và camera đẩy chậm vào công trình.
    Lễ (giai đoạn 5) sẽ bắt đầu đúng lúc mảnh cuối đặt xong.
  - **Mở lại overlay** (hoặc mất mạng) thì công trình hiện ngay đúng tiến độ: game không lưu từng mảnh, chỉ cần tiến độ giai đoạn.
  - Chưa có âm thanh đặt gạch, lợp ngói (làm ở giai đoạn 5b) và chưa có dân phu khiêng (giai đoạn 4).
- **Camera** (SPEC mục 8), chuyển cảnh luôn mượt, không bao giờ lộ ra ngoài mép bản đồ:
  - **Công trường** (thường ngày): phóng vào hạng mục đang xây, công trình chiếm khoảng một nửa bề ngang
    (công trình nhỏ thì phóng tới mức tối đa ×1,6 là dừng), nằm giữa phần màn hình không bị nền tảng che.
  - **Toàn cảnh**: thu nhỏ hết cỡ, lia chậm từ đỉnh quần thể xuống hồ sen trong 9 giây. Các bảng mờ xuống 30%,
    chỉ còn thanh tiến độ; hiện **bản đồ thu nhỏ** góc dưới phải (đã xong có màu, chưa xây là bóng xám, đang xây nhấp nháy).
    Tự chạy mỗi 6 phút (phòng vắng: 3 phút; phòng đông: không tự chạy), hoặc bấm nút **Toàn cảnh** trên trang trạng thái.
  - **Lia giới thiệu**: từ trời lia chậm xuống cổng tam quan trong 20 giây. Phòng vắng tự chạy mỗi 10 phút; bấm nút **Lia giới thiệu** để xem thử.
  - **Đẩy vào**: xong một hạng mục thì camera đẩy chậm vào công trình đó khoảng 5 giây (lễ đầy đủ làm ở giai đoạn 5).
  - **Rung nhẹ** khi có quà từ 1.000 xu.
  - Nhịp tự động theo **chế độ độ đông** của phòng (xem dưới).
- Chưa dựng bản đồ (thiếu ảnh) thì overlay tự quay về vẽ tạm bằng hình khối có tên, không bị dừng.
- **Thanh tiến độ** góc trên phải, ngay dưới vùng an toàn trên:
  - dòng 1 `Hạng mục 4/23 · Cổng tam quan` (tên dài thì chữ tự nhỏ lại);
  - dòng 2 `Giai đoạn 5/10: Dựng cột`, thanh tiến độ chạy liên tục, phần trăm;
  - dòng nhỏ `Toàn công trình 7%`; hàng chấm các giai đoạn (chỉ khi hạng mục có tối đa 10 giai đoạn).
- **Bảng xếp hạng thu gọn** (top 5, nền mờ), đổi mỗi 15 giây: Top phiên này → Bảng góp công → **Bia ghi danh – (hạng mục đang xây)**.
  Bảng chưa có ai thì bỏ qua. Bảng có 3 chỗ đặt sẵn (trái giữa, phải giữa, trái trên) và **tự dời sang chỗ không che
  hạng mục đang xây** (mờ đi, dời, hiện lại). Muốn cố định một chỗ: chỉnh trên trang trạng thái.
- **Ô sự kiện** dưới thanh tiến độ, chỉ hiện khi có: `Giờ vàng ×2 · còn 12:34` (đồng hồ đếm ngược), sự kiện lịch
  (ví dụ `Ngày Rằm ×2`), tổng hệ số khi có từ hai thứ trở lên, và **mục tiêu tim của phiên**: `❤ 1.234/5.000 · Đủ 5.000 tim mở khóa màn múa lân`.
- **Mục tiêu tim của phiên** (bảng 9A): khi bắt đầu phiên lấy theo chế độ lúc đó (vắng 500, vừa 5.000, đông 10.000,
  rất đông 50.000 → 100.000 → 200.000). Đủ tim thì **múa lân** khoảng 14 giây ngay trên dải miễn trừ (người đánh trống,
  chũm chọe, con lân, ông Địa, hoa giấy rơi) và trụ trì dang tay mời xem. Chế độ tăng mà mục tiêu đã đạt thì mở nấc của chế độ mới.
  Trang trạng thái đặt tay được mục tiêu (luôn ưu tiên) hoặc để tự động.
- **Thông báo quà** góc trên trái (dưới nhãn CHẾ ĐỘ THỬ), khoảng 4 giây: avatar tạm (vòng tròn chữ cái đầu; ảnh avatar thật có ở
  giai đoạn 6), tên, câu `… vừa góp một xe trâu chở đá`, ảnh vật phẩm (gạch, bó gỗ, xe trâu, voi, chuông, tượng). Có hàng đợi,
  quà lớn hiện trước. Theo chế độ (bảng 9A):
  - vắng, vừa: mọi quà; quà nhỏ liên tiếp của cùng một người trong 5 giây gộp vào một thông báo (cộng dồn);
  - đông: quà từ 100 xu; quà nhỏ hơn chỉ hiện dòng nhỏ `+1.000 công · Tên` bay lên;
  - rất đông: chỉ quà thuộc top 10% giá trị trong 5 phút gần nhất và từ 500 xu; còn lại hiện `+công`.
- **Chế độ độ đông** (SPEC mục 9A): **vắng**, **vừa**, **đông**, **rất đông**, tính từ số người xem và số người tương tác
  (bình luận, tim, quà) trong 5 phút, lấy mức cao hơn. Đổi chế độ khi ổn định 2 phút; có đợt dồn dập (hơn 100 sự kiện trong
  10 giây) thì lên mức ngay. Trang trạng thái hiện chế độ và có nút ép tay. Chế độ đổi: tốc độ đặt mảnh, nhịp camera, cách trụ trì nói.
- **Trụ trì** đứng góc trái phía trên vùng comment, **tự né sang phải** nếu che công trình đang xây. Dáng: chắp tay, vẫy chào
  (quà từ 100 xu), cúi chào (quà từ 1.000 xu; phòng vắng cúi chào mọi quà), dang tay (lễ, xong hạng mục, mở phiên).
  Bong bóng thoại hiện 4–6 giây, nói lần lượt từng câu (lễ > cảm ơn quà > chào > chuyện phiếm).
  - **Chào:** phòng vắng chào từng người khi vào; phòng vừa chào lần tương tác đầu, gộp nhóm mỗi 10 giây; phòng đông, rất đông
    không chào. Mỗi người chỉ được chào bằng tên một lần mỗi phiên.
  - **Cảm ơn quà** với tên vật phẩm theo mức: dưới 10 xu "một viên gạch", 10–99 "một bó gỗ", 100–499 "một xe trâu chở đá",
    500–999 "một đoàn voi chở gỗ", 1.000–4.999 "một quả đại hồng chung", từ 5.000 "một tượng võ tướng đá".
    Phòng vừa gộp quà liên tiếp của cùng một người. Phòng đông chỉ cảm ơn riêng quà từ 100 xu và quà đầu tiên của mỗi người;
    phòng rất đông chỉ cảm ơn riêng quà từ 1.000 xu; các quà còn lại được cảm ơn chung mỗi 30 giây ("Cảm ơn 12 thiện hữu…").
  - **Mở phiên, đóng phiên, lễ của giai đoạn, xong hạng mục:** có câu riêng. Phòng đông báo tiến độ khi giai đoạn qua 50%, 80%, 95%.
  - **Lúc rảnh:** kể chuyện, hướng dẫn cách góp công (phòng vắng mỗi 1–1,5 phút, phòng vừa 2–3 phút, phòng đông 5 phút; rất đông không nói).
  - Câu **chưa duyệt** chỉ được nói ở chế độ giả lập và có **viền cam**; live thật (kể cả diễn tập) chỉ nói câu đã duyệt.
- Nhãn **CHẾ ĐỘ THỬ** khi dùng giả lập, **DIỄN TẬP** khi hồ sơ thử dùng live thật. Live thật ở `start.bat` thì không có nhãn.
- Dải miễn trừ cố định, nhỏ, nền mờ `Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo` ngay trên vùng comment của nền tảng.
- **Lọc tên:** tên người xem được chuẩn hóa (chữ kiểu 𝓜𝓲𝓷𝓱 → Minh, bỏ ký tự vô hình). Tên chứa từ cấm (danh sách
  `nameFilter.bannedWords` trong `config.json`, so không dấu, không phân biệt hoa thường, kể cả chèn dấu chấm) hoặc tên rỗng
  hiện `Thiện hữu ẩn danh`, cả trên bảng xếp hạng lẫn nhãn "… vừa xây …".
- **Phím `D`** (bấm khi đang xem overlay): bật/tắt khung tô màu các vùng an toàn. Mở `.../overlay/?debug=1` thì bật sẵn.
  Khi đang bật, **kéo thả ảnh chụp màn hình live thật** (chụp trên điện thoại) vào cửa sổ overlay: ảnh phủ mờ lên trên
  để so xem chữ của game có bị nút, khung comment của TikTok che không. Phím `F` đổi cách khớp ảnh, `[` `]` mờ / đậm, `X` bỏ ảnh.
  Ảnh chỉ nằm trong trình duyệt, không gửi đi đâu.
- Chấm đỏ nhỏ góc trên bên phải nghĩa là overlay mất kết nối với game. Nó tự kết nối lại khi game chạy lại.

**Chỉnh hiển thị** (trang trạng thái, khung **Camera và hiển thị**; kéo là overlay đổi ngay):
- **Zoom tối đa** (mặc định ×1,6) và **Công trình chiếm** bao nhiêu phần bề ngang (mặc định 52%).
- **Bảng xếp hạng**: tự chọn chỗ không che công trình, hoặc cố định trái giữa / phải giữa / trái trên.
- **Bản đồ thu nhỏ**: chỉ khi thu toàn cảnh / luôn hiện / tắt.
- **Độ đậm nền** từng khung: thanh tiến độ, bảng xếp hạng, ô sự kiện, dải miễn trừ.

Overlay không đặt thông tin vào các vùng nền tảng tự vẽ: trên 180px, dưới 600px, phải 150px (sửa trong `config.json`, mục `overlay.safeArea`).

---

## 3b. Ảnh game và trang kiểm tra `/tools/assets`

Ảnh gốc trong `assets\raw\` (không sửa, không đổi tên). Ảnh tháp cũ nằm trong `assets\raw\_old\`.
Tên file gốc tiếng Việt được ánh xạ sang tên trong SPEC mục 7 ở `assets\raw-files.json`
(ví dụ `map_built` = `Chín tầng tháp giữa quần thể chùa.png`).
Ảnh đã cắt nằm trong `assets\game\`; thông số từng ảnh nằm trong `assets\manifest.json`.

Mở trang kiểm tra: trên trang trạng thái bấm **Kiểm tra ảnh ↗**, hoặc vào `http://127.0.0.1:3000/tools/assets`.

### Bản đồ quần thể chùa (mục đầu tiên của trang)
- Bản đồ rộng 1728 điểm ảnh (= 1080 × phóng to tối đa 1,6), cao 5575:
  - **ảnh đồi trống** ở trên;
  - **đường đá nối dài** chồng lên đáy 308 điểm ảnh gốc, mờ dần chỗ chồng nên không lộ đường nối.
- Cả ba ảnh được **phóng ×4 bằng AI (Real-ESRGAN)** rồi thu về cỡ bản đồ.
- Mỗi công trình được cắt từ **ảnh chùa hoàn chỉnh**. Hai cách cắt:
  - **Khung xanh** (công trình có hình khối): máy tách hình bằng rembg, rồi bỏ những chỗ giống hệt ảnh đồi trống.
    Đó là cây có sẵn đứng trước công trình; các cây này được đưa vào **lớp tiền cảnh**, vẽ đè lên công trình.
  - **Khung cam** (sân gạch, hồ sen, tường bao, san nền): lấy phần khác biệt với ảnh đồi trống trong vùng, trừ đi các công trình đè lên.
- Trên trang:
  - bỏ dấu tích để ẩn công trình;
  - nút **Ẩn tất cả** để xem đồi trống;
  - kéo thanh **Ảnh gốc map_built chồng lên** để so vị trí với ảnh gốc.
- Bấm một công trình để chỉnh:
  - **kéo khung** (kéo giữa để dời, kéo 4 góc để đổi cỡ) hoặc gõ số;
  - **kéo vạch đỏ** = đường chân công trình (baseY). Chân thấp hơn thì đứng trước, che công trình phía sau;
  - bảo tháp có thêm **vạch tím** = mép trên từng tầng. Tạm thời chia đều 9 dải, chờ ảnh bảo tháp 9 tầng vẽ riêng;
  - bấm **Cắt lại công trình này**. Đổi khung xanh thì máy tách hình lại (10–60 giây), rồi dựng lại cả bản đồ; overlay đang mở tự cập nhật.
- Khung cắt lưu trong `assets\map-cuts.json` (tọa độ theo ảnh gốc 941×1672).

### Chia vùng công trình: trang `/tools/parts` (R3a)
Để "xây từng mảnh", mỗi công trình được chia thành các vùng. Mỗi vùng được xây bằng một loại mảnh:

| Vùng | Gồm | Mảnh |
|---|---|---|
| Nền | nền, móng, bậc, sân quanh chân | khối đá |
| Cột | cột | đoạn cột |
| Khung | xà, kèo | thanh gỗ |
| Mái | mái ngói | viên ngói |
| Tường | tường, cửa | viên gạch |
| Trang trí | bờ nóc, đầu đao, hoành phi, đèn, chuông | mảng nhỏ lóe vàng |
| Mặt nước | mặt nước (hồ sen) | mảng nước |

Mở trang: trên trang trạng thái bấm **Chia vùng ↗**, hoặc vào `http://127.0.0.1:3000/tools/parts`.
- Chọn công trình ở ô trên cùng.
- Chưa chia bao giờ thì máy **tự đề xuất**, nhận vùng theo màu, vân bề mặt và vị trí:
  - mái ngói có rãnh, cột đỏ đứng, xà đỏ nằm ngang;
  - viền mái màu kem, chuông và chóp màu vàng đồng;
  - phần thấp là bệ đá.
- **Cọ tô**: bấm vào một vùng ở bảng bên phải (hoặc phím `1`–`7`) rồi tô lên hình. Cọ chỉ tô lên phần có hình, không tô ra nền trống.
- **Tẩy**: bỏ vùng của điểm ảnh. Chỗ chưa thuộc vùng nào hiện **sọc đỏ**, vì những chỗ đó sẽ không bao giờ được xây.
  Nút **Gán chỗ trống cho vùng gần nhất** lấp hết sọc đỏ.
- Mẹo: giữ `Alt` + bấm để lấy vùng tại chỗ đó; `[` `]` đổi cỡ cọ; `Ctrl+Z` hoàn tác, `Ctrl+Y` làm lại.
- **Xem**:
  - "Tô màu vùng" (kéo thanh độ đậm, bỏ dấu tích để ẩn màu một vùng);
  - "Chỉ vùng đang chọn" (các vùng khác tối đi);
  - "Ảnh gốc". Đổi nền tối / ô caro / sáng, phóng to tới ×6.
- Bấm **Lưu** để ghi vào `assets\game\buildings\<mã>\parts\<vùng>.png`.
  Cắt lại công trình ở `/tools/assets` sau đó thì vùng đã tô vẫn được giữ (dời theo vị trí trên bản đồ).

### Thử xây: trang `/tools/build` (R3c)
Xem một hạng mục được xây từng mảnh mà không cần chờ người xem, không đụng dữ liệu game.
Mở trang: trên trang trạng thái bấm **Thử xây ↗**, hoặc vào `http://127.0.0.1:3000/tools/build`.
- **Chỗ bắt đầu**: chọn hạng mục và giai đoạn. Các hạng mục trước hiện đủ, hạng mục đã chọn xây từ đầu giai đoạn đó.
  Dưới ô chọn ghi giá giai đoạn và vùng sẽ xây (ví dụ "Cột (gỗ thô, dải 15–100% chiều cao)"). Nút **↺ Xây lại từ đầu giai đoạn này**.
- **Góp công**: 4 nút **Thả 10 tim**, **Tặng quà nhỏ**, **Tặng quà lớn**, **Tặng quà cực lớn** (hoặc phím `1` `2` `3` `4`).
  - Số xu của từng quà sửa được (mặc định 1, 100, 1.000 xu). Dòng dưới nút ghi ra số công, tính đúng như game.
  - Ô "Tên hiện trên nhãn" là tên hiện trong nhãn "… vừa xây …".
- **Bắn liên tục**: tự bấm ngẫu nhiên 2–20 lần mỗi giây (phần lớn là tim và quà nhỏ) để thử độ mượt.
- **Tốc độ đặt mảnh**: số mảnh tối đa mỗi giây theo độ đông của phòng (vắng, vừa, đông, rất đông).
- **Số liệu**: FPS (cũng hiện ở góc khung hình), mức thấp nhất trong 10 giây; đang hiện giai đoạn nào; số mảnh đã đặt / tổng;
  số mảnh đang chờ, đang bay; tiến độ theo game.
- Mọi thứ chỉ nằm trong trang đó. Tải lại trang (F5) là xây lại từ đầu chỗ đã chọn. Overlay và bảng xếp hạng không đổi.

### Lối đi và ô ghi danh: trang `/tools/paths` (4c)
Nhân vật (giai đoạn 4d) đi theo **lối đi** vẽ trên bản đồ; xe trâu, voi đi theo **đường chính** từ mép dưới bản đồ vào.
Tượng võ tướng đá mang tên người tặng quà từ 5.000 xu đứng ở các **ô ghi danh** dọc đường vào chùa.
Mở trang: trên trang trạng thái bấm **Lối đi ↗**, hoặc vào `http://127.0.0.1:3000/tools/paths`.
- Nét xanh dương là đường chính, nét xanh lá là lối đi bộ, chấm trắng là điểm, ô vuông tím là ô ghi danh (kèm tượng mẫu, số thứ tự).
- **Chọn / kéo**: kéo điểm hoặc ô ghi danh để dời. **Bấm chuột phải** để xóa.
- **+ Điểm vào lối đang chọn**: bấm gần một đoạn thì chèn điểm vào giữa, bấm chỗ khác thì nối vào cuối lối đó.
- **+ Lối đi mới**, **Xóa lối đang chọn**, đổi mã và loại (lối đi bộ / đường chính) ở dưới danh sách.
- Hai lối có điểm trùng nhau, hoặc điểm của lối này nằm trên đoạn của lối kia, là **nối với nhau**. Dưới danh sách báo
  "Mọi lối đi nối liền nhau" hoặc số cụm rời nhau (cần nối lại).
- **+ Ô ghi danh**: bấm lên bản đồ để thêm ô. Hết ô thì tượng mới xoay vòng thay tượng cũ (giai đoạn 4d).
- **Thử với một hạng mục**: chọn hạng mục để thấy khung (vàng), **vị trí làm việc** tự sinh (chấm cam: dưới đất; cam nhạt: trên giàn giáo),
  **đường đi** từ cổng vào (nét đứt xanh) và một **người mẫu** đứng ở chân công trình để so tỉ lệ (khoảng 1/8 chiều cao gác chuông).
  Bấm **▶ Cho một người đi từ cổng vào** để xem người đó đi theo lối.
- **Lưu**: ghi vào `assets\map-paths.json` (overlay dùng ngay từ giai đoạn 4d). Cắt lại bản đồ không làm mất lối đi.

### Ảnh nhân vật, xe trâu, voi, tượng (4c)
Cắt từ 12 ảnh gốc (5 loại người: dân phu nam, dân phu nữ, thợ mộc, thợ nề, chú tiểu; xe trâu và voi; 3 tượng võ tướng đá) thành
`assets\game\chars\`, `vehicles\`, `honor\` (xem ở trang **Kiểm tra ảnh ↗**). Mỗi loại người có: đi xuống (nhìn thẳng), đi lên (thấy lưng),
đi ngang (sang trái thì lật ảnh), mỗi hướng 3 khung + dáng đứng; dáng mang vác (gạch, quang gánh, gỗ) và dáng làm việc
(cuốc, cưa, đóng búa, xây gạch, trát vữa, đục đá, bê đá, kéo dây, chuyền ngói, quét sân, tưới cây…). Chú tiểu chỉ dùng làm dân phu không tên.
Làm lại từ ảnh gốc: `npm run assets:nobg chars_danphu_nam_walk …` (tên các tấm xem trong `assets\raw-files.json`) rồi `npm run assets:chars`.
Cỡ người trên bản đồ: `characters.heightMap` trong `config.json` (mặc định 54 = khoảng 1/8 chiều cao gác chuông).

### Làm lại bản đồ từ ảnh gốc (chỉ khi thay ảnh bản đồ trong `assets\raw\`)
Cần Python + rembg và Real-ESRGAN như bên dưới. Mở cửa sổ lệnh tại thư mục dự án rồi gõ lần lượt:
1. `npm run assets:upscale`: phóng ×4 ba ảnh bản đồ bằng Real-ESRGAN (vài phút; ảnh đã phóng thì bỏ qua).
2. `npm run assets:segment`: tách hình từng công trình bằng rembg (khoảng 10–60 giây mỗi công trình).
3. `npm run assets:map`: ghép nền, cắt công trình, ghi manifest (khoảng 10 giây). Thêm `-- --background` để ghép lại nền.

### Làm lại ảnh trụ trì, giao diện, vật phẩm, bia từ ảnh gốc
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
4. `npm run assets:build`: cắt, đặt tên, ghi manifest. Phần bản đồ và ảnh đống vật liệu (`props/`) trong manifest được giữ nguyên.

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

**c) R2: bản đồ chùa**
1. Nhấp đúp `start-test.bat`, bấm **Kiểm tra ảnh ↗**. Mục đầu tiên là bản đồ chùa đầy đủ công trình.
2. Kéo thanh **Ảnh gốc map_built chồng lên** qua lại: các công trình phải trùng khít ảnh gốc, không lệch, không mất mảnh.
3. Bấm **Ẩn tất cả (đồi trống)**: chỉ còn đồi, cây, núi. Kéo xuống dưới cùng: chỗ nối đường đá phải liền, không có vệt ngang.
4. Bấm **Chỉ hiện phần nền** (sân gạch, hồ sen, tường bao, san nền): chỗ các công trình sẽ xây là ô đất trống.
5. Bấm từng công trình trong danh sách, nhìn 3 ô xem trước (ô caro, nền tối, nền trắng) để **soi viền cắt**:
   - xem có sót mảng sân, bị mất mái, mất cột, mất hoa văn không;
   - chỗ nào chưa ổn: kéo khung rộng/hẹp lại rồi bấm **Cắt lại công trình này**.
6. Mở overlay, ở trang trạng thái bấm **Quà lớn** nhiều lần:
   - công trình hiện dần lên đúng chỗ trên bản đồ, camera lia theo hạng mục đang xây;
   - tới bảo tháp thì từng tầng hiện lên, banner tự mờ đi để thấy tháp.

**d) R3a: chia vùng Gác chuông**
1. Nhấp đúp `start-test.bat`, trên trang trạng thái bấm **Chia vùng ↗**. Trang mở sẵn **Gác chuông** với bản máy đề xuất.
2. Xem màu từng vùng:
   - mái **tím**, viền mái và chuông **vàng**;
   - 4 cột **đỏ**, xà dưới mái và khung quanh chân chuông **cam**;
   - bệ, bậc, lan can, sân quanh chân **nâu**.
3. Bấm **Chỉ vùng đang chọn** rồi bấm lần lượt từng vùng ở bảng bên phải: mỗi lần chỉ vùng đó sáng, các vùng khác tối đi.
4. Chỗ nào máy chia chưa đúng (ví dụ chóp mái lẫn màu mái, vài vệt xanh "tường" ở mép): chọn vùng đúng, tô lại bằng cọ.
5. Bấm **Lưu**. Ô chọn công trình đổi thành "Gác chuông – đã chỉnh tay". Tải lại trang: vẫn đúng như vừa lưu.

**e) R3b: xây từng mảnh**
0. Nếu trang trạng thái báo công trình **đã hoàn thành 100%** (dữ liệu thử cũ) thì chưa thấy xây gì. Muốn xây lại từ đầu:
   đóng cửa sổ `start-test.bat`, mở thư mục `data\test`, xóa các file `game.db`, `game.db-wal`, `game.db-shm` (file nào có thì xóa).
   Đây chỉ là dữ liệu thử, không đụng hồ sơ thật.
1. Nhấp đúp `start-test.bat`, bấm **Mở overlay ↗**. Đặt cửa sổ overlay và trang trạng thái cạnh nhau.
2. Bấm **Quà vừa (100 xu)** vài lần. Mỗi lần:
   - một đợt mảnh bay từ đống vật liệu vào công trình đang xây;
   - vùng vừa xây sáng viền vàng, có nhãn "… vừa xây … khối đá" (hoặc cọc mốc, mảng đất… tùy giai đoạn).
3. Bấm **1.000 tim**: mảnh bay vào. Bấm **Comment** vài lần: chưa đủ một mảnh thì vật liệu bay ra đống, đống to dần.
4. Bấm **Quà lớn (1.000 xu)** vài lần để qua nhiều giai đoạn, nhiều hạng mục:
   - cọc và dây, đất đào;
   - nền đá từng hàng, cột và khung màu gỗ thô, mái lợp từ mép hiên lên;
   - giàn giáo cao dần, rồi tháo dần ở giai đoạn cuối;
   - xong hạng mục thì công trình hiện đủ màu thật.
5. Đang xây dở thì bấm **F5** trên overlay: công trình hiện ngay đúng như trước khi tải lại (không bay lại từ đầu).
6. Vào **Chia vùng ↗**, tô lại một vùng của công trình đang xây, bấm **Lưu**: overlay tự tải lại vùng mới.
7. Chọn **Phòng rất đông**, tốc độ **×10**, bấm **▶ Chạy**: mảnh bay dày nhưng overlay vẫn mượt.

**f) R3c: trang thử xây**
1. Nhấp đúp `start-test.bat`, trên trang trạng thái bấm **Thử xây ↗**.
2. Chọn hạng mục **Gác chuông**, giai đoạn **1**. Bấm **Thả 10 tim** vài lần: vật liệu bay ra đống, chưa đủ một mảnh thì chưa xây.
3. Bấm **Tặng quà nhỏ**, rồi **Tặng quà lớn**: mảnh bay vào, có nhãn "Khách thử vừa xây …". Ô "Mảnh" tăng đúng theo số công.
4. Chọn giai đoạn khác (ví dụ **5. Dựng cột**): công trình dựng lại ngay đúng giai đoạn đó, không bay lại từ đầu.
5. Bấm **Tặng quà cực lớn**: vượt nhiều giai đoạn, mỗi giai đoạn xong nhanh khoảng 1 giây; xong hạng mục thì camera sang hạng mục sau.
   Bấm quà lớn liên tiếp: các nhãn xếp chồng lên nhau, không đè chữ.
6. Chọn **Chính điện & Tiền đường**, bấm **▶ Bắn liên tục** với **20 lần/giây**, chờ khoảng 30 giây.
   FPS nên giữ quanh 60 (bằng tần số màn hình; màn 144Hz thì cao hơn). Mình báo em số "thấp nhất 10 giây qua".
7. Mở overlay ở cửa sổ khác: overlay **không** thay đổi theo trang thử.

**g) R4: camera và bố cục mới**
1. Đóng cửa sổ game cũ (nếu đang mở), nhấp đúp `start-test.bat` lại, bấm **Mở overlay ↗**. Kéo cửa sổ overlay cao lên cho dễ nhìn.
2. Nhìn bố cục:
   - thanh tiến độ góc trên phải (hạng mục, giai đoạn, thanh chạy, %, toàn công trình, hàng chấm);
   - bảng xếp hạng nhỏ, nền mờ, **không che** công trình đang xây;
   - dải miễn trừ nhỏ ngay trên vùng comment.
3. Bấm **Quà lớn (1.000 xu)** vài lần cho sang hạng mục khác: camera lia mượt sang công trình mới, rung nhẹ khi nhận quà.
   Bảng xếp hạng tự dời chỗ nếu công trình mới nằm ở chỗ bảng đang đứng. Xong hạng mục thì camera đẩy chậm vào khoảng 5 giây.
4. Trên trang trạng thái bấm **Toàn cảnh**: camera thu nhỏ, lia từ đỉnh xuống hồ sen; bảng mờ đi; hiện bản đồ thu nhỏ góc dưới trái.
   Bấm **Lia giới thiệu**: camera đi từ trời xuống cổng tam quan.
5. Thử khung **Camera và hiển thị**: kéo **Zoom tối đa**, **Công trình chiếm**, chọn chỗ đặt bảng, kéo độ đậm nền: overlay đổi ngay.
6. **So với live thật:** chụp màn hình điện thoại lúc đang xem một phiên live TikTok (dọc). Gửi ảnh về máy tính.
   Trên cửa sổ overlay bấm phím `D`, kéo thả ảnh đó vào. Xem chữ của game (thanh tiến độ, bảng, dải miễn trừ) có bị
   nút tim/chia sẻ, khung comment, tên kênh của TikTok che không. Bị che thì báo em, hoặc sửa `overlay.safeArea` trong `config.json`.
7. Giờ vàng: tạm thời chỉ bật được bằng lịch trong `config.json` (`goldenHour.schedule`); khi bật, ô sự kiện hiện `Giờ vàng ×2 · còn …` đếm ngược.

**h) Giai đoạn 4a: độ đông và trụ trì**
1. Nhấp đúp `start-test.bat`, bấm **Mở overlay ↗**. Đặt overlay và trang trạng thái cạnh nhau.
2. Trên trang trạng thái bấm **Bắt đầu phiên**: trụ trì dang tay, chào mở phiên.
3. Khung **Độ đông của phòng**: bấm **Vắng**. Bấm **Người vào phòng**: trụ trì chào người đó bằng tên (mỗi người một lần).
   Bấm **Quà nhỏ (1 xu)**: trụ trì cúi chào, "Cảm ơn … đã góp một viên gạch!".
4. Bấm **Vừa**. Bấm **1.000 tim**, **Comment** vài lần: sau khoảng 10 giây trụ trì chào gộp "Chào A, B và C…".
   Bấm **Quà vừa (100 xu)**: trụ trì vẫy tay, nhắc "một xe trâu chở đá". Bấm **Quà lớn (1.000 xu)**: cúi chào, "đại hồng chung".
5. Bấm **Rất đông**, bấm **Quà nhỏ** nhiều lần: trụ trì không cảm ơn từng người; khoảng 30 giây sau cảm ơn chung "Cảm ơn … thiện hữu".
6. Để yên vài phút ở **Vắng**: trụ trì kể chuyện, hướng dẫn cách góp công.
7. Câu có **viền cam** là câu em viết thêm, chưa duyệt (chỉ hiện ở giả lập). Đọc trong `config\dialogues.json`, đúng thì đổi `"verified": true`.
8. Bấm **Tự động**: chế độ tự tính theo người xem và người tương tác (đổi sau 2 phút ổn định). Chọn kịch bản
   **Phòng rất đông**, bấm **▶ Chạy**: sau vài giây chế độ lên **Rất đông** (đợt dồn dập), mảnh bay chậm lại (10 mảnh/giây).
9. Xây tới công trình to (ví dụ Chính điện): trụ trì tự sang bên phải nếu đứng bên trái che công trình.

**i) Giai đoạn 4b: thông báo quà, mục tiêu tim, Kho thoại**
1. Đóng game đang chạy, nhấp đúp lại `start-test.bat`, mở overlay cạnh trang trạng thái. Bấm **Bắt đầu phiên**.
2. Khung **Độ đông**: bấm **Vừa**. Bấm **Quà nhỏ** nhiều lần liền: thông báo góc trên trái gộp lại, số quà tăng dần
   ("một viên gạch" → "một bó gỗ"). Bấm **Quà vừa**, **Quà lớn**: thông báo có ảnh xe trâu, chuông.
3. Bấm **Đông**, bấm **Quà nhỏ**: chỉ hiện dòng nhỏ `+… công · Tên` bay lên; **Quà vừa** vẫn bật thông báo.
4. Ô sự kiện (dưới thanh tiến độ) hiện `❤ 0/5.000 · Đủ 5.000 tim mở khóa màn múa lân`. Khung **Mục tiêu tim**: gõ `2000`,
   bấm **Đặt mục tiêu**. Bấm **1.000 tim** hai lần: múa lân khoảng 14 giây, hoa giấy rơi, trụ trì mời xem;
   ô sự kiện đổi thành `❤ 2.000 tim · đã mở khóa màn múa lân`. Bấm **Tự động theo chế độ** để về nấc tự động.
5. Bấm **Kho thoại ↗**: xem cảnh báo, bấm một nhóm, thử sửa một câu thêm chữ "may mắn" (hiện ⚠), bấm **Nói thử** (trụ trì nói trên overlay),
   **Duyệt** vài câu, **Lưu**. Mở lại trang thấy câu đã duyệt hết viền cam.

**j) Giai đoạn 4c: ảnh nhân vật, lối đi**
1. Đóng game đang chạy, nhấp đúp lại `start-test.bat`. Trên trang trạng thái bấm **Kiểm tra ảnh ↗**, kéo xuống phần ảnh đã cắt:
   xem các nhóm **Nhân vật**, **Xe trâu, voi**, **Tượng võ tướng đá** trên 3 nền (viền sạch, không mất tay chân, dụng cụ).
2. Bấm **Lối đi ↗**. Xem các lối đi có chạy đúng trên đường đá, sân gạch không; dưới danh sách phải báo "Mọi lối đi nối liền nhau".
3. Chọn hạng mục **Gác chuông**: người mẫu đứng ở chân gác chuông, cao khoảng 1/8 gác chuông. Bấm **▶ Cho một người đi từ cổng vào**:
   người đi qua cổng tam quan, theo lối tới gác chuông. Thử thêm **Chính điện**, **Bảo tháp – Tầng 1**, **Nhà tổ**.
4. Kéo xuống dưới hồ sen: các ô ghi danh (vuông tím) có tượng mẫu dọc hai bên đường đá.
5. Thử dời một điểm, thêm một ô ghi danh, bấm **Lưu**, tải lại trang: vẫn giữ. Muốn bỏ: sửa lại rồi lưu.
   Mình thấy chỗ nào lối đi chưa hợp (đi xuyên cây, xuyên tường) thì chỉnh trên trang này, hoặc báo em.

**k) Lõi game không cần trình duyệt.** Đóng `start-test.bat` trước, rồi gõ `npm run demo -- --reset`.
Lệnh này xóa dữ liệu thử và chạy một chuỗi sự kiện mẫu. Màn hình in từng giai đoạn, từng hạng mục vừa xong, kèm các bảng xếp hạng.

---

## 6. Chỉnh cấu hình

Các file sau được tạo tự động ở lần chạy đầu, từ bản mặc định trong `config\defaults\`:

| File | Nội dung |
|---|---|
| `config\config.json` | Điểm quy đổi, trần ngày, giờ vàng, nhãn chữ trên overlay, danh hiệu, bố cục overlay… |
| `config\project.json` | **Danh sách hạng mục** theo thứ tự xây, giá, các mẫu giai đoạn (mục 5 của SPEC) |
| `config\events.json` | Lịch sự kiện dương lịch, âm lịch (Mùng 1, Rằm, Tết…) |
| `config\dialogues.json` | Kho thoại (mục 9C): thoại trụ trì (`session_start`, `greet_single`, `gift_small`… 15 nhóm) và nhãn `piece_burst`. Xem dưới |

- Mở bằng Notepad để sửa, lưu lại rồi tắt và bật lại game. Từ giai đoạn 7, sửa trực tiếp trên trang admin.
- Ghi sai thì game không chạy và báo rõ chỗ sai, ví dụ: `items: Hạng mục "tam_quan": không có mẫu giai đoạn "vuaa"`.
- Muốn về mặc định: xóa file trong `config\` (KHÔNG xóa thư mục `defaults`), rồi chạy lại game.

### `config\dialogues.json`: kho thoại
Mỗi nhóm (`session_start`, `greet_single`, `greet_group`, `returning`, `gift_small`, `gift_medium`, `gift_large`, `gift_huge`,
`gift_thanks_group`, `progress`, `item_complete`, `stage_ritual`, `idle_story`, `idle_howto`, `session_end`, `toast_gift` (chữ thông báo quà),
`goal_text` (chữ mục tiêu tim), `goal_reached` (trụ trì nói khi đủ tim), `piece_burst`) có:
- `mode`: `shuffle` (xáo trộn, hết một vòng mới lặp lại), `sequential` (lần lượt), `random` (ngẫu nhiên theo `weight`);
- `cooldownSec`: nghỉ ít nhất bao nhiêu giây giữa hai lần nói cùng nhóm;
- `lines`: danh sách câu, mỗi câu `{ "text", "tiers", "weight", "enabled", "verified" }`.
  `tiers` rỗng = mọi chế độ, hoặc ghi `["vang", "vua"]`… `enabled: false` = tạm tắt câu. Thêm bao nhiêu câu cũng được.
- Biến dùng được: `{name}` `{names}` `{n}` `{gift}` `{material}` `{item}` `{stage}` `{ritual}` `{itemIndex}` `{itemTotal}`
  `{percent}` `{count}` `{target}` `{reward}`. Ghi sai biến (ví dụ `{ten}`) thì game báo lỗi khi mở.
- **Duyệt câu:** câu do em viết thêm có `"verified": false`. Live thật chỉ nói câu `"verified": true`. Mình đọc từng câu
  (nhất là nhóm `idle_story` có kiến thức lịch sử), thấy đúng thì đổi thành `true` – hoặc dùng **trang Kho thoại** (dưới).
- Nguyên tắc: không hứa phước báu, may mắn, bình an; nhóm `gift_…` không có từ ngữ tôn giáo; "A Di Đà Phật" chỉ ở mở phiên,
  đóng phiên, lễ, xong hạng mục. Test tự động (`npm test`) quét kho thoại mặc định theo các nguyên tắc này.

**Trang Kho thoại** (trang trạng thái → **Kho thoại ↗**, hoặc `http://127.0.0.1:3000/admin/dialogues`), sửa trực tiếp, không cần mở file:
- Cột trái: các nhóm, số câu **chưa duyệt**, số câu **lỗi**; trên cùng là cảnh báo nhóm nào chưa có câu đã duyệt (live thật sẽ im lặng lúc đó).
- Bấm một nhóm: sửa câu, chọn chế độ dùng câu (vắng/vừa/đông/rất đông), trọng số, bật/tắt; **Duyệt** từng câu hoặc **Duyệt cả nhóm**;
  **+ Thêm câu** (câu mình tự thêm mặc định đã duyệt); kéo ⠿ để đổi thứ tự; **Xóa**.
- Gõ tới đâu kiểm tra tới đó: có từ cấm, từ tôn giáo trong câu cảm ơn quà, biến sai thì hiện ⚠ ngay dưới câu.
- **Nói thử**: trụ trì nói câu đó trên overlay với dữ liệu mẫu ("Tên người xem", "một xe trâu chở đá"…); câu của `toast_gift` hiện thành thông báo quà.
- **Lưu**: có hiệu lực ngay. Bản cũ tự backup vào `data\<hồ sơ>\backups\dialogues\` (giữ 30 bản). Lỗi thì không lưu, báo rõ chỗ sai.
- **Xuất file JSON** / **Nhập file JSON** (hỏi lại trước khi thay, bản cũ được backup).
- Trang trạng thái cũng hiện cảnh báo nhóm chưa có câu duyệt, để mình duyệt trước khi live thật.

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

Mỗi giai đoạn có `name`, có thể có `ritual` (tên lễ, ví dụ "Lễ dựng cột") và `build` (xây vùng nào, mục 7 SPEC):

| Trong `build` | Ý nghĩa |
|---|---|
| `part` | Vùng được xây: `nen`, `cot`, `khung`, `mai`, `tuong`, `trangtri`, `nuoc`, hoặc danh sách vùng. `matdat` = giai đoạn chỉ tác động mặt đất |
| `look` | `full` (màu thật) hoặc `wood` (gỗ thô). Với `matdat`: `coc` (cọc, dây), `dao` (đất đào), `dong` (đống vật liệu) |
| `band` | `[từ, đến]` phần trăm chiều cao của vùng tính từ dưới lên, ví dụ nền `[0, 40]` rồi `[40, 80]` |

Ví dụ: `"build": { "part": "cot", "look": "wood", "band": [15, 100] }` là dựng phần trên của cột bằng gỗ thô.

Quy tắc chia mảnh:
- Hai giai đoạn cùng xây một vùng: giai đoạn dải hẹp hơn được ưu tiên.
- Giai đoạn ghi **đủ cả 7 vùng** nhận **phần còn lại** chưa xây (dùng cho "Hoàn thiện").
- Xong hạng mục bao giờ cũng đủ hình.
- Giai đoạn xây vùng mà công trình không có thì hiện đống vật liệu to dần, để vẫn có phản hồi nhìn thấy.

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

Mục `pieces` (xây từng mảnh):

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `size` | nền 22×12, cột cao 14, khung dài 24, ngói 12×8, gạch 12×6, trang trí 10×10, nước 16×16 | Cỡ mảnh theo vùng (điểm ảnh bản đồ). Mảnh to hơn thì ít mảnh hơn |
| `maxPerSec` | vắng 20, vừa 20, đông 14, rất đông 10 | Số mảnh bay tối đa mỗi giây theo chế độ độ đông |
| `materials` | "khối đá", "đoạn cột", "thanh gỗ", "viên ngói", "viên gạch"… | Tên vật liệu trong nhãn `{material}` |
| `burstSec` | 3 | Vùng vừa xây sáng viền và nhãn hiện trong bao nhiêu giây |

Chữ trên thanh tiến độ nằm ở `labels.progress` (đổi được câu chữ, giữ các chỗ `{...}`):

| Khóa | Mặc định |
|---|---|
| `item` | `Hạng mục {number}/{count} · {item}` |
| `stage` | `Giai đoạn {number}/{count}: {stage}` |
| `project` | `Toàn công trình {percent}%` |
| `completed` | `{project} đã hoàn thành` |

Tên bia trên bảng xếp hạng: `labels.boards.itemTop`, mặc định `Bia ghi danh – {item}`.

Mục `camera` (SPEC mục 8; `maxZoom`, `siteWidth` chỉnh được bằng thanh trượt trên trang trạng thái):

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `maxZoom` | 1,6 | Phóng to tối đa (1,6 = đúng độ nét ảnh bản đồ; hơn nữa sẽ mờ) |
| `siteWidth` | 0,52 | Công trình chiếm bao nhiêu phần bề ngang khung hình (0,45–0,6) |
| `overviewEverySec` | vắng 180, vừa 360, đông 0, rất đông 0 | Mỗi bao nhiêu giây tự thu toàn cảnh (0 = không tự động) |
| `overviewSec` | 9 | Thu toàn cảnh trong bao nhiêu giây |
| `tourEverySec` | vắng 600, còn lại 0 | Mỗi bao nhiêu giây tự lia giới thiệu |
| `tourSec` | 20 | Lia giới thiệu trong bao nhiêu giây |
| `ceremonySec`, `ceremonyZoom` | 5, 1,15 | Xong hạng mục: đẩy vào trong bao nhiêu giây, phóng thêm bao nhiêu lần (không quá `maxZoom`) |
| `shakeMinCoins` | 1000 | Quà từ bao nhiêu xu thì camera rung nhẹ |

Mục `overlay` (bố cục): `boardPosition` (`auto`, `leftMiddle`, `rightMiddle`, `leftTop`), `minimap` (`overview`, `always`, `off`),
`opacity` (độ đậm nền: `progress`, `board`, `events`, `disclaimer`, từ 0 đến 1), `boardRotateSec` (15 giây).

Ô sự kiện: chữ ở `labels.events` (`goldenHour` mặc định `{name} ×{multiplier} · còn {time}`, `event`, `total`).
Lọc tên: `nameFilter.bannedWords`, ví dụ `"bannedWords": ["từ cấm 1", "từ cấm 2"]`; tên vi phạm hiện `labels.anonymousName`.

Mục `crowd` (chế độ độ đông, SPEC 9A): `viewers` = ngưỡng trên của vắng, vừa, đông theo số người xem (mặc định `[5, 50, 300]`,
lớn hơn là rất đông); `interactors` = như vậy theo số người tương tác trong `windowSec` giây (mặc định `[3, 30, 150]`, 300 giây);
`hysteresisSec` (120) = phải ổn định bao lâu mới đổi; `burstEvents`, `burstWindowSec` (100 sự kiện / 10 giây) = đợt dồn dập thì lên mức ngay.

Mục `gifts` (tên quà theo mức, SPEC 14.6): `tiers` = danh sách `{ "minCoins", "name", "dialogue" }` (từ bao nhiêu xu, tên vật phẩm
hiện ở `{gift}`, nhóm thoại cảm ơn). `displayNames` (tùy chọn) = tên tiếng Việt theo mã quà gốc, ví dụ `{ "5655": "Hoa hồng" }`:
có thì câu cảm ơn nhắc thêm, ví dụ "một viên gạch (Hoa hồng)".

Mục `abbot` (trụ trì): `idleSec` = khoảng nghỉ giữa hai lần nói chuyện phiếm theo chế độ, `[ít nhất, nhiều nhất]` giây
(`[0, 0]` = không nói); `waveMinCoins` (100), `bowMinCoins` (1000) = quà từ bao nhiêu xu thì vẫy chào, cúi chào;
`greetGroupSec` (10) = gộp lời chào; `thanksGroupSec` (30) = gộp lời cảm ơn chung; `maxQueue` (6) = hàng đợi câu nói tối đa;
`progressMarks` (`[50, 80, 95]`) = mốc % báo tiến độ ở phòng đông.

Mục `toast` (thông báo quà): `sec` (4) = hiện bao nhiêu giây; `mergeSec` (5) = gộp quà nhỏ liên tiếp trong bao nhiêu giây;
`smallMaxCoins` (99) = quà nhỏ là tới bao nhiêu xu; `dongMinCoins` (100), `ratdongMinCoins` (500) = ngưỡng ở phòng đông, rất đông;
`ratdongTopPercent` (10) và `windowSec` (300) = phòng rất đông chỉ hiện quà thuộc top 10% trong 5 phút.
Mục `heartGoal` (mục tiêu tim): `targets` = các nấc theo chế độ; `reward` = tên phần thưởng hiện trong `{reward}` (mặc định "màn múa lân");
`festivalSec` (14) = múa lân bao lâu. Chữ trong ô sự kiện: `labels.events.heartGoal`, `labels.events.heartGoalDone`; dòng "+công": `labels.plusPoints`.
Ảnh vật phẩm trong thông báo quà: `gifts.tiers[].icon`.
Mục `characters`: `heightMap` (54) = một người cao bao nhiêu đơn vị bản đồ; `maxCharacters` (40) = tối đa bao nhiêu nhân vật cùng lúc (dùng từ 4d).

File `config.json` cũ của bản tháp (có mục `tower`, tên tầng, các khóa `floor1WidthPx`, `towerTaper`, `towerCenterX`, `towerBaseY`
trong mục `overlay`…) được game **tự dọn** ở lần chạy đầu, phần mình đã chỉnh khác được giữ nguyên.

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
| `npm run assets:build` | Cắt ảnh trụ trì, giao diện, vật phẩm, bia → `assets/game` + `assets/manifest.json` |
| `npm run assets:upscale` | Phóng ×4 ba ảnh bản đồ bằng Real-ESRGAN → `assets/work/esrgan` |
| `npm run assets:segment [mã…]` | Tách hình công trình bằng rembg theo `assets/map-cuts.json` → `assets/work/map/rembg` |
| `npm run assets:nobg props` rồi `npm run assets:props` | Tách nền và cắt 18 ảnh đống vật liệu → `assets/game/props` + manifest |
| `npm run assets:nobg lion_dance` rồi `npm run assets:festival` | Tách nền và cắt 14 khung múa lân → `assets/game/festival` + manifest |
| `npm run assets:nobg chars_… vehicles honor_statues` rồi `npm run assets:chars` | Tách nền và cắt nhân vật, xe, tượng → `assets/game/chars`, `vehicles`, `honor` + manifest |
| `npm run assets:map` | Ghép nền, cắt công trình, tiền cảnh → `assets/game/map`, `buildings`, `fg` + phần `map` của manifest |
| `node --import tsx scripts/slice-sheet.ts <sheet.png> <thư_mục> --names a,b --equal` | Cắt một sprite sheet nền trong suốt bất kỳ |

Cấu trúc thư mục và quy tắc làm việc: xem [CLAUDE.md](CLAUDE.md) và mục 2 của [SPEC.md](SPEC.md).
