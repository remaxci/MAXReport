-- Sprint 14 · BI : tableaux de bord personnalisés, composés de graphiques de
-- l'explorateur. Comme les modèles de rapports, ils ne stockent que des
-- réglages (indicateur, marques, découpage…), jamais de chiffres : chaque
-- graphique est recalculé à l'affichage, sous les droits de son lecteur.
--
-- Portée : une marque (brand_id), ou la Direction (brand_id null, toutes marques).
-- Lecture : brand.read sur la marque (Direction : direction.read global).
-- Création et modification : reports.manage sur la marque (Direction : direction.read).
-- Un tableau non partagé n'est visible et modifiable que par la personne qui l'a créé.

create table public.custom_dashboards (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  is_shared boolean not null default true,
  -- Liste de réglages (objets) ; le format de chaque graphique est validé par l'application.
  widgets jsonb not null default '[]'::jsonb check (
    jsonb_typeof(widgets) = 'array'
    and jsonb_array_length(widgets) <= 12
    and pg_column_size(widgets) <= 32768
    and not jsonb_path_exists(widgets, '$[*] ? (@.type() != "object")')
  ),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint custom_dashboards_scope_name_key unique nulls not distinct (brand_id, name)
);
create index custom_dashboards_created_by_idx on public.custom_dashboards (created_by);
create index custom_dashboards_updated_by_idx on public.custom_dashboards (updated_by);

-- Auteur et dates posés par la base ; un tableau ne change pas de portée.
create trigger custom_dashboards_stamp before insert or update on public.custom_dashboards
  for each row execute function app.stamp_marketing_row();
create trigger custom_dashboards_audit after insert or update or delete on public.custom_dashboards
  for each row execute function app.audit('brand_id');

alter table public.custom_dashboards enable row level security;
revoke all on public.custom_dashboards from anon;
revoke truncate on public.custom_dashboards from authenticated;

create policy custom_dashboards_select on public.custom_dashboards for select to authenticated using (
  (
    (brand_id is not null and brand_id = any ((select app.brands_with('brand.read'))::uuid[]))
    or (brand_id is null and (select app.has_global_permission('direction.read')))
  )
  and (is_shared or created_by = (select auth.uid()))
);
create policy custom_dashboards_insert on public.custom_dashboards for insert to authenticated with check (
  (brand_id is not null and brand_id = any ((select app.brands_with('reports.manage'))::uuid[]))
  or (brand_id is null and (select app.has_global_permission('direction.read')))
);
create policy custom_dashboards_update on public.custom_dashboards for update to authenticated
  using (
    (
      (brand_id is not null and brand_id = any ((select app.brands_with('reports.manage'))::uuid[]))
      or (brand_id is null and (select app.has_global_permission('direction.read')))
    )
    and (is_shared or created_by = (select auth.uid()))
  )
  with check (
    (
      (brand_id is not null and brand_id = any ((select app.brands_with('reports.manage'))::uuid[]))
      or (brand_id is null and (select app.has_global_permission('direction.read')))
    )
    and (is_shared or created_by = (select auth.uid()))
  );
create policy custom_dashboards_delete on public.custom_dashboards for delete to authenticated using (
  (
    (brand_id is not null and brand_id = any ((select app.brands_with('reports.manage'))::uuid[]))
    or (brand_id is null and (select app.has_global_permission('direction.read')))
  )
  and (is_shared or created_by = (select auth.uid()))
);
