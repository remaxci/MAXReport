-- Sprint 8 · Tableaux de bord, vue Direction et modèles de rapports.
-- Les indicateurs sont calculés à partir des tables existantes, sous la RLS de
-- chaque utilisateur : un tableau de bord ne montre jamais plus que ce que
-- son lecteur peut déjà consulter. Un modèle de rapport ne stocke que des
-- choix d'affichage (sections, période), jamais de données.

insert into public.permissions (key, module, label) values
  ('reports.manage', 'rapports', 'Créer et modifier les modèles de rapports'),
  ('direction.read', 'rapports', 'Voir la vue Direction consolidée (toutes marques)');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in ('reports.manage', 'direction.read')
where r.key = 'super_admin'
   or (r.key in ('brand_admin', 'marketing', 'sales_manager') and p.key = 'reports.manage')
   or (r.key = 'direction' and p.key = 'direction.read');

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  sections text[] not null check (
    cardinality(sections) between 1 and 6
    and sections <@ array['commercial', 'objectives', 'social', 'campaigns', 'websites', 'budgets']
  ),
  period_kind text not null default 'month' check (period_kind in ('week', 'month', 'quarter', 'year')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  unique (brand_id, name)
);
create index report_templates_created_by_idx on public.report_templates (created_by);
create index report_templates_updated_by_idx on public.report_templates (updated_by);

create trigger report_templates_stamp before insert or update on public.report_templates
  for each row execute function app.stamp_marketing_row();
create trigger report_templates_audit after insert or update or delete on public.report_templates
  for each row execute function app.audit('brand_id');

alter table public.report_templates enable row level security;
revoke all on public.report_templates from anon;

create policy report_templates_select on public.report_templates for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy report_templates_insert on public.report_templates for insert to authenticated
  with check (brand_id = any ((select app.brands_with('reports.manage'))::uuid[]));
create policy report_templates_update on public.report_templates for update to authenticated
  using (brand_id = any ((select app.brands_with('reports.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('reports.manage'))::uuid[]));
create policy report_templates_delete on public.report_templates for delete to authenticated
  using (brand_id = any ((select app.brands_with('reports.manage'))::uuid[]));
