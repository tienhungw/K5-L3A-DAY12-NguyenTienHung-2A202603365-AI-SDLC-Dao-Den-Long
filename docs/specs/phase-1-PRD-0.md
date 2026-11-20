# Phase 1 — PRD-0 + Test Contract v1.0 (tóm tắt để agent đọc)

Nguồn: lab board "Đảo Đèn Lồng Lab", tab Phase 1. Đây là bản tóm tắt của tôi để agent đọc nhanh; khi nghi ngờ, bản gốc trên lab board là chuẩn.

## PRD-0
- Game 3D góc nhìn thứ ba. Nhân vật **Mây**, người giữ đèn nhỏ tuổi, đội nón lá có đèn lồng nhỏ.
- Vòng lặp: gom **đom đóm**, nộp để thắp lại **5 Đèn Lồng Lớn**.
- **Bóng Mực** đuổi theo; chạm vào mất HP (lửa). Mây phát **xung sáng** đẩy lùi, tốn ánh sáng. Bóng sợ đèn.
- Thắng khi thắp đủ đèn; thua khi hết HP. Có điểm, HUD, chơi lại sau thắng/thua.
- Phạm vi Phase 1: **Đêm 1 – Đảo Bến**, đảo tròn, 5 đèn; di chuyển, nhảy, camera 3D, đom đóm, nộp, Bóng Mực, xung, thắng/thua, điểm, HUD, chơi lại.
- Phong cách: đêm, ấm, cổ tích; cam ấm = tốt, tím đen = nguy hiểm; đơn giản, không bạo lực.
- Sáng tạo thêm được khuyến khích nhưng không phá PRD/contract; tắt khi headless; README có mục "Sáng tạo của tôi".
- Công nghệ tự do; chạy trên macOS/Linux.
- Bàn giao: tag `phase-1`; Đêm 1 chơi được; README cài + chạy ≤ 3 lệnh, điều khiển, cách tính điểm; `game.contract.json` + headless; bằng chứng + ghi chép (giả định, nhật ký AI); harness AI.

## Test Contract v1.0 (điểm bắt buộc chính xác)
- `game.contract.json`: `contract_version "1.0"`, `team`, `build_cmd`, `run_cmd`, `headless_cmd`, `tuning{...}` (danh sách khóa xem file). Số phải là số game thật sự dùng.
- CLI: `<headless_cmd> --seed <int> --night 1 [--scenario f] [--inputs f] --ticks <int> --out f.jsonl [--snapshot-every <int>=10]`.
- 60 tick/s; dừng sau `--ticks` hoặc khi game kết thúc; exit 0; lỗi → khác 0 + stderr; inputs/scenario sai → **exit 2**.
- Snapshot 0 = sau setup, trước input. Bước k đọc input tick k, tạo state k+1; event của bước dùng `tick = k+1`. `time_left_s = night − steps/60`.
- Mét, Y lên, đất y=0, player bắt đầu (0,0,0). Khoảng cách đo trên XZ; "trong bán kính r" = ≤ r.
- Inputs: `{"frames":[{tick, move:[x,z], cam_yaw_deg, jump, interact, pulse, dash}]}`; field thiếu giữ giá trị cũ; tick tăng nghiêm ngặt; move dài > 1 thì chuẩn hóa; xoay: `x' = x cosθ + z sinθ`, `z' = −x sinθ + z cosθ`; nút kích hoạt khi false→true.
- Scenario: `player{pos,carried,flames}`, `random_motes`, `random_shades`, `motes[]`, `shades[{pos,id?}]`, `lanterns` (theo id L1..L5, `pos?`, `lit:true`), `time_left_s`. Setup không phát event, không cộng điểm.
- Output JSONL: snapshot (`type,tick,sim_tick,state,time_left_s,score,player{pos,flames,carried},lanterns[{id,pos,lit,deposited}],shades[{id,pos,state}],motes_active`, khuyến nghị `motes`), event (`mote_picked, deposit, lantern_lit, pulse, player_hit, shade_spawned, game_over`), dòng cuối `end`. Tọa độ làm tròn 3 chữ số. Tất định theo seed.
