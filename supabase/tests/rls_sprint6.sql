-- Tests · Sprint 6 (lots d'import, historique agrégé, annulation)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'marketing-x@test.local'),
  ('00000000-0000-4000-8000-000000000008', 'responsable-x@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'lecture-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-9000-00000000000a', 'marketing'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-9000-00000000000a', 'sales_manager'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer')
) as v(u, b, k) join public.roles r on r.key = v.k;

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Marketing X : lot de relevés sociaux, import d'un bloc, garde-fous
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_account uuid; v_batch uuid; v_by uuid; n int; v_status text;
begin
  insert into public.social_accounts (brand_id, platform, name) values (x, 'facebook', 'Page') returning id into v_account;
  insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
  values (x, 'social_snapshots', 'facebook.csv', 120, repeat('a', 64), '["Début","Fin","Impressions"]',
          '[["2026-09-01","2026-09-30",1000],["2026-10-01","2026-10-31",1500]]', 2)
  returning id, created_by into v_batch, v_by;
  if v_by is distinct from '00000000-0000-4000-8000-000000000006' then raise exception 'ECHEC auteur du lot non tracé'; end if;
  insert into ids values ('social_batch', v_batch), ('account', v_account);

  -- La correspondance se règle tant que rien n'est importé.
  update public.import_batches set mapping = '{"period_start": 0, "period_end": 1, "impressions": 2}' where id = v_batch;

  begin
    update public.import_batches set status = 'committed' where id = v_batch;
    raise exception 'ECHEC lot marqué importé sans passer par l''import';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.import_batches set rows = '[]' where id = v_batch;
    raise exception 'ECHEC lignes brutes du lot modifiées';
  exception when check_violation then null;
  end;
  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end, impressions, source, import_batch_id)
    values (x, v_account, '2026-08-01', '2026-08-31', 10, 'import', v_batch);
    raise exception 'ECHEC ligne rattachée à un lot hors import';
  exception when insufficient_privilege then null;
  end;

  n := public.commit_import(v_batch,
    jsonb_build_array(
      jsonb_build_object('account_id', v_account, 'period_start', '2026-09-01', 'period_end', '2026-09-30', 'impressions', 1000),
      jsonb_build_object('account_id', v_account, 'period_start', '2026-10-01', 'period_end', '2026-10-31', 'impressions', 1500)),
    1, 0, '{"skipped": [{"line": 4, "message": "Doublon"}]}');
  if n <> 2 then raise exception 'ECHEC import : % ligne(s)', n; end if;
  select status into v_status from public.import_batches where id = v_batch;
  if v_status <> 'committed' then raise exception 'ECHEC statut du lot : %', v_status; end if;
  select count(*) into n from public.social_snapshots where import_batch_id = v_batch and source = 'import';
  if n <> 2 then raise exception 'ECHEC relevés importés : %', n; end if;

  begin
    perform public.commit_import(v_batch, '[{"account_id": null}]', 0, 0, '{}');
    raise exception 'ECHEC lot importé deux fois';
  exception when check_violation then null;
  end;
  begin
    update public.social_snapshots set import_batch_id = null, source = 'manual' where import_batch_id = v_batch;
    raise exception 'ECHEC ligne détachée de son lot';
  exception when check_violation then null;
  end;
  delete from public.import_batches where id = v_batch;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lot importé supprimé'; end if;
end $$;
reset role;

-- Commercial X et Lecture X : aucun accès aux lots
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.import_batches;
  if n <> 0 then raise exception 'ECHEC le commercial voit les lots'; end if;
  begin
    insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
    values ('00000000-0000-4000-9000-00000000000a', 'companies', 'x.csv', 1, repeat('b', 64), '["Nom"]', '[["A"]]', 1);
    raise exception 'ECHEC le commercial crée un lot';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.import_batches;
  if n <> 0 then raise exception 'ECHEC la lecture voit les lots'; end if;
end $$;
reset role;

