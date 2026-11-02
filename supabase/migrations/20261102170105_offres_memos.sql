-- Sprint 3 · Registres des offres et des mémos stratégiques
-- Offres et mémos partagent une table (commercial_documents, colonne kind) :
-- mêmes règles de sécurité, d'historique et de pièces jointes ; écrans distincts.
-- Prospects et contacts : version minimale, complétée par le module CRM (Sprint 4).

-- =====================================================================
-- Permissions
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('offers.read_all',   'offres', 'Voir toutes les offres de la marque'),
  ('offers.manage_all', 'offres', 'Créer et modifier toutes les offres'),
  ('offers.manage_own', 'offres', 'Créer et modifier ses propres offres'),
  ('memos.read_all',    'memos',  'Voir tous les mémos de la marque'),
  ('memos.manage_all',  'memos',  'Créer et modifier tous les mémos'),
  ('memos.manage_own',  'memos',  'Créer et modifier ses propres mémos'),
  ('crm.read',          'crm',    'Consulter les prospects et contacts'),
  ('crm.manage',        'crm',    'Créer et modifier les prospects et contacts');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.module in ('offres', 'memos', 'crm')
where r.key in ('super_admin', 'brand_admin')
   or (r.key = 'sales_manager' and p.key in (
        'offers.read_all', 'offers.manage_all', 'memos.read_all', 'memos.manage_all', 'crm.read', 'crm.manage'))
   or (r.key = 'sales_rep' and p.key in ('offers.manage_own', 'memos.manage_own', 'crm.read', 'crm.manage'))
   or (r.key in ('direction', 'viewer') and p.key in ('offers.read_all', 'memos.read_all', 'crm.read'))
   or (r.key = 'marketing' and p.key = 'crm.read');

-- =====================================================================
-- Prospects et contacts (version minimale)
-- =====================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  sector text check (sector is null or sector ~ '^[a-z][a-z0-9_]{1,40}$'),
  city text check (city is null or length(city) <= 120),
  country text check (country is null or length(country) <= 120),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 200),
  website text check (website is null or length(website) <= 300),
  owner_id uuid default auth.uid() references public.profiles (id) on delete set null,
  source text check (source is null or source ~ '^[a-z][a-z0-9_]{1,40}$'),
  status_id uuid,
  next_follow_up_on date,
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, status_id) references public.statuses (brand_id, id)
);
create index companies_brand_name_idx on public.companies (brand_id, lower(name));
create index companies_brand_status_idx on public.companies (brand_id, status_id);
create index companies_owner_idx on public.companies (owner_id);
create index companies_created_by_idx on public.companies (created_by);
create index companies_updated_by_idx on public.companies (updated_by);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  company_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  job_title text check (job_title is null or length(job_title) <= 120),
  email text check (email is null or length(email) <= 200),
  phone text check (phone is null or length(phone) <= 40),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, company_id) references public.companies (brand_id, id) on delete cascade
);
create index contacts_brand_company_idx on public.contacts (brand_id, company_id);
create index contacts_created_by_idx on public.contacts (created_by);
create index contacts_updated_by_idx on public.contacts (updated_by);

-- =====================================================================
-- Offres et mémos
-- =====================================================================

