-- Évolution · Assistant IA (lecture seule) : journal d'usage, pour le quota
-- quotidien de chaque personne et le suivi des coûts. Ni la question ni la
-- réponse ne sont conservées : seulement le volume (jetons) et l'issue.

create table public.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null check (length(model) between 1 and 60),
  status text not null check (status in ('ok', 'refused', 'error')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  tool_calls smallint not null default 0 check (tool_calls >= 0)
);
create index assistant_usage_user_day_idx on public.assistant_usage (user_id, created_at);
create index assistant_usage_brand_idx on public.assistant_usage (brand_id);

alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon;
-- Un usage enregistré ne se modifie ni ne s'efface.
revoke update, delete, truncate on public.assistant_usage from authenticated;

-- Chacun lit et enregistre ses propres usages, sur une marque qu'il peut lire.
create policy assistant_usage_select on public.assistant_usage for select to authenticated
  using (user_id = (select auth.uid()));
create policy assistant_usage_insert on public.assistant_usage for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and brand_id = any ((select app.brands_with('brand.read'))::uuid[])
  );
