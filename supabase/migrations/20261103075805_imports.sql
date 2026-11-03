-- Sprint 6 · Imports : lots d'import (CSV, Excel), historique agrégé et
-- annulation d'un lot.
-- Le fichier est lu côté serveur ; ses lignes brutes sont conservées dans le
-- lot (traçabilité), la correspondance des colonnes aussi. L'import se fait
-- d'un bloc (commit_import) et s'annule d'un bloc (rollback_import). Chaque
-- ligne importée garde le lot qui l'a créée ; ce lien est vérifié par la base
-- et ne se modifie pas. Les droits de la table cible (RLS) s'appliquent
-- toujours : importer des relevés exige marketing.manage, des prospects
-- crm.manage.

-- =====================================================================
-- Permission
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('imports.manage', 'imports', 'Importer des fichiers, consulter l''historique et annuler un lot');

insert into public.role_permissions (role_id, permission)
select r.id, 'imports.manage'
from public.roles r
where r.key in ('super_admin', 'brand_admin', 'marketing', 'sales_manager');

-- =====================================================================
-- Lots d'import
-- =====================================================================

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  target text not null check (target in (
    'social_snapshots', 'campaign_snapshots', 'website_snapshots', 'companies', 'historical_metrics'
  )),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_size int not null check (file_size between 1 and 4194304),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  -- En-têtes et lignes brutes du fichier (texte, nombre ou null).
  headers jsonb not null check (jsonb_typeof(headers) = 'array' and jsonb_array_length(headers) between 1 and 60),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  row_count int not null check (row_count between 1 and 5000),
  -- Correspondance champ cible → colonne, et options (formats, objet par défaut).
  mapping jsonb not null default '{}' check (jsonb_typeof(mapping) = 'object'),
  options jsonb not null default '{}' check (jsonb_typeof(options) = 'object'),
  status text not null default 'uploaded' check (status in ('uploaded', 'committed', 'rolled_back')),
  inserted_count int check (inserted_count >= 0),
  skipped_count int check (skipped_count >= 0),
  error_count int check (error_count >= 0),
  -- Lignes écartées (erreurs, doublons) : numéro et motif.
  report jsonb check (report is null or jsonb_typeof(report) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  committed_at timestamptz,
  committed_by uuid references auth.users (id) on delete set null,
  rolled_back_at timestamptz,
  rolled_back_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id)
);
create index import_batches_brand_idx on public.import_batches (brand_id, created_at desc);
create index import_batches_sha_idx on public.import_batches (brand_id, target, file_sha256);
create index import_batches_created_by_idx on public.import_batches (created_by);
create index import_batches_committed_by_idx on public.import_batches (committed_by);
create index import_batches_rolled_back_by_idx on public.import_batches (rolled_back_by);

-- =====================================================================
-- Lien des lignes importées vers leur lot
-- =====================================================================

alter table public.social_snapshots add column import_batch_id uuid;
alter table public.social_snapshots
  add foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id),
  add check ((source = 'import') = (import_batch_id is not null));
create index social_snapshots_batch_idx on public.social_snapshots (brand_id, import_batch_id);

alter table public.campaign_snapshots add column import_batch_id uuid;
alter table public.campaign_snapshots
  add foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id),
  add check ((source = 'import') = (import_batch_id is not null));
create index campaign_snapshots_batch_idx on public.campaign_snapshots (brand_id, import_batch_id);

alter table public.website_snapshots add column import_batch_id uuid;
alter table public.website_snapshots
  add foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id),
  add check ((source = 'import') = (import_batch_id is not null));
create index website_snapshots_batch_idx on public.website_snapshots (brand_id, import_batch_id);

alter table public.companies add column import_batch_id uuid;
alter table public.companies
  add foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id);
create index companies_batch_idx on public.companies (brand_id, import_batch_id);

-- =====================================================================
-- Historique agrégé (chiffres d'avant MAXreport), toujours importé
-- =====================================================================

create table public.historical_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  -- null : chiffre de toute l'équipe.
  user_id uuid references public.profiles (id),
  metric_key text not null check (metric_key in (
    'calls', 'emails_sent', 'qualified_meetings', 'opportunities_created',
    'offers_sent', 'memos_sent', 'contracts_signed', 'revenue_signed'
  )),
  period_start date not null,
  period_end date not null,
  value numeric(18, 2) not null check (value >= 0),
  currency text check (currency in ('XOF', 'USD', 'EUR')),
  comments text check (comments is null or length(comments) <= 2000),
  import_batch_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (brand_id, import_batch_id) references public.import_batches (brand_id, id),
  check (period_end >= period_start),
  check ((metric_key = 'revenue_signed') = (currency is not null)),
  -- Un même chiffre (indicateur, collaborateur, devise) ne se recouvre pas dans le temps.
  constraint historical_metrics_no_overlap exclude using gist (
    brand_id with =,
    metric_key with =,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(currency, '') with =,
    daterange(period_start, period_end, '[]') with &&
  )
);
create index historical_metrics_batch_idx on public.historical_metrics (brand_id, import_batch_id);
create index historical_metrics_user_idx on public.historical_metrics (user_id);
create index historical_metrics_created_by_idx on public.historical_metrics (created_by);

