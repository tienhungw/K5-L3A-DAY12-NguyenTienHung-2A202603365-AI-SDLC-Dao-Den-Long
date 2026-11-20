# Changelog

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
