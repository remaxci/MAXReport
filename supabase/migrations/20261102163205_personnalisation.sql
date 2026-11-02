-- Sprint 2 · Personnalisation sans code
-- Voir docs/architecture.md, section 5. La personnalisation est de la donnée :
-- aucun écran ne modifie le schéma SQL.

-- =====================================================================
-- Permissions
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('settings.manage', 'noyau', 'Paramétrer la marque : listes, statuts, pipeline, champs'),
  ('modules.manage',  'noyau', 'Activer ou désactiver les modules d''une marque');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in ('settings.manage', 'modules.manage')
where r.key = 'super_admin'
   or (r.key = 'brand_admin' and p.key = 'settings.manage');

-- =====================================================================
-- Modules
-- =====================================================================

create table public.modules (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  group_label text not null,
  position int not null default 0
);

insert into public.modules (key, label, group_label, position) values
  ('social',     'Réseaux sociaux',             'Marketing',  10),
  ('campaigns',  'Campagnes',                   'Marketing',  20),
  ('websites',   'Sites web',                   'Marketing',  30),
  ('activities', 'Activités hebdomadaires',     'Commercial', 40),
  ('crm',        'Prospects et opportunités',   'Commercial', 50),
  ('offers',     'Offres',                      'Commercial', 60),
  ('memos',      'Mémos stratégiques',          'Commercial', 70),
  ('contracts',  'Contrats',                    'Commercial', 80),
  ('objectives', 'Objectifs',                   'Gestion',    90),
  ('budgets',    'Budgets',                     'Gestion',   100),
  ('reports',    'Rapports',                    'Gestion',   110),
  ('imports',    'Imports',                     'Gestion',   120);

create table public.brand_modules (
  brand_id uuid not null references public.brands (id) on delete cascade,
  module_key text not null references public.modules (key) on delete cascade,
  enabled boolean not null default true,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (brand_id, module_key)
);
create index brand_modules_module_idx on public.brand_modules (module_key);

-- =====================================================================
-- Listes déroulantes
-- =====================================================================

create table public.option_lists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  -- Listes utilisées par les modules : non supprimables.
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key),
  unique (brand_id, id)
);

create table public.option_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  list_id uuid not null,
  value text not null check (value ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, list_id) references public.option_lists (brand_id, id) on delete cascade,
  unique (list_id, value)
);
create index option_items_brand_list_idx on public.option_items (brand_id, list_id, position);

-- =====================================================================
-- Statuts (les calculs s'appuient sur la catégorie, jamais sur le libellé)
-- =====================================================================

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  entity text not null check (entity in ('company', 'offer', 'memo')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  category text not null check (category in ('draft', 'active', 'success', 'failure', 'closed')),
  position int not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, entity, key),
  unique (brand_id, id)
);
create unique index statuses_one_default_idx on public.statuses (brand_id, entity) where is_default;
create index statuses_brand_entity_idx on public.statuses (brand_id, entity, position);

-- =====================================================================
-- Étapes du pipeline commercial
-- =====================================================================

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  category text not null check (category in ('open', 'won', 'lost')),
  probability int not null default 0 check (probability between 0 and 100),
  position int not null default 0,
  -- Étapes « gagnée » et « perdue » d'origine : toujours actives.
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key),
  unique (brand_id, id)
);
create index pipeline_stages_brand_idx on public.pipeline_stages (brand_id, position);

