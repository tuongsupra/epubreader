
-- Create Storage Bucket 'books'
-- Safe script that checks for existing policies

insert into storage.buckets (id, name, public) 
values ('books', 'books', false)
on conflict (id) do nothing;

-- 2. Policies (Drop first to avoid conflict)

drop policy if exists "User can upload own books" on storage.objects;
create policy "User can upload own books" on storage.objects 
for insert with check (
  bucket_id = 'books' and auth.uid() = owner
);

drop policy if exists "User can download own books" on storage.objects;
create policy "User can download own books" on storage.objects 
for select using (
  bucket_id = 'books' and auth.uid() = owner
);

drop policy if exists "User can delete own books" on storage.objects;
create policy "User can delete own books" on storage.objects 
for delete using (
  bucket_id = 'books' and auth.uid() = owner
);
