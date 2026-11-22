begin;

alter table public.profiles
  add column if not exists school_id_number text;

update public.profiles
set school_id_number = id_number
where school_id_number is null
  and id_number is not null;

grant update (school_id_number) on public.profiles to authenticated;

commit;
