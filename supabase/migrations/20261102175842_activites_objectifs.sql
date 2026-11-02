-- Sprint 4b · Fiches d'activité hebdomadaire et objectifs.
-- Une seule source par indicateur (docs/architecture.md, section 6) :
-- appels, e-mails et rendez-vous viennent des fiches hebdomadaires ;
-- opportunités et mémos viennent du CRM et des registres quand ces modules
-- sont actifs, sinon de la déclaration hebdomadaire.

insert into public.permissions (key, module, label) values
  ('activities.read_all',   'activites', 'Voir les fiches d''activité de toute l''équipe'),
  ('activities.manage_own', 'activites', 'Remplir sa fiche d''activité hebdomadaire'),
  ('activities.validate',   'activites', 'Valider les fiches d''activité'),
  ('objectives.read_all',   'objectifs', 'Voir tous les objectifs et la comparaison des commerciaux'),
  ('objectives.manage',     'objectifs', 'Définir les objectifs');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.module in ('activites', 'objectifs')
where r.key in ('super_admin', 'brand_admin', 'sales_manager')
   or (r.key = 'sales_rep' and p.key = 'activities.manage_own')
   or (r.key in ('direction', 'viewer') and p.key in ('activities.read_all', 'objectives.read_all'));

-- =====================================================================
-- Fiches d'activité hebdomadaire
-- =====================================================================

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id),
  -- Lundi de la semaine ISO.
  week_start date not null check (extract(isodow from week_start) = 1),
  calls_prospecting int not null default 0 check (calls_prospecting between 0 and 10000),
  calls_follow_up int not null default 0 check (calls_follow_up between 0 and 10000),
  emails_sent int not null default 0 check (emails_sent between 0 and 10000),
  qualified_meetings int not null default 0 check (qualified_meetings between 0 and 10000),
  -- Saisis seulement si le module correspondant (CRM, mémos) est désactivé.
  opportunities_declared int check (opportunities_declared is null or opportunities_declared between 0 and 10000),
  memos_declared int check (memos_declared is null or memos_declared between 0 and 10000),
  comments text check (comments is null or length(comments) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'validated')),
  submitted_at timestamptz,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, user_id, week_start),
  unique (brand_id, id)
);
create index weekly_reports_brand_week_idx on public.weekly_reports (brand_id, week_start);
create index weekly_reports_user_idx on public.weekly_reports (user_id);
create index weekly_reports_validated_by_idx on public.weekly_reports (validated_by);

create function app.prepare_weekly_report()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_validator boolean := auth.uid() is not null
    and new.brand_id = any (app.brands_with('activities.validate'));
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, auth.uid());
    if new.status = 'validated' then
      raise exception 'Une fiche se valide après sa soumission.' using errcode = 'check_violation';
    end if;
    if not app.is_brand_member(new.user_id, new.brand_id) then
      raise exception 'La fiche doit appartenir à un collaborateur de la marque.' using errcode = 'check_violation';
    end if;
  else
    if new.brand_id is distinct from old.brand_id or new.user_id is distinct from old.user_id
       or new.week_start is distinct from old.week_start then
      raise exception 'La marque, l''auteur et la semaine d''une fiche sont figés.' using errcode = 'check_violation';
    end if;
    -- Une fiche validée n'est plus modifiable, sauf par un valideur.
    if old.status = 'validated' and auth.uid() is not null and not v_validator then
      raise exception 'Cette fiche est validée : elle n''est plus modifiable.' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'validated' and old.status <> 'validated' then
      if auth.uid() is not null and not v_validator then
        raise exception 'Seul un responsable peut valider une fiche.' using errcode = 'insufficient_privilege';
      end if;
      if old.status <> 'submitted' then
        raise exception 'Seule une fiche soumise peut être validée.' using errcode = 'check_violation';
      end if;
      new.validated_at := now();
      new.validated_by := auth.uid();
    elsif new.status <> 'validated' then
      new.validated_at := null;
      new.validated_by := null;
    end if;
    new.updated_at := now();
  end if;

  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now();
  elsif new.status = 'draft' then
    new.submitted_at := null;
  end if;
  return new;
