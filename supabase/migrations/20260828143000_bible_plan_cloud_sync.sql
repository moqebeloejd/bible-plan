-- Cloud sync for the separate Chronological Bible · One Year app.
-- This intentionally uses app-prefixed tables so Kingdom study data remains separate.

create table if not exists public.bible_reader_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (char_length(plan_id) between 1 and 100),
  day_id text not null check (day_id ~ '^[A-Z0-9]+-D[0-9]{3}$'),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id, day_id)
);

create table if not exists public.bible_reader_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (char_length(plan_id) between 1 and 100),
  start_date date not null,
  bible_version text not null default 'NKJV' check (char_length(bible_version) between 2 and 24),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);

create or replace function public.bible_plan_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bible_reader_progress_set_updated_at on public.bible_reader_progress;
create trigger bible_reader_progress_set_updated_at
before update on public.bible_reader_progress
for each row execute function public.bible_plan_set_updated_at();

drop trigger if exists bible_reader_settings_set_updated_at on public.bible_reader_settings;
create trigger bible_reader_settings_set_updated_at
before update on public.bible_reader_settings
for each row execute function public.bible_plan_set_updated_at();

alter table public.bible_reader_progress enable row level security;
alter table public.bible_reader_settings enable row level security;

revoke all on table public.bible_reader_progress from anon;
revoke all on table public.bible_reader_settings from anon;
revoke all on table public.bible_reader_progress from authenticated;
revoke all on table public.bible_reader_settings from authenticated;
grant select, insert, update, delete on table public.bible_reader_progress to authenticated;
grant select, insert, update, delete on table public.bible_reader_settings to authenticated;

drop policy if exists "Readers view own Bible progress" on public.bible_reader_progress;
create policy "Readers view own Bible progress"
on public.bible_reader_progress for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Readers add own Bible progress" on public.bible_reader_progress;
create policy "Readers add own Bible progress"
on public.bible_reader_progress for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers update own Bible progress" on public.bible_reader_progress;
create policy "Readers update own Bible progress"
on public.bible_reader_progress for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers remove own Bible progress" on public.bible_reader_progress;
create policy "Readers remove own Bible progress"
on public.bible_reader_progress for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Readers view own Bible settings" on public.bible_reader_settings;
create policy "Readers view own Bible settings"
on public.bible_reader_settings for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Readers add own Bible settings" on public.bible_reader_settings;
create policy "Readers add own Bible settings"
on public.bible_reader_settings for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers update own Bible settings" on public.bible_reader_settings;
create policy "Readers update own Bible settings"
on public.bible_reader_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Readers remove own Bible settings" on public.bible_reader_settings;
create policy "Readers remove own Bible settings"
on public.bible_reader_settings for delete to authenticated
using ((select auth.uid()) = user_id);