-- =====================================================================
-- Champs personnalisés
-- =====================================================================

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  entity text not null check (entity in (
    'company', 'contact', 'opportunity', 'offer', 'memo', 'contract',
    'weekly_report', 'campaign', 'expense'
  )),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  help_text text check (help_text is null or length(help_text) <= 200),
  type text not null check (type in (
    'text', 'long_text', 'number', 'money', 'date', 'boolean',
    'select', 'multiselect', 'user', 'url', 'email', 'phone'
  )),
  options_list_id uuid,
  required boolean not null default false,
  -- Règles autorisées : min, max (nombres, montants), max_length (textes).
  validation jsonb not null default '{}' check (
    jsonb_typeof(validation) = 'object'
    and (validation - array['min', 'max', 'max_length']) = '{}'::jsonb
  ),
  -- Permission nécessaire pour modifier la valeur (null = droits sur l'enregistrement).
  write_permission text references public.permissions (key),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (brand_id, options_list_id) references public.option_lists (brand_id, id),
  check ((type in ('select', 'multiselect')) = (options_list_id is not null)),
  unique (brand_id, entity, key)
);
create index custom_fields_brand_entity_idx on public.custom_field_definitions (brand_id, entity, position);
create index custom_fields_list_idx on public.custom_field_definitions (brand_id, options_list_id);
create index custom_fields_write_permission_idx on public.custom_field_definitions (write_permission);
create index custom_fields_created_by_idx on public.custom_field_definitions (created_by);

-- =====================================================================
-- Garde-fous
-- =====================================================================

-- Clés et natures figées : les données et les calculs en dépendent.
create function app.guard_config_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_column text;
begin
  foreach v_column in array tg_argv loop
    if v_new -> v_column is distinct from v_old -> v_column then
      raise exception 'Ce paramètre ne peut plus être modifié après sa création (%).', v_column
        using errcode = 'check_violation';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;

create function app.guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default and not new.is_active then
    raise exception 'Le statut par défaut ne peut pas être désactivé.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.guard_pipeline_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_system and not new.is_active then
    raise exception 'Les étapes « gagnée » et « perdue » d''origine restent actives.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.guard_custom_field()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and (select count(*) from public.custom_field_definitions d
        where d.brand_id = new.brand_id and d.entity = new.entity and d.is_active
          and d.id <> new.id) >= 50 then
    raise exception 'Au plus 50 champs personnalisés actifs par type de fiche.'
      using errcode = 'check_violation';
  end if;
  if (new.validation ? 'min' and jsonb_typeof(new.validation -> 'min') <> 'number')
     or (new.validation ? 'max' and jsonb_typeof(new.validation -> 'max') <> 'number')
     or (new.validation ? 'max_length' and jsonb_typeof(new.validation -> 'max_length') <> 'number') then
    raise exception 'Règles de validation invalides.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.guard_system_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system then
    raise exception 'Une liste utilisée par les modules ne peut pas être supprimée.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

-- =====================================================================
-- Validation des valeurs personnalisées
-- Renvoie la liste des erreurs (vide si tout est valide). Utilisée par le
-- trigger app.validate_custom_values(), posé sur chaque table métier.
-- Règle « obligatoire » : à la création ; en modification, seulement si la
-- valeur existante est vidée (un nouveau champ obligatoire ne bloque pas
-- les fiches anciennes).
-- =====================================================================

