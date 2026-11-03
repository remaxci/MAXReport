-- Sprint 5 · Marketing : plateformes, comptes sociaux, campagnes, sites web
-- et leurs relevés de performance.
-- Aucune connexion aux API des plateformes : les relevés sont saisis (les
-- imports arrivent au Sprint 6). Une contrainte d'exclusion interdit deux
-- relevés qui se chevauchent pour un même compte, une même campagne ou un
-- même site : deux saisies d'une même semaine ne peuvent pas s'additionner.
-- Une mesure non saisie reste vide (null), jamais 0.

-- =====================================================================
-- Permissions
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('marketing.read',   'marketing', 'Consulter les réseaux sociaux, campagnes et sites web'),
  ('marketing.manage', 'marketing', 'Gérer les comptes, campagnes et sites, saisir les relevés');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.module = 'marketing'
where r.key in ('super_admin', 'brand_admin', 'marketing')
   or (r.key in ('direction', 'viewer', 'sales_manager') and p.key = 'marketing.read');

-- =====================================================================
-- Plateformes : liste commune à toutes les marques, alimentée par migration
-- =====================================================================

create table public.platforms (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  kind text not null check (kind in ('social', 'ads', 'offline')),
  position int not null default 0,
  is_active boolean not null default true
);

insert into public.platforms (key, label, kind, position) values
  ('facebook',      'Facebook',                        'social',  10),
  ('instagram',     'Instagram',                       'social',  20),
  ('linkedin',      'LinkedIn',                        'social',  30),
  ('tiktok',        'TikTok',                          'social',  40),
  ('youtube',       'YouTube',                         'social',  50),
  ('x_twitter',     'X (Twitter)',                     'social',  60),
  ('whatsapp',      'WhatsApp Business',               'social',  70),
  ('meta_ads',      'Meta Ads (Facebook, Instagram)',  'ads',     110),
  ('google_ads',    'Google Ads',                      'ads',     120),
  ('linkedin_ads',  'LinkedIn Ads',                    'ads',     130),
  ('tiktok_ads',    'TikTok Ads',                      'ads',     140),
  ('emailing',      'E-mailing',                       'ads',     150),
  ('sms',           'SMS',                             'ads',     160),
  ('other_digital', 'Autre support numérique',         'ads',     190),
  ('billboard',     'Affichage',                       'offline', 210),
  ('radio',         'Radio',                           'offline', 220),
  ('tv',            'Télévision',                      'offline', 230),
  ('press',         'Presse',                          'offline', 240),
  ('event',         'Événement, salon',                'offline', 250),
  ('other_offline', 'Autre support hors ligne',        'offline', 290);

-- =====================================================================
-- Comptes sociaux et relevés
-- =====================================================================

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  platform text not null references public.platforms (key),
  name text not null check (length(btrim(name)) between 1 and 200),
  handle text check (handle is null or length(handle) <= 200),
  url text check (url is null or (length(url) <= 500 and url ~ '^https?://\S+$')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id)
);
create index social_accounts_brand_idx on public.social_accounts (brand_id, platform);
create index social_accounts_platform_idx on public.social_accounts (platform);
create index social_accounts_created_by_idx on public.social_accounts (created_by);
create index social_accounts_updated_by_idx on public.social_accounts (updated_by);

create table public.social_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  -- Stock : abonnés en fin de période.
  followers_total bigint check (followers_total >= 0),
  -- Flux.
  followers_new bigint check (followers_new >= 0),
  impressions bigint check (impressions >= 0),
  posts int check (posts >= 0),
  interactions bigint check (interactions >= 0),
  clicks bigint check (clicks >= 0),
  -- Non additif : portée relevée pour la période exacte.
  reach bigint check (reach >= 0),
  source text not null default 'manual' check (source in ('manual', 'import')),
  comments text check (comments is null or length(comments) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  foreign key (brand_id, account_id) references public.social_accounts (brand_id, id) on delete cascade,
  check (period_end >= period_start and period_end - period_start <= 366),
  check (num_nonnulls(followers_total, followers_new, impressions, posts, interactions, clicks, reach) > 0),
  constraint social_snapshots_no_overlap
    exclude using gist (account_id with =, daterange(period_start, period_end, '[]') with &&)
);
create index social_snapshots_account_idx on public.social_snapshots (brand_id, account_id, period_start);
create index social_snapshots_created_by_idx on public.social_snapshots (created_by);
create index social_snapshots_updated_by_idx on public.social_snapshots (updated_by);

