-- Sprint 10 · Planification : projets, jalons, tâches et leur chronologie.
-- Lecture : planning.read ; écriture : planning.manage. Le responsable d'une
-- tâche (avec planning.read) en change le statut et l'avancement, et la
-- commente ; la base refuse toute autre modification de sa part.
-- Statuts de tâche paramétrables par marque (entité « task » de statuses) :
-- les calculs (terminé, en retard) s'appuient sur la catégorie.

-- =====================================================================
-- Module et permissions
-- =====================================================================

insert into public.modules (key, label, group_label, position) values
  ('planning', 'Planification', 'Gestion', 85);

insert into public.permissions (key, module, label) values
  ('planning.read',   'planification', 'Voir les projets et les tâches de la marque'),
  ('planning.manage', 'planification', 'Créer et modifier projets, jalons et tâches');

insert into public.role_permissions (role_id, permission)
select r.id, p.key
from public.roles r
join public.permissions p on p.module = 'planification'
where r.key in ('super_admin', 'brand_admin', 'sales_manager', 'marketing')
   or (r.key in ('sales_rep', 'direction', 'viewer') and p.key = 'planning.read');

-- =====================================================================
-- Statuts de tâche et champs personnalisés
-- =====================================================================

alter table public.statuses drop constraint statuses_entity_check;
alter table public.statuses add constraint statuses_entity_check
  check (entity in ('company', 'offer', 'memo', 'task'));

alter table public.custom_field_definitions drop constraint custom_field_definitions_entity_check;
alter table public.custom_field_definitions add constraint custom_field_definitions_entity_check
  check (entity in (
    'company', 'contact', 'opportunity', 'offer', 'memo', 'contract',
    'weekly_report', 'campaign', 'expense', 'project', 'task'
  ));

create or replace function app.seed_brand_defaults(p_brand uuid)
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
    (p_brand, 'memo', 'cloture',          'Clôturé',               'closed',  '#64748b', 60, false),
    (p_brand, 'task', 'a_faire',  'À faire',  'draft',   '#94a3b8', 10, true),
    (p_brand, 'task', 'en_cours', 'En cours', 'active',  '#3b82f6', 20, false),
    (p_brand, 'task', 'en_revue', 'En revue', 'active',  '#6366f1', 30, false),
    (p_brand, 'task', 'termine',  'Terminé',  'success', '#16a34a', 40, false),
    (p_brand, 'task', 'annule',   'Annulé',   'closed',  '#64748b', 50, false)
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

-- Marques existantes : module et statuts de tâche seulement.
insert into public.brand_modules (brand_id, module_key)
select b.id, 'planning' from public.brands b
on conflict do nothing;

insert into public.statuses (brand_id, entity, key, label, category, color, position, is_default)
select b.id, 'task', v.key, v.label, v.category, v.color, v.position, v.is_default
from public.brands b
cross join (values
  ('a_faire',  'À faire',  'draft',   '#94a3b8', 10, true),
  ('en_cours', 'En cours', 'active',  '#3b82f6', 20, false),
  ('en_revue', 'En revue', 'active',  '#6366f1', 30, false),
  ('termine',  'Terminé',  'success', '#16a34a', 40, false),
  ('annule',   'Annulé',   'closed',  '#64748b', 50, false)
) as v(key, label, category, color, position, is_default)
on conflict (brand_id, entity, key) do nothing;

-- =====================================================================
-- Projets et jalons
-- =====================================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 5000),
  owner_id uuid references public.profiles (id),
  status text not null default 'planned' check (status in ('planned', 'active', 'on_hold', 'done', 'cancelled')),
  start_on date,
  end_on date,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  check (end_on is null or start_on is null or end_on >= start_on)
);
create index projects_brand_idx on public.projects (brand_id, start_on);
create index projects_owner_idx on public.projects (owner_id);
create index projects_created_by_idx on public.projects (created_by);
create index projects_updated_by_idx on public.projects (updated_by);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  due_on date not null,
  reached_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (brand_id, id),
  foreign key (brand_id, project_id) references public.projects (brand_id, id) on delete cascade
);
create index milestones_project_idx on public.milestones (brand_id, project_id, due_on);
create index milestones_created_by_idx on public.milestones (created_by);
create index milestones_updated_by_idx on public.milestones (updated_by);

