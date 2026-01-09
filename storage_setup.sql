
-- Safe Storage Setup Script
-- Checks if bucket exists, creates if not.
-- Drops policies if exist to avoid conflicts, then creates them.

-- 1. Create bucket if not exists
insert into storage.buckets (id, name, public) 
values ('books', 'books', false)
on conflict (id) do nothing;

-- 2. Drop existing policies to prevent "already exists" error
drop policy if exists "User can upload own books" on storage.objects;
drop policy if exists "User can download own books" on storage.objects;
drop policy if exists "User can delete own books" on storage.objects;

-- 3. Create policies
create policy "User can upload own books" on storage.objects 
for insert with check (
  bucket_id = 'books' and auth.uid() = owner
);

create policy "User can download own books" on storage.objects 
for select using (
  bucket_id = 'books' and auth.uid() = owner
);

create policy "User can delete own books" on storage.objects 
for delete using (
  bucket_id = 'books' and auth.uid() = owner
);
