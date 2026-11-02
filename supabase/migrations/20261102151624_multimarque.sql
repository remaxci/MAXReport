-- Sprint 1 · Multimarque, utilisateurs, rôles et permissions
-- Voir docs/architecture.md, sections 4 (Noyau) et 5.

-- =====================================================================
-- Tables
-- =====================================================================

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  name text not null check (length(btrim(name)) between 1 and 120),
  logo_path text,
  primary_color text check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  reporting_currency text not null default 'XOF'
    check (reporting_currency in ('XOF', 'USD', 'EUR')),
  timezone text not null default 'Africa/Abidjan',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz
);
create index brands_created_by_idx on public.brands (created_by);
create index brands_updated_by_idx on public.brands (updated_by);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or length(full_name) <= 120),
  phone text check (phone is null or length(phone) <= 40),
  job_title text check (job_title is null or length(job_title) <= 120),
  default_brand_id uuid references public.brands (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_default_brand_idx on public.profiles (default_brand_id);

-- Catalogue des permissions : alimenté uniquement par les migrations.
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  label text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  description text,
  -- global : s'attribue sans marque et vaut pour toutes les marques.
  scope text not null check (scope in ('global', 'brand')),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission)
);
create index role_permissions_permission_idx on public.role_permissions (permission);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- null = toutes les marques (rôles globaux : Direction, super-administrateur).
  brand_id uuid references public.brands (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint memberships_user_brand_key unique nulls not distinct (user_id, brand_id)
);
create index memberships_brand_idx on public.memberships (brand_id);
create index memberships_role_idx on public.memberships (role_id);
create index memberships_created_by_idx on public.memberships (created_by);

-- Journal des modifications : alimenté par trigger, jamais modifiable.
create table public.audit_log (
  id bigint generated always as identity primary key,
  brand_id uuid,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);
create index audit_log_brand_at_idx on public.audit_log (brand_id, at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

-- =====================================================================
-- Fonctions de permission (utilisées par toutes les politiques RLS)
-- =====================================================================

-- Marques sur lesquelles l'utilisateur courant détient une permission,
-- directement ou par un rôle global.
create function app.brands_with(p_permission text)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.brands b
  where exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = (select auth.uid())
      and p.is_active
      and rp.permission = p_permission
      and (m.brand_id = b.id or m.brand_id is null)
  );
$$;

-- Permission détenue par un rôle global (affectation sans marque).
create function app.has_global_permission(p_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = (select auth.uid())
      and p.is_active
      and m.brand_id is null
      and rp.permission = p_permission
  );
$$;

revoke all on function app.brands_with(text) from public;
revoke all on function app.has_global_permission(text) from public;
grant execute on function app.brands_with(text) to authenticated;
grant execute on function app.has_global_permission(text) to authenticated;

-- =====================================================================
-- Profils : création automatique et synchronisation de l'e-mail
-- =====================================================================

create function app.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create function app.handle_user_email_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.handle_user_email_change();

-- Comptes déjà existants.
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- =====================================================================
-- Garde-fous
-- =====================================================================

create function app.is_last_active_super_admin(p_user uuid, p_except_membership uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.memberships m
      join public.roles r on r.id = m.role_id and r.key = 'super_admin'
      where m.user_id = p_user
    )
    and not exists (
      select 1 from public.memberships m
      join public.roles r on r.id = m.role_id and r.key = 'super_admin'
      join public.profiles p on p.id = m.user_id and p.is_active
      where m.user_id <> p_user
        and (p_except_membership is null or m.id <> p_except_membership)
    );
$$;
revoke all on function app.is_last_active_super_admin(uuid, uuid) from public;
grant execute on function app.is_last_active_super_admin(uuid, uuid) to authenticated;

create function app.guard_brand_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code or new.slug is distinct from old.slug then
    raise exception 'Le code et l''adresse d''une marque ne peuvent pas être modifiés.'
      using errcode = 'check_violation';
  end if;
  if (new.is_active is distinct from old.is_active
      or new.archived_at is distinct from old.archived_at)
     and auth.uid() is not null
     and not app.has_global_permission('brands.manage') then
    raise exception 'Seul un super-administrateur peut activer, désactiver ou archiver une marque.'
      using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create function app.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not app.has_global_permission('users.manage') then
    if new.email is distinct from old.email or new.is_active is distinct from old.is_active then
      raise exception 'Seul un gestionnaire des utilisateurs peut modifier l''e-mail ou l''activation d''un compte.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  if old.is_active and not new.is_active and app.is_last_active_super_admin(new.id) then
    raise exception 'Impossible de désactiver le dernier super-administrateur actif.'
      using errcode = 'check_violation';
  end if;
  if new.default_brand_id is distinct from old.default_brand_id
     and new.default_brand_id is not null
     and new.id = auth.uid()
     and not (new.default_brand_id = any (app.brands_with('brand.read'))) then
    raise exception 'Marque par défaut inaccessible.' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Vérifie la cohérence d'une affectation et empêche l'élévation de privilèges.
