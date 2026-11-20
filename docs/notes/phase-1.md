# Phase 1 — Yêu cầu, giả định, tiêu chí nghiệm thu, đánh giá

Spec: [docs/specs/phase-1-PRD-0.md](../specs/phase-1-PRD-0.md) · Bằng chứng: [docs/proof/phase-1/](../proof/phase-1/README.md)

## 1. Quyết định kiến trúc (mỗi dòng một lý do)
- **Node.js + Three.js (web)**: chạy được trên macOS/Linux/Windows chỉ cần Node ≥ 18; không cần GPU cho headless; không cần build step.
- **Tách `src/sim/` (logic thuần) khỏi `src/web/` (render)**: trình duyệt và headless chạy *cùng một* `step()`, nên những gì test headless chứng minh cũng đúng với bản chơi.
- **`game.contract.json` là nguồn số duy nhất**: sim đọc `tuning` từ file này lúc chạy → con số khai báo không thể lệch với con số game dùng.
- **Timer tính bằng tick** (không cộng dồn giây float) và **PRNG có seed (mulberry32)** → tất định tuyệt đối.

## 2. Giả định cho chỗ mơ hồ
| # | Chỗ mơ hồ | Giả định của tôi |
|---|---|---|
| A1 | "HP" | HP = **lửa** (`flames` = 3). Mỗi lần chạm Bóng Mực mất 1 lửa. |
| A2 | "Xung sáng tốn ánh sáng" | Ánh sáng = **đom đóm đang mang**. Xung tốn `pulse_cost` = 1 đom đóm; mang ít hơn thì không phát được (không có event). Có cooldown 1 s. |
| A3 | Xung tác động gì | Mọi Bóng Mực trong `pulse_radius` (≤ 4 m, XZ) bị **choáng** 2 s (đứng yên, không gây sát thương) và bị **đẩy** 3 m ra xa người chơi (nếu trùng vị trí thì đẩy về +X). +20 điểm mỗi bóng. Phát xung khi không có bóng vẫn tốn đom đóm và vẫn ghi event `pulse` với `stunned_ids: []`. |
| A4 | "Bóng sợ đèn" | Chỉ **đèn đã thắp** tạo vùng an toàn `safe_radius` = 3 m; bóng luôn bị giữ **ngoài hẳn** 3 m (đặt tại 3.01 m nếu bị đẩy vào). Đèn chưa thắp không bảo vệ. |
| A5 | Nhặt đom đóm | Tự động khi trong `pickup_radius` (1 m) và chưa đầy `carry_capacity` (5). Theo thứ tự id. +10 điểm/con. |
| A6 | Nộp | Nhấn `interact` trong `interact_radius` (2 m) của đèn **chưa thắp gần nhất**; chỉ nộp phần còn thiếu (`lantern_cost` = 5 mỗi đèn). Đủ 5 → `lantern_lit`, +100. |
| A7 | Bị đánh | `dropped = floor(carried × 0.5)`; đom đóm rơi **mất hẳn** (không rơi lại xuống đất). Bất tử 1.5 s (90 tick) sau mỗi lần bị đánh. Mỗi bước tối đa 1 lần trúng đòn. |
| A8 | Rơi khỏi đảo | Không có: người chơi bị chặn ở mép đảo bán kính 30 m → `fall_enabled: false`, không có event `player_hit` với `by: "fall"`. |
| A9 | Thua vì hết đêm | Đêm 1 dài 240 s; `time_left_s` về 0 → `lost` / `dawn`. |
| A10 | Thưởng cuối ván | Chỉ khi **thắng**: `floor(time_left_s) × 2 + flames × 50`. Thua không có thưởng. |
| A11 | Thứ tự xử lý trong 1 bước | nút (cạnh lên) → di chuyển → nhảy → nộp (thắng thì dừng ngay) → xung → nhặt → bóng di chuyển → va chạm → spawn → thời gian/thua. |
| A12 | Spawn ngẫu nhiên mặc định | 30 đom đóm ban đầu; cứ 4 s thêm 1 nếu còn < 20. 2 Bóng Mực ban đầu (cách người chơi ≥ 12 m); cứ 40 s thêm 1 (tối đa 5) → event `shade_spawned`. Spawn ban đầu là "setup" nên không phát event. |
| A13 | Snapshot | Mỗi `--snapshot-every` tick từ tick 0. **Thêm 1 snapshot ở tick kết thúc** khi game thắng/thua giữa chừng (để thấy trạng thái cuối); dừng vì hết `--ticks` thì không thêm. |
| A14 | Vị trí trong scenario | Nhận `[x,y,z]`, `[x,z]` hoặc `{x,y,z}`. Bóng không có y thì lơ lửng y = 1. Đom đóm luôn ở y = 0. Lanterns nhận mảng hoặc object theo id; có thể đặt `deposited`. |
| A15 | Input sai | JSON hỏng, thiếu `frames`, tick không phải số nguyên ≥ 0, tick trùng/giảm, `move` ngoài [-1,1], nút không phải boolean, id đèn ngoài L1..L5, file không đọc được → exit 2. |
| A16 | Nhảy | Vận tốc 6.5 m/s, trọng lực 20 m/s²; chỉ đổi y, không ảnh hưởng va chạm (contract đo XZ). Không có `dash`. |
| A17 | Bóng Mực di chuyển | Luôn đuổi thẳng tới người chơi với `shade_speed` 2.5 m/s (state `chase`), trượt quanh vùng an toàn của đèn. |