-- =====================================================================
-- Garde-fous
-- =====================================================================

-- Cycle de vie d'un lot : envoyé → importé → annulé. Le fichier ne change pas ;
-- la correspondance se règle tant que rien n'est importé.
create function app.guard_import_batch()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'uploaded' then
      raise exception 'Un lot commence à l''état envoyé.' using errcode = 'check_violation';
    end if;
    new.created_by := auth.uid();
    new.inserted_count := null; new.skipped_count := null; new.error_count := null; new.report := null;
    new.committed_at := null; new.committed_by := null; new.rolled_back_at := null; new.rolled_back_by := null;
    return new;
  end if;

  if (new.brand_id, new.target, new.file_name, new.file_size, new.file_sha256, new.headers, new.rows,
      new.row_count, new.created_at, new.created_by)
     is distinct from
     (old.brand_id, old.target, old.file_name, old.file_size, old.file_sha256, old.headers, old.rows,
      old.row_count, old.created_at, old.created_by) then
    raise exception 'Le fichier d''un lot ne se modifie pas.' using errcode = 'check_violation';
  end if;

  if old.status = 'uploaded' and new.status = 'uploaded' then
    new.inserted_count := null; new.skipped_count := null; new.error_count := null; new.report := null;
  elsif new.status <> old.status and coalesce(current_setting('app.import_batch', true), '') <> old.id::text then
    raise exception 'Un lot s''importe ou s''annule par les fonctions prévues.' using errcode = 'insufficient_privilege';
  elsif old.status = 'uploaded' and new.status = 'committed' then
    new.committed_at := now();
    new.committed_by := auth.uid();
  elsif old.status = 'committed' and new.status = 'rolled_back' then
    if (new.mapping, new.options, new.inserted_count, new.skipped_count, new.error_count, new.report)
       is distinct from (old.mapping, old.options, old.inserted_count, old.skipped_count, old.error_count, old.report) then
      raise exception 'Le compte rendu d''un lot importé ne se modifie pas.' using errcode = 'check_violation';
    end if;
    new.rolled_back_at := now();
    new.rolled_back_by := auth.uid();
  else
    raise exception 'Ce lot ne peut plus changer d''état.' using errcode = 'check_violation';
  end if;
  if new.status <> 'rolled_back' then
    new.rolled_back_at := null;
    new.rolled_back_by := null;
  end if;
  if new.status = 'uploaded' then
    new.committed_at := null;
    new.committed_by := null;
  end if;
  return new;
end;
$$;

-- Une ligne ne se rattache qu'à un lot en cours d'import, de la même marque et
-- de la même table, par une personne qui détient imports.manage ; le lien est figé.
create function app.check_import_link()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.import_batch_id is distinct from old.import_batch_id then
      raise exception 'Le lot d''import d''une ligne ne se modifie pas.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.import_batch_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.import_batches b
    where b.id = new.import_batch_id and b.brand_id = new.brand_id
      and b.target = tg_table_name and b.status = 'uploaded'
  ) then
    raise exception 'Lot d''import invalide pour cette ligne.' using errcode = 'check_violation';
  end if;
  if coalesce(current_setting('app.import_batch', true), '') <> new.import_batch_id::text then
    raise exception 'Une ligne ne se rattache à un lot que par l''import.' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and not (new.brand_id = any (app.brands_with('imports.manage'))) then
    raise exception 'Import non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create function app.stamp_historical_metric()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  if new.user_id is not null and not app.is_brand_member(new.user_id, new.brand_id) then
    raise exception 'Le chiffre doit concerner un collaborateur de la marque.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Lignes d'un lot encore présentes, quels que soient les droits de lecture.
create function app.import_rows_remaining(p_batch uuid, p_target text)
returns int
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_target not in ('social_snapshots', 'campaign_snapshots', 'website_snapshots', 'companies', 'historical_metrics') then
    raise exception 'Table d''import inconnue.' using errcode = 'check_violation';
  end if;
  execute format('select count(*) from public.%I where import_batch_id = $1', p_target)
    into v_count using p_batch;
  return v_count;
