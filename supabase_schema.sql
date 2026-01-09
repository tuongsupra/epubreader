-- Create a table for public profiles
create table profiles (
  id uuid references auth.users not null primary key,
  updated_at timestamp with time zone,
  theme text,
  font_family text,
  font_size integer
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- Create a table for reading progress
create table user_books (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  book_hash text not null, -- Unique identifier for the book (md5 of title+author or similar)
  title text,
  last_read_cfi text, -- EPUB location string
  percentage float,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, book_hash)
);

alter table user_books enable row level security;

create policy "Users can view own books." on user_books
  for select using (auth.uid() = user_id);

create policy "Users can insert their own books." on user_books
  for insert with check (auth.uid() = user_id);

create policy "Users can update own books." on user_books
  for update using (auth.uid() = user_id);

-- Check triggers to handle updated_at
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on user_books
  for each row execute procedure moddatetime (updated_at);