create table public.commercial_documents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  kind text not null check (kind in ('offer', 'memo')),
  -- Attribuée automatiquement : OF-CODE-2026-0001, MS-CODE-2026-0001.
  reference text not null,
  company_id uuid not null,
  contact_id uuid,
  owner_id uuid not null default auth.uid() references public.profiles (id),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  -- Date de création (offre) ou de rédaction (mémo).
  issued_on date not null default current_date,
  sent_on date,
  status_id uuid not null,
  follow_up_on date,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  currency text check (currency in ('XOF', 'USD', 'EUR')),
  valid_until date,
  recipient_response text check (recipient_response is null or length(recipient_response) <= 5000),
  comments text check (comments is null or length(comments) <= 5000),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, reference),
  unique (brand_id, id),
  foreign key (brand_id, company_id) references public.companies (brand_id, id),
  foreign key (brand_id, contact_id) references public.contacts (brand_id, id),
  foreign key (brand_id, status_id) references public.statuses (brand_id, id),
  -- Montant et validité : offres uniquement ; réponse du destinataire : mémos uniquement.
  check (kind = 'offer' or (amount is null and currency is null and valid_until is null)),
  check (kind = 'memo' or recipient_response is null),
  check ((amount is null) = (currency is null))
);
create index documents_brand_kind_issued_idx on public.commercial_documents (brand_id, kind, issued_on desc);
create index documents_brand_kind_follow_up_idx on public.commercial_documents (brand_id, kind, follow_up_on);
create index documents_brand_company_idx on public.commercial_documents (brand_id, company_id);
create index documents_brand_contact_idx on public.commercial_documents (brand_id, contact_id);
create index documents_brand_status_idx on public.commercial_documents (brand_id, status_id);
create index documents_owner_idx on public.commercial_documents (owner_id);
create index documents_created_by_idx on public.commercial_documents (created_by);
create index documents_updated_by_idx on public.commercial_documents (updated_by);

-- Chronologie métier : envoi, relances, changements de statut, commentaires…
create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  document_id uuid not null,
  type text not null check (type in (
    'created', 'updated', 'status_changed', 'sent', 'follow_up_scheduled', 'follow_up_done',
    'comment', 'attachment_added', 'attachment_removed', 'archived', 'restored'
  )),
  occurred_at timestamptz not null default now(),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  foreign key (brand_id, document_id) references public.commercial_documents (brand_id, id) on delete cascade
);
create index document_events_document_idx on public.document_events (brand_id, document_id, occurred_at desc);
create index document_events_actor_idx on public.document_events (actor_id);

create table public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  document_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 4194304),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (brand_id, document_id) references public.commercial_documents (brand_id, id) on delete cascade
);
create index document_attachments_document_idx on public.document_attachments (brand_id, document_id);
create index document_attachments_uploaded_by_idx on public.document_attachments (uploaded_by);

-- Compteurs des références : manipulés uniquement par les triggers.
create table public.reference_counters (
  brand_id uuid not null references public.brands (id) on delete cascade,
  kind text not null,
  year int not null,
  last_value int not null default 0,
  primary key (brand_id, kind, year)
);

-- =====================================================================
-- Droits sur un document (utilisé par les politiques et le stockage)
-- =====================================================================

create function app.can_manage_document(p_document uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commercial_documents d
    where d.id = p_document
      and (
        d.brand_id = any (app.brands_with(d.kind || 's.manage_all'))
        or (d.owner_id = (select auth.uid())
            and d.brand_id = any (app.brands_with(d.kind || 's.manage_own')))
      )
  );
$$;
revoke all on function app.can_manage_document(uuid) from public;
grant execute on function app.can_manage_document(uuid) to authenticated;

