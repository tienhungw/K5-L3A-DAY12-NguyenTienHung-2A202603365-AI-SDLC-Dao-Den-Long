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

## Phase 2

### Lời nhắc chính
1. "Phase 2 đã có trong link artifact, hãy tiếp tục hoàn thiện phase 2" → agent không đọc được tab Phase 2 (nội dung tải động, cần đăng nhập) và **không đoán yêu cầu**, mà xin người dùng dán ticket.
2. Người dùng dán nguyên văn Ticket-02 → lưu vào `docs/specs/phase-2-ticket-02.md` trước khi làm gì khác.
3. Giữa phase: "thay nhạc nền bằng lab11nen.mp3, tiếng F bằng lab11duoi.mp3, tiếng E bằng lab11sang.mp3" → làm xong phần đang dở (scenario) rồi mới tích hợp.

### Trình tự
| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Lưu spec, liệt kê chỗ mơ hồ | `docs/specs/phase-2-ticket-02.md`, 20 giả định B1–B20 |
| 2 | Contract v1.1 + `maps.js` + viết lại `world.js` theo 12 bước | 3 Đêm chạy được, 0.2–0.6 s/Đêm |
| 3 | Chạy test cũ → 15 test đỏ vì luật đổi | viết lại kèm lý do (bảng §4 trong phase-2.md) |
| 4 | Test mới cho từng tính năng, kỳ vọng tính tay | 59/60 xanh lần đầu; 4 test sai do kỳ vọng của tôi (xem dưới) |
| 5 | Cập nhật 8 scenario Phase 1 + 11 scenario Phase 2 | 20/20 PASS |
| 6 | Renderer mới, âm thanh của người dùng | 0 lỗi console |
| 7 | Đo FPS bằng Chrome/CDP → 25.8 FPS (chưa đạt) → tìm nguyên nhân → sửa | 43.6 FPS |
| 8 | Docs, AGENTS.md, skill, tag `phase-2` | |

### Lỗi của AI (và cách phát hiện / sửa)
| # | Lỗi | Phát hiện bằng | Sửa | Chỉnh harness |
|---|---|---|---|---|
| 1 | Biến sai tên `p.vy` (đúng là `p.vel.y`) khi lướt trên không | tự review diff trước khi chạy | sửa | — |
| 2 | Đẩy lùi Bóng Mực "trượt theo mép" vùng an toàn thay vì **dừng** như ticket ghi | đối chiếu lại câu "dừng nếu gặp vật cản" | `shadeMove(..., 'stop')` | — |
| 3 | 4 test kỳ vọng sai: đọc tick khi game đã kết thúc; quên Bóng Mực hết choáng sẽ đuổi lại vào tầm; quên Tỏa Sáng (bước 7) chạy trước AI Gió Lạc (bước 8); vị trí 11.9999 được làm tròn thành 12 | đọc giá trị thực, **tính lại tay**, chỉ sửa test khi sim đúng theo ticket | sửa test kèm chú thích lý do | AGENTS.md: "kỳ vọng tính tay từ ticket" |
| 4 | Bot demo thua cả 3 Đêm, rơi khỏi đảo khi né | mô phỏng headless 9 ván | dò mặt đất trước khi né | — |
| 5 | FPS 25.8 < 30. Đoán ban đầu "do bloom" là **sai** | đo có kiểm soát 4 biến thể (bloom on/off × HUD on/off) | thủ phạm là ghi DOM mỗi khung → cache HUD → 43.6 FPS | quy tắc HUD trong AGENTS.md |
| 6 | Ảnh Đêm 3 hiện menu | xem ảnh | do chờ chưa đủ lâu sau tua 60 s; tăng thời gian chờ | — |
| 7 | Heredoc trong Bash bị lỗi phân tích (2 lần) | lỗi shell | ghi script ra file rồi chạy | — |

### Token / chi phí (ước tính)
- Đọc ticket (người dùng dán) + spec: ~15k input. Viết sim + test + renderer + docs: ~70k output.
- Ngữ cảnh tích lũy cả phiên Phase 2 (gửi lại mỗi lượt, phần lớn cache): ước tính **~4–6 triệu token input**, **~80k output**. Số chính xác: `/cost`.
- Cách tiết kiệm: sửa bằng script Python nhỏ thay vì đọc lại cả file lớn; một lần đo FPS có kiểm soát thay vì thử mò; dùng lại proof script/CI của Phase 1.

## Phase 3

### Lời nhắc chính
1. Người dùng dán nguyên văn Ticket-03 → lưu `docs/specs/phase-3-ticket-03.md`, viết **ADR trước khi code** để chốt mô hình trạng thái đèn và luật thắng.

### Trình tự
| Bước | Việc | Kết quả |
|---|---|---|
| 1 | Spec + ADR 0001 | máy trạng thái đèn, `drain`, bước 2b, luật bình minh |
| 2 | Sửa `world.js` / `files.js` / contract v1.2 bằng một script sửa có kiểm tra (assert từng đoạn) | 3 Đêm chạy được |
| 3 | Chạy test cũ → 11 test đỏ, đúng các luật bị [THAY THẾ] | sửa/xóa có lý do (bảng §4 phase-3.md) |
| 4 | 17 test mới, kỳ vọng tính tay theo đơn vị 1/60 | 3 kỳ vọng sai (xem dưới) |
| 5 | 8 scenario p3 + cập nhật p1-02, p1-03, p2-06 | 28/28 |
| 6 | Renderer + bot châm dầu; ảnh 09–11; FPS 42.7 | |

### Lỗi của AI (và cách phát hiện / sửa)
| # | Lỗi | Phát hiện | Sửa |
|---|---|---|---|
| 1 | Hết choáng: lúc đầu vẫn phát hiện lại Mây ngay trong tick đó (snapshot ra `chase`), trái với chữ của ticket "hết choáng thì về wander" | đọc lại ticket khi viết test | tick hết choáng dừng ở `wander` (giả định C8) |
| 2 | Kỳ vọng `refuel.fuel = 50` quên rằng bóng đang hút cũng lấy 5/60 ở bước 2 của chính tick đó | test đỏ → **tính lại tay**: 1200 − 1 − 5 + 1800 = 2994 → 49.9 | sửa test, ghi phép tính trong chú thích |
| 3 | Kỳ vọng `fuel_drain` chỉ ở tick 180, 240: quên tick 300 cũng là bội của 60 | đọc output thật, đối chiếu ticket "mỗi 60 tick khi đang hút" | thêm `[300, 0]` |
| 4 | Kỳ vọng `fuel 99.98` trong scenario — snapshot làm tròn **1** chữ số → 100 | tự rà trước khi chạy | sửa thành 100 |
| 5 | Script sửa test cố xóa một đoạn đã bị thay ở bước trước → lỗi giữa chừng | traceback Python | tách phần còn lại ra chạy riêng; các phần đã ghi giữ nguyên |
| 6 | Ảnh "dawn result" chọn nhầm seed (bot thua rồi tự chơi lại) | xem ảnh | đổi sang seed bot thắng; chụp trước khi bot tự bấm tiếp |

### Token / chi phí (ước tính)
- Ticket + ADR + sim + test + renderer + docs: ~45k token output; ngữ cảnh tích lũy Phase 3 ước tính ~3–4 triệu token input (phần lớn cache). Số chính xác: `/cost`.
- Tiết kiệm: sửa file bằng script có `assert` (không đọc lại file lớn), dùng lại `proof.mjs` / `browser-check.mjs` của Phase 2, chỉ thêm 3 ảnh mới.
