# Kịch bản video demo (< 5 phút) — người làm tự quay

Quay màn hình trên Windows: **Win + Alt + R** (Xbox Game Bar) ra `.mp4`; hoặc OBS. Lưu thành `demo.mp4`, đính kèm Release v1.0.0.

| Thời gian | Nội dung | Lệnh / thao tác |
|---|---|---|
| 0:00–0:20 | Giới thiệu: tên, MSSV, game, link repo | — |
| 0:20–1:50 | Chơi trực tiếp Đêm 1: nhặt đom đóm, thắp đèn, châm dầu, Tỏa Sáng đuổi Bóng Mực, Lướt; cho thấy HUD, thanh dầu, phụ đề | `npm start` → http://localhost:8765 |
| 1:50–2:20 | Cài đặt: đổi phím (báo trùng), mù màu, chữ lớn, giảm chuyển động; Bảng xếp hạng | menu |
| 2:20–2:50 | Bot chơi Đêm 2/3 (tùy chọn) | `http://localhost:8765/?autoplay&seed=5&night=2` |
| 2:50–3:30 | Bằng chứng: chạy test | `npm test` (80/80) |
| 3:30–4:00 | Headless + soak | `node src/headless.js --seed 1 --night 3 --ticks 600 --out o.jsonl` · `npm run soak` |
| 4:00–4:40 | Benchmark (mở cửa sổ 1280×720) | `npm run bench` → mở `bench.json` |
| 4:40–4:55 | Lướt nhanh AGENTS.md, skill, hook, `git log --oneline`, tag | `git tag --list` |

Nén nếu cần (khi có ffmpeg): `ffmpeg -i input.mp4 -t 299 -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 96k demo.mp4`