-- Chemin d'un fichier : {brand_id}/{document_id}/{nom}.
create function app.can_write_document_file(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if coalesce(array_length(v_parts, 1), 0) <> 2 or v_parts[1] !~ v_uuid or v_parts[2] !~ v_uuid then
    return false;
  end if;
  return exists (
      select 1 from public.commercial_documents d
      where d.id = v_parts[2]::uuid and d.brand_id = v_parts[1]::uuid
    )
    and app.can_manage_document(v_parts[2]::uuid);
end;
$$;
revoke all on function app.can_write_document_file(text) from public;
grant execute on function app.can_write_document_file(text) to authenticated;

-- Collaborateurs d'une marque, pour les listes de choix (commercial, responsable…).
create function app.brand_member_options(p_brand_id uuid)
returns table (user_id uuid, label text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email)
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.brand_id = p_brand_id
    and p_brand_id = any (app.brands_with('brand.read'))
  order by 2;
$$;
revoke all on function app.brand_member_options(uuid) from public;
grant execute on function app.brand_member_options(uuid) to authenticated;

create function public.brand_member_options(p_brand_id uuid)
returns table (user_id uuid, label text)
language sql stable security invoker
set search_path = ''
as $$
  select * from app.brand_member_options(p_brand_id);
$$;
revoke all on function public.brand_member_options(uuid) from public, anon;
grant execute on function public.brand_member_options(uuid) to authenticated;

-- =====================================================================
-- Garde-fous et automatismes
-- =====================================================================

create function app.is_brand_member(p_user uuid, p_brand uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.is_active
    where m.user_id = p_user and (m.brand_id = p_brand or m.brand_id is null)
  );
$$;
revoke all on function app.is_brand_member(uuid, uuid) from public;

create function app.prepare_company()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status_id is null then
      select id into new.status_id from public.statuses
       where brand_id = new.brand_id and entity = 'company' and is_default;
    end if;
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un prospect ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  if new.status_id is not null and not exists (
    select 1 from public.statuses s
    where s.id = new.status_id and s.brand_id = new.brand_id and s.entity = 'company'
  ) then
    raise exception 'Statut de prospect invalide.' using errcode = 'check_violation';
  end if;
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not app.is_brand_member(new.owner_id, new.brand_id) then
    raise exception 'Le responsable doit être un collaborateur de la marque.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.prepare_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un contact ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create function app.prepare_document()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status record;
  v_code text;
  v_year int;
  v_number int;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.owner_id := coalesce(new.owner_id, auth.uid());
    if new.status_id is null then
      select id into new.status_id from public.statuses
       where brand_id = new.brand_id and entity = new.kind and is_default;
    end if;

    select code into v_code from public.brands where id = new.brand_id;
    v_year := extract(year from new.issued_on)::int;
    insert into public.reference_counters as c (brand_id, kind, year, last_value)
    values (new.brand_id, new.kind, v_year, 1)
    on conflict (brand_id, kind, year) do update set last_value = c.last_value + 1
    returning last_value into v_number;
    new.reference := case new.kind when 'offer' then 'OF' else 'MS' end
      || '-' || v_code || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
  else
    if new.reference is distinct from old.reference or new.kind is distinct from old.kind
       or new.brand_id is distinct from old.brand_id then
      raise exception 'La référence, le type et la marque d''un document sont figés.'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  select s.entity, s.is_active into v_status from public.statuses s
   where s.id = new.status_id and s.brand_id = new.brand_id;
  if v_status.entity is distinct from new.kind then
    raise exception 'Statut invalide pour ce document.' using errcode = 'check_violation';
  end if;
  if not v_status.is_active and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id) then
    raise exception 'Ce statut est désactivé.' using errcode = 'check_violation';
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

create function app.validate_document_custom()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_errors text[];
begin
  v_errors := app.custom_values_errors(
    new.brand_id, new.kind, new.custom,
    case when tg_op = 'UPDATE' then old.custom end
  );
  if cardinality(v_errors) > 0 then
    raise exception '%', array_to_string(v_errors, ' ') using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Chronologie automatique.
create function app.log_document_events()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_changed text[];
  v_from text;
  v_to text;
