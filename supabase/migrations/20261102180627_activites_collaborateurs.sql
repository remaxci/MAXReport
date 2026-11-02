-- Collaborateurs qui remplissent une fiche d'activité : affectation de marque
-- dont le rôle détient activities.manage_own. Base de la vue d'équipe et du
-- suivi des fiches manquantes. Mêmes conditions de lecture que la liste des
-- collaborateurs (brand.read).

create function app.activity_members(p_brand_id uuid)
returns table (user_id uuid, label text)
language sql stable security definer
set search_path = ''
as $$
  select distinct p.id, coalesce(nullif(btrim(p.full_name), ''), p.email)
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.role_permissions rp on rp.role_id = m.role_id and rp.permission = 'activities.manage_own'
  where m.brand_id = p_brand_id
    and p_brand_id = any (app.brands_with('brand.read'))
  order by 2;
$$;
revoke all on function app.activity_members(uuid) from public;
grant execute on function app.activity_members(uuid) to authenticated;

create function public.activity_members(p_brand_id uuid)
returns table (user_id uuid, label text)
language sql stable security invoker
set search_path = ''
as $$
  select * from app.activity_members(p_brand_id);
$$;
revoke all on function public.activity_members(uuid) from public, anon;
grant execute on function public.activity_members(uuid) to authenticated;
