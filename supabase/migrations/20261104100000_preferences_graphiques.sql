-- Graphiques affichés sur le tableau de bord : choix de chaque personne, par marque.
-- On retient les graphiques masqués : un nouveau graphique reste visible par défaut.
-- Une préférence d'affichage n'ouvre aucune donnée : les graphiques restent lus sous la RLS.

create table public.dashboard_chart_preferences (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  hidden text[] not null default '{}'
    check (cardinality(hidden) <= 100 and array_to_string(hidden, ',') ~ '^[a-z0-9_.,]*$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);
create index dashboard_chart_preferences_brand_idx on public.dashboard_chart_preferences (brand_id);

create trigger dashboard_chart_preferences_updated_at before update on public.dashboard_chart_preferences
  for each row execute function app.set_updated_at();

alter table public.dashboard_chart_preferences enable row level security;
revoke all on public.dashboard_chart_preferences from anon;
revoke delete, truncate on public.dashboard_chart_preferences from authenticated;

create policy dashboard_chart_preferences_select on public.dashboard_chart_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy dashboard_chart_preferences_insert on public.dashboard_chart_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy dashboard_chart_preferences_update on public.dashboard_chart_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
