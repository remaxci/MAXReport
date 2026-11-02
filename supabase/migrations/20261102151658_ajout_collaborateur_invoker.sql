-- Sprint 1 · L'ajout d'un collaborateur s'exécute avec les droits de l'appelant
-- (RLS appliquée). Seule la recherche du compte par e-mail passe par une
-- fonction interne, non exposée par l'API.

create function app.find_active_profile_id(p_email text, p_brand_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
    and p.is_active
    and p_brand_id = any (app.brands_with('members.manage'));
$$;
revoke all on function app.find_active_profile_id(text, uuid) from public;
grant execute on function app.find_active_profile_id(text, uuid) to authenticated;

create or replace function public.add_brand_member(p_brand_id uuid, p_email text, p_role_id uuid)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if not (p_brand_id = any (app.brands_with('members.manage'))) then
    raise exception 'Vous ne pouvez pas gérer les collaborateurs de cette marque.'
      using errcode = 'insufficient_privilege';
  end if;

  v_user := app.find_active_profile_id(p_email, p_brand_id);
  if v_user is null then
    raise exception 'Aucun compte actif avec cet e-mail.' using errcode = 'no_data_found';
  end if;

  insert into public.memberships (user_id, brand_id, role_id)
  values (v_user, p_brand_id, p_role_id)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Ce collaborateur a déjà un rôle dans cette marque.' using errcode = 'unique_violation';
end;
$$;

revoke all on function public.add_brand_member(uuid, text, uuid) from public, anon;
grant execute on function public.add_brand_member(uuid, text, uuid) to authenticated;
