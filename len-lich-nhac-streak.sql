-- Đặt lịch cho Meow Meow Streak gửi email nhắc mỗi ngày lúc 19:30 giờ Việt Nam (12:30 UTC).
-- Làm SAU khi đã deploy function streak-reminder (xem hướng dẫn trong tin nhắn / README).
-- Thay MAT_KHAU_BI_MAT bên dưới bằng đúng giá trị bạn đặt cho secret REMINDER_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Xoá lịch cũ nếu có (chạy lại file này an toàn)
select cron.unschedule(jobid) from cron.job where jobname = 'meow-streak-reminder';

select cron.schedule(
  'meow-streak-reminder',
  '30 12 * * *',
  $$
  select net.http_post(
    url     := 'https://xmtvmwcjjqqzscmkdlwd.supabase.co/functions/v1/streak-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'MAT_KHAU_BI_MAT'),
    body    := '{}'::jsonb
  );
  $$
);

-- Muốn thử mà chưa gửi thật: đổi body thành '{"dry": true}'::jsonb, hoặc gọi bằng curl:
--   curl -X POST https://xmtvmwcjjqqzscmkdlwd.supabase.co/functions/v1/streak-reminder \
--     -H "x-cron-secret: MAT_KHAU_BI_MAT" -H "Content-Type: application/json" -d '{"dry":true}'
-- Muốn dừng nhắc: select cron.unschedule('meow-streak-reminder');
