-- ════════════════════════════════════════════
-- NAMI-VET: Initial Database Schema
-- Run this in your Supabase SQL editor
-- ════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users profile (extends Supabase auth.users) ──────────────

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  avatar_url text,
  plan text default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Projects ─────────────────────────────────────────────────

create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null default 'Untitled Project',
  description text,
  thumbnail_url text,
  duration_seconds float default 0,
  resolution text default '1920x1080',
  fps integer default 30,
  last_opened_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Timeline state (full JSON of the editor timeline) ────────

create table public.project_timelines (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null unique,
  timeline_json jsonb not null default '{"tracks":[],"duration":0,"playhead":0}'::jsonb,
  updated_at timestamptz default now()
);

-- ── Media assets (files imported into a project) ─────────────

create table public.media_assets (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  file_name text not null,
  file_path text not null,
  file_size_bytes bigint,
  duration_seconds float,
  width integer,
  height integer,
  fps float,
  media_type text check (media_type in ('video', 'audio', 'image', 'subtitle')),
  thumbnail_url text,
  created_at timestamptz default now()
);

-- ── AI chat history per project ──────────────────────────────

create table public.ai_conversations (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz default now()
);

-- ── Generated subtitle segments ──────────────────────────────

create table public.subtitle_segments (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  start_time float not null,
  end_time float not null,
  text text not null,
  language text default 'en',
  created_at timestamptz default now()
);

-- ════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_timelines enable row level security;
alter table public.media_assets enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.subtitle_segments enable row level security;

-- ── RLS Policies (users see only their own data) ─────────────

create policy "Users own their profile"
  on public.profiles for all using (auth.uid() = id);

create policy "Users own their projects"
  on public.projects for all using (auth.uid() = user_id);

create policy "Timeline access via project"
  on public.project_timelines for all using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

create policy "Media asset access"
  on public.media_assets for all using (auth.uid() = user_id);

create policy "AI conversation access"
  on public.ai_conversations for all using (auth.uid() = user_id);

create policy "Subtitle access"
  on public.subtitle_segments for all using (
    project_id in (select id from public.projects where user_id = auth.uid())
  );

-- ════════════════════════════════════════════
-- Auto-update updated_at trigger
-- ════════════════════════════════════════════

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function update_updated_at();

create trigger timelines_updated_at
  before update on public.project_timelines
  for each row execute function update_updated_at();

-- ════════════════════════════════════════════
-- Auto-create profile on signup trigger
-- ════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url, plan)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'free'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
