# Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0": giả định, tiêu chí nghiệm thu, đánh giá

Spec: [docs/specs/phase-4-ticket-04.md](../specs/phase-4-ticket-04.md) · Bằng chứng: [docs/proof/phase-4/](../proof/phase-4/README.md)

## 1. Quyết định
- **Bench chạy trong Chrome thật** (cửa sổ 1280×720), điều khiển qua DevTools Protocol bằng `scripts/bench.mjs`, không dùng thư viện ngoài. Lý do: đây là bản web, nên đo trong trình duyệt mới đúng renderer thật.
- **Cảnh bench** là chế độ `?bench` của renderer, dùng chính sim với cờ `world.bench`. Cờ này tắt sát thương, nhặt đom đóm, hao dầu và điều kiện kết thúc; bóng vẫn `wander` theo luật bình thường. Cờ chỉ được bật từ trình duyệt, nên headless/scenario không bị ảnh hưởng (80 test giữ nguyên kết quả).
- **Bảng xếp hạng lưu phía server Node** (`data/leaderboard.json`, ghi nguyên tử bằng tmp + rename), không dùng localStorage. Lý do: lệnh `<run_cmd> --export-leaderboard` phải đọc được dữ liệu từ đĩa.
- **`run_cmd` đổi thành `node server.js`.** Với `npm start --export-leaderboard out.json`, npm coi `--export-leaderboard` là cờ của npm và không chuyển cho script.

## 2. Giả định
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| D1 | Mây trong bench | Đứng yên và bị Bóng Mực bỏ qua (không phát hiện), để bóng luôn ở `wander` như ticket mô tả. |
| D2 | "Rải đều trên đảo" | Phân bố đều theo diện tích trong đĩa bán kính 38 m (r = 38·√u), dùng `createRng(42)`. Đom đóm cũng vậy. |
| D3 | `load_ms` | Từ `performance.timeOrigin` của tiến trình `node scripts/bench.mjs` (gồm khởi động server + Chrome + tải trang) tới khung `requestAnimationFrame` đầu tiên của cảnh bench. |
| D4 | `peak_mem_mb` | Tổng RSS (Windows: working set) của mọi tiến trình Chrome, lấy mẫu mỗi 5 s trong lúc đo. Lấy mẫu mỗi 1 s làm giật khung trên Windows (p1 low 26 → 9). |
| D5 | Đo dt | dt giữa hai callback `requestAnimationFrame` liên tiếp, sau 3 s khởi động; dừng khi tổng dt đạt `duration`. |
| D6 | Soak "reset xong Đêm cuối" | Sau khi Đêm cuối kết thúc, thế giới của nó ra khỏi phạm vi và gọi `gc()` (cần `--expose-gc`) rồi mới đo. |
| D7 | Input ngẫu nhiên của soak | `createRng(seed_đêm ^ 0x5eed)`: hướng mới mỗi 30 tick, mỗi tick các nút bật với xác suất 5/3/2/10%. |
| D8 | Tên bảng xếp hạng | Chuẩn hóa NFC; 3–12 ký tự là chữ Latin (gồm tiếng Việt có dấu), số, `_`. |
| D9 | `nights_won` khi thua | Số Đêm đã thắng trước Đêm thua (0–2); điểm = tổng điểm các Đêm đã thắng. |
| D10 | Phụ đề | Mặc định bật, tắt được; tối đa 3 dòng; mỗi sự kiện hiện 1–4 s. |

