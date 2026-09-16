-- Run this migration once in the Supabase SQL editor.
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  media_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'processing', 'ready', 'failed')),
  error text,
  chunk_count integer not null default 0 check (chunk_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.usage_counters (
  usage_date date not null default (timezone('utc', now())::date),
  scope_type text not null check (scope_type in ('workspace', 'ip', 'global')),
  scope_key text not null,
  action text not null,
  count integer not null default 0 check (count >= 0),
  primary key (usage_date, scope_type, scope_key, action)
);

create index if not exists documents_workspace_idx
  on public.documents(workspace_id, created_at desc);
create index if not exists document_chunks_workspace_idx
  on public.document_chunks(workspace_id, document_id);
create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists workspaces_expiry_idx on public.workspaces(expires_at);

alter table public.workspaces enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.usage_counters enable row level security;

revoke all on public.workspaces, public.documents, public.document_chunks, public.usage_counters
  from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.match_document_chunks(
  p_workspace_id uuid,
  query_embedding extensions.vector(1536),
  match_threshold float default 0.5,
  match_count integer default 6
)
returns table (
  id bigint,
  document_id uuid,
  file_name text,
  content text,
  page_number integer,
  metadata jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    chunks.id, chunks.document_id, docs.name, chunks.content,
    chunks.page_number, chunks.metadata,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from public.document_chunks as chunks
  join public.documents as docs on docs.id = chunks.document_id
  where chunks.workspace_id = p_workspace_id
    and docs.workspace_id = p_workspace_id
    and docs.status = 'ready'
    and 1 - (chunks.embedding <=> query_embedding) >= match_threshold
  order by chunks.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

create or replace function public.consume_ip_quota(
  p_action text,
  p_ip_hash text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  today date := timezone('utc', now())::date;
begin
  perform pg_advisory_xact_lock(hashtext('ip:' || p_action || ':' || p_ip_hash));
  select coalesce(max(count), 0) into current_count
  from public.usage_counters
  where usage_date = today and scope_type = 'ip'
    and scope_key = p_ip_hash and action = p_action;
  if current_count >= p_limit then return false; end if;
  insert into public.usage_counters (usage_date, scope_type, scope_key, action, count)
  values (today, 'ip', p_ip_hash, p_action, 1)
  on conflict (usage_date, scope_type, scope_key, action)
  do update set count = public.usage_counters.count + 1;
  return true;
end;
$$;

create or replace function public.consume_demo_quota(
  p_action text,
  p_workspace_id uuid,
  p_ip_hash text,
  p_workspace_limit integer,
  p_global_limit integer,
  p_ip_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_count integer;
  global_count integer;
  ip_count integer;
  today date := timezone('utc', now())::date;
begin
  perform pg_advisory_xact_lock(hashtext('demo-quota:' || p_action));
  select coalesce(max(count), 0) into workspace_count from public.usage_counters
    where usage_date = today and scope_type = 'workspace'
      and scope_key = p_workspace_id::text and action = p_action;
  select coalesce(max(count), 0) into global_count from public.usage_counters
    where usage_date = today and scope_type = 'global'
      and scope_key = 'all' and action = p_action;
  select coalesce(max(count), 0) into ip_count from public.usage_counters
    where usage_date = today and scope_type = 'ip'
      and scope_key = p_ip_hash and action = p_action;
  if workspace_count >= p_workspace_limit
    or global_count >= p_global_limit
    or ip_count >= p_ip_limit then
    return false;
  end if;
  insert into public.usage_counters (usage_date, scope_type, scope_key, action, count)
  values
    (today, 'workspace', p_workspace_id::text, p_action, 1),
    (today, 'global', 'all', p_action, 1),
    (today, 'ip', p_ip_hash, p_action, 1)
  on conflict (usage_date, scope_type, scope_key, action)
  do update set count = public.usage_counters.count + 1;
  return true;
end;
$$;

revoke all on function public.match_document_chunks(uuid, extensions.vector, float, integer) from public, anon, authenticated;
revoke all on function public.consume_ip_quota(text, text, integer) from public, anon, authenticated;
revoke all on function public.consume_demo_quota(text, uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.match_document_chunks(uuid, extensions.vector, float, integer) to service_role;
grant execute on function public.consume_ip_quota(text, text, integer) to service_role;
grant execute on function public.consume_demo_quota(text, uuid, text, integer, integer, integer) to service_role;
