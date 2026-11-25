-- Chạy 1 lần trong Supabase → SQL Editor (chạy lại nhiều lần cũng an toàn).
-- Bảng lưu chuỗi ngày học, thẻ đóng băng và cài đặt nhắc email của Meow Meow Streak,
-- để học viên đổi máy / đổi trình duyệt vẫn giữ chuỗi.
-- (Không chạy cũng không sao: mèo vẫn đếm chuỗi, nhưng chỉ lưu trên từng trình duyệt.)

create table if not exists public.user_streaks (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  best_streak    integer not null default 0,
  last_day       date,
  updated_at     timestamptz not null default now()
);

-- Cột mới cho thẻ đóng băng + nhắc email
alter table public.user_streaks add column if not exists freezes           integer not null default 0;
alter table public.user_streaks add column if not exists frozen_days       jsonb   not null default '[]'::jsonb;
alter table public.user_streaks add column if not exists reminder_email    text;
alter table public.user_streaks add column if not exists reminder_on       boolean not null default false;
alter table public.user_streaks add column if not exists last_reminded_day date;
-- Cá 🐟 của mèo (kiếm cá, cho ăn) — mỗi máy ghi bộ đếm riêng nên đồng bộ nhiều thiết bị không mất cá
alter table public.user_streaks add column if not exists fish_state jsonb not null default '{}'::jsonb;

alter table public.user_streaks enable row level security;

drop policy if exists "streak_select_own"   on public.user_streaks;
drop policy if exists "streak_insert_own"   on public.user_streaks;
drop policy if exists "streak_update_own"   on public.user_streaks;
drop policy if exists "streak_select_admin" on public.user_streaks;

create policy "streak_select_own" on public.user_streaks
  for select using (auth.uid() = user_id);

create policy "streak_insert_own" on public.user_streaks
  for insert with check (auth.uid() = user_id);

create policy "streak_update_own" on public.user_streaks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Giáo viên (admin_users) xem được chuỗi của cả lớp
create policy "streak_select_admin" on public.user_streaks
  for select using (exists (select 1 from public.admin_users a where a.id = auth.uid()));