## 3. Tiêu chí nghiệm thu (làm A thì thấy B) → cách kiểm chứng
| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC1 | `move [0,1]`, yaw 0, 60 tick → z = 4.5 | unit test + scenario p1-01 |
| AC2 | yaw 90: `[0,1]` → +X, `[1,0]` → −Z; vector dài > 1 được chuẩn hóa | unit test |
| AC3 | Đom đóm ở đúng 1.0 m được nhặt ở tick 1, +10 điểm; 1.01 m thì không | unit test |
| AC4 | Không mang quá 5 | unit test |
| AC5 | Nộp trong 2 m vào đèn gần nhất; ngoài 2 m không có gì; giữ nút chỉ nộp 1 lần | unit test + p1-02 |
| AC6 | Đủ 5 → `lantern_lit`, +100; đèn thứ 5 → `won/all_lit`, điểm thưởng đúng công thức | unit test + p1-03 (ván thắng trọn vẹn 25 đom đóm, điểm dự đoán độc lập = 1334) |
| AC7 | Bóng cách 3 m đánh trúng ở tick 53; `dropped` đúng; bất tử 90 tick; hết lửa → `lost/no_flames` | unit test + p1-04 |
| AC8 | `time_left_s` = 3 → thua `dawn` ở tick 180 | unit test + p1-05 |
| AC9 | Xung: tốn 1, choáng + đẩy 3 m, +20/bóng, choáng 120 tick rồi đuổi tiếp, cooldown 60 tick | unit test + p1-06 |
| AC10 | Bóng không bao giờ vào ≤ 3 m quanh đèn đã thắp | unit test + p1-07 (1800 tick, 3 bóng) |
| AC11 | Output đúng định dạng, làm tròn 3 số, snapshot đúng nhịp, dòng `end` cuối | contract tests |
| AC12 | Cùng đầu vào → output giống từng byte; khác seed → khác | contract test + proof chạy mỗi scenario 2 lần |
| AC13 | Input/scenario hỏng → exit 2 + stderr | contract test (10 trường hợp) + p1-09 |
| AC14 | Game chơi được trong trình duyệt: HUD, thắng/thua, chơi lại | ảnh chụp headless Chrome (autoplay) + chơi tay |

## 4. Đánh giá Phase 1
- **Đạt:** AC1–AC13 có bằng chứng tự động (36 test + 9 scenario, tất cả PASS ở commit gắn tag `phase-1`). AC14 có 3 ảnh chụp từ build thật (bot autoplay dùng đúng input contract).
- **Chưa đạt / hạn chế:**
  - Chưa có video demo (để Phase 4 theo lịch).
  - Ảnh chụp bằng Chrome headless + SwiftShader (render phần mềm) — chưa đo FPS trên GPU thật.
  - Chưa có reviewer độc lập (agent/người khác) đọc lại code Phase 1 — dự kiến chạy `/code-review` trước Phase 2.
  - Cân bằng game chưa thử nghiệm với người chơi thật: đứng yên thì thua sau ~12 s (bóng đuổi), bot thắng trong ~40 s → có thể hơi dễ với người chơi giỏi.
- **AI sai ở đâu / chỉnh harness:** xem [ai-log.md](ai-log.md).
