# Đảo Đèn Lồng

> **Video demo:** sẽ được đính kèm Release `v1.0.0` ở Phase 4 (chưa có ở tag này).
> Nguyễn Tiến Hưng · 2A202603365 · Day 12 AI SDLC · Tài liệu gốc của lab: [docs/lab/](docs/lab/README.md)

Game 3D góc nhìn thứ ba. Bạn là **Mây**, người giữ đèn nhỏ tuổi đội nón lá, áo trắng ngà, khăn đỏ. Sương đen đã nuốt ánh sáng của ba hòn đảo: gom **đom đóm**, thắp lại các **Đèn Lồng Lớn** trước bình minh, né **Bóng Mực** và giữ đom đóm khỏi tay **Gió Lạc**.

## Cài đặt và chạy (3 lệnh, macOS / Linux / Windows, cần Node ≥ 18)
```bash
git clone <repo-url> dao-den-long && cd dao-den-long
npm install
npm start          # mở http://localhost:8765  (cổng bận? PORT=8766 npm start)
```

## Điều khiển
| Phím | Hành động |
|---|---|
| W A S D (hoặc ↑ ↓) | Di chuyển (theo hướng camera) |
| Kéo chuột / ← → | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Space | Nhảy |
| Shift | Lướt (14 m/s trong 0.2 s, hồi chiêu 1.5 s) |
| E | Nạp ánh sáng / châm dầu cho Đèn Lồng Lớn gần nhất (trong 2 m) |
| F | Tỏa Sáng (tốn 3 đom đóm): choáng + đẩy lùi Bóng Mực trong 5 m, đuổi Gió Lạc |
| Esc / P | Tạm dừng: Tiếp tục · Chơi lại Đêm · Cài đặt · Về menu |

URL tiện ích: `?autoplay&seed=4&night=1` (bot tự chơi), `&skip=40` (tua nhanh 40 s), `?fps` (hiện FPS).

## Ba Đêm
| Đêm | Đảo | Đèn | Thời gian | Điểm mới |
|---|---|---|---|---|
| 1 | Đảo Bến — đảo tròn bán kính 40 m | 5 (giữ ≥ 3) | 4:00 | — |
| 2 | Đảo Cau — hai đảo nối bằng cầu tre, bục nhảy vượt biển mây | 6 (giữ ≥ 4) | 4:30 | Gió Lạc, Bùa Gió |
| 3 | Đảo Chuông — 3 tầng, dốc, bục nhảy, tháp chuông | 7 (giữ ≥ 5) | 5:00 | Gió mạnh mỗi 30 s, Bóng Mực nhanh hơn |

Menu → giới thiệu Đêm (lời Ông Đăng) → chơi → kết quả → Đêm kế. Thắng Đêm 3 thì tới màn **Bình Minh** với tổng điểm; thua thì chơi lại Đêm đó.

## Luật (số chuẩn Ticket-02, luật đèn và thắng theo Ticket-03)
- Chạy 6 m/s, nhảy 7 m/s. Rơi khỏi đảo (xuống biển mây): −1 lửa, mất hết đom đóm, hồi sinh sau 1 s.
- Đom đóm tự nhặt khi tới gần (≤ 1 m). Sức chứa **10 + 2 × số lần thắp thành công** (tối đa 20). Đèn mới cần **10** đom đóm, đèn từng sáng thắp lại chỉ cần **5**.
- Đèn sáng **hao dầu 1/giây** (đầy 100). Bấm E ở đèn đang sáng để châm dầu: mỗi đom đóm +10 dầu. Hết dầu thì đèn tắt.
- Bóng Mực phát hiện trong 12 m, bỏ đuổi ngoài 18 m, chạy 4 m/s (Đêm 3: 4.5). Chạm vào: −1 **Ngọn Lửa** (có 3), rơi một nửa số đom đóm ra quanh Mây (nhặt lại được trong 8 s), bất tử 1.5 s.
- Đèn sáng có **≥ 30 dầu** tạo vùng an toàn **6 m** mà Bóng Mực không vào được. Dưới 30, đèn nhấp nháy, mất vùng an toàn, và Bóng Mực tới **hút dầu** (5/giây).
- Gió Lạc lao tới khi bạn mang ≥ 5 đom đóm, cướp tối đa 3 rồi bay đi. Tỏa Sáng trúng nó thì nó đánh rơi đồ đã cướp.
- Bùa Gió (lá bùa đỏ viền vàng): 10 s chạy 7.2 m/s và lướt không cần hồi chiêu.
- **Thắng**: còn sống lúc **bình minh** và còn ≥ 60% số đèn đang sáng. **Thua**: hết Ngọn Lửa, hoặc bình minh tới mà không đủ đèn sáng.

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp, thắp lại, châm dầu) | +5 |
| Thắp lần đầu / thắp lại | +100 / +40 |
| Bóng Mực trúng Tỏa Sáng (đang hút dầu) | +5 (+15) |
| Bình minh (khi thắng): mỗi đèn đang sáng | +50 + phần nguyên của dầu |
| Bình minh (khi thắng): mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm game = tổng điểm các Đêm đã thắng.