begin
  if tg_op = 'INSERT' then
    select label into v_to from public.statuses where id = new.status_id;
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.id, 'created', jsonb_build_object('status', v_to));
    if new.sent_on is not null then
      insert into public.document_events (brand_id, document_id, type, payload)
      values (new.brand_id, new.id, 'sent', jsonb_build_object('date', new.sent_on));
    end if;
    if new.follow_up_on is not null then
      insert into public.document_events (brand_id, document_id, type, payload)
      values (new.brand_id, new.id, 'follow_up_scheduled', jsonb_build_object('date', new.follow_up_on));
    end if;
    return null;
  end if;

  if new.status_id is distinct from old.status_id then
    select label into v_from from public.statuses where id = old.status_id;
    select label into v_to from public.statuses where id = new.status_id;
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.id, 'status_changed', jsonb_build_object('from', v_from, 'to', v_to));
  end if;
  if new.sent_on is distinct from old.sent_on and new.sent_on is not null then
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.id, 'sent', jsonb_build_object('date', new.sent_on));
  end if;
  if new.follow_up_on is distinct from old.follow_up_on and new.follow_up_on is not null then
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.id, 'follow_up_scheduled', jsonb_build_object('date', new.follow_up_on));
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.document_events (brand_id, document_id, type)
    values (new.brand_id, new.id, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;

  v_changed := array_remove(array[
    case when new.subject is distinct from old.subject then 'subject' end,
    case when new.company_id is distinct from old.company_id then 'company' end,
    case when new.contact_id is distinct from old.contact_id then 'contact' end,
    case when new.owner_id is distinct from old.owner_id then 'owner' end,
    case when new.issued_on is distinct from old.issued_on then 'issued_on' end,
    case when new.amount is distinct from old.amount or new.currency is distinct from old.currency then 'amount' end,
    case when new.valid_until is distinct from old.valid_until then 'valid_until' end,
    case when new.recipient_response is distinct from old.recipient_response then 'recipient_response' end,
    case when new.comments is distinct from old.comments then 'comments' end,
    case when new.custom is distinct from old.custom then 'custom' end
  ], null);
  if cardinality(v_changed) > 0 then
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.id, 'updated', jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;
  return null;
end;
$$;

create function app.log_attachment_events()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.document_events (brand_id, document_id, type, payload)
    values (new.brand_id, new.document_id, 'attachment_added', jsonb_build_object('file_name', new.file_name));
  elsif exists (select 1 from public.commercial_documents d where d.id = old.document_id) then
    insert into public.document_events (brand_id, document_id, type, payload)
    values (old.brand_id, old.document_id, 'attachment_removed', jsonb_build_object('file_name', old.file_name));
  end if;
  return null;
end;
$$;

revoke all on function app.prepare_company() from public;
revoke all on function app.prepare_contact() from public;
revoke all on function app.prepare_document() from public;
revoke all on function app.validate_document_custom() from public;
revoke all on function app.log_document_events() from public;
revoke all on function app.log_attachment_events() from public;

create trigger companies_prepare before insert or update on public.companies
  for each row execute function app.prepare_company();
create trigger companies_custom before insert or update on public.companies
  for each row execute function app.validate_custom_values('company');
create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function app.audit('brand_id');

create trigger contacts_prepare before insert or update on public.contacts
  for each row execute function app.prepare_contact();
create trigger contacts_custom before insert or update on public.contacts
  for each row execute function app.validate_custom_values('contact');
create trigger contacts_audit after insert or update or delete on public.contacts
  for each row execute function app.audit('brand_id');

create trigger documents_prepare before insert or update on public.commercial_documents
  for each row execute function app.prepare_document();
create trigger documents_custom before insert or update on public.commercial_documents
  for each row execute function app.validate_document_custom();
create trigger documents_events after insert or update on public.commercial_documents
  for each row execute function app.log_document_events();
create trigger documents_audit after insert or update or delete on public.commercial_documents
  for each row execute function app.audit('brand_id');

create trigger attachments_events after insert or delete on public.document_attachments
  for each row execute function app.log_attachment_events();
create trigger attachments_audit after insert or delete on public.document_attachments
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.commercial_documents enable row level security;
alter table public.document_events enable row level security;
alter table public.document_attachments enable row level security;
alter table public.reference_counters enable row level security;

revoke all on public.companies, public.contacts, public.commercial_documents,
  public.document_events, public.document_attachments, public.reference_counters from anon;
revoke all on public.reference_counters from authenticated;
revoke update, truncate on public.document_events from authenticated;
revoke update, truncate on public.document_attachments from authenticated;

create policy companies_select on public.companies for select to authenticated
  using (brand_id = any ((select app.brands_with('crm.read'))::uuid[]));
create policy companies_insert on public.companies for insert to authenticated
  with check (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));
