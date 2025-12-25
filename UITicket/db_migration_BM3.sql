-- ============================================
-- MIGRATION BM3: Ghi nhận đặt chỗ (giữ ghế)
-- Chạy trên PostgreSQL (Neon / local)
-- ============================================

-- 1) Thêm cột giữ ghế (đã đặt) theo hạng vé
ALTER TABLE chuyen_bay_hang_ve
  ADD COLUMN IF NOT EXISTS so_ghe_da_dat integer NOT NULL DEFAULT 0;

-- Nếu trước đó có NULL (hiếm), set về 0
UPDATE chuyen_bay_hang_ve
SET so_ghe_da_dat = 0
WHERE so_ghe_da_dat IS NULL;

-- 2) Đảm bảo bảng giao_dich_ve có các cột cần thiết (nếu DB bạn thiếu)
ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS loai text NOT NULL DEFAULT 'ban_ve';

ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS created_by bigint;

ALTER TABLE giao_dich_ve
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 3) Thêm tham số QĐ3 (nếu chưa có)
-- ThoiGianDatVeChamNhat: số ngày chậm nhất trước khi khởi hành để được đặt (mặc định 1)
-- ThoiGianHuyDatVe: số ngày trước ngày bay sẽ tự hủy phiếu (mặc định 0 = hủy vào ngày bay)
INSERT INTO tham_so (ten_tham_so, gia_tri)
SELECT 'ThoiGianDatVeChamNhat', '1'
WHERE NOT EXISTS (SELECT 1 FROM tham_so WHERE ten_tham_so = 'ThoiGianDatVeChamNhat');

INSERT INTO tham_so (ten_tham_so, gia_tri)
SELECT 'ThoiGianHuyDatVe', '0'
WHERE NOT EXISTS (SELECT 1 FROM tham_so WHERE ten_tham_so = 'ThoiGianHuyDatVe');

-- (Optional) Nếu DB bạn còn constraint cũ chặn trạng thái/loại, hãy điều chỉnh cho phù hợp:
-- Ví dụ: allow trang_thai IN ('Đặt chỗ','Đã hủy','Hết hạn','Đã thanh toán')
-- và loai IN ('ban_ve','dat_cho')