## 3. Tiêu chí nghiệm thu → kiểm chứng
| Mục | Tiêu chí | Kiểm chứng | Kết quả |
|---|---|---|---|
| §1 bench chạy & đủ trường | lệnh tự thoát mã 0, `bench.json` đủ 10 trường + `contract_version 1.3` | chạy thật → [bench.json](../proof/phase-4/bench.json) | Đạt |
| §1 công thức | avg / p1 low / p95 đúng định nghĩa | test `frameStats` (tính tay) | Đạt |
| §1 ngưỡng (máy dev) | avg ≥ 60, p1 low ≥ 30, load ≤ 10 s | avg **66.4**, load **1.6 s**, p1 low **26.4** | **p1 low chưa đạt trên máy dev** (xem §4) |
| §1 cảnh chuẩn | 200 bóng `wander`, 100 đom đóm, L1–L3 fuel 100, camera r 30 / Y 15 / 15 s | code `loadBench()` + ảnh 16 | Đạt |
| §2 soak | 10 Đêm, 0 crash, RSS cuối ≤ 1.2 × đầu | [soak.json](../proof/phase-4/soak.json): 0 crash, **1.05×** + test | Đạt |
| §3 bảng xếp hạng | top 10, điểm giảm dần, bằng điểm thì ai đạt trước đứng trên, ISO có múi giờ, lưu đĩa, xuất đúng thứ tự | 3 test + ảnh 13 | Đạt |
| §3 nhập tên sau Bình Minh/thua | form ở cả hai màn, kiểm tra tên | code + chạy tay | Đạt (tay) |
| §4 đổi phím | 9 hành động, báo trùng, khôi phục mặc định, lưu | ảnh 12 | Đạt (ảnh) |
| §4 phụ đề / chỉ báo | Bóng Mực + mũi tên mép, gió, 10 s cuối, đèn < 30 | ảnh 14 + code | Đạt (ảnh/tay) |
| §4 giảm chuyển động | tắt rung camera và chớp màn hình | code (`settings.reducedMotion`) | Đạt (tay) |
| §4 cỡ chữ | ≥ 18 px (1em = 18px), chữ lớn ×1.25 | CSS + ảnh 15 | Đạt |
| §5 đóng gói | clone sạch + 3 lệnh; zip release chạy không cần `npm install` | thử clone sạch + giải nén zip vào thư mục trống, headless + browser-check 0 lỗi | Đạt |
| §6 contract v1.3 | `bench_cmd`, `soak_cmd`; v1.0–v1.2 giữ nguyên | test contract + 80 test | Đạt |
| §7 retro | 1–2 trang | [retro.md](retro.md) | Đạt |
| §7 video | .mp4 < 5 phút | — | **Người làm tự quay** (kịch bản: [docs/demo/VIDEO-SCRIPT.md](../demo/VIDEO-SCRIPT.md)) |
| DoD Release v1.0.0 | Release có bản chạy được | `dist/dao-den-long-v1.0.0.zip` đã đóng gói | **Người làm tạo trên GitHub** (máy không có `gh`) |

## 4. Đánh giá Phase 4
- **Hiệu năng:** trên laptop Intel i5-1135G7 + Iris Xe (GPU tích hợp, cắm sạc, chế độ Balanced) bench đạt avg 66.4 FPS và load 1.6 s, nhưng **p1 low 26.4 < 30**. Giữa các lần chạy giống hệt nhau p1 low dao động 12–26.
  - Đã chẩn đoán có kiểm soát: tắt sim không đổi gì; tắt HUD trước khi sửa CSS thì +15 FPS; tắt bloom thì +35 FPS.
  - Đã sửa: Bóng Mực instanced, bloom 1/4 độ phân giải, viền đặc thay vỏ trong suốt, bỏ MSAA canvas, bỏ CSS filter, lấy mẫu RSS mỗi 5 s.
  - Phần còn lại là các khung GPU chậm theo cụm của GPU tích hợp. Ticket ghi rõ số chính thức đo trên máy chấm của giảng viên.
- **Ổn định:** soak 10 Đêm không crash, RSS 1.05×, `heapUsed` 4.15 → 4.25 MB.
- **Hồi quy:** 80 test (gồm toàn bộ test Phase 1–3 còn hiệu lực) PASS.
- **Còn thiếu (người làm thực hiện):** quay video, tạo GitHub Release v1.0.0 và đính kèm zip + video.
