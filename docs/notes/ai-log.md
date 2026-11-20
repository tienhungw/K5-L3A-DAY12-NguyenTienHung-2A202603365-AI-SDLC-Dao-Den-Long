# Nhật ký dùng AI

Công cụ: **Claude Code** (VS Code extension), model Claude Opus 5.5. Người điều phối: Nguyễn Tiến Hưng (2A202603365).
Harness: [AGENTS.md](../../AGENTS.md) (+ `CLAUDE.md` trỏ tới nó), skill [verify](../../.claude/skills/verify/SKILL.md),
Stop hook [scripts/stop-hook.mjs](../../scripts/stop-hook.mjs) (chặn agent kết thúc khi `npm test` đỏ), CI [.github/workflows/ci.yml](../../.github/workflows/ci.yml).

## Phase 1

### Lời nhắc chính
1. "Đọc toàn bộ repo + lab board, tóm tắt nội dung lab, rồi hoàn thành bài lab và đẩy lên GitHub."
2. Agent tự lập kế hoạch: đọc Test Contract trước → thiết kế `src/sim` thuần → viết test theo contract → mới viết renderer.

### Trình tự làm việc
| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Đọc README/GUIDE/RUBRIC/... và lab board (chỉ tab Phase 1 đọc được) | Nắm PRD-0 + contract |
| 2 | Chọn kiến trúc (Node + Three.js, sim tách riêng) | ghi ở phase-1.md §1 |
| 3 | Viết `game.contract.json`, `src/sim/*`, `src/headless.js` | chạy thử seed 42 hai lần → giống nhau |
| 4 | Viết 35 unit/contract test **với giá trị kỳ vọng tính tay từ tuning** (ví dụ bóng cách 3 m trúng ở tick ⌈2.2/2.5·60⌉ = 53) | 32/35 pass lần đầu, 3 fail do test sai (xem lỗi #2) |
| 5 | Harness: AGENTS.md, skill verify, Stop hook, CI | hook chạy thử exit 0 |
| 6 | Proof script + 9 scenario; scenario thắng trọn ván được sinh bằng script tính điểm độc lập | 9/9 pass |
| 7 | Renderer Three.js + audio + autopilot; chụp ảnh bằng Chrome headless | 3 ảnh trong `docs/proof/phase-1/screens/` |
| 8 | Viết README, ghi chép, tag `phase-1` | |

### Lỗi của AI (và cách phát hiện / sửa)
| # | Lỗi | Phát hiện bằng | Sửa | Chỉnh harness |
|---|---|---|---|---|
| 1 | Dùng `node --test tests/` — Node 22 không nhận thư mục làm đối số | chạy test → "Cannot find module" | đổi sang `node --test` (tự tìm `*.test.js`) | lệnh test ghi cố định trong AGENTS.md |
| 2 | 3 test đọc "snapshot cuối" ở tick 5/2 trong khi `--snapshot-every` = 10 → đọc nhầm snapshot tick 0 | test fail với `actual: 0` | **sửa test** (`every: 1`), *không* sửa sim cho vừa test, vì contract chỉ yêu cầu snapshot theo nhịp | ghi vào AGENTS.md: đổi test phải có lý do |
| 3 | Test spawn ngẫu nhiên ban đầu để người chơi đứng yên 45 s → sẽ chết trước lần spawn ở 40 s (test yếu/sai tiền đề) | rà soát lại tiền đề trước khi chạy | cho người chơi đứng trong vùng an toàn của đèn đã thắp | — |
| 4 | So sánh `import.meta.url` với `process.argv[1]` để chạy CLI — dễ sai trên Windows (hoa/thường ổ đĩa) | review code | tách `runner.js`, `headless.js` luôn chạy `main()` | — |
| 5 | Mặc định cổng 8080 — trên máy dev bị một dịch vụ khác chiếm, request treo | `EADDRINUSE` + timeout | cổng mặc định 8765, thông báo lỗi rõ ràng, hỗ trợ `PORT=` | — |
| 6 | Cả 9 scenario PASS ngay lần đầu → nghi ngờ bộ kiểm tra quá dễ dãi | **mutation check**: sửa `end_ticks` 180→181 | proof script báo FAIL đúng → bộ kiểm tra có tác dụng; đã khôi phục file | ghi trong skill verify: không nới assertion |

### Token / chi phí (ước tính)
- Đọc tài liệu lab + lab board: ~60k token input (HTML lab board lớn ~180 KB, chỉ đọc phần text/grep cần thiết).
- Viết code + test + docs Phase 1: ~45k token output.
- Tổng ngữ cảnh tích lũy cả phiên (gửi lại mỗi lượt, phần lớn được cache): ước tính **~2–3 triệu token input**, **~50k output**. Số chính xác: xem `/cost` trong Claude Code.
- Cách tiết kiệm: grep/strip HTML thay vì đọc toàn bộ lab board; viết test theo số liệu contract trước nên ít vòng sửa; một script proof dùng chung cho mọi phase; sim không phụ thuộc thư viện nên test chạy < 3 s.
