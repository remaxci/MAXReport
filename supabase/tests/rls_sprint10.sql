-- Tests · Sprint 10 (planification : projets, jalons, tâches, chronologie)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'commercial2-x@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'lecture-x@test.local'),
  ('00000000-0000-4000-8000-00000000000d', 'direction@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer'),
  ('00000000-0000-4000-8000-00000000000d', null, 'direction')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Valeurs par défaut : module et statuts de tâche posés à la création de la marque
do $$
declare n int;
begin
  select count(*) into n from public.statuses where brand_id = '00000000-0000-4000-9000-00000000000a' and entity = 'task';
  if n <> 5 then raise exception 'ECHEC statuts de tâche par défaut : % au lieu de 5', n; end if;
  if not exists (select 1 from public.brand_modules where brand_id = '00000000-0000-4000-9000-00000000000a' and module_key = 'planning') then
    raise exception 'ECHEC module planification absent de la nouvelle marque';
  end if;
end $$;

-- Administrateur X : projet, jalon, tâches et garde-fous
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  rep constant uuid := '00000000-0000-4000-8000-000000000004';
  v_project uuid;
  v_other uuid;
  v_milestone uuid;
  v_task uuid;
  v_sub uuid;
  v_status text;
begin
  insert into public.projects (brand_id, name, start_on, end_on) values (x, 'Lancement agence', current_date, current_date + 60)
  returning id into v_project;
  insert into public.projects (brand_id, name) values (x, 'Autre projet') returning id into v_other;
  insert into public.milestones (brand_id, project_id, name, due_on) values (x, v_project, 'Ouverture', current_date + 30)
  returning id into v_milestone;

  insert into public.tasks (brand_id, project_id, milestone_id, title, assignee_id, start_on, due_on)
  values (x, v_project, v_milestone, 'Préparer le plan média', rep, current_date, current_date + 10)
  returning id into v_task;
  select s.key into v_status from public.tasks t join public.statuses s on s.id = t.status_id where t.id = v_task;
  if v_status is distinct from 'a_faire' then raise exception 'ECHEC statut par défaut : %', v_status; end if;
  if not exists (select 1 from public.task_events where task_id = v_task and type = 'created') then
    raise exception 'ECHEC chronologie : création non tracée';
  end if;

  insert into public.tasks (brand_id, project_id, parent_id, title) values (x, v_project, v_task, 'Sous-tâche')
  returning id into v_sub;

  begin
    insert into public.tasks (brand_id, parent_id, title) values (x, v_sub, 'Sous-sous-tâche');
    raise exception 'ECHEC sous-tâche d''une sous-tâche acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (brand_id, title, start_on, due_on) values (x, 'Dates inversées', current_date, current_date - 1);
    raise exception 'ECHEC échéance avant le début acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (brand_id, title, assignee_id) values (x, 'Étranger', '00000000-0000-4000-8000-000000000005');
    raise exception 'ECHEC responsable d''une autre marque accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (brand_id, project_id, milestone_id, title) values (x, v_other, v_milestone, 'Mauvais jalon');
    raise exception 'ECHEC jalon d''un autre projet accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (brand_id, title, status_id)
    values (x, 'Statut d''offre', (select id from public.statuses where brand_id = x and entity = 'offer' and is_default));
    raise exception 'ECHEC statut d''une autre nature accepté';
  exception when check_violation then null;
  end;
  begin
    update public.tasks set brand_id = '00000000-0000-4000-9000-00000000000b' where id = v_task;
    raise exception 'ECHEC tâche déplacée vers une autre marque';
  exception when check_violation or foreign_key_violation or insufficient_privilege then null;
  end;
end $$;
reset role;

-- Commercial responsable de la tâche : statut, avancement et commentaire seulement
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_task uuid;
  v_progress int;
  v_done timestamptz;
  n int;
begin
  select id into v_task from public.tasks where title = 'Préparer le plan média';
  if v_task is null then raise exception 'ECHEC le responsable ne voit pas sa tâche'; end if;

  update public.tasks set status_id = (select id from public.statuses where brand_id = x and entity = 'task' and key = 'en_cours'),
                          progress = 40
   where id = v_task;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC le responsable ne peut pas avancer sa tâche'; end if;
  if not exists (select 1 from public.task_events where task_id = v_task and type = 'status_changed') then
    raise exception 'ECHEC chronologie : changement de statut non tracé';
  end if;

  begin
    update public.tasks set title = 'Titre changé' where id = v_task;
    raise exception 'ECHEC le responsable a modifié le titre';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tasks set due_on = current_date + 90 where id = v_task;
    raise exception 'ECHEC le responsable a repoussé l''échéance';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tasks (brand_id, title) values (x, 'Tâche du commercial');
    raise exception 'ECHEC le commercial a créé une tâche';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects (brand_id, name) values (x, 'Projet du commercial');
    raise exception 'ECHEC le commercial a créé un projet';
  exception when insufficient_privilege then null;
  end;

  insert into public.task_events (brand_id, task_id, type, payload)
  values (x, v_task, 'comment', '{"text":"Plan en cours"}');
  begin
    insert into public.task_events (brand_id, task_id, type) values (x, v_task, 'status_changed');
    raise exception 'ECHEC événement de chronologie forgé';
  exception when insufficient_privilege then null;
  end;

  update public.tasks set status_id = (select id from public.statuses where brand_id = x and entity = 'task' and key = 'termine')
   where id = v_task;
  select progress, completed_at into v_progress, v_done from public.tasks where id = v_task;
  if v_progress <> 100 or v_done is null then raise exception 'ECHEC tâche terminée sans 100 %% ni date d''achèvement'; end if;
end $$;
reset role;

-- Second commercial : voit les tâches, ne modifie ni ne commente celles des autres
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_task uuid;
  n int;
begin
  select id into v_task from public.tasks where title = 'Préparer le plan média';
  if v_task is null then raise exception 'ECHEC le second commercial ne voit pas les tâches de la marque'; end if;
  update public.tasks set progress = 10 where id = v_task;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC le second commercial a modifié la tâche d''un collègue'; end if;
  begin
    insert into public.task_events (brand_id, task_id, type, payload) values (x, v_task, 'comment', '{"text":"x"}');
    raise exception 'ECHEC le second commercial a commenté la tâche d''un collègue';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Lecture seule et Direction : voient, n'écrivent pas
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  if n <> 2 then raise exception 'ECHEC lecture : % tâches visibles au lieu de 2', n; end if;
  begin
    insert into public.projects (brand_id, name) values ('00000000-0000-4000-9000-00000000000a', 'Projet lecture');
    raise exception 'ECHEC un profil en lecture a créé un projet';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.projects where brand_id = '00000000-0000-4000-9000-00000000000a';
  if n <> 2 then raise exception 'ECHEC Direction : % projets visibles au lieu de 2', n; end if;
  update public.projects set name = 'Renommé par la Direction' where brand_id = '00000000-0000-4000-9000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC la Direction a modifié un projet'; end if;
end $$;
reset role;

-- Administrateur Y : rien de la marque X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.projects) + (select count(*) from public.milestones)
       + (select count(*) from public.tasks) + (select count(*) from public.task_events) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit % éléments de planification de la marque X', n; end if;
  begin
    insert into public.tasks (brand_id, title) values ('00000000-0000-4000-9000-00000000000a', 'Intrusion');
    raise exception 'ECHEC admin Y a créé une tâche dans la marque X';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK : tous les tests du Sprint 10 passent' as resultat;

rollback;