end;
$$;

revoke all on function app.guard_import_batch() from public;
revoke all on function app.check_import_link() from public;
revoke all on function app.stamp_historical_metric() from public;
revoke all on function app.import_rows_remaining(uuid, text) from public;
grant execute on function app.import_rows_remaining(uuid, text) to authenticated;

create trigger import_batches_guard before insert or update on public.import_batches
  for each row execute function app.guard_import_batch();
create trigger import_batches_audit after insert or update or delete on public.import_batches
  for each row execute function app.audit('brand_id');

create trigger social_snapshots_import before insert or update on public.social_snapshots
  for each row execute function app.check_import_link();
create trigger campaign_snapshots_import before insert or update on public.campaign_snapshots
  for each row execute function app.check_import_link();
create trigger website_snapshots_import before insert or update on public.website_snapshots
  for each row execute function app.check_import_link();
create trigger companies_import before insert or update on public.companies
  for each row execute function app.check_import_link();
create trigger historical_metrics_import before insert or update on public.historical_metrics
  for each row execute function app.check_import_link();
create trigger historical_metrics_stamp before insert on public.historical_metrics
  for each row execute function app.stamp_historical_metric();
create trigger historical_metrics_audit after insert or update or delete on public.historical_metrics
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Import et annulation d'un lot, d'un bloc
-- Fonctions security invoker : la RLS de chaque table cible s'applique.
-- =====================================================================

create function public.commit_import(
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
  -- Marque la transaction : seules ces fonctions rattachent des lignes au lot.
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

create function public.rollback_import(p_batch_id uuid)
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
  if v_batch.status <> 'committed' then
    raise exception 'Seul un lot importé peut être annulé.' using errcode = 'check_violation';
  end if;
  perform set_config('app.import_batch', v_batch.id::text, true);

  execute format('delete from public.%I where brand_id = $1 and import_batch_id = $2', v_batch.target)
    using v_batch.brand_id, v_batch.id;
  get diagnostics v_count = row_count;
  -- Des lignes que l'utilisateur n'a pas le droit de supprimer bloquent l'annulation.
  if app.import_rows_remaining(v_batch.id, v_batch.target) > 0 then
    raise exception 'Vous n''avez pas les droits pour supprimer toutes les lignes de ce lot.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.import_batches set status = 'rolled_back' where id = p_batch_id;
  perform set_config('app.import_batch', '', true);
  return v_count;
end;
$$;

revoke all on function public.commit_import(uuid, jsonb, int, int, jsonb) from public, anon;
revoke all on function public.rollback_import(uuid) from public, anon;
grant execute on function public.commit_import(uuid, jsonb, int, int, jsonb) to authenticated;
grant execute on function public.rollback_import(uuid) to authenticated;

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.import_batches enable row level security;
alter table public.historical_metrics enable row level security;
revoke all on public.import_batches, public.historical_metrics from anon;

create policy import_batches_select on public.import_batches for select to authenticated
  using (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));
create policy import_batches_update on public.import_batches for update to authenticated
  using (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));
-- Un lot abandonné avant import se supprime ; un lot importé reste dans l'historique.
create policy import_batches_delete on public.import_batches for delete to authenticated
  using (status = 'uploaded' and brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));

create policy historical_metrics_select on public.historical_metrics for select to authenticated using (
  brand_id = any ((select app.brands_with('imports.manage'))::uuid[])
  or brand_id = any ((select app.brands_with('objectives.read_all'))::uuid[])
  or brand_id = any ((select app.brands_with('activities.read_all'))::uuid[])
  or (brand_id = any ((select app.brands_with('brand.read'))::uuid[])
      and (user_id is null or user_id = (select auth.uid())))
);
create policy historical_metrics_insert on public.historical_metrics for insert to authenticated
  with check (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));
create policy historical_metrics_delete on public.historical_metrics for delete to authenticated
  using (brand_id = any ((select app.brands_with('imports.manage'))::uuid[]));

-- Prospects importés : supprimables par l'annulation de leur lot (une
-- entreprise déjà liée à une opportunité, une offre… reste protégée par les
-- clés étrangères). Les prospects saisis à la main s'archivent toujours.
create policy companies_delete_imported on public.companies for delete to authenticated using (
  import_batch_id is not null
  and brand_id = any ((select app.brands_with('imports.manage'))::uuid[])
  and brand_id = any ((select app.brands_with('crm.manage'))::uuid[])
);
