create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'buyer');
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    institutional_email,
    role,
    department,
    avatar_url,
    is_verified,
    verification_status,
    id_verification_completed,
    is_registered
  )
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      ''
    ),
    nullif(normalized_email, ''),
    nullif(normalized_email, ''),
    case
      when normalized_email = 'admin@adssu.edu.ph' then 'admin'
      when requested_role = 'seller' then 'seller'
      else 'buyer'
    end,
    new.raw_user_meta_data->>'department',
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    ),
    requested_role <> 'seller' or normalized_email = 'admin@adssu.edu.ph',
    case
      when requested_role = 'seller'
        and normalized_email <> 'admin@adssu.edu.ph' then 'pending'
      else 'verified'
    end,
    normalized_email = 'admin@adssu.edu.ph',
    normalized_email = 'admin@adssu.edu.ph'
      or (
        requested_role in ('buyer', 'seller')
        and nullif(btrim(new.raw_user_meta_data->>'department'), '') is not null
      )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
