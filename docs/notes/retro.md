# Retro

> Bản cuối viết ở Phase 4. Dưới đây là ghi chú tích lũy sau mỗi phase.

## Sau Phase 1
- **Hiệu quả:** đọc Test Contract trước và viết test với kỳ vọng tính tay từ `tuning` → phát hiện lỗi sớm, gần như không phải sửa sim. Tách sim/render giúp toàn bộ bằng chứng chạy không cần trình duyệt.
- **Chưa hiệu quả:** mất thời gian với môi trường Windows (cổng 8080 bị chiếm, chạy server nền trong Bash tool bị treo).
- **Harness hữu ích nhất:** proof script dùng chung + Stop hook (không thể "xong" khi test đỏ).
- **Nếu làm lại:** chọn cổng ít phổ biến ngay từ đầu; viết proof script trước khi viết sim.

## Sau Phase 2
- **Hiệu quả:** kiến trúc tách sim/render của Phase 1 trả lời đúng lúc: viết lại toàn bộ luật mà renderer chỉ cần đọc state mới. Test so sánh *toàn bộ* tuning với ticket bắt lỗi số ngay. Đo có kiểm soát tìm ra nút thắt FPS thật (DOM) thay vì đoán (bloom).
- **Chưa hiệu quả:** phase này rất lớn; renderer, bot và docs chiếm nhiều thời gian hơn luật. Một số tính năng UI (Bình Minh, lưu cài đặt, âm thanh) chỉ kiểm tra tay.
- **Harness hữu ích nhất:** `proof.mjs` (thêm `night`, `last_snapshot`) và `browser-check.mjs` (ảnh + lỗi console + FPS trong một lệnh).
- **Nếu làm lại:** viết test Playwright-kiểu (qua CDP) cho chuỗi menu → Đêm → kết quả sớm hơn để tự động hóa phần UI.

## Sau Phase 3
- **Hiệu quả:** viết ADR trước khi code giúp bước sửa code chỉ còn là "chép" mô hình đã chốt. Lưu dầu dạng số nguyên 1/60 làm mọi kỳ vọng tính tay khớp chính xác tới tick.
- **Chưa hiệu quả:** 3 kỳ vọng test sai vì quên tương tác giữa các bước trong cùng một tick (bước 2 hút dầu trước bước 5 châm dầu). Bài học: với mỗi test liên quan nhiều cơ chế, viết phép tính theo từng bước của tick ngay trong chú thích.
- **Harness hữu ích nhất:** bảng "test cũ bị thay" trong ghi chú phase + quy tắc "không bao giờ skip" trong AGENTS.md.