-- =====================================================================
-- Campagnes et relevés (montants dans la devise de la campagne)
-- =====================================================================

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  platform text not null references public.platforms (key),
  name text not null check (length(btrim(name)) between 1 and 200),
  objective text not null default 'awareness'
    check (objective in ('awareness', 'traffic', 'engagement', 'leads', 'conversions', 'other')),
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'completed', 'cancelled')),
  start_on date,
  end_on date,
  planned_budget numeric(18, 2) check (planned_budget >= 0),
  currency text not null default 'XOF' check (currency in ('XOF', 'USD', 'EUR')),
  -- Référence de la campagne sur la plateforme (information, aucune connexion).
  external_id text check (external_id is null or length(external_id) <= 200),
  comments text check (comments is null or length(comments) <= 5000),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  check (end_on is null or start_on is null or end_on >= start_on)
);
create index campaigns_brand_idx on public.campaigns (brand_id, start_on desc);
create index campaigns_platform_idx on public.campaigns (platform);
create index campaigns_created_by_idx on public.campaigns (created_by);
create index campaigns_updated_by_idx on public.campaigns (updated_by);

create table public.campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  campaign_id uuid not null,
  period_start date not null,
  period_end date not null,
  -- Dépense relevée sur la plateforme, dans la devise de la campagne.
  spend numeric(18, 2) check (spend >= 0),
  impressions bigint check (impressions >= 0),
  clicks bigint check (clicks >= 0),
  leads bigint check (leads >= 0),
  conversions bigint check (conversions >= 0),
  conversion_value numeric(18, 2) check (conversion_value >= 0),
  reach bigint check (reach >= 0),
  source text not null default 'manual' check (source in ('manual', 'import')),
  comments text check (comments is null or length(comments) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  foreign key (brand_id, campaign_id) references public.campaigns (brand_id, id) on delete cascade,
  check (period_end >= period_start and period_end - period_start <= 366),
  check (num_nonnulls(spend, impressions, clicks, leads, conversions, conversion_value, reach) > 0),
  constraint campaign_snapshots_no_overlap
    exclude using gist (campaign_id with =, daterange(period_start, period_end, '[]') with &&)
);
create index campaign_snapshots_campaign_idx on public.campaign_snapshots (brand_id, campaign_id, period_start);
create index campaign_snapshots_created_by_idx on public.campaign_snapshots (created_by);
create index campaign_snapshots_updated_by_idx on public.campaign_snapshots (updated_by);

-- =====================================================================
-- Sites web et relevés (sessions ventilées par canal d'acquisition)
-- =====================================================================

create table public.websites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  url text check (url is null or (length(url) <= 500 and url ~ '^https?://\S+$')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id)
);
create index websites_brand_idx on public.websites (brand_id);
create index websites_created_by_idx on public.websites (created_by);
create index websites_updated_by_idx on public.websites (updated_by);

create table public.website_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  website_id uuid not null,
  period_start date not null,
  period_end date not null,
  -- Non additif : utilisateurs uniques de la période exacte.
  users bigint check (users >= 0),
  sessions bigint check (sessions >= 0),
  page_views bigint check (page_views >= 0),
  conversions bigint check (conversions >= 0),
  form_submissions bigint check (form_submissions >= 0),
  sessions_organic bigint check (sessions_organic >= 0),
  sessions_direct bigint check (sessions_direct >= 0),
  sessions_social bigint check (sessions_social >= 0),
  sessions_paid bigint check (sessions_paid >= 0),
  sessions_referral bigint check (sessions_referral >= 0),
  sessions_email bigint check (sessions_email >= 0),
  sessions_other bigint check (sessions_other >= 0),
  source text not null default 'manual' check (source in ('manual', 'import')),
  comments text check (comments is null or length(comments) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  foreign key (brand_id, website_id) references public.websites (brand_id, id) on delete cascade,
  check (period_end >= period_start and period_end - period_start <= 366),
  check (num_nonnulls(users, sessions, page_views, conversions, form_submissions, sessions_organic,
    sessions_direct, sessions_social, sessions_paid, sessions_referral, sessions_email, sessions_other) > 0),
  -- La ventilation par canal ne peut pas dépasser le total des sessions.
  check (sessions is null or coalesce(sessions_organic, 0) + coalesce(sessions_direct, 0)
    + coalesce(sessions_social, 0) + coalesce(sessions_paid, 0) + coalesce(sessions_referral, 0)
    + coalesce(sessions_email, 0) + coalesce(sessions_other, 0) <= sessions),
  constraint website_snapshots_no_overlap
    exclude using gist (website_id with =, daterange(period_start, period_end, '[]') with &&)
);
create index website_snapshots_website_idx on public.website_snapshots (brand_id, website_id, period_start);
create index website_snapshots_created_by_idx on public.website_snapshots (created_by);
create index website_snapshots_updated_by_idx on public.website_snapshots (updated_by);

