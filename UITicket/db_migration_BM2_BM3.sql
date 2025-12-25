-- ============================================================
-- DB MIGRATION - BM2 + BM3 (UITicket)
--
-- Mục tiêu:
--  1) BM3: ghi nhận ĐẶT CHỖ -> giữ ghế bằng so_ghe_da_dat (KHÔNG cộng vào so_ghe_da_ban)
--  2) BM2: bán vé phải trừ cả ghế đã bán + ghế đã đặt
--     ghế trống = so_luong_ghe - so_ghe_da_ban - so_ghe_da_dat
--
-- Chạy trên PostgreSQL (Neon / local)
-- ============================================================

BEGIN;

-- 1) Thêm cột giữ ghế (đã đặt)
ALTER TABLE chuyen_bay_hang_ve
  ADD COLUMN IF NOT EXISTS so_ghe_da_dat INT NOT NULL DEFAULT 0;

-- Nếu trước đó có NULL (hiếm), set về 0
UPDATE chuyen_bay_hang_ve
SET so_ghe_da_dat = 0
WHERE so_ghe_da_dat IS NULL;

-- 2) (Khuyến nghị) Đảm bảo không âm
ALTER TABLE chuyen_bay_hang_ve
  DROP CONSTRAINT IF EXISTS chuyen_bay_hang_ve_so_ghe_da_dat_nonneg;
ALTER TABLE chuyen_bay_hang_ve
  ADD CONSTRAINT chuyen_bay_hang_ve_so_ghe_da_dat_nonneg CHECK (so_ghe_da_dat >= 0);

-- 3) Đảm bảo giao_dich_ve có các cột BM3 cần (nếu DB bạn thiếu)
ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS loai TEXT NOT NULL DEFAULT 'ban_ve';

ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 4) Nếu DB đang có CHECK constraint cho trang_thai trong giao_dich_ve mà CHƯA cho phép 'Đặt chỗ'
--    thì nên DROP constraint đó để tránh lỗi khi tạo phiếu đặt.
ALTER TABLE giao_dich_ve
  DROP CONSTRAINT IF EXISTS giao_dich_ve_trang_thai_check;

-- (Tuỳ chọn) Nếu bạn MUỐN giữ CHECK constraint, có thể add lại như dưới (nhớ đảm bảo dữ liệu hiện có hợp lệ):
-- ALTER TABLE giao_dich_ve
--   ADD CONSTRAINT giao_dich_ve_trang_thai_check
--   CHECK (trang_thai IN ('Đặt chỗ','Đã thanh toán','Đã hủy','Hết hạn','Bị hủy (ngày bay)'));

COMMIT;
