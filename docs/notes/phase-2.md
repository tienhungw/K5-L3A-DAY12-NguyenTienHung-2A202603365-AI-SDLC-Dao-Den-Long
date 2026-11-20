# Phase 2 — Ticket-02 "Ba hòn đảo": thay đổi thiết kế, giả định, tiêu chí nghiệm thu, đánh giá

Spec: [docs/specs/phase-2-ticket-02.md](../specs/phase-2-ticket-02.md) · Bằng chứng: [docs/proof/phase-2/](../proof/phase-2/README.md)

## 1. Thay đổi thiết kế (và vì sao)
- **Số liệu chuẩn thay số tự chọn.** `game.contract.json` lên v1.1; test `game.contract.json is v1.1 with Ticket-02 standard numbers` so sánh **toàn bộ** khối tuning với bảng của ticket, nên lệch một số là test đỏ ngay.
- **Bản đồ tách ra `src/sim/maps.js`**: mỗi Đêm khai báo `ground(x,z)` (độ cao, `null` = biển mây, `'tower'` = vật cản), danh sách đèn, điểm sinh, bục nhảy, bùa, cờ gió/Gió Lạc. Logic `world.js` dùng chung cho cả 3 Đêm.
- **`step()` viết lại theo đúng 12 bước của ticket** (chú thích `// 1.` … `// 11.` trong code). Thắng/thua chuyển xuống bước 11 (Phase 1 thắng ngay lúc nạp), nhờ vậy "thắng đúng tick hết giờ" được xử lý đúng.
- **Bộ đếm theo tick, giảm ở bước 2**: `invuln`, `dashCd`, `pulseCd`, `charm`, choáng, TTL, hồi bùa. Tạm dừng chỉ cần `return` sớm ở bước 1, nên mọi bộ đếm tự đứng yên.
- **Độ cao / vách**: Mây đi được nếu mặt đất mới cao hơn chân ≤ 0.35 m (đủ cho dốc 0.5 m/m kể cả khi lướt 14 m/s), cao hơn thì là vách. Bước ra mép cao hơn 0.35 m thì rơi tự do.
- **Renderer** (`src/web/main.js`) viết lại cho menu, chuỗi 3 Đêm, tạm dừng, cài đặt, HUD đầy đủ, bảng màu chuẩn. HUD chỉ ghi DOM khi giá trị đổi: đo cho thấy ghi DOM mỗi khung là nút thắt FPS (15 → 40+ FPS).

## 2. Giả định cho chỗ ticket chưa nói rõ
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | Tăng tốc ≤ 0.1 s | Vận tốc đổi **tức thì** (0 s ≤ 0.1 s). |
| B2 | Thời gian ở trạng thái `spawning` | 60 tick (1 s), đứng yên, không gây sát thương, trúng Tỏa Sáng vẫn bị choáng. |
| B3 | `wander` | Lượn 1.5 m/s tới điểm ngẫu nhiên (seed) cách 3–10 m; đổi điểm sau 240 tick hoặc khi tới nơi/bị chặn. Bóng mới tạo từ scenario mặc định `wander`. |
| B4 | Chênh cao khi Bóng Mực chạm | So **mặt đất dưới bóng** (tâm − 1 m) với chân Mây, ≤ 1.5 m. Bóng luôn lơ lửng 1 m trên mặt đất, bay qua vách tầng, không vào biển mây/tháp. |
| B5 | Vùng an toàn lúc đèn vừa thắp | Bóng bên trong bị đẩy ra 0.2 m/tick (≤ 30 tick với bán kính 6 m), ra tới 6.001 m thì thôi; trong lúc đó không di chuyển theo AI và không gây sát thương. Đặt bóng trong vùng đèn đã sáng ngay từ scenario thì nó bị đặt lên mép ở lượt di chuyển đầu. |
| B6 | Vật cản của đẩy lùi / recoil | Biển mây, tháp chuông, vùng an toàn của đèn đã sáng → dừng đẩy. |
| B7 | Sau choáng / recoil | Về `chase` nếu Mây trong 12 m, ngược lại `wander`. |
| B8 | Trần 30 đom đóm | Chỉ đếm đom đóm `random`; "điểm trống" = điểm sinh không có đom đóm `random` đứng trên. Đom đóm rơi không chiếm điểm. |
| B9 | Vị trí đom đóm rơi | Góc + bán kính 1.5–2.5 m theo seed; thử lại tối đa 8 lần nếu rơi vào biển mây, không được thì đặt dưới chân Mây. |
| B10 | Điểm xuất phát Đêm 2 / 3 | Đêm 2: (0,0,0) tâm đảo A. Đêm 3: (0,0,0) nằm trong tháp chuông nên chọn **(0,0,−30)** trên tầng 0, quay mặt +Z. |
| B11 | Rơi rồi hồi sinh | Trong 60 tick chờ: Mây ẩn, không di chuyển/nhặt/nạp/Tỏa Sáng, không bị chạm hay cướp, Bóng Mực mất mục tiêu. |
| B12 | Bục nhảy | Kích hoạt khi Mây **đứng trên** bục (XZ ≤ 1 m, chân cách mặt bục < 0.05 m). Hướng Đêm 2 = từ tâm bục tới tâm đảo kia. Trong lúc bay phím di chuyển không có tác dụng, gió vẫn cộng thêm, lướt thì thay vận tốc ngang trong 12 tick. |
| B13 | Lướt trên mặt đất rồi nhảy | Chỉ khi **bắt đầu** lướt trên không mới giữ độ cao; lướt trên đất vẫn nhảy được. |
| B14 | `pulse` khi trúng Gió Lạc | Thêm trường `drifter_ids` vào event `pulse`; Gió Lạc không cộng điểm (+5 chỉ cho Bóng Mực). Tỏa Sáng xét trạng thái Gió Lạc *trước* bước 8, nên Gió Lạc đang `idle` không bị ảnh hưởng. |
| B15 | Gió Lạc | Sinh ở một điểm sinh Bóng Mực ngẫu nhiên ("điểm sương"); `idle` lượn 2 m/s giữa các điểm đó; bay trên biển mây được; cao 1.5 m trên mặt đất. Không có event khi sinh (ticket không định nghĩa). `removed` vẫn nằm trong mảng `drifters` để theo dõi `stolen`. |
| B16 | Gió mạnh | Bắt đầu ở sim tick 1800, 3600, …, kéo dài 300 tick; `dir_deg` là số nguyên 0–359 lấy từ seed; `dir_deg: null` khi không có gió. Chỉ đẩy Mây. |
| B17 | `night_start` | Ghi ngay sau snapshot 0 với `tick: 0` (không phải event của scenario). |
| B18 | Snapshot | `player.invuln` là boolean; `ttl_s` của đom đóm `random` là `null`; `charms` có thêm `pos`. |
| B19 | Scenario mở rộng | `motes[]` nhận thêm `kind`, `ttl_s`; `charms[]` nhận `respawn_ticks`; `drifters[]` nhận `state_ticks_left` (thời gian flee còn lại). |
| B20 | Âm thanh | Theo yêu cầu của người làm: nhạc nền = `lab11nen.mp3`, Tỏa Sáng (F) = `lab11duoi.mp3`, nạp ánh sáng (E) = `lab11sang.mp3`; các hiệu ứng khác tổng hợp bằng WebAudio. |

