# Changelog

## v1.0.0 / phase-4 (Ticket-04 "Bình minh: phát hành v1.0.0", contract v1.3)
- **Benchmark** `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`: cửa sổ Chrome 1280×720, vsync tắt, cảnh chuẩn (200 Bóng Mực, 100 đom đóm, L1–L3 sáng), camera bay vòng, đủ các trường của ticket.
- **Soak** `node --expose-gc --jitless --max-semi-space-size=1 src/soak.js`: 10 Đêm trong một tiến trình, input ngẫu nhiên theo seed.
- **Bảng xếp hạng cục bộ:** top 10, lưu `data/leaderboard.json`, màn hình từ menu, nhập tên sau Bình Minh/thua (hỗ trợ tiếng Việt), `node server.js --export-leaderboard out.json`.
- **Accessibility:** đổi phím (phát hiện trùng, khôi phục mặc định), phụ đề/chỉ báo hình ảnh + mũi tên chỉ Bóng Mực mới, giảm chuyển động, chữ ≥ 18 px + chữ lớn ×1.25.
- **Hiệu năng:** Bóng Mực vẽ bằng instanced mesh (5 draw call), bloom ở 1/4 độ phân giải, bỏ MSAA canvas thừa, bỏ CSS filter vẽ lại mỗi khung.
- `run_cmd` đổi thành `node server.js` (để `--export-leaderboard` tới được script; `npm start` vẫn dùng được để chơi).
- Release v1.0.0: `dao-den-long-v1.0.0.zip` (web tĩnh + server, không cần `npm install`).

## phase-3 (Ticket-03 "Đèn cạn dầu", contract v1.2)

### Phase 3 — Breaking changes
- **Không còn thắng sớm.** `game_over.reason = "all_lit"` bị xóa. Thắng chỉ ở bình minh: `dawn_survived` khi còn sống và ≥ ceil(0.6 × số đèn) đèn đang sáng; ngược lại `dawn`. `no_flames` vẫn luôn được xét trước.
- **Thời lượng Đêm** 300/330/360 s → **240/270/300 s** (`night{1,2,3}_duration_s`).
- **Điểm:** +10 → **+5** mỗi đom đóm nạp (`score.per_mote`); `per_second_left` → **0** (bỏ thưởng thời gian). Mới: +40 thắp lại, +15 khi Tỏa Sáng trúng bóng đang hút, bình minh +50 + floor(fuel) mỗi đèn sáng.
- **Đèn có thể tắt:** `fuel` 100 → hao 1/s; hết dầu → `lantern_out`, `deposited = 0`. Đèn sáng nhận đom đóm để **châm dầu** (event `refuel`, không phải `deposit`).
- **Vùng an toàn** chỉ còn khi `lit && fuel ≥ 30` (trước đây: mọi đèn sáng).
- **Bóng Mực:** thêm trạng thái `drain`; hết choáng giờ luôn về `wander` (trước đây: `chase` nếu Mây trong 12 m).
- **Sức chứa** không cố định 10: `capacity = min(20, 10 + 2 × successful_lights)`; snapshot có `player.capacity`.
- **Snapshot/scenario/event mới:** `lanterns[].fuel/ever_lit/relit_count`; scenario `lanterns[].fuel/ever_lit`, `player.successful_lights`, `shades[].target_lantern_id`; event `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit.relight`.

### Thêm
- Thanh dầu trên đèn, nhấp nháy 1 Hz khi < 30; đèn tắt bị xẹp và có giấy rách; tia hút của Bóng Mực.
- Cài đặt "Bảng màu dễ phân biệt" (lưu lại): Bóng Mực #00B3FF, cảnh báo UI trắng + ⚠.
- ADR 0001, 74 test, 28 scenario.

## phase-2 (Ticket-02, contract v1.1)
- Số liệu chuẩn; thứ tự xử lý 12 bước mỗi tick; 3 Đêm (Đảo Bến chuẩn hóa, Đảo Cau, Đảo Chuông).
- Mới: Lướt, Tạm dừng, rơi khỏi đảo + hồi sinh, Gió Lạc, Bùa Gió, gió mạnh, bục nhảy, tầng/dốc/tháp.
- Menu → giới thiệu Đêm → kết quả → Đêm kế → Bình Minh; menu tạm dừng; Cài đặt (âm lượng, độ nhạy chuột) được lưu; HUD đầy đủ; bảng màu chuẩn.
- Âm thanh: nhạc nền và tiếng Tỏa Sáng/nạp ánh sáng dùng file mp3 của tác giả.
- 60 test + 20 scenario; `scripts/browser-check.mjs` đo FPS (TB 43.6 ở 1280×720).

## phase-1
- Đêm 1 – Đảo Bến chơi được trên trình duyệt (Three.js): di chuyển, nhảy, camera 3D, đom đóm, nộp, 5 Đèn Lồng Lớn, Bóng Mực, xung sáng, thắng/thua, điểm, HUD, chơi lại.
- Chế độ headless theo Test Contract v1.0 (`node src/headless.js`), `game.contract.json`.
- 36 test (`npm test`), 9 scenario bằng chứng, CI, harness AI (AGENTS.md, skill verify, Stop hook).
