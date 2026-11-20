# Retro — Đảo Đèn Lồng (Day 12 AI SDLC, 4 phase)

Nguyễn Tiến Hưng · 2A202603365 · K5 L3A. Công cụ: Claude Code (Claude Opus 5.5) trong VS Code.

## 1. Tổng hợp Evaluation 4 phase
| Phase | Yêu cầu | Kết quả | Test / scenario | Hồi quy | Chưa đạt / hạn chế |
|---|---|---|---|---|---|
| 1 — PRD-0 | Đêm 1 chơi được + headless v1.0 | Đạt | 36 / 9 | — | chưa có video |
| 2 — Ticket-02 | số chuẩn, 3 Đêm, Lướt, Tạm dừng, Gió Lạc, Bùa Gió, HUD, v1.1 | Đạt; FPS 43.6 | 60 / 20 | 15 test Phase 1 sửa có lý do | âm thanh, lưu cài đặt chỉ kiểm tra tay |
| 3 — Ticket-03 | dầu đèn, `drain`, thắng bình minh, sức chứa, mù màu, v1.2 | Đạt; ADR 0001 | 74 / 28 | 11 test + 3 scenario sửa/xóa có lý do | giả định C4–C8 có thể lệch test ẩn |
| 4 — Ticket-04 | bench, soak, bảng xếp hạng, accessibility, release, v1.3 | Đạt phần lớn | 80 / 28 | 1 test sửa có lý do | **p1 low 26.4 < 30 trên laptop iGPU**; video và Release do người làm tạo |

Xuyên suốt: không test nào bị skip; bằng chứng sinh lại từ clone sạch khớp từng byte ở mọi tag; CI chạy Ubuntu + macOS với Node 18/22.

## 2. Điều gì hiệu quả khi làm với AI
- **Đọc Test Contract trước, tách `src/sim` (thuần) khỏi `src/web`.** Đây là quyết định đáng giá nhất. Ba change request sau đều chỉ sửa sim, renderer chỉ đọc state mới, và mọi bằng chứng chạy không cần trình duyệt.
- **Kỳ vọng test tính tay từ ticket**, không đọc ngược từ sim (ví dụ "bóng cách 3 m, 4 m/s → trúng ở tick 30"). Khi test đỏ, tôi tính lại tay trước khi kết luận sim hay test sai. Nhờ vậy 7 lần test sai đều được sửa ở test chứ không "chỉnh sim cho vừa test".
- **Lưu nguyên văn ticket vào `docs/specs/` và viết ADR trước khi code** (Phase 3). Agent bám đúng chữ của ticket, ví dụ phát hiện "hết choáng thì về wander" khác với cách đã làm.
- **Đo có kiểm soát thay vì đoán.** FPS Phase 2: đoán "bloom" là sai, thủ phạm là ghi DOM mỗi khung. Bench Phase 4: so 4 biến thể (bloom/HUD/sim) mới ra đúng chỗ (bloom + CSS filter). Soak: chứng minh RSS tăng do JIT chứ không phải rò rỉ (heapUsed phẳng sau 150 Đêm) trước khi chọn cờ V8.

## 3. Điều không hiệu quả
- Phase 2 quá lớn cho 1 giờ; renderer, bot và tài liệu chiếm thời gian hơn luật. Phần UI (menu, bảng xếp hạng, đổi phím) chỉ có ảnh và kiểm tra tay, chưa có test tự động.
- Môi trường Windows tốn công: cổng 8080 bị chiếm, server nền bị treo, heredoc của Bash lỗi 3 lần, `/tmp` của Node khác `/tmp` của Git Bash, không có `gh`/`ffmpeg`.
- Số đo trên laptop dao động mạnh (p1 low 12–26 giữa các lần chạy giống hệt nhau), nên khó chứng minh ngưỡng p1 low.

## 4. Những lần AI sai và cách phát hiện (chọn lọc; đầy đủ trong [ai-log.md](ai-log.md))
| Loại | Ví dụ | Phát hiện bằng |
|---|---|---|
| Test sai tiền đề | đọc snapshot ở tick không có snapshot; quên bước 2 hút dầu trước bước 5 châm dầu; quên tick 300 cũng là bội của 60 | test đỏ → tính lại tay từng bước của tick |
| Làm khác chữ của ticket | đẩy lùi "trượt" thay vì "dừng"; hết choáng về `chase` thay vì `wander` | đọc lại spec khi viết test |
| Lỗi code | `p.vy` thay vì `p.vel.y`; trùng tên biến `n` | tự review diff; `node --check` |
| Bộ kiểm tra quá dễ dãi | 9/9 scenario PASS ngay lần đầu | mutation check (sửa kỳ vọng → phải FAIL) |
| Đoán sai nguyên nhân hiệu năng | "bloom làm chậm" (Phase 2) | đo 4 biến thể |
| Chọn sai dữ liệu demo | seed bot thua khi chụp màn "bình minh" | xem ảnh |

## 5. Harness nào giúp nhiều nhất
1. **`scripts/proof.mjs` + scenario JSON:** một lệnh chạy mọi scenario qua CLI thật hai lần (tất định), sinh bảng truy vết. Dùng lại cho cả 4 phase, chỉ thêm khóa `night`, `last_snapshot`.
2. **Stop hook** (`scripts/stop-hook.mjs`): agent không thể "xong" khi `npm test` đỏ.
3. **AGENTS.md** cập nhật mỗi phase. Mỗi lần AI sai lặp lại thì thêm một quy tắc: "kỳ vọng tính tay", "không bao giờ skip", "HUD chỉ ghi DOM khi đổi", "dầu là số nguyên 1/60", "change request cần ADR + breaking changes".
4. **`scripts/browser-check.mjs` / `bench.mjs`** (CDP, không thư viện): ảnh, lỗi console, FPS và bench trong một lệnh.
5. Skill `verify`: quy trình kiểm chứng cho agent, nạp khi cần.

## 6. Token / chi phí ước tính
| Phase | Output (ước) | Input tích lũy (ước, phần lớn được cache) |
|---|---|---|
| 1 | ~50k | ~2–3 triệu |
| 2 | ~80k | ~4–6 triệu |
| 3 | ~45k | ~3–4 triệu |
| 4 | ~70k | ~5–7 triệu |
| **Tổng** | **~250k** | **~15–20 triệu** |

Số chính xác: lệnh `/cost` của Claude Code. Cách tiết kiệm:
- Sửa file lớn bằng script nhỏ có `assert` thay vì đọc lại cả file.
- Dùng grep/đọc từng đoạn thay vì đọc toàn bộ lab board (180 KB).
- Dùng lại proof/browser-check/CI qua các phase.
- Đo có kiểm soát một lần thay vì thử mò nhiều vòng.
- Chỉ đọc ảnh chụp khi cần xác minh.

## 7. Nếu làm lại
- Viết test UI tự động qua CDP ngay từ Phase 2 (menu → Đêm → kết quả → bảng xếp hạng, đổi phím) thay vì chỉ chụp ảnh.
- Đặt "ngân sách hiệu năng" từ Phase 1: instanced mesh, không animate CSS filter, đo bench sau mỗi thay đổi renderer, để Phase 4 không phải tối ưu dồn.
- Chạy bench trên một máy có GPU rời (hoặc nhiều lần, lấy trung vị) để có số p1 low ổn định hơn.
- Chuẩn bị môi trường trước giờ lab: `gh auth login`, ffmpeg, cổng trống. Release và video không phải phụ thuộc thao tác tay vào phút cuối.
