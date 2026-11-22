begin;

alter table public.profiles
  add column if not exists course text,
  add column if not exists id_number text;

drop function if exists public.submit_valid_id(text, text);
drop function if exists public.submit_valid_id(text, text, text);

create function public.submit_valid_id(
  p_path text,
  p_course_year text,
  p_id_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_role text;
  clean_program text := nullif(btrim(p_course_year), '');
  clean_id_number text := nullif(btrim(p_id_number), '');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> uid::text then
    raise exception 'Invalid ID image path';
  end if;
  if clean_program is null then raise exception 'Program is required'; end if;
  if clean_id_number is null then raise exception 'School ID number is required'; end if;

  select role into user_role from public.profiles where id = uid;
  if user_role not in ('buyer', 'seller') then raise exception 'Profile not found'; end if;

  update public.profiles
  set valid_id_url = p_path,
      id_document_url = p_path,
      course = clean_program,
      course_year = clean_program,
      id_number = clean_id_number,
      id_verification_completed = true,
      verification_status = 'pending',
      is_verified = false,
      verified_at = null,
      verification_rejection_reason = null
  where id = uid;
end;
$$;

revoke all on function public.submit_valid_id(text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_valid_id(text, text, text)
  to authenticated;

grant update (course) on public.profiles to authenticated;

commit;
