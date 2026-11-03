-- Tests · Sprint 14 (tableaux de bord personnalisés)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'marketing-x@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'direction@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-9000-00000000000a', 'marketing'),
  ('00000000-0000-4000-8000-000000000007', null, 'direction')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Administrateur X : tableau partagé et tableau personnel ; rien ailleurs ; format contrôlé
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  w constant jsonb := '[{"indicator":"commercial.offers_sent","brandIds":["00000000-0000-4000-9000-00000000000a"],"granularity":"month","points":12,"comparison":"none","chart":"line"}]';
  n int;
begin
  insert into public.custom_dashboards (id, brand_id, name, widgets) values ('00000000-0000-4000-b000-000000000001', x, 'Partagé X', w);
  insert into public.custom_dashboards (id, brand_id, name, is_shared) values ('00000000-0000-4000-b000-000000000002', x, 'Personnel X', false);
  if (select created_by from public.custom_dashboards where id = '00000000-0000-4000-b000-000000000001') <> '00000000-0000-4000-8000-000000000003' then
    raise exception 'ECHEC auteur non posé par la base';
  end if;

  begin
    insert into public.custom_dashboards (brand_id, name) values (y, 'Intrus');
    raise exception 'ECHEC tableau créé dans une autre marque';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.custom_dashboards (brand_id, name) values (null, 'Direction ?');
    raise exception 'ECHEC tableau Direction créé sans le droit Direction';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.custom_dashboards (brand_id, name) values (x, 'Partagé X');
    raise exception 'ECHEC deux tableaux du même nom dans une marque';
  exception when unique_violation then null;
  end;

  begin
    insert into public.custom_dashboards (brand_id, name, widgets) values (x, 'Objet', '{"a":1}');
    raise exception 'ECHEC graphiques hors liste acceptés';
  exception when check_violation then null;
  end;
  begin
    insert into public.custom_dashboards (brand_id, name, widgets) values (x, 'Nombre', '[1, 2]');
    raise exception 'ECHEC graphique qui n''est pas un objet accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.custom_dashboards (brand_id, name, widgets)
    select x, 'Trop', jsonb_agg('{}'::jsonb) from generate_series(1, 13);
    raise exception 'ECHEC plus de douze graphiques acceptés';
  exception when check_violation then null;
  end;

  begin
    update public.custom_dashboards set brand_id = y where id = '00000000-0000-4000-b000-000000000001';
    raise exception 'ECHEC tableau déplacé vers une autre marque';
  exception when check_violation or insufficient_privilege then null;
  end;
end $$;
reset role;

-- Second gestionnaire de X : voit et modifie le partagé, pas le personnel d'un autre
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.custom_dashboards;
  if n <> 1 then raise exception 'ECHEC le second gestionnaire voit % tableau(x) au lieu de 1', n; end if;
  update public.custom_dashboards set name = 'Partagé X (revu)' where id = '00000000-0000-4000-b000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC le second gestionnaire ne peut pas modifier le tableau partagé'; end if;
  begin
    update public.custom_dashboards set is_shared = false where id = '00000000-0000-4000-b000-000000000001';
    raise exception 'ECHEC tableau d''un autre rendu personnel';
  exception when insufficient_privilege then null;
  end;
  delete from public.custom_dashboards where id = '00000000-0000-4000-b000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC tableau personnel d''un autre supprimé'; end if;
end $$;
reset role;

-- Commercial de X : lit le partagé, ne crée, ne modifie, ne supprime rien
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.custom_dashboards;
  if n <> 1 then raise exception 'ECHEC le commercial voit % tableau(x) au lieu de 1', n; end if;
  update public.custom_dashboards set name = 'Piraté' where id = '00000000-0000-4000-b000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC le commercial a modifié un tableau'; end if;
  delete from public.custom_dashboards;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC le commercial a supprimé un tableau'; end if;
  begin
    insert into public.custom_dashboards (brand_id, name) values ('00000000-0000-4000-9000-00000000000a', 'Le mien');
    raise exception 'ECHEC le commercial a créé un tableau';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Administrateur Y : rien de la marque X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.custom_dashboards;
  if n <> 0 then raise exception 'ECHEC admin Y voit % tableau(x) de la marque X', n; end if;
end $$;
reset role;

-- Direction : lit les tableaux partagés des marques, crée les siens (toutes marques)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.custom_dashboards;
  if n <> 1 then raise exception 'ECHEC la Direction voit % tableau(x) au lieu de 1 (le partagé de X)', n; end if;
  insert into public.custom_dashboards (id, brand_id, name) values ('00000000-0000-4000-b000-000000000003', null, 'Groupe');
  begin
    insert into public.custom_dashboards (brand_id, name) values (null, 'Groupe');
    raise exception 'ECHEC deux tableaux Direction du même nom';
  exception when unique_violation then null;
  end;
  begin
    insert into public.custom_dashboards (brand_id, name) values ('00000000-0000-4000-9000-00000000000a', 'Dans X');
    raise exception 'ECHEC la Direction a créé un tableau de marque sans reports.manage';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Ni l'administrateur ni le commercial de X ne voient le tableau Direction
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.custom_dashboards where brand_id is null;
  if n <> 0 then raise exception 'ECHEC admin X voit un tableau Direction'; end if;
  select count(*) into n from public.custom_dashboards;
  if n <> 2 then raise exception 'ECHEC admin X voit % tableau(x) au lieu de 2 (ses deux)', n; end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 14 passent' as resultat;

rollback;
