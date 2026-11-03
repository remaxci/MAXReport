-- Tests · Notifications des tâches (préférences, journal, contenu du récapitulatif)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000c', 'TESTZ', 'test-z', 'Marque Z');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000c', 'sales_rep')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Planification active dans X, désactivée dans Z.
insert into public.brand_modules (brand_id, module_key, enabled) values
  ('00000000-0000-4000-9000-00000000000a', 'planning', true),
  ('00000000-0000-4000-9000-00000000000c', 'planning', false)
on conflict (brand_id, module_key) do update set enabled = excluded.enabled;

-- Tâches du commercial (A à G dans X, Z1 dans Z) et une tâche en retard pour l'administrateur.
insert into public.tasks (id, brand_id, title, assignee_id, due_on) values
  ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-9000-00000000000a', 'A en retard', '00000000-0000-4000-8000-000000000004', current_date - 2),
  ('00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-9000-00000000000a', 'B aujourd''hui', '00000000-0000-4000-8000-000000000004', current_date),
  ('00000000-0000-4000-a000-0000000000a3', '00000000-0000-4000-9000-00000000000a', 'C demain', '00000000-0000-4000-8000-000000000004', current_date + 1),
  ('00000000-0000-4000-a000-0000000000a4', '00000000-0000-4000-9000-00000000000a', 'D confiée', '00000000-0000-4000-8000-000000000004', current_date + 5),
  ('00000000-0000-4000-a000-0000000000a5', '00000000-0000-4000-9000-00000000000a', 'E prise soi-même', '00000000-0000-4000-8000-000000000004', current_date + 5),
  ('00000000-0000-4000-a000-0000000000a6', '00000000-0000-4000-9000-00000000000a', 'F archivée', '00000000-0000-4000-8000-000000000004', current_date - 3),
  ('00000000-0000-4000-a000-0000000000a7', '00000000-0000-4000-9000-00000000000a', 'G terminée', '00000000-0000-4000-8000-000000000004', current_date - 3),
  ('00000000-0000-4000-a000-0000000000c1', '00000000-0000-4000-9000-00000000000c', 'Z1 sans planification', '00000000-0000-4000-8000-000000000004', current_date - 1),
  ('00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-9000-00000000000a', 'Admin en retard', '00000000-0000-4000-8000-000000000003', current_date - 1);

update public.tasks set archived_at = now() where id = '00000000-0000-4000-a000-0000000000a6';
update public.tasks set status_id = (
  select id from public.statuses
  where brand_id = '00000000-0000-4000-9000-00000000000a' and entity = 'task' and category = 'success' limit 1
) where id = '00000000-0000-4000-a000-0000000000a7';

-- D confiée par l'administrateur ; E « confiée » par le commercial lui-même.
insert into public.task_events (brand_id, task_id, type, actor_id, payload) values
  ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-0000000000a4', 'assigned', '00000000-0000-4000-8000-000000000003', '{}'),
  ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-0000000000a5', 'assigned', '00000000-0000-4000-8000-000000000004', '{}');

-- L'administrateur ne veut pas de récapitulatif.
insert into public.notification_preferences (user_id, daily_digest) values ('00000000-0000-4000-8000-000000000003', false);

-- Contenu : seules A (retard), B (aujourd'hui), C (demain), D (nouvelle) ; rien pour l'administrateur.
do $$
declare
  v_items jsonb;
  v_titles text;
begin
  select items into v_items from public.task_digests(current_date) where user_id = '00000000-0000-4000-8000-000000000004';
  if v_items is null then raise exception 'ECHEC aucun récapitulatif pour le commercial'; end if;
  select string_agg((i ->> 'title') || '=' || (i ->> 'kind') || case when (i ->> 'isNew')::boolean then '+nouvelle' else '' end, ', ' order by i ->> 'title')
    into v_titles from jsonb_array_elements(v_items) i;
  if v_titles <> 'A en retard=overdue, B aujourd''hui=due_today, C demain=due_soon, D confiée=assigned+nouvelle' then
    raise exception 'ECHEC contenu inattendu : %', v_titles;
  end if;
  if exists (select 1 from public.task_digests(current_date) where user_id = '00000000-0000-4000-8000-000000000003') then
    raise exception 'ECHEC récapitulatif pour une personne qui l''a désactivé';
  end if;

  -- Rappel le jour même seulement : C (demain) disparaît.
  insert into public.notification_preferences (user_id, due_soon_days) values ('00000000-0000-4000-8000-000000000004', 0);
  select items into v_items from public.task_digests(current_date) where user_id = '00000000-0000-4000-8000-000000000004';
  if exists (select 1 from jsonb_array_elements(v_items) i where i ->> 'title' = 'C demain') then
    raise exception 'ECHEC rappel envoyé malgré la préférence « le jour même »';
  end if;

  -- Déjà envoyé aujourd'hui : plus rien.
  insert into public.notification_digests (user_id, digest_on, status, task_count) values ('00000000-0000-4000-8000-000000000004', current_date, 'sent', 3);
  if exists (select 1 from public.task_digests(current_date) where user_id = '00000000-0000-4000-8000-000000000004') then
    raise exception 'ECHEC deuxième récapitulatif le même jour';
  end if;
end $$;

-- Un envoi pour l'administrateur, pour vérifier l'isolement du journal.
insert into public.notification_digests (user_id, digest_on, status, task_count) values ('00000000-0000-4000-8000-000000000003', current_date - 1, 'sent', 1);

-- Commercial connecté : ses préférences et son journal seulement ; ni écriture du journal, ni contenu des autres.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.notification_preferences;
  if n <> 1 then raise exception 'ECHEC le commercial voit % préférence(s) au lieu de 1', n; end if;
  update public.notification_preferences set daily_digest = false where user_id = '00000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC préférences d''un autre modifiées'; end if;
  begin
    insert into public.notification_preferences (user_id) values ('00000000-0000-4000-8000-000000000003');
    raise exception 'ECHEC préférence créée pour un autre';
  exception when insufficient_privilege then null;
  end;
  update public.notification_preferences set due_soon_days = 2 where user_id = '00000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC le commercial ne peut pas régler ses préférences'; end if;
  begin
    update public.notification_preferences set due_soon_days = 30 where user_id = '00000000-0000-4000-8000-000000000004';
    raise exception 'ECHEC délai de rappel hors bornes accepté';
  exception when check_violation then null;
  end;

  select count(*) into n from public.notification_digests;
  if n <> 1 then raise exception 'ECHEC le commercial voit % envoi(s) au lieu de 1 (le sien)', n; end if;
  begin
    insert into public.notification_digests (user_id, digest_on, status) values ('00000000-0000-4000-8000-000000000004', current_date + 1, 'sent');
    raise exception 'ECHEC le commercial a écrit dans le journal des envois';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.task_digests(current_date);
    raise exception 'ECHEC le commercial a lu le contenu des récapitulatifs';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK : tous les tests des notifications passent' as resultat;

rollback;