## Chế độ headless (Test Contract v1.2)
```bash
node src/headless.js --seed 1 --night 1 --ticks 21600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```
- `--night` nhận 1, 2, 3. Không cần `npm install`, không cần cửa sổ/GPU. Lỗi file hoặc `--night` sai → exit code 2. Một Đêm đầy đủ chạy dưới 1 s.
- Khai báo: [game.contract.json](game.contract.json). Game **đọc trực tiếp** khối `tuning` từ file này; các số chuẩn còn lại nằm ở `SPEC` trong [src/sim/world.js](src/sim/world.js). Bản đồ: [src/sim/maps.js](src/sim/maps.js).
- Giả định cho chỗ ticket chưa nói rõ: [Phase 1](docs/notes/phase-1.md) · [Phase 2](docs/notes/phase-2.md) · [Phase 3](docs/notes/phase-3.md). Quyết định thiết kế: [ADR 0001](docs/adr/0001-lantern-fuel-and-dawn-win.md). Breaking changes: [CHANGELOG](CHANGELOG.md). Ví dụ: điểm xuất phát Đêm 3 là (0,0,−30) vì (0,0,0) nằm trong tháp chuông.

## Kiểm thử và bằng chứng
```bash
npm test                                        # 74 test + 28 scenario headless (mỗi scenario chạy 2 lần để so tất định)
node scripts/proof.mjs phase-3                  # sinh lại bằng chứng vào docs/proof/phase-3/
node scripts/browser-check.mjs out/ --fps-seconds 20   # (Node ≥ 22 + Chrome, khi npm start đang chạy) ảnh + lỗi console + FPS
```
Bằng chứng: [Phase 1](docs/proof/phase-1/README.md) · [Phase 2](docs/proof/phase-2/README.md) · [Phase 3](docs/proof/phase-3/README.md). CI trên GitHub Actions chạy `npm test` trên Ubuntu + macOS với Node 18 và 22.

## Sáng tạo của tôi
Tất cả nằm trong `src/web/`, chỉ là phần hiển thị và âm thanh, không đụng tới luật trong `src/sim/`. Vì vậy đầu ra headless không đổi: toàn bộ test headless chạy không cần trình duyệt và vẫn PASS.
- **Âm thanh riêng:** nhạc nền đêm `lab11nen.mp3`, tiếng Tỏa Sáng `lab11duoi.mp3`, tiếng nạp ánh sáng `lab11sang.mp3`. Các hiệu ứng khác (nhặt, nhảy, lướt, Bóng Mực xuất hiện, đếm ngược, thắng/thua) được tổng hợp bằng WebAudio.
- **Vòng tiến độ trên đèn:** vòng sáng quanh đèn lớn dần theo số đom đóm đã nạp; khi thắp, đèn bùng sáng và hiện vòng an toàn 6 m trên mặt đất.
- **Gió Lạc là dải lụa:** các mảnh lụa bay theo vệt đường đi; sáng lên khi đang đuổi hoặc đang mang đồ cướp.
- **Lá bay báo gió** 2 s trước mỗi cơn gió ở Đêm 3, kèm tiếng gió và thông báo.
- **Lời Ông Đăng** cho từng Đêm và thông báo ngắn theo tình huống (đèn sáng, bị cướp, nhặt bùa, rơi xuống biển mây).
- **Tia hút dầu:** Bóng Mực đang hút nối với đèn bằng một tia sáng màu viền của nó, để người chơi thấy đèn nào đang bị hút.
- **Bot `?autoplay`:** dùng đúng input của contract, biết đi qua cầu, lên dốc, dùng bục nhảy, né Bóng Mực và châm dầu cho đèn yếu. Dùng để chụp ảnh bằng chứng và đo FPS.

## Cấu trúc
```
game.contract.json     contract v1.1 + tuning
src/sim/               logic game thuần: world.js (luật, 12 bước/tick), maps.js (3 bản đồ), files.js, runner.js, rng.js
src/headless.js        CLI headless
src/web/               renderer Three.js, menu/HUD, audio.js + sounds/, autopilot.js
server.js              server tĩnh không phụ thuộc
tests/                 node:test + tests/scenarios/*.json
scripts/               proof.mjs, browser-check.mjs, gen-win-scenario.mjs, stop-hook.mjs
docs/specs/            yêu cầu từng phase · docs/notes/ giả định, nhật ký AI, retro · docs/proof/ bằng chứng
AGENTS.md, CLAUDE.md, .claude/   harness AI (skill verify, Stop hook)
```

## Harness AI
[AGENTS.md](AGENTS.md) (lệnh, cấu trúc, quy tắc; cập nhật mỗi phase) · skill [verify](.claude/skills/verify/SKILL.md) · Stop hook [.claude/settings.json](.claude/settings.json) → [scripts/stop-hook.mjs](scripts/stop-hook.mjs) (không cho agent kết thúc khi test đỏ) · CI [.github/workflows/ci.yml](.github/workflows/ci.yml). Nhật ký: [docs/notes/ai-log.md](docs/notes/ai-log.md).

Giấy phép: [MIT](LICENSE) · Nguồn: [CREDITS.md](CREDITS.md) · Thay đổi: [CHANGELOG.md](CHANGELOG.md)
