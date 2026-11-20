# Retro

> Bản cuối viết ở Phase 4. Dưới đây là ghi chú tích lũy sau mỗi phase.

## Sau Phase 1
- **Hiệu quả:** đọc Test Contract trước và viết test với kỳ vọng tính tay từ `tuning` → phát hiện lỗi sớm, gần như không phải sửa sim. Tách sim/render giúp toàn bộ bằng chứng chạy không cần trình duyệt.
- **Chưa hiệu quả:** mất thời gian với môi trường Windows (cổng 8080 bị chiếm, chạy server nền trong Bash tool bị treo).
- **Harness hữu ích nhất:** proof script dùng chung + Stop hook (không thể "xong" khi test đỏ).
- **Nếu làm lại:** chọn cổng ít phổ biến ngay từ đầu; viết proof script trước khi viết sim.
