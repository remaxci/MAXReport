-- Sprint 7 · Budgets, lignes budgétaires, dépenses et taux de change.
-- Engagé = dépenses engagées + payées ; réalisé = dépenses payées.
-- Une campagne rattachée à une ligne compte ses dépenses saisies (factures)
-- si elle en a, sinon sa dépense relevée sur la plateforme, marquée « non
-- facturée » : jamais les deux (calcul côté application, testé).
-- Les taux de change sont communs à toutes les marques ; la parité EUR/XOF
-- est fixe et ne se saisit pas.

-- =====================================================================
-- Permissions
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('budgets.read',    'budgets', 'Voir les budgets et les dépenses'),
  ('budgets.manage',  'budgets', 'Créer les budgets et saisir les dépenses'),
  ('fx_rates.manage', 'noyau',   'Saisir les taux de change (toutes marques)');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in ('budgets.read', 'budgets.manage', 'fx_rates.manage')
where r.key = 'super_admin'
   or (r.key in ('brand_admin', 'marketing') and p.key in ('budgets.read', 'budgets.manage'))
   or (r.key in ('direction', 'viewer', 'sales_manager') and p.key = 'budgets.read');

-- =====================================================================
-- Taux de change (communs à toutes les marques)
-- =====================================================================

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  from_currency text not null check (from_currency in ('XOF', 'USD', 'EUR')),
  to_currency text not null check (to_currency in ('XOF', 'USD', 'EUR')),
  -- 1 unité de from_currency = rate unités de to_currency.
  rate numeric(20, 10) not null check (rate > 0),
  source text not null check (length(btrim(source)) between 1 and 200),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (rate_date, from_currency, to_currency),
  check (from_currency <> to_currency),
  check (not (from_currency in ('EUR', 'XOF') and to_currency in ('EUR', 'XOF')))
);
create index fx_rates_created_by_idx on public.fx_rates (created_by);

-- =====================================================================
-- Budgets et lignes
-- =====================================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  scope text not null default 'marketing' check (scope in ('marketing', 'commercial', 'other')),
  period_start date not null,
  period_end date not null,
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null default 'XOF' check (currency in ('XOF', 'USD', 'EUR')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'closed')),
  comments text check (comments is null or length(comments) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  check (period_end >= period_start)
);
create index budgets_brand_idx on public.budgets (brand_id, period_start desc);
create index budgets_created_by_idx on public.budgets (created_by);
create index budgets_updated_by_idx on public.budgets (updated_by);

-- Montants des lignes dans la devise du budget.
create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  budget_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 200),
  -- Choix de la liste « Catégories de dépenses » de la marque.
  category text check (category is null or category ~ '^[a-z][a-z0-9_]{1,40}$'),
  campaign_id uuid,
  amount numeric(18, 2) not null check (amount >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  -- Une campagne n'a qu'une ligne par budget.
  unique (budget_id, campaign_id),
  foreign key (brand_id, budget_id) references public.budgets (brand_id, id) on delete cascade,
  foreign key (brand_id, campaign_id) references public.campaigns (brand_id, id)
);
create index budget_lines_budget_idx on public.budget_lines (brand_id, budget_id, position);
create index budget_lines_campaign_idx on public.budget_lines (brand_id, campaign_id);
create index budget_lines_created_by_idx on public.budget_lines (created_by);
create index budget_lines_updated_by_idx on public.budget_lines (updated_by);