-- =====================================================================
-- Tâches
-- =====================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  project_id uuid,
  milestone_id uuid,
  -- Sous-tâche : un seul niveau (vérifié par trigger).
  parent_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (description is null or length(description) <= 10000),
  assignee_id uuid references public.profiles (id),
  status_id uuid not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  start_on date,
  due_on date,
  progress int not null default 0 check (progress between 0 and 100),
  estimate_hours numeric(7, 2) check (estimate_hours is null or estimate_hours between 0 and 10000),
  -- Renseignée par le trigger à l'entrée dans un statut « succès ».
  completed_at timestamptz,
  -- Ordre des cartes dans une colonne du Kanban.
  position int not null default 0,
  -- Liens facultatifs vers les autres modules de la marque.
  campaign_id uuid,
  document_id uuid,
  company_id uuid,
  custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  unique (brand_id, id),
  foreign key (brand_id, project_id) references public.projects (brand_id, id),
  foreign key (brand_id, milestone_id) references public.milestones (brand_id, id) on delete set null (milestone_id),
  foreign key (brand_id, parent_id) references public.tasks (brand_id, id) on delete cascade,
  foreign key (brand_id, status_id) references public.statuses (brand_id, id),
  foreign key (brand_id, campaign_id) references public.campaigns (brand_id, id),
  foreign key (brand_id, document_id) references public.commercial_documents (brand_id, id),
  foreign key (brand_id, company_id) references public.companies (brand_id, id),
  check (due_on is null or start_on is null or due_on >= start_on)
);
create index tasks_brand_status_idx on public.tasks (brand_id, status_id, position);
create index tasks_brand_due_idx on public.tasks (brand_id, due_on);
create index tasks_project_idx on public.tasks (brand_id, project_id);
create index tasks_milestone_idx on public.tasks (brand_id, milestone_id);
create index tasks_parent_idx on public.tasks (brand_id, parent_id);
create index tasks_campaign_idx on public.tasks (brand_id, campaign_id);
create index tasks_document_idx on public.tasks (brand_id, document_id);
create index tasks_company_idx on public.tasks (brand_id, company_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_updated_by_idx on public.tasks (updated_by);

-- Chronologie : création, statut, responsable, échéance, archivage, commentaires.
create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  task_id uuid not null,
  type text not null check (type in (
    'created', 'updated', 'status_changed', 'assigned', 'due_changed', 'comment', 'archived', 'restored'
  )),
  occurred_at timestamptz not null default now(),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  foreign key (brand_id, task_id) references public.tasks (brand_id, id) on delete cascade
);
create index task_events_task_idx on public.task_events (brand_id, task_id, occurred_at desc);
create index task_events_actor_idx on public.task_events (actor_id);

-- =====================================================================
-- Garde-fous
-- =====================================================================

create function app.prepare_project()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Un projet ne change pas de marque.' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not app.is_brand_member(new.owner_id, new.brand_id) then
    raise exception 'Le responsable doit être un collaborateur de la marque.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.prepare_milestone()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.brand_id is distinct from old.brand_id or new.project_id is distinct from old.project_id then
      raise exception 'Un jalon ne change pas de projet.' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Colonnes qu'un responsable sans droit de gestion peut modifier sur sa tâche
-- (les autres sont posées par ce trigger).
create function app.prepare_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status record;
  v_free constant text[] := array['status_id', 'progress', 'position', 'completed_at', 'updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status_id is null then
      select id into new.status_id from public.statuses
       where brand_id = new.brand_id and entity = 'task' and is_default;
    end if;
  else
    if new.brand_id is distinct from old.brand_id then
      raise exception 'Une tâche ne change pas de marque.' using errcode = 'check_violation';
    end if;
    if auth.uid() is not null and not (new.brand_id = any (app.brands_with('planning.manage')))
       and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'Sur vos tâches, vous pouvez changer le statut et l''avancement ; le reste revient au responsable du planning.'
        using errcode = 'insufficient_privilege';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  select s.entity, s.is_active, s.category into v_status from public.statuses s
   where s.id = new.status_id and s.brand_id = new.brand_id;
  if v_status.entity is distinct from 'task' then
    raise exception 'Statut de tâche invalide.' using errcode = 'check_violation';
  end if;
  if not v_status.is_active and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id) then
    raise exception 'Ce statut est désactivé.' using errcode = 'check_violation';
  end if;
  -- Terminée : date d'achèvement (conservée tant que le statut ne change pas) et 100 %.
  if v_status.category = 'success' then
    new.completed_at := case
      when tg_op = 'UPDATE' and new.status_id = old.status_id and old.completed_at is not null then old.completed_at
      else now()
    end;
    new.progress := 100;
  else
    new.completed_at := null;
  end if;

  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not app.is_brand_member(new.assignee_id, new.brand_id) then
    raise exception 'Le responsable doit être un collaborateur de la marque.' using errcode = 'check_violation';
  end if;
  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m where m.id = new.milestone_id and m.project_id is not distinct from new.project_id
  ) then
    raise exception 'Le jalon doit appartenir au projet de la tâche.' using errcode = 'check_violation';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or exists (
      select 1 from public.tasks p where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Une sous-tâche se rattache à une tâche principale (un seul niveau).' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.tasks c where c.parent_id = new.id) then
      raise exception 'Une tâche qui a des sous-tâches ne peut pas devenir une sous-tâche.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create function app.log_task_events()
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
    insert into public.task_events (brand_id, task_id, type) values (new.brand_id, new.id, 'created');
    return null;
  end if;

  if new.status_id is distinct from old.status_id then
    select label into v_from from public.statuses where id = old.status_id;
    select label into v_to from public.statuses where id = new.status_id;
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.id, 'status_changed', jsonb_build_object('from', v_from, 'to', v_to));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(nullif(btrim(full_name), ''), email) into v_to from public.profiles where id = new.assignee_id;
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.id, 'assigned', jsonb_build_object('to', v_to));
  end if;
  if new.due_on is distinct from old.due_on then
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.id, 'due_changed', jsonb_build_object('from', old.due_on, 'to', new.due_on));
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.task_events (brand_id, task_id, type)
    values (new.brand_id, new.id, case when new.archived_at is null then 'restored' else 'archived' end);
  end if;

  v_changed := array_remove(array[
    case when new.title is distinct from old.title then 'title' end,
    case when new.description is distinct from old.description then 'description' end,
    case when new.project_id is distinct from old.project_id then 'project' end,
    case when new.milestone_id is distinct from old.milestone_id then 'milestone' end,
    case when new.parent_id is distinct from old.parent_id then 'parent' end,
    case when new.priority is distinct from old.priority then 'priority' end,
    case when new.start_on is distinct from old.start_on then 'start_on' end,
    case when new.progress is distinct from old.progress then 'progress' end,
    case when new.estimate_hours is distinct from old.estimate_hours then 'estimate_hours' end,
    case when (new.campaign_id, new.document_id, new.company_id)
           is distinct from (old.campaign_id, old.document_id, old.company_id) then 'links' end,
    case when new.custom is distinct from old.custom then 'custom' end
  ], null);
  if cardinality(v_changed) > 0 then
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.id, 'updated', jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;
  return null;
