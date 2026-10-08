# Fidget Toy Box 🧸

**Chơi thử:** https://nhatbien.github.io/fidget-toy-box/

Game HTML5 thư giãn gồm 12 món đồ chơi chống stress: Pop It, con quay, xốp nổ, slime, bảng
công tắc, đàn gõ, cát động lực, bóng bay, trống điện tử, vẽ xoay, vườn thiền và con lắc Newton.
Game viết bằng JavaScript thuần với Canvas 2D, không dùng thư viện ngoài. Toàn bộ âm thanh được
tạo bằng code. Bản build chỉ khoảng 1,1 MB.

Mỗi món có 6 kiểu (1 miễn phí và 5 kiểu mở bằng sao ★ kiếm được khi chơi), tổng cộng 60 kiểu để mở
khóa. Một số món có thêm chế độ riêng: đàn gõ có chế độ học bài hát, trống có nhịp nền, con quay
ghi kỷ lục RPM, bóng bay có quả vàng thưởng sao.

Game đã làm sẵn theo yêu cầu kỹ thuật của **YouTube Playables**, đồng thời chạy được trên itch.io,
CrazyGames, GameDistribution và website riêng.

## Chạy thử trên máy

```bash
npm install
```

```bash
npm run dev
```

- Mở http://localhost:5173 để chạy bản web thường.
- Mở http://localhost:5173/dev-youtube.html để chạy với **bản giả lập YouTube SDK**:
  - Nhấn `M` để giả lập YouTube tắt hoặc bật tiếng, `P` để tạm dừng hoặc tiếp tục.
  - Thêm `?lang=vi` vào địa chỉ để đổi ngôn ngữ.
  - Mọi lần gọi SDK hiện trong Console với tiền tố `[ytgame]`. Nếu vi phạm luật, Console báo đỏ.
- Mở thẳng một món để test: `http://localhost:5173/?toy=spinner` (các id có trong `src/toys/meta.js`).
- Kiểm thử tự động: mở Console và nạp `tools/smoke-test.js`, rồi gọi `await runSmokeTest()`.
  Script mở cả 12 món, chạm, vuốt và đa chạm ngẫu nhiên, đổi qua cả 6 kiểu, bấm nút, rồi báo số
  lỗi và thời gian vẽ mỗi khung hình.
- Chụp lại ảnh gameplay: nạp `tools/capture-shots.js`, rồi gọi `await captureShots('portrait')`
  (đặt cửa sổ 450×800) hoặc `await captureShots('landscape')` (đặt cửa sổ 1280×720). Ảnh được lưu
  vào `store/screenshots/` qua server dev.

## Build để đăng

```bash
npm run build
```

Lệnh trên tạo ra:

| File | Dùng để |
|---|---|
| `dist/fidget-toy-box-youtube.zip` | Upload lên YouTube Playables Developer Portal (đã nạp SDK `game_api/v1`) |
| `dist/fidget-toy-box-web.zip` | Upload lên itch.io, CrazyGames, GameDistribution, Netlify… |
| `dist/web/` | Thư mục web tĩnh, kéo thả lên Netlify Drop hoặc GitHub Pages |

## Cập nhật bản online

Sửa code xong, chạy lệnh sau để build và đưa lên GitHub Pages:

```bash
npm run deploy
```

## Có link public để điền form YouTube

Form của YouTube cần link game chơi được trên web. Link tải từ Google Drive hay Dropbox không được
chấp nhận. Cách nhanh nhất:

1. **itch.io** (miễn phí):
   - Vào *Create new project* → *Kind of project*: **HTML**.
   - Upload `fidget-toy-box-web.zip`, tick *This file will be played in the browser*.
   - Embed: chọn *Click to launch in fullscreen* hoặc đặt kích thước 1280×720.
   - Tick *Mobile friendly*, orientation để *Default*.
   - Ảnh bìa dùng `store/titled/itch_cover_630x500.jpg`.
   - Ảnh chụp gameplay thật dùng `store/screenshots/`: 13 ảnh ngang 1920×1080 và 13 ảnh dọc 900×1600.
   - Bấm *Publish*: bạn có link dạng `https://<tên>.itch.io/fidget-toy-box`.
2. **Netlify Drop**: kéo thư mục `dist/web` vào https://app.netlify.com/drop để có link `*.netlify.app`.
3. **CrazyGames / GameDistribution**: upload `fidget-toy-box-web.zip`. Ảnh bìa ngang, dọc và vuông có
   sẵn trong `store/titled/`. Lượt chơi thật ở đây là số liệu tốt để ghi vào form YouTube.

## Sau khi YouTube duyệt

- Upload `dist/fidget-toy-box-youtube.zip` lên Playables Developer Portal và chạy Test Suite của họ.
- Thumbnail cho YouTube dùng `store/youtube/` (**không có chữ hay logo**, vì luật Playables cấm branding
  trong thumbnail): ngang 16:9, dọc 9:16 và vuông 1:1.