create function app.custom_values_errors(
  p_brand uuid,
  p_entity text,
  p_new jsonb,
  p_old jsonb default null
)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_errors text[] := '{}';
  v_def public.custom_field_definitions%rowtype;
  v_key text;
  v_val jsonb;
  v_old_val jsonb;
  v_empty boolean;
  v_item jsonb;
  v_text text;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'object' then
    return array['Valeurs personnalisées invalides.'];
  end if;

  for v_key in select jsonb_object_keys(p_new) loop
    if not exists (
      select 1 from public.custom_field_definitions d
      where d.brand_id = p_brand and d.entity = p_entity and d.key = v_key
    ) then
      v_errors := v_errors || format('Champ inconnu : %s.', v_key);
    end if;
  end loop;

  for v_def in
    select * from public.custom_field_definitions d
    where d.brand_id = p_brand and d.entity = p_entity
    order by d.position
  loop
    v_val := p_new -> v_def.key;
    v_old_val := p_old -> v_def.key;
    v_empty := v_val is null or v_val in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);

    -- Droit de modification propre au champ.
    if v_def.write_permission is not null
       and v_val is distinct from v_old_val
       and auth.uid() is not null
       and not (p_brand = any (app.brands_with(v_def.write_permission))) then
      v_errors := v_errors || format('Vous ne pouvez pas modifier « %s ».', v_def.label);
    end if;

    if not v_def.is_active then
      continue;
    end if;

    if v_empty then
      if v_def.required and (
        p_old is null
        or not (v_old_val is null or v_old_val in ('null'::jsonb, '""'::jsonb, '[]'::jsonb))
      ) then
        v_errors := v_errors || format('« %s » est obligatoire.', v_def.label);
      end if;
      continue;
    end if;

    case v_def.type
      when 'text', 'long_text', 'url', 'email', 'phone' then
        if jsonb_typeof(v_val) <> 'string' then
          v_errors := v_errors || format('« %s » doit être un texte.', v_def.label);
          continue;
        end if;
        v_text := v_val #>> '{}';
        if v_def.validation ? 'max_length'
           and length(v_text) > (v_def.validation ->> 'max_length')::numeric then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        elsif v_def.type = 'email' and v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          v_errors := v_errors || format('« %s » n''est pas un e-mail valide.', v_def.label);
        elsif v_def.type = 'url' and v_text !~ '^https?://[^[:space:]]+$' then
          v_errors := v_errors || format('« %s » doit commencer par http:// ou https://.', v_def.label);
        elsif v_def.type = 'phone' and v_text !~ '^[+0-9 ().-]{6,30}$' then
          v_errors := v_errors || format('« %s » n''est pas un numéro valide.', v_def.label);
        elsif v_def.type in ('text', 'url', 'email', 'phone') and length(v_text) > 500 then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        elsif v_def.type = 'long_text' and length(v_text) > 5000 then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        end if;

      when 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          v_errors := v_errors || format('« %s » doit être un nombre.', v_def.label);
        elsif v_def.validation ? 'min' and (v_val #>> '{}')::numeric < (v_def.validation ->> 'min')::numeric then
          v_errors := v_errors || format('« %s » est trop petit.', v_def.label);
        elsif v_def.validation ? 'max' and (v_val #>> '{}')::numeric > (v_def.validation ->> 'max')::numeric then
          v_errors := v_errors || format('« %s » est trop grand.', v_def.label);
        end if;

      when 'money' then
        if jsonb_typeof(v_val) <> 'object'
           or jsonb_typeof(v_val -> 'amount') <> 'number'
           or coalesce(v_val ->> 'currency', '') not in ('XOF', 'USD', 'EUR')
           or (v_val - array['amount', 'currency']) <> '{}'::jsonb then
          v_errors := v_errors || format('« %s » doit être un montant avec sa devise.', v_def.label);
        elsif v_def.validation ? 'min' and (v_val ->> 'amount')::numeric < (v_def.validation ->> 'min')::numeric then
          v_errors := v_errors || format('« %s » est trop petit.', v_def.label);
        elsif v_def.validation ? 'max' and (v_val ->> 'amount')::numeric > (v_def.validation ->> 'max')::numeric then
          v_errors := v_errors || format('« %s » est trop grand.', v_def.label);
        end if;

      when 'date' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          v_errors := v_errors || format('« %s » doit être une date.', v_def.label);
        else
          begin
            perform (v_val #>> '{}')::date;
          exception when others then
            v_errors := v_errors || format('« %s » doit être une date.', v_def.label);
          end;
        end if;

      when 'boolean' then
        if jsonb_typeof(v_val) <> 'boolean' then
          v_errors := v_errors || format('« %s » doit valoir oui ou non.', v_def.label);
        end if;

      when 'select' then
        if jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from public.option_items i
          where i.list_id = v_def.options_list_id and i.value = (v_val #>> '{}') and i.is_active
        ) then
          v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
        end if;

      when 'multiselect' then
        if jsonb_typeof(v_val) <> 'array' then
          v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
        else
          for v_item in select jsonb_array_elements(v_val) loop
            if jsonb_typeof(v_item) <> 'string' or not exists (
              select 1 from public.option_items i
              where i.list_id = v_def.options_list_id and i.value = (v_item #>> '{}') and i.is_active
            ) then
              v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
              exit;
            end if;
          end loop;
        end if;

      when 'user' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1 from public.memberships m
             where m.user_id = (v_val #>> '{}')::uuid
               and (m.brand_id = p_brand or m.brand_id is null)
           ) then
          v_errors := v_errors || format('« %s » : collaborateur inconnu pour cette marque.', v_def.label);
        end if;
    end case;
  end loop;

  return v_errors;
end;
$$;

revoke all on function app.custom_values_errors(uuid, text, jsonb, jsonb) from public;
grant execute on function app.custom_values_errors(uuid, text, jsonb, jsonb) to authenticated;

-- À poser sur chaque table métier : execute function app.validate_custom_values('offer').
create function app.validate_custom_values()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_errors text[];
begin
  v_errors := app.custom_values_errors(
    new.brand_id,
    tg_argv[0],
    coalesce(to_jsonb(new) -> 'custom', '{}'::jsonb),
    case when tg_op = 'UPDATE' then coalesce(to_jsonb(old) -> 'custom', '{}'::jsonb) end
  );
  if cardinality(v_errors) > 0 then
    raise exception '%', array_to_string(v_errors, ' ') using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function app.guard_config_update() from public;
revoke all on function app.guard_status() from public;
revoke all on function app.guard_pipeline_stage() from public;
revoke all on function app.guard_custom_field() from public;
revoke all on function app.guard_system_list() from public;
revoke all on function app.validate_custom_values() from public;

-- =====================================================================
-- Valeurs par défaut d'une marque
-- =====================================================================

create function app.seed_brand_defaults(p_brand uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.brand_modules (brand_id, module_key)
  select p_brand, m.key from public.modules m
  on conflict do nothing;

  insert into public.option_lists (brand_id, key, label, is_system) values
    (p_brand, 'lead_sources',        'Sources de prospects',   true),
    (p_brand, 'industries',          'Secteurs d''activité',   true),
    (p_brand, 'campaign_objectives', 'Objectifs de campagne',  true),
    (p_brand, 'expense_categories',  'Catégories de dépenses', true)
  on conflict (brand_id, key) do nothing;

  insert into public.option_items (brand_id, list_id, value, label, position)
  select p_brand, l.id, v.value, v.label, v.position
  from public.option_lists l
  join (values
    ('lead_sources', 'recommandation', 'Recommandation', 10),
    ('lead_sources', 'site_web', 'Site web', 20),
    ('lead_sources', 'reseaux_sociaux', 'Réseaux sociaux', 30),
    ('lead_sources', 'evenement', 'Salon ou événement', 40),
    ('lead_sources', 'prospection', 'Prospection directe', 50),
    ('lead_sources', 'partenaire', 'Partenaire', 60),
    ('lead_sources', 'autre', 'Autre', 70),
    ('industries', 'immobilier', 'Immobilier', 10),
    ('industries', 'banque_assurance', 'Banque et assurance', 20),
    ('industries', 'industrie', 'Industrie', 30),
    ('industries', 'commerce', 'Commerce et distribution', 40),
    ('industries', 'services', 'Services', 50),
    ('industries', 'secteur_public', 'Secteur public', 60),
    ('industries', 'autre', 'Autre', 70),
    ('campaign_objectives', 'notoriete', 'Notoriété', 10),
    ('campaign_objectives', 'trafic', 'Trafic', 20),
    ('campaign_objectives', 'engagement', 'Engagement', 30),
    ('campaign_objectives', 'leads', 'Génération de leads', 40),
    ('campaign_objectives', 'conversions', 'Conversions', 50),
    ('expense_categories', 'media', 'Média payant', 10),
    ('expense_categories', 'contenu', 'Production de contenu', 20),
    ('expense_categories', 'evenementiel', 'Événementiel', 30),
    ('expense_categories', 'impression', 'Impression', 40),
    ('expense_categories', 'outils', 'Outils et logiciels', 50),
    ('expense_categories', 'prestataires', 'Prestataires', 60),
    ('expense_categories', 'autre', 'Autre', 70)
  ) as v(list_key, value, label, position) on v.list_key = l.key
  where l.brand_id = p_brand
  on conflict (list_id, value) do nothing;

  insert into public.statuses (brand_id, entity, key, label, category, color, position, is_default) values
    (p_brand, 'company', 'nouveau',  'Nouveau',  'draft',   '#94a3b8', 10, true),
    (p_brand, 'company', 'contacte', 'Contacté', 'active',  '#3b82f6', 20, false),
    (p_brand, 'company', 'qualifie', 'Qualifié', 'active',  '#6366f1', 30, false),
    (p_brand, 'company', 'client',   'Client',   'success', '#16a34a', 40, false),
    (p_brand, 'company', 'perdu',    'Perdu',    'failure', '#dc2626', 50, false),
    (p_brand, 'offer', 'brouillon',       'Brouillon',       'draft',   '#94a3b8', 10, true),
    (p_brand, 'offer', 'envoyee',         'Envoyée',         'active',  '#3b82f6', 20, false),
    (p_brand, 'offer', 'relance_prevue',  'Relance prévue',  'active',  '#f59e0b', 30, false),
    (p_brand, 'offer', 'en_negociation',  'En négociation',  'active',  '#6366f1', 40, false),
    (p_brand, 'offer', 'acceptee',        'Acceptée',        'success', '#16a34a', 50, false),
    (p_brand, 'offer', 'refusee',         'Refusée',         'failure', '#dc2626', 60, false),
    (p_brand, 'offer', 'expiree',         'Expirée',         'failure', '#64748b', 70, false),
    (p_brand, 'memo', 'en_preparation',   'En préparation',        'draft',   '#94a3b8', 10, true),
    (p_brand, 'memo', 'envoye',           'Envoyé',                'active',  '#3b82f6', 20, false),
    (p_brand, 'memo', 'attente_reponse',  'En attente de réponse', 'active',  '#6366f1', 30, false),
    (p_brand, 'memo', 'relance_prevue',   'Relance prévue',        'active',  '#f59e0b', 40, false),
    (p_brand, 'memo', 'reponse_recue',    'Réponse reçue',         'success', '#16a34a', 50, false),
    (p_brand, 'memo', 'cloture',          'Clôturé',               'closed',  '#64748b', 60, false)
  on conflict (brand_id, entity, key) do nothing;

  insert into public.pipeline_stages (brand_id, key, label, category, probability, position, is_system) values
    (p_brand, 'qualification', 'Qualification', 'open',  10,  10, false),
    (p_brand, 'proposition',   'Proposition',   'open',  40,  20, false),
    (p_brand, 'negociation',   'Négociation',   'open',  70,  30, false),
    (p_brand, 'gagnee',        'Gagnée',        'won',   100, 40, true),
    (p_brand, 'perdue',        'Perdue',        'lost',  0,   50, true)
  on conflict (brand_id, key) do nothing;
end;
$$;
revoke all on function app.seed_brand_defaults(uuid) from public, authenticated;

create function app.handle_new_brand()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.seed_brand_defaults(new.id);
  return null;
end;
$$;
revoke all on function app.handle_new_brand() from public;

-- Réordonne des éléments de paramétrage (droits de l'appelant : RLS appliquée).
create function public.reorder_config(p_table text, p_brand_id uuid, p_ids uuid[])
returns void
language plpgsql security invoker
set search_path = ''
as $$
begin
  if p_table not in ('option_items', 'statuses', 'pipeline_stages', 'custom_field_definitions') then
    raise exception 'Table non autorisée.' using errcode = 'insufficient_privilege';
  end if;
  execute format(
    'update public.%I t set position = x.ord * 10
       from unnest($1::uuid[]) with ordinality as x(id, ord)
      where t.id = x.id and t.brand_id = $2',
    p_table
  ) using p_ids, p_brand_id;
end;
$$;
revoke all on function public.reorder_config(text, uuid, uuid[]) from public, anon;
grant execute on function public.reorder_config(text, uuid, uuid[]) to authenticated;

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger brands_seed_defaults after insert on public.brands
  for each row execute function app.handle_new_brand();

create trigger brand_modules_guard before update on public.brand_modules
  for each row execute function app.guard_config_update('brand_id', 'module_key');
create trigger option_lists_guard before update on public.option_lists
  for each row execute function app.guard_config_update('brand_id', 'key', 'is_system');
create trigger option_lists_guard_delete before delete on public.option_lists
  for each row execute function app.guard_system_list();
create trigger option_items_guard before update on public.option_items
  for each row execute function app.guard_config_update('brand_id', 'list_id', 'value');
create trigger statuses_guard before update on public.statuses
  for each row execute function app.guard_config_update('brand_id', 'entity', 'key', 'category');
create trigger statuses_check before insert or update on public.statuses
  for each row execute function app.guard_status();
create trigger pipeline_stages_guard before update on public.pipeline_stages
  for each row execute function app.guard_config_update('brand_id', 'key', 'category', 'is_system');
create trigger pipeline_stages_check before insert or update on public.pipeline_stages
  for each row execute function app.guard_pipeline_stage();
create trigger custom_fields_guard before update on public.custom_field_definitions
  for each row execute function app.guard_config_update('brand_id', 'entity', 'key', 'type', 'options_list_id');
create trigger custom_fields_check before insert or update on public.custom_field_definitions
  for each row execute function app.guard_custom_field();

create trigger brand_modules_audit after update on public.brand_modules
  for each row execute function app.audit('brand_id');
create trigger option_lists_audit after insert or update or delete on public.option_lists
  for each row execute function app.audit('brand_id');
create trigger option_items_audit after insert or update or delete on public.option_items
  for each row execute function app.audit('brand_id');
create trigger statuses_audit after insert or update or delete on public.statuses
  for each row execute function app.audit('brand_id');
create trigger pipeline_stages_audit after insert or update or delete on public.pipeline_stages
  for each row execute function app.audit('brand_id');
create trigger custom_fields_audit after insert or update or delete on public.custom_field_definitions
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.modules enable row level security;
alter table public.brand_modules enable row level security;
alter table public.option_lists enable row level security;
alter table public.option_items enable row level security;
alter table public.statuses enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.custom_field_definitions enable row level security;

revoke all on public.modules, public.brand_modules, public.option_lists, public.option_items,
  public.statuses, public.pipeline_stages, public.custom_field_definitions from anon;
revoke insert, update, delete, truncate on public.modules from authenticated;

create policy modules_select on public.modules for select to authenticated using (true);

create policy brand_modules_select on public.brand_modules for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy brand_modules_update on public.brand_modules for update to authenticated
  using ((select app.has_global_permission('modules.manage')))
  with check ((select app.has_global_permission('modules.manage')));

-- Paramétrage : lisible par toute personne ayant accès à la marque,
-- modifiable avec settings.manage. Pas de suppression (désactivation),
-- sauf les listes personnalisées.
create policy option_lists_select on public.option_lists for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy option_lists_insert on public.option_lists for insert to authenticated
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]) and not is_system);
create policy option_lists_update on public.option_lists for update to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));
create policy option_lists_delete on public.option_lists for delete to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]) and not is_system);

create policy option_items_select on public.option_items for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy option_items_insert on public.option_items for insert to authenticated
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));
create policy option_items_update on public.option_items for update to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));

create policy statuses_select on public.statuses for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy statuses_insert on public.statuses for insert to authenticated
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));
create policy statuses_update on public.statuses for update to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));

create policy pipeline_stages_select on public.pipeline_stages for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]) and not is_system);
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));

create policy custom_fields_select on public.custom_field_definitions for select to authenticated
  using (brand_id = any ((select app.brands_with('brand.read'))::uuid[]));
create policy custom_fields_insert on public.custom_field_definitions for insert to authenticated
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));
create policy custom_fields_update on public.custom_field_definitions for update to authenticated
  using (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('settings.manage'))::uuid[]));

-- =====================================================================
-- Marques existantes
-- =====================================================================

select app.seed_brand_defaults(id) from public.brands;
