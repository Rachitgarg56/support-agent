-- Apply once to an existing Papertrail Supabase project before deploying the new app.
-- New projects can use created_tables.sql instead.
create or replace function public.reserve_document_upload(
  p_workspace_id uuid,
  p_document_id uuid,
  p_name text,
  p_media_type text,
  p_size_bytes bigint,
  p_storage_path text,
  p_max_files integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  file_count integer;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then return false; end if;
  select count(*) into file_count from public.documents where workspace_id = p_workspace_id;
  if file_count >= p_max_files then return false; end if;
  insert into public.documents
    (id, workspace_id, name, media_type, size_bytes, storage_path, status)
  values
    (p_document_id, p_workspace_id, p_name, p_media_type, p_size_bytes, p_storage_path, 'pending');
  return true;
end;
$$;

revoke all on function public.reserve_document_upload(uuid, uuid, text, text, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_document_upload(uuid, uuid, text, text, bigint, text, integer) to service_role;
