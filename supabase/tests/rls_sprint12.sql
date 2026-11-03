-- Tests · Sprint 12 (dépendances entre tâches, pièces jointes des tâches)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'lecture-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Tâches de départ (hors RLS) : A, B, C dans X (A confiée au commercial), Z dans Y.
insert into public.tasks (id, brand_id, title, assignee_id) values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-9000-00000000000a', 'A', '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-9000-00000000000a', 'B', null),
  ('00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-9000-00000000000a', 'C', null),
  ('00000000-0000-4000-a000-00000000000f', '00000000-0000-4000-9000-00000000000b', 'Z', null);

-- Administrateur X : chaîne de dépendances, boucles refusées
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  b constant uuid := '00000000-0000-4000-a000-00000000000b';
  c constant uuid := '00000000-0000-4000-a000-00000000000c';
begin
  insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, b, a);
  insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, c, b);
  if not exists (select 1 from public.task_events where task_id = b and type = 'dependency_added' and payload ->> 'task' = 'A') then
    raise exception 'ECHEC chronologie : dépendance non tracée';
  end if;

  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, a, c);
    raise exception 'ECHEC boucle indirecte acceptée (A attend C qui attend B qui attend A)';
  exception when check_violation then null;
  end;
  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, a, b);
    raise exception 'ECHEC boucle directe acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, a, a);
    raise exception 'ECHEC tâche dépendant d''elle-même';
  exception when check_violation then null;
  end;
  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, a, '00000000-0000-4000-a000-00000000000f');
    raise exception 'ECHEC dépendance vers une tâche d''une autre marque';
  exception when foreign_key_violation then null;
  end;

  delete from public.task_dependencies where task_id = c and depends_on_id = b;
  if not exists (select 1 from public.task_events where task_id = c and type = 'dependency_removed') then
    raise exception 'ECHEC chronologie : retrait de dépendance non tracé';
  end if;
end $$;
reset role;

-- Commercial responsable de A : pièces jointes de sa tâche seulement, pas de dépendances
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  a constant uuid := '00000000-0000-4000-a000-00000000000a';
  b constant uuid := '00000000-0000-4000-a000-00000000000b';
  n int;
begin
  select count(*) into n from public.task_dependencies;
  if n <> 1 then raise exception 'ECHEC le commercial voit % dépendance(s) au lieu de 1', n; end if;
  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (x, a, b);
    raise exception 'ECHEC le commercial a créé une dépendance';
  exception when insufficient_privilege then null;
  end;
  delete from public.task_dependencies where task_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC le commercial a supprimé une dépendance'; end if;

  insert into public.task_attachments (brand_id, task_id, storage_path, file_name, mime_type, size_bytes)
  values (x, a, x::text || '/taches/' || a::text || '/plan.pdf', 'plan.pdf', 'application/pdf', 1000);
  if not exists (select 1 from public.task_events where task_id = a and type = 'attachment_added') then
    raise exception 'ECHEC chronologie : pièce jointe non tracée';
  end if;
  if not app.can_write_task_file(x::text || '/taches/' || a::text || '/autre.pdf') then
    raise exception 'ECHEC stockage : le responsable ne peut pas déposer sur sa tâche';
  end if;
  if app.can_write_task_file(x::text || '/taches/' || b::text || '/x.pdf') then
    raise exception 'ECHEC stockage : dépôt autorisé sur la tâche d''un autre';
  end if;
  if app.can_write_task_file(x::text || '/' || a::text || '/x.pdf') then
    raise exception 'ECHEC stockage : chemin de document accepté pour une tâche';
  end if;

  begin
    insert into public.task_attachments (brand_id, task_id, storage_path, file_name, mime_type, size_bytes)
    values (x, b, x::text || '/taches/' || b::text || '/x.pdf', 'x.pdf', 'application/pdf', 1000);
    raise exception 'ECHEC pièce jointe ajoutée à la tâche d''un autre';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.task_attachments (brand_id, task_id, storage_path, file_name, mime_type, size_bytes)
    values (x, a, 'ailleurs/plan.pdf', 'plan.pdf', 'application/pdf', 1000);
    raise exception 'ECHEC pièce jointe hors du dossier de la tâche';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Lecture seule : voit, ne modifie rien
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.task_dependencies) + (select count(*) from public.task_attachments) into n;
  if n <> 2 then raise exception 'ECHEC lecture : % éléments visibles au lieu de 2', n; end if;
  delete from public.task_attachments;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lecture : pièce jointe supprimée'; end if;
  if app.can_write_task_file('00000000-0000-4000-9000-00000000000a/taches/00000000-0000-4000-a000-00000000000a/x.pdf') then
    raise exception 'ECHEC lecture : dépôt de fichier autorisé';
  end if;
end $$;
reset role;

-- Administrateur Y : rien de la marque X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.task_dependencies) + (select count(*) from public.task_attachments) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit % élément(s) de la marque X', n; end if;
  -- A→B fermerait une boucle dans X : Y doit être refusé pour son droit, pas pour la boucle.
  begin
    insert into public.task_dependencies (brand_id, task_id, depends_on_id)
    values ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
    raise exception 'ECHEC admin Y a créé une dépendance dans X';
  exception when insufficient_privilege then null;
  end;
  if app.can_write_task_file('00000000-0000-4000-9000-00000000000a/taches/00000000-0000-4000-a000-00000000000b/x.pdf') then
    raise exception 'ECHEC admin Y peut déposer un fichier sur une tâche de X';
  end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 12 passent' as resultat;

rollback;
