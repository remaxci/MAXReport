-- Sprint 4a · CRM : opportunités, historique des échanges, contrats signés.
-- L'annuaire des prospects reste partagé dans la marque (crm.read) pour éviter
-- les doublons ; les opportunités et contrats sont personnels (manage_own).

-- =====================================================================
-- Permissions
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('opportunities.read_all',   'crm',      'Voir toutes les opportunités de la marque'),
  ('opportunities.manage_all', 'crm',      'Créer et modifier toutes les opportunités'),
  ('opportunities.manage_own', 'crm',      'Créer et modifier ses propres opportunités'),
  ('contracts.read_all',       'contrats', 'Voir tous les contrats de la marque'),
  ('contracts.manage_all',     'contrats', 'Enregistrer et modifier tous les contrats'),
  ('contracts.manage_own',     'contrats', 'Enregistrer et modifier ses propres contrats');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.key like 'opportunities.%' or p.key like 'contracts.%'
where r.key in ('super_admin', 'brand_admin')
   or (r.key = 'sales_manager' and p.key in (
        'opportunities.read_all', 'opportunities.manage_all', 'contracts.read_all', 'contracts.manage_all'))
   or (r.key = 'sales_rep' and p.key in ('opportunities.manage_own', 'contracts.manage_own'))
   or (r.key in ('direction', 'viewer') and p.key in ('opportunities.read_all', 'contracts.read_all'));

-- =====================================================================
-- Opportunités
-- =====================================================================

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  owner_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  stage_id uuid not null,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  currency text check (currency in ('XOF', 'USD', 'EUR')),
  expected_close_on date,
  -- Renseignée automatiquement à l'entrée dans une étape gagnée ou perdue.
  closed_on date,
  source text check (source is null or source ~ '^[a-z][a-z0-9_]{1,40}$'),
  lost_reason text check (lost_reason is null or length(lost_reason) <= 2000),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, company_id) references public.companies (brand_id, id),
  foreign key (brand_id, contact_id) references public.contacts (brand_id, id),
  foreign key (brand_id, stage_id) references public.pipeline_stages (brand_id, id),
  check ((amount is null) = (currency is null))
);
create index opportunities_brand_stage_idx on public.opportunities (brand_id, stage_id);
create index opportunities_brand_company_idx on public.opportunities (brand_id, company_id);
create index opportunities_brand_contact_idx on public.opportunities (brand_id, contact_id);
create index opportunities_owner_idx on public.opportunities (owner_id);
create index opportunities_created_at_idx on public.opportunities (brand_id, created_at);
create index opportunities_created_by_idx on public.opportunities (created_by);
create index opportunities_updated_by_idx on public.opportunities (updated_by);

-- =====================================================================
-- Historique des échanges (appels, e-mails, rendez-vous, notes)
-- Historique qualitatif : il n'alimente pas les indicateurs d'activité,
-- qui viennent des fiches hebdomadaires (pas de double comptage).
-- =====================================================================

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  company_id uuid not null,
  opportunity_id uuid,
  contact_id uuid,
  user_id uuid not null default auth.uid() references public.profiles (id),
  type text not null check (type in ('call', 'email', 'meeting', 'note', 'other')),
  occurred_at timestamptz not null default now(),
  summary text not null check (length(btrim(summary)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (brand_id, company_id) references public.companies (brand_id, id) on delete cascade,
  foreign key (brand_id, opportunity_id) references public.opportunities (brand_id, id) on delete cascade,
  foreign key (brand_id, contact_id) references public.contacts (brand_id, id) on delete set null (contact_id)
);
create index interactions_company_idx on public.interactions (brand_id, company_id, occurred_at desc);
create index interactions_opportunity_idx on public.interactions (brand_id, opportunity_id);
create index interactions_contact_idx on public.interactions (brand_id, contact_id);
create index interactions_user_idx on public.interactions (user_id);

-- =====================================================================
-- Contrats signés (source du chiffre d'affaires signé)
-- =====================================================================

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  company_id uuid not null,
  opportunity_id uuid,
  offer_id uuid,
  owner_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(btrim(title)) between 1 and 200),
  signed_on date not null,
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null check (currency in ('XOF', 'USD', 'EUR')),
  start_on date,
  end_on date,
  comments text check (comments is null or length(comments) <= 5000),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, company_id) references public.companies (brand_id, id),
  foreign key (brand_id, opportunity_id) references public.opportunities (brand_id, id),
  foreign key (brand_id, offer_id) references public.commercial_documents (brand_id, id),
  check (end_on is null or start_on is null or end_on >= start_on)
);
create index contracts_brand_signed_idx on public.contracts (brand_id, signed_on desc);
create index contracts_brand_company_idx on public.contracts (brand_id, company_id);
create index contracts_brand_opportunity_idx on public.contracts (brand_id, opportunity_id);
create index contracts_brand_offer_idx on public.contracts (brand_id, offer_id);
create index contracts_owner_idx on public.contracts (owner_id);
create index contracts_created_by_idx on public.contracts (created_by);
create index contracts_updated_by_idx on public.contracts (updated_by);

-- =====================================================================
-- Garde-fous
-- =====================================================================