create function app.check_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scope text;
begin
  if tg_op = 'UPDATE'
     and (new.user_id is distinct from old.user_id or new.brand_id is distinct from old.brand_id) then
    raise exception 'Seul le rôle d''une affectation peut être modifié.' using errcode = 'check_violation';
  end if;

  select scope into v_scope from public.roles where id = new.role_id;
  if v_scope = 'global' and new.brand_id is not null then
    raise exception 'Un rôle global ne s''attribue pas sur une marque.' using errcode = 'check_violation';
  end if;
  if v_scope = 'brand' and new.brand_id is null then
    raise exception 'Un rôle de marque s''attribue sur une marque précise.' using errcode = 'check_violation';
  end if;

  -- On ne peut attribuer que des droits que l'on détient soi-même sur la marque.
  if auth.uid() is not null and not app.has_global_permission('users.manage') then
    if exists (
      select 1 from public.role_permissions rp
      where rp.role_id = new.role_id
        and not (new.brand_id = any (app.brands_with(rp.permission)))
    ) then
      raise exception 'Vous ne pouvez pas attribuer un rôle plus étendu que le vôtre.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create function app.protect_last_super_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_super uuid;
begin
  select id into v_super from public.roles where key = 'super_admin';
  if old.role_id = v_super
     and (tg_op = 'DELETE' or new.role_id is distinct from v_super)
     and app.is_last_active_super_admin(old.user_id, old.id) then
    raise exception 'Il doit rester au moins un super-administrateur actif.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create function app.guard_system_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system then
    if tg_op = 'DELETE' then
      raise exception 'Un rôle système ne peut pas être supprimé.' using errcode = 'check_violation';
    end if;
    if new.key is distinct from old.key or new.scope is distinct from old.scope
       or new.is_system is distinct from old.is_system then
      raise exception 'La clé et la portée d''un rôle système sont figées.' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create function app.guard_super_admin_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.roles where id = old.role_id and key = 'super_admin') then
    raise exception 'Le super-administrateur conserve toutes les permissions.' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

-- =====================================================================
-- Journal d'audit (trigger générique)
-- Argument : nom de la colonne qui porte la marque (ou rien).
-- =====================================================================

create function app.audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_brand uuid;
  v_changed_old jsonb;
  v_changed_new jsonb;
begin
  if tg_nargs > 0 then
    v_brand := (v_row ->> tg_argv[0])::uuid;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, v_old -> n.key), jsonb_object_agg(n.key, n.value)
      into v_changed_old, v_changed_new
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key
       and n.key not in ('updated_at', 'updated_by');
    if v_changed_new is null then
      return null;
    end if;
    v_old := v_changed_old;
    v_new := v_changed_new;
  end if;

  insert into public.audit_log (brand_id, table_name, record_id, action, actor_id, old_values, new_values)
  values (
    v_brand,
    tg_table_name,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'role_id', v_row ->> 'permission')),
    lower(tg_op),
    auth.uid(),
    v_old,
    v_new
  );
  return null;
end;
$$;

revoke all on function app.handle_new_user() from public;
revoke all on function app.handle_user_email_change() from public;
revoke all on function app.guard_brand_update() from public;
revoke all on function app.guard_profile_update() from public;
revoke all on function app.check_membership() from public;
revoke all on function app.protect_last_super_admin() from public;
revoke all on function app.guard_system_role() from public;
revoke all on function app.guard_super_admin_permissions() from public;
revoke all on function app.audit() from public;

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger brands_guard before update on public.brands
  for each row execute function app.guard_brand_update();
create trigger profiles_guard before update on public.profiles
  for each row execute function app.guard_profile_update();
create trigger memberships_check before insert or update on public.memberships
  for each row execute function app.check_membership();
create trigger memberships_protect_super_admin before update or delete on public.memberships
  for each row execute function app.protect_last_super_admin();
create trigger roles_guard before update or delete on public.roles
  for each row execute function app.guard_system_role();
create trigger role_permissions_guard before delete on public.role_permissions
  for each row execute function app.guard_super_admin_permissions();

create trigger brands_audit after insert or update or delete on public.brands
  for each row execute function app.audit('id');
create trigger profiles_audit after update on public.profiles
  for each row execute function app.audit();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function app.audit('brand_id');
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function app.audit();
create trigger role_permissions_audit after insert or delete on public.role_permissions
  for each row execute function app.audit();

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.brands enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

-- Les visiteurs non connectés n'ont accès à rien.
revoke all on public.brands, public.profiles, public.permissions, public.roles,
  public.role_permissions, public.memberships, public.audit_log from anon;
-- Le journal ne s'écrit que par trigger.
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke insert, update, delete, truncate on public.permissions from authenticated;

-- Marques
create policy brands_select on public.brands for select to authenticated using (
  (select app.has_global_permission('brand.read'))
  or id = any ((select app.brands_with('brand.read'))::uuid[])
);
create policy brands_insert on public.brands for insert to authenticated
  with check ((select app.has_global_permission('brands.manage')));
create policy brands_update on public.brands for update to authenticated
  using (id = any ((select app.brands_with('brand.settings'))::uuid[]))
  with check (id = any ((select app.brands_with('brand.settings'))::uuid[]));

