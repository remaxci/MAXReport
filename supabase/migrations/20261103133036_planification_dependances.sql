-- Sprint 12 · Planification : dépendances entre tâches et pièces jointes des tâches.
-- « B dépend de A » : B commence quand A est terminée. Dépendances entre tâches
-- d'une même marque, sans boucle, même indirecte (vérifié par la base).
-- Pièces jointes : bucket privé « attachments », chemin {marque}/taches/{tâche}/… ;
-- ajout et suppression par un gestionnaire du planning ou le responsable de la tâche.

-- =====================================================================
-- Chronologie : nouveaux événements
-- =====================================================================

alter table public.task_events drop constraint task_events_type_check;
alter table public.task_events add constraint task_events_type_check check (type in (
  'created', 'updated', 'status_changed', 'assigned', 'due_changed', 'comment', 'archived', 'restored',
  'dependency_added', 'dependency_removed', 'attachment_added', 'attachment_removed'
));

-- =====================================================================
-- Droit de modifier une tâche (pièces jointes, stockage)
-- =====================================================================

create function app.can_edit_task(p_task uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and t.archived_at is null
      and (
        t.brand_id = any (app.brands_with('planning.manage'))
        or (t.assignee_id = (select auth.uid()) and t.brand_id = any (app.brands_with('planning.read')))
      )
  );
$$;
revoke all on function app.can_edit_task(uuid) from public;
grant execute on function app.can_edit_task(uuid) to authenticated;

-- Chemin d'un fichier de tâche : {brand_id}/taches/{task_id}/{nom}.
create function app.can_write_task_file(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3 or v_parts[1] !~ v_uuid or v_parts[2] <> 'taches' or v_parts[3] !~ v_uuid then
    return false;
  end if;
  return exists (
      select 1 from public.tasks t
      where t.id = v_parts[3]::uuid and t.brand_id = v_parts[1]::uuid
    )
    and app.can_edit_task(v_parts[3]::uuid);
end;
$$;
revoke all on function app.can_write_task_file(text) from public;
grant execute on function app.can_write_task_file(text) to authenticated;

-- =====================================================================
-- Dépendances
-- =====================================================================

create table public.task_dependencies (
  brand_id uuid not null,
  -- La tâche qui attend…
  task_id uuid not null,
  -- … la fin de celle-ci.
  depends_on_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (task_id, depends_on_id),
  foreign key (brand_id, task_id) references public.tasks (brand_id, id) on delete cascade,
  foreign key (brand_id, depends_on_id) references public.tasks (brand_id, id) on delete cascade,
  check (task_id <> depends_on_id)
);
create index task_dependencies_task_idx on public.task_dependencies (brand_id, task_id);
create index task_dependencies_depends_on_idx on public.task_dependencies (brand_id, depends_on_id);
create index task_dependencies_created_by_idx on public.task_dependencies (created_by);

create function app.guard_task_dependency()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Ce déclencheur passe avant la RLS : sans ce contrôle, l'erreur « boucle »
  -- révélerait des dépendances à qui n'a pas le droit de les gérer.
  if auth.uid() is not null and not (new.brand_id = any (app.brands_with('planning.manage'))) then
    raise exception 'Vous n''avez pas le droit de gérer les dépendances de cette marque.'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_by := auth.uid();
  -- Une marque à la fois : deux ajouts simultanés ne peuvent pas former une boucle.
  perform pg_advisory_xact_lock(hashtextextended('task_dependencies:' || new.brand_id::text, 0));
  if exists (
    with recursive chain(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'Cette dépendance créerait une boucle : une tâche ne peut pas attendre, même indirectement, sa propre fin.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function app.log_task_dependency_events()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    select title into v_title from public.tasks where id = new.depends_on_id;
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.task_id, 'dependency_added', jsonb_build_object('task', v_title));
  elsif exists (select 1 from public.tasks where id = old.task_id) then
    select title into v_title from public.tasks where id = old.depends_on_id;
    insert into public.task_events (brand_id, task_id, type, payload)
    values (old.brand_id, old.task_id, 'dependency_removed', jsonb_build_object('task', v_title));
  end if;
  return null;
end;
$$;

revoke all on function app.guard_task_dependency() from public;
revoke all on function app.log_task_dependency_events() from public;

create trigger task_dependencies_guard before insert on public.task_dependencies
  for each row execute function app.guard_task_dependency();
create trigger task_dependencies_events after insert or delete on public.task_dependencies
  for each row execute function app.log_task_dependency_events();
create trigger task_dependencies_audit after insert or delete on public.task_dependencies
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Pièces jointes
-- =====================================================================

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  task_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 4194304),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (brand_id, task_id) references public.tasks (brand_id, id) on delete cascade,
  check (storage_path like brand_id::text || '/taches/' || task_id::text || '/%')
);
create index task_attachments_task_idx on public.task_attachments (brand_id, task_id);
create index task_attachments_uploaded_by_idx on public.task_attachments (uploaded_by);

create function app.log_task_attachment_events()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (brand_id, task_id, type, payload)
    values (new.brand_id, new.task_id, 'attachment_added', jsonb_build_object('file_name', new.file_name));
  elsif exists (select 1 from public.tasks where id = old.task_id) then
    insert into public.task_events (brand_id, task_id, type, payload)
    values (old.brand_id, old.task_id, 'attachment_removed', jsonb_build_object('file_name', old.file_name));
  end if;
  return null;
end;
$$;
revoke all on function app.log_task_attachment_events() from public;

create trigger task_attachments_events after insert or delete on public.task_attachments
  for each row execute function app.log_task_attachment_events();
create trigger task_attachments_audit after insert or delete on public.task_attachments
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Sécurité au niveau des lignes
-- =====================================================================

alter table public.task_dependencies enable row level security;
alter table public.task_attachments enable row level security;
revoke all on public.task_dependencies, public.task_attachments from anon;
revoke update, truncate on public.task_dependencies, public.task_attachments from authenticated;

create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (brand_id = any ((select app.brands_with('planning.manage'))::uuid[]));

create policy task_attachments_select on public.task_attachments for select to authenticated
  using (brand_id = any ((select app.brands_with('planning.read'))::uuid[]));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (app.can_edit_task(task_id) and uploaded_by = (select auth.uid()));
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (app.can_edit_task(task_id));

-- Fichiers : lisibles si la pièce jointe l'est ; écrits et supprimés par qui peut modifier la tâche.
create policy task_files_select on storage.objects for select to authenticated using (
  bucket_id = 'attachments'
  and exists (select 1 from public.task_attachments a where a.storage_path = storage.objects.name)
);
create policy task_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and app.can_write_task_file(name)
);
create policy task_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and app.can_write_task_file(name)
);