-- =====================================================================
-- Garde-fous
-- =====================================================================

-- Auteur, date de modification, marque figée : commun aux tables marketing.
create function app.stamp_marketing_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un enregistrement ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Plateforme du bon type (arguments : types admis), active à la création.
create function app.check_platform_kind()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.platforms p
    where p.key = new.platform and p.kind = any (tg_argv)
      and (p.is_active or (tg_op = 'UPDATE' and new.platform = old.platform))
  ) then
    raise exception 'Plateforme invalide pour cet enregistrement.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Les relevés d'une campagne sont dans sa devise : elle se fige au premier relevé.
create function app.lock_campaign_currency()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.campaign_snapshots s where s.campaign_id = old.id) then
    raise exception 'La devise d''une campagne ne change plus une fois des relevés saisis.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function app.stamp_marketing_row() from public;
revoke all on function app.check_platform_kind() from public;
revoke all on function app.lock_campaign_currency() from public;

create trigger social_accounts_stamp before insert or update on public.social_accounts
  for each row execute function app.stamp_marketing_row();
create trigger social_accounts_platform before insert or update on public.social_accounts
  for each row execute function app.check_platform_kind('social');
create trigger social_accounts_audit after insert or update or delete on public.social_accounts
  for each row execute function app.audit('brand_id');

create trigger social_snapshots_stamp before insert or update on public.social_snapshots
  for each row execute function app.stamp_marketing_row();
create trigger social_snapshots_audit after insert or update or delete on public.social_snapshots
  for each row execute function app.audit('brand_id');

create trigger campaigns_stamp before insert or update on public.campaigns
  for each row execute function app.stamp_marketing_row();
create trigger campaigns_platform before insert or update on public.campaigns
  for each row execute function app.check_platform_kind('ads', 'offline');
create trigger campaigns_currency before update on public.campaigns
  for each row execute function app.lock_campaign_currency();
create trigger campaigns_custom before insert or update on public.campaigns
  for each row execute function app.validate_custom_values('campaign');
create trigger campaigns_audit after insert or update or delete on public.campaigns
  for each row execute function app.audit('brand_id');

create trigger campaign_snapshots_stamp before insert or update on public.campaign_snapshots
  for each row execute function app.stamp_marketing_row();
create trigger campaign_snapshots_audit after insert or update or delete on public.campaign_snapshots
  for each row execute function app.audit('brand_id');

create trigger websites_stamp before insert or update on public.websites
  for each row execute function app.stamp_marketing_row();
create trigger websites_audit after insert or update or delete on public.websites
  for each row execute function app.audit('brand_id');

create trigger website_snapshots_stamp before insert or update on public.website_snapshots
  for each row execute function app.stamp_marketing_row();
create trigger website_snapshots_audit after insert or update or delete on public.website_snapshots
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- Lecture : marketing.read ou marketing.manage ; écriture : marketing.manage.
-- Comptes, campagnes et sites s'archivent ; seuls les relevés se suppriment
-- (saisie erronée), avec trace dans le journal d'audit.
-- =====================================================================

alter table public.platforms enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_snapshots enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_snapshots enable row level security;
alter table public.websites enable row level security;
alter table public.website_snapshots enable row level security;

revoke all on public.platforms, public.social_accounts, public.social_snapshots, public.campaigns,
  public.campaign_snapshots, public.websites, public.website_snapshots from anon;

create policy platforms_select on public.platforms for select to authenticated using (true);

do $$
declare
  t text;
begin
  foreach t in array array['social_accounts', 'social_snapshots', 'campaigns', 'campaign_snapshots',
                           'websites', 'website_snapshots'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using ('
      || 'brand_id = any ((select app.brands_with(''marketing.read''))::uuid[]) '
      || 'or brand_id = any ((select app.brands_with(''marketing.manage''))::uuid[]))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated '
      || 'with check (brand_id = any ((select app.brands_with(''marketing.manage''))::uuid[]))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated '
      || 'using (brand_id = any ((select app.brands_with(''marketing.manage''))::uuid[])) '
      || 'with check (brand_id = any ((select app.brands_with(''marketing.manage''))::uuid[]))', t);
  end loop;
  foreach t in array array['social_snapshots', 'campaign_snapshots', 'website_snapshots'] loop
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated '
      || 'using (brand_id = any ((select app.brands_with(''marketing.manage''))::uuid[]))', t);
  end loop;
end $$;