- Bật quảng cáo trong mục *Monetization* của Portal. Game đã gọi sẵn:
  - Quảng cáo có thưởng (`requestRewardedAd`) ở nút **"Miễn phí (QC)"** khi mở khóa kiểu mới.
  - Quảng cáo chen giữa (`requestInterstitialAd`) khi quay về kệ đồ chơi, cách nhau ít nhất 3 phút.

## Những yêu cầu Playables game đã đáp ứng

- **Nạp SDK và tín hiệu sẵn sàng:**
  - SDK được nạp trước code game.
  - `firstFrameReady` gọi lúc màn hình tải đang hiện, `gameReady` gọi khi kệ đồ chơi đã bấm được.
- **Lưu dữ liệu:**
  - Dùng `loadData` và `saveData` của YouTube, có đợi `loadData` xong rồi mới lưu.
  - Lưu khi mở khóa, khi tạm dừng, khi về menu và tự động mỗi 8 giây nếu có thay đổi. Dữ liệu chỉ khoảng 1 KB.
  - Trong môi trường YouTube, game không dùng localStorage.
- **Âm thanh:**
  - Tuân theo `isAudioEnabled` và `onAudioEnabledChange`.
  - Không có nút tắt tiếng tổng; chỉ có công tắc riêng cho nhạc nền, hiệu ứng âm thanh và rung.
- **Tạm dừng:** `onPause` dừng vòng lặp, âm thanh và bộ hẹn giờ nhạc. Trong YouTube, game không dùng Page Visibility API.
- **Màn hình:**
  - Chơi được ở mọi tỉ lệ từ 9:32 đến 32:9, không khóa chiều xoay.
  - Đổi kích thước cửa sổ không mất trạng thái.
  - Chữ nét theo devicePixelRatio.
- **Điều khiển:**
  - Hỗ trợ cảm ứng, chuột và đa chạm.
  - Bàn phím: phím mũi tên và Enter trên kệ, `Esc` để đóng hộp thoại hoặc về kệ (game không chặn phím `Esc`).
- **Nội dung:**
  - Không có nút thoát, không có link ra ngoài, không có lời mời chia sẻ.
  - Khi mở khóa hết, game báo đã hết nội dung.
- **Ngôn ngữ:**
  - Lấy ngôn ngữ qua `getLanguage`.
  - Có 10 thứ tiếng: en, vi, es, pt, fr, de, id, it, tr, ru.
- **Kỹ thuật:**
  - Chỉ dùng đường dẫn tương đối, tên file an toàn.
  - Gói ban đầu khoảng 1,1 MB (giới hạn là 30 MiB, khuyến nghị dưới 15 MiB).
  - Mỗi file nhỏ hơn 512 KiB; `game.js` là 291 KiB.
  - Bộ nhớ JS khoảng 11 MB (giới hạn 512 MB).
  - Code được chuyển về chuẩn ES2019 để chạy trên các trình duyệt cũ hơn.
- **Đối chiếu với SDK thật:** đã kiểm tra với SDK thật (phiên bản 1.20260928), cả 14 hàm game gọi đều tồn tại.

## Tạo lại ảnh bằng Codex CLI

Toàn bộ ảnh do Codex CLI (`codex exec --enable image_generation`) tạo. Prompt nằm trong
`tools/image_prompts.json`.

```bash
python3 tools/gen_images.py A B C D
```

```bash
python3 tools/process_images.py
```

```bash
python3 tools/make_store_assets.py
```

Muốn tạo lại riêng vài ảnh: `python3 tools/gen_images.py --only thumb_slime icon`.

## Cấu trúc code

```
index.html            trang game (bản dev nạp src/main.js dạng ES module)
dev-youtube.html      như trên + giả lập YouTube SDK (không đưa vào bản build)
src/app.js            vòng lặp, xử lý chạm, thanh công cụ, sao ★, mở khóa, lưu, hộp thoại
src/platform.js       lớp tích hợp YouTube Playables SDK / web
src/audio.js          bộ tổng hợp âm thanh WebAudio (hiệu ứng + nhạc nền ambient)
src/menu.js           kệ đồ chơi
src/gfx.js, fx.js, ui.js   thư viện vẽ, hiệu ứng hạt, nút và hộp thoại
src/toys/*.js         12 món đồ chơi (API mô tả trong docs/TOY_API.md)
assets/               ảnh WebP và font Baloo 2 (SIL OFL) dùng trong game
art_src/              ảnh gốc PNG từ Codex (không đưa vào bản build)
store/                ảnh cho các cổng game: youtube/ (không chữ), titled/ (có logo),
                      screenshots/ (ảnh gameplay thật), listing.md (mô tả game)
tools/                build, server dev, tạo ảnh, giả lập SDK, kiểm thử, chụp ảnh
```