end;
$$;

revoke all on function app.prepare_project() from public;
revoke all on function app.prepare_milestone() from public;
revoke all on function app.prepare_task() from public;
revoke all on function app.log_task_events() from public;

create trigger projects_prepare before insert or update on public.projects
  for each row execute function app.prepare_project();
create trigger projects_custom before insert or update on public.projects
  for each row execute function app.validate_custom_values('project');
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function app.audit('brand_id');

create trigger milestones_prepare before insert or update on public.milestones
  for each row execute function app.prepare_milestone();
create trigger milestones_audit after insert or update or delete on public.milestones
  for each row execute function app.audit('brand_id');

create trigger tasks_prepare before insert or update on public.tasks
  for each row execute function app.prepare_task();
create trigger tasks_custom before insert or update on public.tasks
  for each row execute function app.validate_custom_values('task');
create trigger tasks_events after insert or update on public.tasks
  for each row execute function app.log_task_events();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- Projets, jalons et tâches s'archivent (jalons : suppression possible) ;
-- la chronologie ne se modifie pas.
-- =====================================================================

alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

revoke all on public.projects, public.milestones, public.tasks, public.task_events from anon;
revoke update, delete, truncate on public.task_events from authenticated;

create policy projects_select on public.projects for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
create policy projects_insert on public.projects for insert to authenticated
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));
create policy projects_update on public.projects for update to authenticated
  using (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));

create policy milestones_select on public.milestones for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
create policy milestones_insert on public.milestones for insert to authenticated
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));
create policy milestones_update on public.milestones for update to authenticated
  using (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]))
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));
create policy milestones_delete on public.milestones for delete to authenticated
  using (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));

create policy tasks_select on public.tasks for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));
create policy tasks_update on public.tasks for update to authenticated
  using (
    brand_id = any ((select app.brands_with('planning.manage'))::uuid[])
    or (assignee_id = (select auth.uid()) and brand_id = any ((select app.brands_with('planning.read'))::uuid[]))
  )
  with check (
    brand_id = any ((select app.brands_with('planning.manage'))::uuid[])
    or (assignee_id = (select auth.uid()) and brand_id = any ((select app.brands_with('planning.read'))::uuid[]))
  );

create policy task_events_select on public.task_events for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
-- Commentaire : par un gestionnaire du planning, ou par le responsable de la tâche.
create policy task_events_insert on public.task_events for insert to authenticated with check (
  type = 'comment'
  and actor_id = (select auth.uid())
  and exists (
    select 1 from public.tasks t
    where t.id = task_events.task_id and t.brand_id = task_events.brand_id
      and (
        t.brand_id = any ((select app.brands_with('planning.manage'))::uuid[])
        or (t.assignee_id = (select auth.uid()) and t.brand_id = any ((select app.brands_with('planning.read'))::uuid[]))
      )
  )
);
