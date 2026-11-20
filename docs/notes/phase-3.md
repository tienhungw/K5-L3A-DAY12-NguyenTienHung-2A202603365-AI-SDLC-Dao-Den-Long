# Phase 3 — Ticket-03 "Đèn cạn dầu": quyết định, giả định, tiêu chí nghiệm thu, test đã thay, đánh giá

Spec: [docs/specs/phase-3-ticket-03.md](../specs/phase-3-ticket-03.md) · ADR: [docs/adr/0001-lantern-fuel-and-dawn-win.md](../adr/0001-lantern-fuel-and-dawn-win.md) · Breaking changes: [CHANGELOG.md](../../CHANGELOG.md#phase-3--breaking-changes) · Bằng chứng: [docs/proof/phase-3/](../proof/phase-3/README.md)

## 1. Thay đổi thiết kế (tóm tắt, chi tiết trong ADR 0001)
- Đèn thành máy trạng thái 2 chiều `UNLIT ⇄ LIT`, thêm thuộc tính `fuelU` (số nguyên, đơn vị 1/60), `everLit`, `relit`. "Vùng an toàn" giờ là `lit && fuel ≥ 30`, không còn chỉ là `lit`.
- Bóng Mực có trạng thái `drain`; `wander` chọn mục tiêu là đèn yếu, nếu không có thì đèn tắt.
- Thêm bước 2b (trừ dầu rồi tắt đèn ngay sau bước 2). Bước 11 bỏ thắng sớm, chỉ xét ở tick bình minh.
- Renderer chỉ đọc state mới: thanh dầu, nhấp nháy 1 Hz, đèn tắt xẹp và rách, chế độ mù màu, HUD sức chứa.

## 2. Giả định cho chỗ ticket chưa nói rõ
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | "Đèn đầy dầu không được chọn" | Bước 2 luôn trừ dầu trước bước 5, nên lúc bấm E đèn sáng không bao giờ đầy đúng 100; đèn đó vẫn là ứng viên châm dầu (dùng ít nhất 1 đom đóm). |
| C2 | Đèn tắt được thắp lại | Dùng lại `deposited` (đã về 0 khi tắt) và ngưỡng 5; event `deposit` như cũ, `lantern_lit.relight = true`, `relit_count += 1`. |
| C3 | Đèn đặt `lit: true` bằng scenario | `ever_lit` mặc định `true` (đã từng sáng); không tính vào `successful_lights`. `fuel ≤ 0` thì coi như đèn tắt. |
| C4 | Tốc độ và điểm dừng khi `wander` tới đèn | 1.5 m/s (như Phase 2), dừng khi cách ≤ 2 m. Tới đèn tắt thì đứng chờ ở đó. Không còn đèn nào để tới thì lượn ngẫu nhiên như Phase 2. |
| C5 | Bắt đầu `drain` | Ngay trong tick bóng tới ≤ 2 m; bắt đầu hút từ bước 2 của tick kế tiếp. |
| C6 | `fuel_drain` | Mỗi con có bộ đếm tick hút riêng; ghi event ở tick hút thứ 60, 120, … (kể cả tick làm đèn tắt, khi đó `fuel: 0`, ghi trước `lantern_out`). |
| C7 | `drain` → `chase` | Mây trong ≤ 6 m (XZ). Bóng đang `drain` không gây sát thương cho tới khi chuyển `chase`. |
| C8 | Hết choáng | Tick hết choáng kết thúc ở `wander`; từ tick sau mới xét lại phát hiện Mây (12 m). |
| C9 | Châm dầu khi có bóng trong 6 m | Mọi bóng trong 6 m bị đẩy ra (vô hại, ≤ 30 tick); con đang `drain` chuyển `wander`. |
| C10 | Điểm Tỏa Sáng trúng bóng đang `drain` | Tổng 15 điểm cho con đó (thay cho 5, không cộng dồn thành 20). |
| C11 | Thưởng bình minh | Dùng dầu ở cuối tick bình minh (sau khi đã trừ dầu tick đó), `floor(fuel)`. |
| C12 | `per_second_left` | Giữ khóa trong contract, đặt **0** (Ticket-03 bỏ thưởng thời gian). Các điểm mới không có khóa trong contract (+40 thắp lại, +15 drain, +50 mỗi đèn lúc bình minh) nằm trong `SPEC`. |
| C13 | Bảng màu mù màu | Áp dụng cho viền, thân phát sáng, mắt và tia hút của Bóng Mực, cùng màu cảnh báo UI (đồng hồ ≤ 30 s, thanh dầu thấp). Đèn tắt xẹp và rách được hiển thị **luôn**, không chỉ trong chế độ mù màu. |

## 3. Tiêu chí nghiệm thu → kiểm chứng
| Mục ticket | Tiêu chí (làm A thì thấy B) | Kiểm chứng |
|---|---|---|
| §1 hao dầu / tắt | fuel 2 → `lantern_out` ở tick 120, `deposited 0`, `ever_lit true`, `fuel 0` | test + `p3-01` |
| §1 châm dầu | fuel 50, mang 7 → `refuel {amount 6, fuel 100}`, còn 1, +30; mang 3 → fuel 80 | test + `p3-02` |
| §1 thắp lại | đèn `ever_lit` + 5 đom đóm → `lantern_lit {relight: true}`, +25 +40, `relit_count 1`; đèn chưa từng sáng với 5 → chưa sáng | test + `p3-03` |
| §1 hiển thị | thanh dầu; < 30 thì đèn và thanh nhấp nháy 1 Hz | ảnh 09 |
| §2 ngưỡng 30 | fuel 30.0 còn vùng an toàn; 29.98 thì bóng vào được | test |
| §2 drain | bóng `wander` tới đèn fuel 20: `drain` ở tick 120; `fuel_drain` tick 180 = 12.0, tick 240 = 6.0; tắt ở tick 300 → `wander` | test + `p3-04` |
| §2 cộng dồn | 2 con hút: sau 60 tick fuel 20 → 9.0 | test |
| §2 chuyển trạng thái | Mây ≤ 6 m → `chase`; Tỏa Sáng → `stunned` (+15); hết choáng → `wander` | test + `p3-05` |
| §2 châm lên ≥ 30 | bóng trong 6 m bị đẩy ra trong ≤ 30 tick, không gây sát thương | test |
| §3 bình minh | 3/5 sáng → `won/dawn_survived`, điểm 3 × (50 + 50) + 150 = 450 | test + `p3-06` |
| §3 thua | 2/5 → `lost/dawn` (0 điểm thưởng); đèn tắt đúng tick bình minh không được tính | test + `p3-07` |
| §3 no_flames trước | hết lửa ở tick cuối → `no_flames` | test |
| §3 ngưỡng | Đêm 2 4/6, Đêm 3 5/7 | test |
| §3 không thắng sớm | thắp đủ 5 đèn, Đêm vẫn chạy | test + `p1-03` |
| §4 sức chứa | `successful_lights 3` → 16; 6 → 20 (tối đa); đèn đặt bằng scenario không tính | test + `p3-08` |
| §5 điểm | +5/đom đóm, +100 / +40, +5 / +15, thưởng bình minh | các test trên |
| §6 mù màu | cài đặt lưu `localStorage`; bóng #00B3FF; UI cảnh báo trắng + ⚠; đèn tắt xẹp 20% và rách | ảnh 10 + code |
| §7 contract v1.2 | tuning v1.2, `fuel` / `ever_lit` / `relit_count` / `capacity`, scenario mới, event mới | contract test |

## 4. Test cũ bị luật mới làm sai (đã sửa có lý do, không skip)
| Test / scenario cũ | Luật bị thay | Thay bằng |
|---|---|---|
| contract `is v1.1 …` | §7 v1.2 (thời lượng, khóa dầu, bảng điểm) | `is v1.2 with Ticket-02/03 standard numbers` |
| contract `snapshot has all v1.1 fields` | §7 thêm trường | `… v1.2 fields` |
| `deposit: +10 per mote` | §5 +5/đom đóm | `+5 per mote` |
| `lantern choice … lit lanterns are skipped` | §1 đèn sáng chưa đầy là ứng viên châm dầu | `… a lit lantern is refuelled` |
| `min(carried, missing) … (+100)` | §5 điểm + `relight` trong event | cập nhật điểm 15 + 100, `relight: false` |
| `lighting the last lantern wins …` | §3 không thắng sớm | **xóa**, thay bằng `lighting every lantern no longer ends the night` |
| `win takes precedence over dawn …` | §3 luật thắng mới | **xóa**, thay bằng các test `dawn: …` và `no_flames beats dawn …` (phase3.test.js) |
| `night timer: 300 s` | §3 240 s | `night timer: 240 s` |
| Đêm 2 / Đêm 3 `330 s` / `360 s` | §3 270 / 300 s | cập nhật |
| scenario `p1-02` | §5 điểm | 150 thay 200 |
| scenario `p1-03-full-win` | §3 không thắng sớm | sinh lại: thắp đủ 5 đèn → vẫn `playing`, điểm 750 |
| scenario `p2-06` | §3 270 s | `time_left_s 268` |

Không có test nào bị skip hay tắt. Các test Phase 1–2 không bị luật mới thay vẫn chạy nguyên và PASS.

## 5. Đánh giá Phase 3
- **Đạt:** 74 test + 28 scenario PASS. Hồi quy Phase 1–2 PASS. Một Đêm đầy đủ chạy 0.44 s; FPS trung bình 42.7 ở 1280×720.
- **Chạy tay / ảnh:** thanh dầu và nhấp nháy, chế độ mù màu (ảnh 09–10), màn kết quả bình minh (ảnh 11). Việc lưu cài đặt mù màu chỉ kiểm tra tay.
- **Rủi ro:** các giả định C4–C8 (tốc độ `wander`, lúc bắt đầu hút, nhịp `fuel_drain`, tick hết choáng) có thể lệch với test ẩn; mỗi giả định chỉ cần đổi một hằng số trong `SPEC` hoặc vài dòng ở bước 8.
- **AI sai ở đâu:** xem [ai-log.md](ai-log.md#phase-3).