-- Responsable X (imports et prospects, pas le marketing) : prospects importés,
-- annulation bloquée sur un lot marketing et sur un prospect déjà utilisé
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_batch uuid; v_batch2 uuid; v_company uuid; n int;
begin
  begin
    perform public.rollback_import((select id from ids where name = 'social_batch'));
    raise exception 'ECHEC annulation d''un lot marketing sans droit marketing';
  exception when insufficient_privilege then null;
  end;

  insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
  values (x, 'companies', 'prospects.xlsx', 2048, repeat('c', 64), '["Nom","Ville"]', '[["Alpha","Abidjan"],["Beta","Bouaké"]]', 2)
  returning id into v_batch;
  n := public.commit_import(v_batch, '[{"name": "Alpha", "city": "Abidjan"}, {"name": "Beta", "city": "Bouaké"}]', 0, 0, '{}');
  if n <> 2 then raise exception 'ECHEC prospects importés : %', n; end if;

  -- Un prospect importé déjà lié à une opportunité bloque l'annulation du lot.
  select id into v_company from public.companies where import_batch_id = v_batch and name = 'Alpha';
  insert into public.opportunities (brand_id, company_id, title, stage_id)
  values (x, v_company, 'Mandat', (select id from public.pipeline_stages where brand_id = x and key = 'qualification'));
  begin
    perform public.rollback_import(v_batch);
    raise exception 'ECHEC annulation malgré un prospect utilisé';
  exception when foreign_key_violation then null;
  end;
  select count(*) into n from public.companies where import_batch_id = v_batch;
  if n <> 2 then raise exception 'ECHEC annulation partielle : % prospect(s) restant(s)', n; end if;

  insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
  values (x, 'companies', 'prospects2.csv', 100, repeat('d', 64), '["Nom"]', '[["Gamma"]]', 1)
  returning id into v_batch2;
  perform public.commit_import(v_batch2, '[{"name": "Gamma"}]', 0, 0, '{}');
  n := public.rollback_import(v_batch2);
  if n <> 1 then raise exception 'ECHEC annulation : % ligne(s)', n; end if;
  if exists (select 1 from public.companies where name = 'Gamma') then raise exception 'ECHEC prospect annulé encore présent'; end if;
  if (select status from public.import_batches where id = v_batch2) <> 'rolled_back' then raise exception 'ECHEC statut annulé'; end if;

  -- Un prospect saisi à la main ne se supprime pas.
  insert into public.companies (brand_id, name) values (x, 'Manuel') returning id into v_company;
  delete from public.companies where id = v_company;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC prospect manuel supprimé'; end if;
end $$;
reset role;

-- Marketing X : annulation de son lot
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_batch uuid := (select id from ids where name = 'social_batch'); n int;
begin
  n := public.rollback_import(v_batch);
  if n <> 2 then raise exception 'ECHEC annulation marketing : %', n; end if;
  select count(*) into n from public.social_snapshots where account_id = (select id from ids where name = 'account');
  if n <> 0 then raise exception 'ECHEC relevés encore présents'; end if;
  begin
    perform public.rollback_import(v_batch);
    raise exception 'ECHEC lot annulé deux fois';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Admin X : historique agrégé
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x constant uuid := '00000000-0000-4000-9000-00000000000a'; v_batch uuid; n int;
begin
  insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
  values (x, 'historical_metrics', 'historique.xlsx', 500, repeat('e', 64), '["Indicateur"]', '[["calls"]]', 1)
  returning id into v_batch;
  insert into ids values ('historical_batch', v_batch);
  begin
    perform public.commit_import(v_batch, jsonb_build_array(
      jsonb_build_object('metric_key', 'calls', 'period_start', '2025-01-01', 'period_end', '2025-12-31', 'value', 500),
      jsonb_build_object('metric_key', 'calls', 'period_start', '2025-06-01', 'period_end', '2025-06-30', 'value', 40)), 0, 0, '{}');
    raise exception 'ECHEC chiffres historiques qui se recouvrent';
  exception when exclusion_violation then null;
  end;
  n := public.commit_import(v_batch, jsonb_build_array(
    jsonb_build_object('metric_key', 'calls', 'period_start', '2025-01-01', 'period_end', '2025-12-31', 'value', 500),
    jsonb_build_object('user_id', '00000000-0000-4000-8000-000000000004', 'metric_key', 'revenue_signed',
                       'period_start', '2025-01-01', 'period_end', '2025-12-31', 'value', 25000000, 'currency', 'XOF'),
    jsonb_build_object('user_id', '00000000-0000-4000-8000-000000000008', 'metric_key', 'calls',
                       'period_start', '2025-01-01', 'period_end', '2025-12-31', 'value', 300)), 0, 0, '{}');
  if n <> 3 then raise exception 'ECHEC historique importé : %', n; end if;
end $$;
reset role;

-- Le commercial voit l'historique d'équipe et le sien, pas celui d'un collègue
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.historical_metrics;
  if n <> 2 then raise exception 'ECHEC historique visible par le commercial : %', n; end if;
end $$;
reset role;

-- Admin Y : rien de la marque X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.import_batches) + (select count(*) from public.historical_metrics) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit les imports de X'; end if;
  begin
    perform public.rollback_import((select id from ids where name = 'historical_batch'));
    raise exception 'ECHEC admin Y annule un lot de X';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK : tous les tests du Sprint 6 passent' as resultat;

rollback;
