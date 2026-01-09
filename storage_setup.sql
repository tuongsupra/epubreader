
-- Create Storage Bucket 'books'
-- You can run this in Supabase SQL Editor

-- 1. Create bucket if not exists (Note: You might need to do this via Dashboard UI if SQL fails due to permissions)
insert into storage.buckets (id, name, public) 
values ('books', 'books', false)
on conflict (id) do nothing;

-- 2. Policy: User can upload their own books
create policy "User can upload own books" on storage.objects 
for insert with check (
  bucket_id = 'books' and auth.uid() = owner
);

-- 3. Policy: User can download their own books
create policy "User can download own books" on storage.objects 
for select using (
  bucket_id = 'books' and auth.uid() = owner
);

-- 4. Policy: User can delete their own books
create policy "User can delete own books" on storage.objects 
for delete using (
  bucket_id = 'books' and auth.uid() = owner
);

-- Note: Ensure 'user_books' table is ready for sync logic (no change needed from previous schema unless we want to map file paths explicitly, but we can assume path = userId/hash.epub)