create policy companies_update on public.companies for update to authenticated
  using (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));

create policy contacts_select on public.contacts for select to authenticated
  using (brand_id = any ((select app.brands_with('crm.read'))::uuid[]));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));
create policy contacts_update on public.contacts for update to authenticated
  using (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('crm.manage'))::uuid[]));

-- Lecture : tout le registre (read_all), ou ses propres documents (manage_own).
create policy documents_select on public.commercial_documents for select to authenticated using (
  (kind = 'offer' and (
    brand_id = any ((select app.brands_with('offers.read_all'))::uuid[])
    or brand_id = any ((select app.brands_with('offers.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('offers.manage_own'))::uuid[]))
  ))
  or (kind = 'memo' and (
    brand_id = any ((select app.brands_with('memos.read_all'))::uuid[])
    or brand_id = any ((select app.brands_with('memos.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('memos.manage_own'))::uuid[]))
  ))
);
-- Écriture : tout le registre (manage_all), ou ses propres documents (manage_own).
create policy documents_insert on public.commercial_documents for insert to authenticated with check (
  (kind = 'offer' and (
    brand_id = any ((select app.brands_with('offers.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('offers.manage_own'))::uuid[]))
  ))
  or (kind = 'memo' and (
    brand_id = any ((select app.brands_with('memos.manage_all'))::uuid[])
    or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('memos.manage_own'))::uuid[]))
  ))
);
create policy documents_update on public.commercial_documents for update to authenticated
  using (
    (kind = 'offer' and (
      brand_id = any ((select app.brands_with('offers.manage_all'))::uuid[])
      or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('offers.manage_own'))::uuid[]))
    ))
    or (kind = 'memo' and (
      brand_id = any ((select app.brands_with('memos.manage_all'))::uuid[])
      or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('memos.manage_own'))::uuid[]))
    ))
  )
  with check (
    (kind = 'offer' and (
      brand_id = any ((select app.brands_with('offers.manage_all'))::uuid[])
      or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('offers.manage_own'))::uuid[]))
    ))
    or (kind = 'memo' and (
      brand_id = any ((select app.brands_with('memos.manage_all'))::uuid[])
      or (owner_id = (select auth.uid()) and brand_id = any ((select app.brands_with('memos.manage_own'))::uuid[]))
    ))
  );

-- Chronologie et pièces jointes : visibles si le document l'est.
create policy document_events_select on public.document_events for select to authenticated using (
  exists (select 1 from public.commercial_documents d where d.id = document_events.document_id)
);
create policy document_events_insert on public.document_events for insert to authenticated with check (
  type in ('comment', 'follow_up_done')
  and actor_id = (select auth.uid())
  and app.can_manage_document(document_id)
);

create policy document_attachments_select on public.document_attachments for select to authenticated using (
  exists (select 1 from public.commercial_documents d where d.id = document_attachments.document_id)
);
create policy document_attachments_insert on public.document_attachments for insert to authenticated with check (
  app.can_manage_document(document_id)
  and storage_path like brand_id::text || '/' || document_id::text || '/%'
);
create policy document_attachments_delete on public.document_attachments for delete to authenticated
  using (app.can_manage_document(document_id));

-- =====================================================================
-- Stockage privé des pièces jointes
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 4194304,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

create policy attachments_objects_select on storage.objects for select to authenticated using (
  bucket_id = 'attachments'
  and exists (select 1 from public.document_attachments a where a.storage_path = storage.objects.name)
);
create policy attachments_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and app.can_write_document_file(name)
);
create policy attachments_objects_delete on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and app.can_write_document_file(name)
);