end;
$$;
revoke all on function app.prepare_weekly_report() from public;

create trigger weekly_reports_prepare before insert or update on public.weekly_reports
  for each row execute function app.prepare_weekly_report();
create trigger weekly_reports_custom before insert or update on public.weekly_reports
  for each row execute function app.validate_custom_values('weekly_report');
create trigger weekly_reports_audit after insert or update or delete on public.weekly_reports
  for each row execute function app.audit('brand_id');

alter table public.weekly_reports enable row level security;
revoke all on public.weekly_reports from anon;

create policy weekly_reports_select on public.weekly_reports for select to authenticated using (
  brand_id = any ((select app.brands_with('activities.read_all'))::uuid[])
  or (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('activities.manage_own'))::uuid[]))
);
create policy weekly_reports_insert on public.weekly_reports for insert to authenticated with check (
  user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('activities.manage_own'))::uuid[])
);
create policy weekly_reports_update on public.weekly_reports for update to authenticated
  using (
    (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('activities.manage_own'))::uuid[]))
    or brand_id = any ((select app.brands_with('activities.validate'))::uuid[])
  )
  with check (
    (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('activities.manage_own'))::uuid[]))
    or brand_id = any ((select app.brands_with('activities.validate'))::uuid[])
  );

-- =====================================================================
-- Objectifs
-- =====================================================================

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  -- null = objectif collectif (toute l'équipe de la marque).
  user_id uuid references public.profiles (id),
  metric_key text not null check (metric_key in (
    'calls', 'emails_sent', 'qualified_meetings', 'opportunities_created',
    'offers_sent', 'memos_sent', 'contracts_signed', 'revenue_signed'
  )),
  period_start date not null,
  period_end date not null,
  target_value numeric(18, 2) not null check (target_value > 0),
  currency text check (currency in ('XOF', 'USD', 'EUR')),
  comments text check (comments is null or length(comments) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (period_end >= period_start),
  check ((metric_key = 'revenue_signed') = (currency is not null))
);
create index objectives_brand_period_idx on public.objectives (brand_id, period_start, period_end);
create index objectives_user_idx on public.objectives (user_id);
create index objectives_created_by_idx on public.objectives (created_by);
create index objectives_updated_by_idx on public.objectives (updated_by);

create function app.prepare_objective()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un objectif ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  if new.user_id is not null and not app.is_brand_member(new.user_id, new.brand_id) then
    raise exception 'L''objectif doit concerner un collaborateur de la marque.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function app.prepare_objective() from public;

create trigger objectives_prepare before insert or update on public.objectives
  for each row execute function app.prepare_objective();
create trigger objectives_audit after insert or update or delete on public.objectives
  for each row execute function app.audit('brand_id');

alter table public.objectives enable row level security;
revoke all on public.objectives from anon;

-- Chacun voit ses objectifs et ceux de l'équipe ; le détail de tous avec objectives.read_all.
create policy objectives_select on public.objectives for select to authenticated using (
  brand_id = any ((select app.brands_with('objectives.read_all'))::uuid[])
  or (brand_id = any ((select app.brands_with('brand.read'))::uuid[])
      and (user_id is null or user_id = (select auth.uid())))
);
create policy objectives_insert on public.objectives for insert to authenticated
  with check (brand_id = any ((select app.brands_with('objectives.manage'))::uuid[]));
create policy objectives_update on public.objectives for update to authenticated
  using (brand_id = any ((select app.brands_with('objectives.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('objectives.manage'))::uuid[]));
create policy objectives_delete on public.objectives for delete to authenticated
  using (brand_id = any ((select app.brands_with('objectives.manage'))::uuid[]));

-- =====================================================================
-- Réalisés par collaborateur et par indicateur, sur une période.
-- Agrégats seulement. Sans droit de lecture de l'équipe, les valeurs des
-- collègues sont regroupées sur une ligne anonyme (user_id null) : on voit
-- son propre réalisé et le total de l'équipe, jamais le détail des autres.
-- Règles : fiches soumises ou validées, semaines commençant dans la période ;
-- documents et contrats non archivés.
-- =====================================================================

create function app.metric_actuals(p_brand uuid, p_from date, p_to date)
returns table (user_id uuid, metric_key text, currency text, value numeric)
language sql stable security definer
set search_path = ''
as $$
  with access as (
    select
      p_brand = any (app.brands_with('brand.read')) as can_read,
      p_brand = any (app.brands_with('objectives.read_all'))
        or p_brand = any (app.brands_with('activities.read_all')) as all_users
  ),
  modules as (
    select coalesce(array_agg(module_key) filter (where enabled), '{}') as enabled
    from public.brand_modules where brand_id = p_brand
  ),
  reports as (
    select w.* from public.weekly_reports w
    where w.brand_id = p_brand and w.week_start between p_from and p_to
      and w.status in ('submitted', 'validated')
  ),
  raw as (
    select r.user_id, 'calls' as metric_key, null::text as currency,
           (r.calls_prospecting + r.calls_follow_up)::numeric as value
    from reports r
    union all
    select r.user_id, 'emails_sent', null, r.emails_sent from reports r
    union all
    select r.user_id, 'qualified_meetings', null, r.qualified_meetings from reports r
    union all
    select o.owner_id, 'opportunities_created', null, 1
    from public.opportunities o, modules m
    where 'crm' = any (m.enabled) and o.brand_id = p_brand and o.archived_at is null
      and o.created_at::date between p_from and p_to
    union all
    select r.user_id, 'opportunities_created', null, coalesce(r.opportunities_declared, 0)
    from reports r, modules m
    where not ('crm' = any (m.enabled))
    union all
    select d.owner_id, 'offers_sent', null, 1
    from public.commercial_documents d
    where d.brand_id = p_brand and d.kind = 'offer' and d.archived_at is null
      and d.sent_on between p_from and p_to
    union all
    select d.owner_id, 'memos_sent', null, 1
    from public.commercial_documents d, modules m
    where 'memos' = any (m.enabled) and d.brand_id = p_brand and d.kind = 'memo'
      and d.archived_at is null and d.sent_on between p_from and p_to
    union all
    select r.user_id, 'memos_sent', null, coalesce(r.memos_declared, 0)
    from reports r, modules m
    where not ('memos' = any (m.enabled))
    union all
    select c.owner_id, 'contracts_signed', null, 1
    from public.contracts c
    where c.brand_id = p_brand and c.archived_at is null and c.signed_on between p_from and p_to
    union all
    select c.owner_id, 'revenue_signed', c.currency, c.amount
    from public.contracts c
    where c.brand_id = p_brand and c.archived_at is null and c.signed_on between p_from and p_to
  )
  select
    case when a.all_users or r.user_id = (select auth.uid()) then r.user_id end,
    r.metric_key,
    r.currency,
    sum(r.value)
  from raw r, access a
  where a.can_read
  group by 1, 2, 3;
$$;
revoke all on function app.metric_actuals(uuid, date, date) from public;
grant execute on function app.metric_actuals(uuid, date, date) to authenticated;

create function public.metric_actuals(p_brand_id uuid, p_from date, p_to date)
returns table (user_id uuid, metric_key text, currency text, value numeric)
language sql stable security invoker
set search_path = ''
as $$
  select * from app.metric_actuals(p_brand_id, p_from, p_to);
$$;
revoke all on function public.metric_actuals(uuid, date, date) from public, anon;
grant execute on function public.metric_actuals(uuid, date, date) to authenticated;
