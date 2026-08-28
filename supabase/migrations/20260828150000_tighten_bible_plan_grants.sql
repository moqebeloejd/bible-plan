-- Limit Data API roles to only the operations used by the Bible-plan client.
revoke all on table public.bible_reader_progress from anon;
revoke all on table public.bible_reader_settings from anon;
revoke all on table public.bible_reader_progress from authenticated;
revoke all on table public.bible_reader_settings from authenticated;

grant select, insert, update, delete on table public.bible_reader_progress to authenticated;
grant select, insert, update, delete on table public.bible_reader_settings to authenticated;