create function app.prepare_opportunity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_stage record;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.owner_id := coalesce(new.owner_id, auth.uid());
    if new.stage_id is null then
      select id into new.stage_id from public.pipeline_stages
       where brand_id = new.brand_id and category = 'open' and is_active
       order by position limit 1;
    end if;
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Une opportunité ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  select s.category, s.is_active into v_stage from public.pipeline_stages s
   where s.id = new.stage_id and s.brand_id = new.brand_id;
  if v_stage.category is null then
    raise exception 'Étape de pipeline invalide.' using errcode = 'check_violation';
  end if;
  if not v_stage.is_active and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) then
    raise exception 'Cette étape est désactivée.' using errcode = 'check_violation';
  end if;

  -- Date de clôture : posée en entrant dans une étape gagnée ou perdue, retirée en revenant en cours.
  if v_stage.category = 'open' then
    new.closed_on := null;
  elsif tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.closed_on := coalesce(new.closed_on, current_date);
  end if;

  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not app.is_brand_member(new.owner_id, new.brand_id) then
    raise exception 'Le commercial responsable doit être un collaborateur de la marque.'
      using errcode = 'check_violation';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.company_id = new.company_id
  ) then
    raise exception 'Le contact n''appartient pas à cette entreprise.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.prepare_interaction()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.brand_id is distinct from old.brand_id or new.user_id is distinct from old.user_id) then
    raise exception 'L''auteur et la marque d''un échange sont figés.' using errcode = 'check_violation';
  end if;
  if new.opportunity_id is not null and not exists (
    select 1 from public.opportunities o where o.id = new.opportunity_id and o.company_id = new.company_id
  ) then
    raise exception 'L''opportunité n''appartient pas à cette entreprise.' using errcode = 'check_violation';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.company_id = new.company_id
  ) then
    raise exception 'Le contact n''appartient pas à cette entreprise.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.prepare_contract()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.owner_id := coalesce(new.owner_id, auth.uid());
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un contrat ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not app.is_brand_member(new.owner_id, new.brand_id) then
    raise exception 'Le commercial responsable doit être un collaborateur de la marque.'
      using errcode = 'check_violation';
  end if;
  if new.opportunity_id is not null and not exists (
    select 1 from public.opportunities o where o.id = new.opportunity_id and o.company_id = new.company_id
  ) then
    raise exception 'L''opportunité n''appartient pas à cette entreprise.' using errcode = 'check_violation';
  end if;
  if new.offer_id is not null and not exists (
    select 1 from public.commercial_documents d
    where d.id = new.offer_id and d.kind = 'offer' and d.company_id = new.company_id
  ) then
    raise exception 'L''offre liée doit être une offre de la même entreprise.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function app.prepare_opportunity() from public;
revoke all on function app.prepare_interaction() from public;
revoke all on function app.prepare_contract() from public;

create trigger opportunities_prepare before insert or update on public.opportunities
  for each row execute function app.prepare_opportunity();
create trigger opportunities_custom before insert or update on public.opportunities
  for each row execute function app.validate_custom_values('opportunity');
create trigger opportunities_audit after insert or update or delete on public.opportunities
  for each row execute function app.audit('brand_id');

create trigger interactions_prepare before insert or update on public.interactions
  for each row execute function app.prepare_interaction();
create trigger interactions_audit after insert or update or delete on public.interactions
  for each row execute function app.audit('brand_id');

create trigger contracts_prepare before insert or update on public.contracts
  for each row execute function app.prepare_contract();
create trigger contracts_custom before insert or update on public.contracts
  for each row execute function app.validate_custom_values('contract');
create trigger contracts_audit after insert or update or delete on public.contracts
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.opportunities enable row level security;
alter table public.interactions enable row level security;
alter table public.contracts enable row level security;

revoke all on public.opportunities, public.interactions, public.contracts from anon;

create policy opportunities_select on public.opportunities for select to authenticated using (
  brand_id = any ((select app.brands_with('opportunities.read_all'))::uuid[])
  or brand_id = any ((select app.brands_with('opportunities.manage_all'))::uuid[])
  or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('opportunities.manage_own'))::uuid[]))
);
create policy opportunities_insert on public.opportunities for insert to authenticated with check (
  brand_id = any ((select app.brands_with('opportunities.manage_all'))::uuid[])
  or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('opportunities.manage_own'))::uuid[]))
);
create policy opportunities_update on public.opportunities for update to authenticated
  using (
    brand_id = any ((select app.brands_with('opportunities.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('opportunities.manage_own'))::uuid[]))
  )
  with check (
    brand_id = any ((select app.brands_with('opportunities.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('opportunities.manage_own'))::uuid[]))
  );

-- Échanges : visibles avec l'annuaire, saisis par les personnes qui gèrent les prospects,
-- modifiables et supprimables par leur auteur seulement.
create policy interactions_select on public.interactions for select to authenticated
  using (brand_id = any ((select app.brands_with('crm.read'))::uuid[]));
create policy interactions_insert on public.interactions for insert to authenticated with check (
  user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('crm.manage'))::uuid[])
);
create policy interactions_update on public.interactions for update to authenticated
  using (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('crm.manage'))::uuid[]))
  with check (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));
create policy interactions_delete on public.interactions for delete to authenticated
  using (user_id = (select auth.uid()) and brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));

create policy contracts_select on public.contracts for select to authenticated using (
  brand_id = any ((select app.brands_with('contracts.read_all'))::uuid[])
  or brand_id = any ((select app.brands_with('contracts.manage_all'))::uuid[])
  or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('contracts.manage_own'))::uuid[]))
);
create policy contracts_insert on public.contracts for insert to authenticated with check (
  brand_id = any ((select app.brands_with('contracts.manage_all'))::uuid[])
  or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('contracts.manage_own'))::uuid[]))
);
create policy contracts_update on public.contracts for update to authenticated
  using (
    brand_id = any ((select app.brands_with('contracts.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('contracts.manage_own'))::uuid[]))
  )
  with check (
    brand_id = any ((select app.brands_with('contracts.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('contracts.manage_own'))::uuid[]))
  );