## 3. Tiêu chí nghiệm thu cho từng mục Phần 3 (+ cách kiểm chứng)
| Mục | Tiêu chí (làm A thì thấy B) | Kiểm chứng |
|---|---|---|
| Gió Lạc – kích hoạt | Mang ≥ 5 và cách ≤ 15 m → `chase` ở tick kế; mang 4 hoặc cách 15.5 m → vẫn `idle`; nạp xuống < 5 → về `idle` | test `drifter stays idle…` |
| Gió Lạc – cướp | Từ 10 m, 7 m/s: `drifter_steal` ở tick 76 với `{amount 3, carried 2}`; bất tử không chặn; không mất lửa | test + scenario `p2-04` |
| Gió Lạc – rời đi | `flee` 240 tick rồi `removed`, giữ `stolen` | test + `p2-04` |
| Gió Lạc – Tỏa Sáng | Đang `chase` → `flee`, không cướp; đang `flee` có đồ → `drifter_drop`, 3 đom đóm `dropped` tại chỗ, `removed` sau 120 tick | test + `p2-05` |
| Gió Lạc – lịch & giới hạn | Đêm 2: D1 ở tick 1200, D2 ở 2400, tối đa 2 con còn sống; Đêm 1 không có | test `drifters ignore lantern safe zones…` |
| Gió Lạc – vùng an toàn | Vẫn cướp được khi Mây đứng cạnh đèn đã sáng | cùng test |
| Bùa Gió | Nhặt trong 1 m → `charm_picked {C1, 600}`; chạy 7.2 m/s (60 tick = 7.2 m); lướt không hồi chiêu nhưng phải nhấn lại, nhấn khi đang lướt bị bỏ qua; xuất hiện lại sau 2700 tick | 2 test + `p2-03` |
| Lướt | 14 m/s × 12 tick = 2.8 m; hồi chiêu 90 tick tính từ lúc bắt đầu; đứng yên thì lướt theo hướng mặt (+Z); trên không giữ độ cao; không bất tử | 3 test + `p2-01` |
| Tạm dừng | `paused`/`resumed`; `tick` tăng, `sim_tick`, thời gian, vị trí, hồi chiêu đứng yên; snapshot `state: "paused"` | test + `p2-02`; trong game: Esc/P mở menu tạm dừng (ảnh 06) |
| Chuỗi 3 Đêm | Menu → giới thiệu Đêm (tên đảo + lời Ông Đăng) → chơi → kết quả → Đêm kế; thắng Đêm 3 → Bình Minh + tổng điểm; thua → "Chơi lại Đêm" | ảnh 01, 07; chạy tay (xem §4) |
| Cài đặt | Âm lượng + độ nhạy chuột, lưu `localStorage` (`ddl-settings`) | chạy tay |
| Âm thanh | Nhạc nền + hiệu ứng cho nhặt, thắp đèn, Tỏa Sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s | code `src/web/audio.js` + chạy tay |
| HUD | Lửa (trên trái), mm:ss (trên giữa, đỏ + nhấp nháy ≤ 30 s), đèn k/n + điểm (trên phải), 10 ô đom đóm (dưới giữa), hồi chiêu Lướt/Tỏa Sáng (dưới phải), "E — Nạp ánh sáng (x/10)", mũi tên tới đèn chưa sáng gần nhất khi ngoài màn hình | ảnh 02–05, 08 |
| Bảng màu / ánh sáng | Màu chuẩn trong `C = {…}` ở `main.js` + biến CSS; `ambient.intensity = 0.15 + 0.55 × lit/total` | code review + ảnh |
| Bản đồ Đêm 2 | Cầu giữ được, bước ra ngoài cầu thì rơi; bục nhảy bay ~1.4 s và đáp xuống đảo B | 3 test + `p2-06` |
| Bản đồ Đêm 3 | Vách tầng chặn; dốc 30° lên Y = 3; tháp chặn; bước khỏi tầng 1 rơi xuống tầng 0 (không mất lửa); bục (0,3,13) đưa lên tầng 2 | 3 test + `p2-07`, `p2-08` |
| Gió mạnh Đêm 3 | Gió bật ở tick 1800, tắt ở 2100, đẩy đúng 10 m theo `dir_deg` | test + `p2-09` |
| Rơi khỏi đảo | Đúng 1 event, `lost` = số đang mang, chờ 60 tick, hồi sinh tại điểm xuất phát với bất tử | 2 test + `p2-10` |
| Hiệu năng headless | Một Đêm 21 600 tick ≤ 30 s | test + đo 0.61 s |
| FPS ≥ 30 ở 1280×720 | Trung bình 43.6, thấp nhất 40 (Intel Iris Xe) | `docs/proof/phase-2/browser/fps.json` |

