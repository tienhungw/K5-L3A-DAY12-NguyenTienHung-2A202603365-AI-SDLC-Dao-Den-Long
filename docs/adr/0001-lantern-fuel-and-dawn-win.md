# ADR 0001 — Đèn có nhiên liệu, Bóng Mực hút dầu, thắng khi giữ đảo sáng tới bình minh

- Trạng thái: **Chấp nhận** (Phase 3, Ticket-03, contract v1.2)
- Thay thế: luật "đèn đã sáng không nhận thêm đom đóm", "Bóng Mực không bao giờ vào vùng an toàn", "thắng ngay khi tất cả đèn sáng", công thức điểm Ticket-02.

## Bối cảnh
Ở Phase 2, đèn là máy trạng thái 2 trạng thái một chiều: `unlit(deposited) → lit` (lit là trạng thái cuối). Game kết thúc ngay khi mọi đèn `lit`. Người chơi giỏi thắng sau 2 phút, nên cuối Đêm thiếu căng thẳng.

## Quyết định
### 1. Mô hình trạng thái đèn (mới)
```
            deposited += n (cost = 10 nếu !ever_lit, 5 nếu ever_lit)
  UNLIT ───────────────────────────────────────────────▶ LIT(fuel = 100)
    ▲   deposited >= cost  → lantern_lit{relight}               │  bước 2: fuel -= 1/60 (hao) + 5/60 × số bóng đang drain
    │                                                           │  bước 5: refuel → fuel = min(100, fuel + 10 × used)
    └────────────── fuel <= 0 → lantern_out, deposited = 0, ever_lit = true ◀┘
  Thuộc tính phụ: safe = LIT && fuel >= 30  (vùng an toàn 6 m chỉ tồn tại khi safe)
```
- **Đơn vị nguyên:** dầu lưu ở `fuelU` = fuel × 60, kiểu số nguyên (tối đa 6000). Hao 1 đơn vị/tick, mỗi con drain hút 5 đơn vị/tick, châm 600 đơn vị/đom đóm. Không có sai số số thực. Chỉ khi xuất snapshot mới làm tròn `fuel = round(fuelU/60, 1)`.
- **Thứ tự trong tick:** bước 2 trừ dầu (hao + hút) → ngay sau đó đèn `fuelU ≤ 0` tắt (`lantern_out`) → các bước 3–10 như Ticket-02 → bước 11 xét thắng/thua.
- `ever_lit`, `relit_count`, `successful_lights` (theo Đêm) là trạng thái mới. Sức chứa = min(20, 10 + 2 × successful_lights) được tính mỗi lần cần.

### 2. Bóng Mực: thêm trạng thái `drain`
```
 wander ──(Mây ≤ 12 m)──▶ chase ──(> 18 m)──▶ wander
 wander ──(≤ 2 m tới đèn sáng fuel < 30)──▶ drain
 drain ──(Mây ≤ 6 m)──▶ chase      drain ──(Tỏa Sáng)──▶ stunned ──(hết choáng)──▶ wander
 drain ──(đèn tắt | fuel ≥ 30 | cách > 2 m)──▶ wander
```
Khi `wander`, mục tiêu là đèn sáng gần nhất có fuel < 30 (bằng nhau thì id nhỏ); nếu không có thì đèn tắt gần nhất; nếu cũng không có thì lượn ngẫu nhiên như Phase 2. `isSafe(lantern)` thay cho `lantern.lit` ở mọi chỗ chặn và đẩy Bóng Mực. Châm dầu lên ≥ 30 khi có bóng trong 6 m thì dùng lại cơ chế "đẩy ra mép ≤ 30 tick, vô hại" của lúc vừa thắp.

### 3. Luật thắng
Xóa nhánh "mọi đèn sáng → thắng" ở bước 11. Bước 11 giờ là: hết Ngọn Lửa → `lost/no_flames`; hết giờ → đếm số đèn **đang sáng sau mọi cập nhật của tick đó** (đèn tắt ở bước 2 của tick bình minh không được tính). Đủ `ceil(win_ratio × n)` → `won/dawn_survived`, thưởng `Σ(50 + floor(fuel)) + 50 × lửa`; ngược lại `lost/dawn`.

## Hệ quả
- (+) Game luôn kéo dài đủ Đêm và có căng thẳng ở cuối; điểm thưởng theo dầu khuyến khích châm dầu.
- (−) **Phá vỡ tương thích:** `all_lit` không còn; thời lượng Đêm, điểm và nghĩa của vùng an toàn đều đổi. Liệt kê trong [CHANGELOG.md](../../CHANGELOG.md#phase-3--breaking-changes).
- (−) Test và scenario Phase 1–2 dựa vào thắng sớm, điểm cũ hoặc thời lượng cũ phải sửa. Danh sách và lý do ở [docs/notes/phase-3.md](../notes/phase-3.md).
- Renderer chỉ đọc thêm `fuel`, `ever_lit`, `capacity` và trạng thái `drain`; không chứa luật.

## Phương án đã cân nhắc
- **Dầu kiểu số thực (fuel -= 1/60):** bị loại vì sai số cộng dồn làm lệch tick tắt đèn so với test ẩn; ticket cũng khuyến nghị đơn vị nguyên.
- **Giữ `deposited` làm thước đo dầu:** bị loại vì hai khái niệm khác thang (đom đóm vs dầu) và ticket yêu cầu `deposited = 0` khi tắt.