-- =====================================================================
-- Dépenses (montant et devise d'origine conservés)
-- =====================================================================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  budget_line_id uuid not null,
  campaign_id uuid,
  supplier text check (supplier is null or length(supplier) <= 200),
  description text not null check (length(btrim(description)) between 1 and 500),
  expense_date date not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null check (currency in ('XOF', 'USD', 'EUR')),
  status text not null default 'committed' check (status in ('committed', 'paid')),
  paid_on date,
  -- Numéro de facture ou de bon de commande.
  external_ref text check (external_ref is null or length(external_ref) <= 100),
  comments text check (comments is null or length(comments) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'import')),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, budget_line_id) references public.budget_lines (brand_id, id),
  foreign key (brand_id, campaign_id) references public.campaigns (brand_id, id),
  foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id),
  check ((source = 'import') = (import_batch_id is not null)),
  check ((status = 'paid') = (paid_on is not null))
);
create index expenses_line_idx on public.expenses (brand_id, budget_line_id, expense_date);
create index expenses_campaign_idx on public.expenses (brand_id, campaign_id);
create index expenses_batch_idx on public.expenses (brand_id, import_batch_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_updated_by_idx on public.expenses (updated_by);
-- Une même facture d'un même fournisseur ne s'enregistre qu'une fois.
create unique index expenses_reference_key on public.expenses (brand_id, lower(coalesce(supplier, '')), external_ref)
  where external_ref is not null and archived_at is null;

-- =====================================================================
-- Garde-fous
-- =====================================================================

create function app.stamp_fx_rate()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- Campagne héritée de la ligne ; paiement daté ; ligne d'un budget non clôturé.
create function app.prepare_expense()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_line record;
begin
  select l.campaign_id, b.status into v_line
  from public.budget_lines l join public.budgets b on b.id = l.budget_id
  where l.id = new.budget_line_id and l.brand_id = new.brand_id;
  if not found then
    raise exception 'Ligne budgétaire introuvable.' using errcode = 'check_violation';
  end if;
  if v_line.status = 'closed' and (tg_op = 'INSERT' or new.budget_line_id is distinct from old.budget_line_id) then
    raise exception 'Ce budget est clôturé : il ne reçoit plus de dépenses.' using errcode = 'check_violation';
  end if;
  if v_line.campaign_id is not null then
    if new.campaign_id is null then
      new.campaign_id := v_line.campaign_id;
    elsif new.campaign_id <> v_line.campaign_id then
      raise exception 'La dépense et sa ligne budgétaire désignent deux campagnes différentes.' using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'paid' then
    new.paid_on := coalesce(new.paid_on, current_date);
  else
    new.paid_on := null;
  end if;
  return new;
end;
$$;

revoke all on function app.stamp_fx_rate() from public;
revoke all on function app.prepare_expense() from public;

create trigger fx_rates_stamp before insert or update on public.fx_rates
  for each row execute function app.stamp_fx_rate();
create trigger fx_rates_audit after insert or update or delete on public.fx_rates
  for each row execute function app.audit();

-- Auteur, date de modification, marque figée (fonction commune aux tables métier récentes).
create trigger budgets_stamp before insert or update on public.budgets
  for each row execute function app.stamp_marketing_row();
create trigger budgets_audit after insert or update or delete on public.budgets
  for each row execute function app.audit('brand_id');

create trigger budget_lines_stamp before insert or update on public.budget_lines
  for each row execute function app.stamp_marketing_row();
create trigger budget_lines_audit after insert or update or delete on public.budget_lines
  for each row execute function app.audit('brand_id');

create trigger expenses_stamp before insert or update on public.expenses
  for each row execute function app.stamp_marketing_row();
create trigger expenses_prepare before insert or update on public.expenses
  for each row execute function app.prepare_expense();
create trigger expenses_import before insert or update on public.expenses
  for each row execute function app.check_import_link();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Import des dépenses (Sprint 6) : nouvelle table cible
-- =====================================================================

alter table public.import_batches drop constraint import_batches_target_check;
alter table public.import_batches add constraint import_batches_target_check check (target in (
  'social_snapshots', 'campaign_snapshots', 'website_snapshots', 'companies', 'historical_metrics', 'expenses'
));

create or replace function app.import_rows_remaining(p_batch uuid, p_target text)
returns int
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_target not in ('social_snapshots', 'campaign_snapshots', 'website_snapshots', 'companies',
                      'historical_metrics', 'expenses') then
    raise exception 'Table d''import inconnue.' using errcode = 'check_violation';
  end if;
  execute format('select count(*) from public.%I where import_batch_id = $1', p_target)
    into v_count using p_batch;
  return v_count;
end;
$$;

create or replace function public.commit_import(
  p_batch_id uuid,
  p_rows jsonb,
  p_skipped int,
  p_errors int,
  p_report jsonb
)
returns int
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_batch record;
  v_count int;
begin
  select id, brand_id, target, status into v_batch
  from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Lot introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_batch.status <> 'uploaded' then
    raise exception 'Ce lot a déjà été importé ou annulé.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Aucune ligne à importer.' using errcode = 'check_violation';
  end if;
  perform set_config('app.import_batch', v_batch.id::text, true);

  case v_batch.target
    when 'social_snapshots' then
      insert into public.social_snapshots (brand_id, account_id, period_start, period_end, followers_total,
        followers_new, impressions, posts, interactions, clicks, reach, comments, source, import_batch_id)
      select v_batch.brand_id, r.account_id, r.period_start, r.period_end, r.followers_total,
        r.followers_new, r.impressions, r.posts, r.interactions, r.clicks, r.reach, r.comments, 'import', v_batch.id
      from jsonb_to_recordset(p_rows) as r(account_id uuid, period_start date, period_end date,
        followers_total bigint, followers_new bigint, impressions bigint, posts int, interactions bigint,
        clicks bigint, reach bigint, comments text);
    when 'campaign_snapshots' then
      insert into public.campaign_snapshots (brand_id, campaign_id, period_start, period_end, spend,
        impressions, clicks, leads, conversions, conversion_value, reach, comments, source, import_batch_id)
      select v_batch.brand_id, r.campaign_id, r.period_start, r.period_end, r.spend,
        r.impressions, r.clicks, r.leads, r.conversions, r.conversion_value, r.reach, r.comments, 'import', v_batch.id
      from jsonb_to_recordset(p_rows) as r(campaign_id uuid, period_start date, period_end date,
        spend numeric, impressions bigint, clicks bigint, leads bigint, conversions bigint,
        conversion_value numeric, reach bigint, comments text);
    when 'website_snapshots' then
      insert into public.website_snapshots (brand_id, website_id, period_start, period_end, users, sessions,
        page_views, conversions, form_submissions, sessions_organic, sessions_direct, sessions_social,
        sessions_paid, sessions_referral, sessions_email, sessions_other, comments, source, import_batch_id)
      select v_batch.brand_id, r.website_id, r.period_start, r.period_end, r.users, r.sessions,
        r.page_views, r.conversions, r.form_submissions, r.sessions_organic, r.sessions_direct, r.sessions_social,
        r.sessions_paid, r.sessions_referral, r.sessions_email, r.sessions_other, r.comments, 'import', v_batch.id
      from jsonb_to_recordset(p_rows) as r(website_id uuid, period_start date, period_end date,
        users bigint, sessions bigint, page_views bigint, conversions bigint, form_submissions bigint,
        sessions_organic bigint, sessions_direct bigint, sessions_social bigint, sessions_paid bigint,
        sessions_referral bigint, sessions_email bigint, sessions_other bigint, comments text);
    when 'companies' then
      insert into public.companies (brand_id, name, sector, city, country, phone, email, website, source,
        next_follow_up_on, import_batch_id)
      select v_batch.brand_id, r.name, r.sector, r.city, r.country, r.phone, r.email, r.website, r.source,
        r.next_follow_up_on, v_batch.id
      from jsonb_to_recordset(p_rows) as r(name text, sector text, city text, country text, phone text,
        email text, website text, source text, next_follow_up_on date);
    when 'historical_metrics' then
      insert into public.historical_metrics (brand_id, user_id, metric_key, period_start, period_end, value,
        currency, comments, import_batch_id)
      select v_batch.brand_id, r.user_id, r.metric_key, r.period_start, r.period_end, r.value,
        r.currency, r.comments, v_batch.id
      from jsonb_to_recordset(p_rows) as r(user_id uuid, metric_key text, period_start date, period_end date,
        value numeric, currency text, comments text);
    when 'expenses' then
      insert into public.expenses (brand_id, budget_line_id, campaign_id, supplier, description, expense_date,
        amount, currency, status, paid_on, external_ref, comments, source, import_batch_id)
      select v_batch.brand_id, r.budget_line_id, r.campaign_id, r.supplier, r.description, r.expense_date,
        r.amount, r.currency, r.status, r.paid_on, r.external_ref, r.comments, 'import', v_batch.id
      from jsonb_to_recordset(p_rows) as r(budget_line_id uuid, campaign_id uuid, supplier text, description text,
        expense_date date, amount numeric, currency text, status text, paid_on date, external_ref text, comments text);
  end case;
  get diagnostics v_count = row_count;

  update public.import_batches
     set status = 'committed', inserted_count = v_count, skipped_count = greatest(p_skipped, 0),
         error_count = greatest(p_errors, 0), report = coalesce(p_report, '{}'::jsonb)
   where id = p_batch_id;
  perform set_config('app.import_batch', '', true);
  return v_count;
end;
$$;

-- =====================================================================
-- Sécurité au niveau des lignes
-- Lecture : budgets.read ou budgets.manage ; écriture : budgets.manage.
-- Budgets et dépenses s'archivent ; une ligne sans dépense se supprime.
-- =====================================================================

alter table public.fx_rates enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.expenses enable row level security;
revoke all on public.fx_rates, public.budgets, public.budget_lines, public.expenses from anon;

create policy fx_rates_select on public.fx_rates for select to authenticated using (true);
create policy fx_rates_insert on public.fx_rates for insert to authenticated
  with check ((select app.has_global_permission('fx_rates.manage')));
create policy fx_rates_update on public.fx_rates for update to authenticated
  using ((select app.has_global_permission('fx_rates.manage')))
  with check ((select app.has_global_permission('fx_rates.manage')));
create policy fx_rates_delete on public.fx_rates for delete to authenticated
  using ((select app.has_global_permission('fx_rates.manage')));

create policy budgets_select on public.budgets for select to authenticated using (
  brand_id = any ((select app.brands_with('budgets.read'))::uuid[])
  or brand_id = any ((select app.brands_with('budgets.manage'))::uuid[])
);
create policy budgets_insert on public.budgets for insert to authenticated
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));
create policy budgets_update on public.budgets for update to authenticated
  using (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));

create policy budget_lines_select on public.budget_lines for select to authenticated using (
  brand_id = any ((select app.brands_with('budgets.read'))::uuid[])
  or brand_id = any ((select app.brands_with('budgets.manage'))::uuid[])
);
create policy budget_lines_insert on public.budget_lines for insert to authenticated
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));
create policy budget_lines_update on public.budget_lines for update to authenticated
  using (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));
create policy budget_lines_delete on public.budget_lines for delete to authenticated
  using (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));

create policy expenses_select on public.expenses for select to authenticated using (
  brand_id = any ((select app.brands_with('budgets.read'))::uuid[])
  or brand_id = any ((select app.brands_with('budgets.manage'))::uuid[])
);
create policy expenses_insert on public.expenses for insert to authenticated
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));
create policy expenses_update on public.expenses for update to authenticated
  using (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('budgets.manage'))::uuid[]));
-- Seule l'annulation d'un lot d'import supprime des dépenses.
create policy expenses_delete_imported on public.expenses for delete to authenticated using (
  import_batch_id is not null
  and brand_id = any ((select app.brands_with('imports.manage'))::uuid[])
  and brand_id = any ((select app.brands_with('budgets.manage'))::uuid[])
);