-- Profils
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select app.has_global_permission('users.manage'))
  or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id
      and m.brand_id = any ((select app.brands_with('members.read'))::uuid[])
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select app.has_global_permission('users.manage')))
  with check (id = (select auth.uid()) or (select app.has_global_permission('users.manage')));

-- Catalogue des permissions et rôles : lisibles par tous les connectés.
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_insert on public.roles for insert to authenticated
  with check ((select app.has_global_permission('roles.manage')));
create policy roles_update on public.roles for update to authenticated
  using ((select app.has_global_permission('roles.manage')))
  with check ((select app.has_global_permission('roles.manage')));
create policy roles_delete on public.roles for delete to authenticated
  using ((select app.has_global_permission('roles.manage')));
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check ((select app.has_global_permission('roles.manage')));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using ((select app.has_global_permission('roles.manage')));

-- Affectations
create policy memberships_select on public.memberships for select to authenticated using (
  user_id = (select auth.uid())
  or brand_id = any ((select app.brands_with('members.read'))::uuid[])
  or (brand_id is null and (select app.has_global_permission('users.manage')))
);
create policy memberships_insert on public.memberships for insert to authenticated with check (
  brand_id = any ((select app.brands_with('members.manage'))::uuid[])
  or (brand_id is null and (select app.has_global_permission('users.manage')))
);
create policy memberships_update on public.memberships for update to authenticated
  using (
    brand_id = any ((select app.brands_with('members.manage'))::uuid[])
    or (brand_id is null and (select app.has_global_permission('users.manage')))
  )
  with check (
    brand_id = any ((select app.brands_with('members.manage'))::uuid[])
    or (brand_id is null and (select app.has_global_permission('users.manage')))
  );
create policy memberships_delete on public.memberships for delete to authenticated using (
  brand_id = any ((select app.brands_with('members.manage'))::uuid[])
  or (brand_id is null and (select app.has_global_permission('users.manage')))
);

-- Journal
create policy audit_log_select on public.audit_log for select to authenticated using (
  brand_id = any ((select app.brands_with('audit.read'))::uuid[])
  or (brand_id is null and (select app.has_global_permission('audit.read')))
);

-- =====================================================================
-- Ajout d'un collaborateur par e-mail
-- Les profils d'autres marques ne sont pas lisibles : cette fonction
-- retrouve un compte par son e-mail exact, après contrôle de la permission.
-- =====================================================================

create function public.add_brand_member(p_brand_id uuid, p_email text, p_role_id uuid)
returns uuid
language plpgsql security definer
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

  select id into v_user from public.profiles
   where lower(email) = lower(btrim(p_email)) and is_active;
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

-- Premier super-administrateur : à lancer depuis l'éditeur SQL de Supabase.
create function app.grant_super_admin(p_email text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from public.profiles where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Aucun compte avec cet e-mail : créez-le d''abord dans Authentication > Users.';
  end if;
  insert into public.memberships (user_id, brand_id, role_id)
  select v_user, null, id from public.roles where key = 'super_admin'
  on conflict (user_id, brand_id) do update set role_id = excluded.role_id;
end;
$$;
revoke all on function app.grant_super_admin(text) from public, authenticated;

-- =====================================================================
-- Données de référence
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('brands.manage',  'noyau', 'Créer, activer et archiver les marques'),
  ('brand.read',     'noyau', 'Accéder à la marque'),
  ('brand.settings', 'noyau', 'Modifier les informations de la marque'),
  ('members.read',   'noyau', 'Voir les collaborateurs de la marque'),
  ('members.manage', 'noyau', 'Ajouter, modifier et retirer des collaborateurs'),
  ('users.manage',   'noyau', 'Gérer les comptes et les rôles globaux'),
  ('roles.manage',   'noyau', 'Modifier les rôles et leurs permissions'),
  ('audit.read',     'noyau', 'Consulter le journal des modifications');

insert into public.roles (key, label, description, scope, is_system) values
  ('super_admin',   'Super-administrateur',     'Tous les droits, sur toutes les marques', 'global', true),
  ('direction',     'Direction',                'Lecture de toutes les marques et vue consolidée', 'global', true),
  ('brand_admin',   'Administrateur de marque', 'Paramètres et collaborateurs de la marque', 'brand', true),
  ('sales_manager', 'Responsable commercial',   'Tout le commercial de la marque', 'brand', true),
  ('sales_rep',     'Commercial',               'Ses propres dossiers commerciaux', 'brand', true),
  ('marketing',     'Marketing',                'Réseaux, campagnes, sites et dépenses marketing', 'brand', true),
  ('viewer',        'Lecture',                  'Consultation seule', 'brand', true);

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on
  r.key = 'super_admin'
  or (r.key = 'direction'     and p.key in ('brand.read', 'members.read', 'audit.read'))
  or (r.key = 'brand_admin'   and p.key in ('brand.read', 'brand.settings', 'members.read', 'members.manage', 'audit.read'))
  or (r.key = 'sales_manager' and p.key in ('brand.read', 'members.read'))
  or (r.key in ('sales_rep', 'marketing', 'viewer') and p.key = 'brand.read');
