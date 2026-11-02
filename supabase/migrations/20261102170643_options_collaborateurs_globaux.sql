-- Liste des collaborateurs d'une marque : inclut les comptes à rôle global
-- (ils peuvent être responsables d'un document ou apparaître dans l'historique).
drop function public.brand_member_options(uuid);
drop function app.brand_member_options(uuid);

create function app.brand_member_options(p_brand_id uuid)
returns table (user_id uuid, label text, is_global boolean)
language sql stable security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), p.email),
         bool_and(m.brand_id is null)
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  where (m.brand_id = p_brand_id or m.brand_id is null)
    and p_brand_id = any (app.brands_with('brand.read'))
  group by p.id, p.full_name, p.email
  order by 3, 2;
$$;
revoke all on function app.brand_member_options(uuid) from public;
grant execute on function app.brand_member_options(uuid) to authenticated;

create function public.brand_member_options(p_brand_id uuid)
returns table (user_id uuid, label text, is_global boolean)
language sql stable security invoker
set search_path = ''
as $$
  select * from app.brand_member_options(p_brand_id);
$$;
revoke all on function public.brand_member_options(uuid) from public, anon;
grant execute on function public.brand_member_options(uuid) to authenticated;