## 4. Test cũ bị luật mới thay đổi (đã sửa kèm lý do, không xóa âm thầm)
| Test Phase 1 | Vì sao đổi | Thay bằng |
|---|---|---|
| contract `has every required field` | Contract v1.1, tuning phải bằng số chuẩn | so sánh đúng từng số với Ticket-02 |
| `snapshot has all contract fields` | Thêm trường v1.1 | kiểm tra trường v1.1 trên cả 3 Đêm |
| `scenario setup emits no events` | Có `night_start` ở tick 0 | chỉ cho phép `night_start` |
| `player cannot leave the island` | `fall_enabled` thành `true` | test rơi + hồi sinh, rơi khi còn 1 lửa |
| `mote … picked … with score per_mote` | Điểm tính khi **nạp**, không tính khi nhặt | nhặt = 0 điểm; nạp = +10/con |
| deposit / lighting / win (vị trí L1 cũ, cost 5) | Bản đồ chuẩn (L1 ở z = 25), cost 10, thắng xét ở bước 11 | tính lại; thêm "thắng đúng tick hết giờ" |
| pulse (cost 1, đẩy tức thì 3 m, +20) | Tỏa Sáng: cost 3, 3D 5 m, đẩy 4 m trong 15 tick, +5 | tính lại từ số chuẩn |
| `shades never enter safe_radius` (3 m) | Bán kính 6 m + luật đẩy ra khi vừa thắp | 2 test mới |
| `random spawns … at tick 0` | Bóng chỉ sinh từ tick 300 theo lịch | test lịch sinh + lịch đom đóm |
| Scenario `p1-01…p1-08` | Số và bản đồ chuẩn | đã cập nhật số kỳ vọng; `p1-03` sinh lại bằng `scripts/gen-win-scenario.mjs` (điểm dự đoán độc lập 1702) |

## 5. Đánh giá Phase 2
- **Đạt (có bằng chứng tự động):** toàn bộ Phần 1 (số chuẩn, thứ tự 12 bước), Phần 2 (3 bản đồ), Phần 4 (contract v1.1) và phần headless của Phần 3. Có 60 test + 20 scenario, tất cả PASS. Hồi quy Phase 1 chạy lại theo số chuẩn và PASS.
- **Đạt (bằng chứng ảnh/đo):** HUD, menu, tạm dừng, giới thiệu Đêm; FPS trung bình 43.6 ở 1280×720.
- **Chưa kiểm chứng tự động, chỉ chạy tay:** âm thanh (nghe), lưu cài đặt giữa các lần mở, màn Bình Minh (bot demo chưa thắng được Đêm 3 nên chưa có ảnh). Chưa có video.
- **Rủi ro còn lại:** các giả định B2–B5, B8, B10 ảnh hưởng tới test ẩn. Nếu giảng viên định nghĩa khác (ví dụ thời gian `spawning`), cần sửa một hằng số trong `SPEC`.
- **Hồi quy với Phase 1:** không còn test nào bị tắt; mọi test Phase 1 bị đổi đều có lý do ở §4.
