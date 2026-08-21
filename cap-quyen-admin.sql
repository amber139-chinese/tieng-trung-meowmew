-- =========================================================
-- CẤP QUYỀN GIÁO VIÊN / QUẢN TRỊ
--
-- 1) Trước hết hãy tạo tài khoản của bạn trên login.html.
-- 2) Đổi amber139 bên dưới thành TÊN TÀI KHOẢN của bạn nếu khác.
-- 3) Run đoạn SQL này.
-- =========================================================

insert into public.admin_users(id)
select id
from public.profiles
where username = 'amber139'
on conflict (id) do nothing;

-- Kiểm tra:
select
  p.username,
  p.display_name,
  case when a.id is not null then 'ĐÃ LÀ QUẢN TRỊ' else 'CHƯA CÓ QUYỀN' end as trang_thai
from public.profiles p
left join public.admin_users a on a.id = p.id
where p.username = 'amber139';
