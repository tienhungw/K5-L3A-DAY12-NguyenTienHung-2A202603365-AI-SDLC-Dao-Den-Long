# Đảo Đèn Lồng

> **Video demo:** sẽ được đính kèm Release `v1.0.0` ở Phase 4 (chưa có ở tag này).
> Nguyễn Tiến Hưng · 2A202603365 · Day 12 AI SDLC · Tài liệu gốc của lab: [docs/lab/](docs/lab/README.md)

Game 3D góc nhìn thứ ba. Bạn là **Mây**, người giữ đèn nhỏ tuổi với chiếc nón lá treo đèn lồng. Sương đen đã nuốt ánh sáng của Đảo Bến: hãy gom **đom đóm**, thắp lại **5 Đèn Lồng Lớn** trước bình minh và né **Bóng Mực**.

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
| Kéo chuột / ← → | Xoay camera |
| Space | Nhảy |
| E | Nộp đom đóm vào Đèn Lồng Lớn gần nhất (trong 2 m) |
| F (hoặc Q) | Xung sáng (tốn 1 đom đóm): làm choáng + đẩy Bóng Mực trong 4 m |
| R | Chơi lại · M: tắt tiếng · P: tạm dừng |

Thêm `?autoplay` vào URL để xem bot tự chơi (`?autoplay&seed=5&skip=40` để tua nhanh 40 s).

## Luật và cách tính điểm (Đêm 1 – Đảo Bến)
- Đom đóm tự được nhặt khi đến gần (≤ 1 m), mang tối đa **5**. Mỗi Đèn Lồng Lớn cần **5** đom đóm.
- Bóng Mực luôn đuổi theo (2.5 m/s, bạn chạy 4.5 m/s). Chạm vào: mất 1 **lửa** (có 3), rơi mất một nửa số đom đóm đang mang, bất tử 1.5 s.
- Bóng Mực **sợ đèn**: không thể vào vòng 3 m quanh đèn đã thắp — đứng cạnh đèn sáng là an toàn.
- **Thắng**: thắp đủ 5 đèn. **Thua**: hết lửa, hoặc hết đêm (240 s).

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Làm choáng 1 Bóng Mực bằng xung | +20 |
| Khi thắng: mỗi giây còn lại (làm tròn xuống) | +2 |
| Khi thắng: mỗi lửa còn lại | +50 |

## Chế độ headless (Test Contract v1.0)
```bash
node src/headless.js --seed 1 --night 1 --ticks 4800 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```
- Không cần `npm install`, không cần cửa sổ/GPU. Lỗi file inputs/scenario → exit code 2.
- Khai báo: [game.contract.json](game.contract.json). Game **đọc trực tiếp** khối `tuning` từ file này, nên con số khai báo chính là con số game dùng.
- Khái niệm không có trong game: `fall_enabled: false` — người chơi bị chặn ở mép đảo (bán kính 30 m), không có sát thương do rơi. Không dùng nút `dash`.
- Các giả định cho chỗ PRD mơ hồ: [docs/notes/phase-1.md](docs/notes/phase-1.md).

## Kiểm thử và bằng chứng
```bash
npm test                          # unit + contract + mọi scenario headless (chạy 2 lần, so tất định)
node scripts/proof.mjs phase-1    # sinh lại bằng chứng vào docs/proof/phase-1/
```
- Bằng chứng từng phase: [docs/proof/](docs/proof/phase-1/README.md) · CI: GitHub Actions chạy `npm test` trên Ubuntu + macOS, Node 18 & 22 mỗi lần push.

## Sáng tạo của tôi
Tất cả nằm trong `src/web/` (chỉ phần hiển thị) — không đụng vào luật trong `src/sim/`, nên đầu ra headless không đổi (bằng chứng: toàn bộ test headless chạy không cần trình duyệt và vẫn PASS).
- **Đom đóm bay quanh Mây**: số đom đóm đang mang hiện thành những đốm sáng xoay quanh người; đèn nhỏ trên nón sáng hơn khi mang nhiều.
- **Hạt tiến độ trên đèn**: mỗi Đèn Lồng Lớn có 5 hạt sáng dần theo số đom đóm đã nộp; khi thắp, đèn bùng sáng và hiện vòng an toàn màu cam trên đất.
- **Âm thanh tổng hợp** (WebAudio, không dùng file): tiếng "ting" cao dần khi nhặt, hợp âm khi thắp đèn, tiếng trầm khi bị đánh, giai điệu thắng/thua.
- **Gợi ý theo ngữ cảnh**: "Nhấn E để nộp…", "Túi đầy!", "Bóng Mực tới gần — nhấn F!".
- **Chế độ tự chơi `?autoplay`**: bot dùng đúng input của contract (kể cả xoay camera và đổi hệ trục), dùng để chụp ảnh bằng chứng và quay demo.

## Cấu trúc
```
game.contract.json     khai báo contract + tuning (nguồn số duy nhất)
src/sim/               logic game thuần (world.js, files.js, runner.js, rng.js)
src/headless.js        CLI headless
src/web/               renderer Three.js, audio, autopilot
server.js              server tĩnh không phụ thuộc
tests/                 node:test + tests/scenarios/*.json
scripts/               proof.mjs, gen-win-scenario.mjs, stop-hook.mjs
docs/specs/            tóm tắt yêu cầu từng phase
docs/notes/            giả định, nhật ký AI, retro
docs/proof/            bằng chứng từng phase
AGENTS.md, CLAUDE.md, .claude/   harness AI (skill verify, Stop hook)
```

## Harness AI
[AGENTS.md](AGENTS.md) (lệnh, cấu trúc, quy tắc) · skill [verify](.claude/skills/verify/SKILL.md) (chạy kiểm chứng + lưu bằng chứng) · Stop hook [.claude/settings.json](.claude/settings.json) → [scripts/stop-hook.mjs](scripts/stop-hook.mjs) (không cho agent kết thúc khi test đỏ) · CI [.github/workflows/ci.yml](.github/workflows/ci.yml). Nhật ký: [docs/notes/ai-log.md](docs/notes/ai-log.md).

Giấy phép: [MIT](LICENSE) · Nguồn: [CREDITS.md](CREDITS.md) · Thay đổi: [CHANGELOG.md](CHANGELOG.md)
