-- Add account-synchronised display preferences to the existing Bible settings row.
-- Existing readers retain the church blue-and-white light theme by default.

alter table public.bible_reader_settings
  add column if not exists theme text not null default 'light',
  add column if not exists accent text not null default 'blue';

alter table public.bible_reader_settings
  drop constraint if exists bible_reader_settings_theme_check,
  add constraint bible_reader_settings_theme_check
    check (theme in ('light', 'dark')),
  drop constraint if exists bible_reader_settings_accent_check,
  add constraint bible_reader_settings_accent_check
    check (accent in ('blue', 'pink', 'purple', 'teal'));

-- RLS and grants remain unchanged: these columns live on the same user-owned
-- row already protected by auth.uid() policies for authenticated readers.
