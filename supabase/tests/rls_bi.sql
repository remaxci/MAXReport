-- Tests · Connexion BI (clés d'accès en lecture seule)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'direction@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000007', null, 'direction')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Seul le super-administrateur a la permission par défaut : le test l'accorde
-- aux administrateurs de marque et à la Direction (annulé à la fin).
do $$
begin
  if exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
             where rp.permission = 'bi.connect' and r.key <> 'super_admin') then
    raise exception 'ECHEC bi.connect accordé par défaut à un autre rôle que le super-administrateur';
  end if;
  if not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                 where rp.permission = 'bi.connect' and r.key = 'super_admin') then
    raise exception 'ECHEC super-administrateur sans bi.connect';
  end if;
end $$;
insert into public.role_permissions (role_id, permission)
select id, 'bi.connect' from public.roles where key in ('brand_admin', 'direction');

insert into public.companies (id, brand_id, name) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-00000000000a', 'Client X'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-9000-00000000000b', 'Client Y');
insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject, amount, currency, issued_on) values
  ('00000000-0000-4000-9000-00000000000a', 'offer', '00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-8000-000000000003', 'Offre X', 1000, 'XOF', '2026-11-03'),
  ('00000000-0000-4000-9000-00000000000b', 'offer', '00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-8000-000000000005', 'Offre Y', 2000, 'XOF', '2026-11-03');

-- =====================================================================
-- Gestion des clés (session de l'application)
-- =====================================================================

-- Administrateur X : clé de sa marque ; ni autre marque, ni Direction ; empreinte illisible
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  v_by uuid;
begin
  insert into public.bi_access_keys (id, brand_id, name, token_hash, token_hint, datasets, expires_at) values
    ('00000000-0000-4000-d000-000000000001', x, 'Power BI X',
     encode(extensions.digest('mxbi_test_cle_marque_x_000000000001', 'sha256'), 'hex'), '0001',
     array['marques', 'offres', 'taches'], now() + interval '90 days');
  select created_by into v_by from public.bi_access_keys where id = '00000000-0000-4000-d000-000000000001';
  if v_by is distinct from '00000000-0000-4000-8000-000000000003' then
    raise exception 'ECHEC auteur de la clé non posé par la base';
  end if;

  begin
    insert into public.bi_access_keys (brand_id, name, token_hash, token_hint, datasets, expires_at)
    values (y, 'Intrus', encode(extensions.digest('mxbi_test_intrus_000000000000000', 'sha256'), 'hex'), 'trus',
            array['offres'], now() + interval '30 days');
    raise exception 'ECHEC clé créée pour une autre marque';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bi_access_keys (brand_id, name, token_hash, token_hint, datasets, expires_at)
    values (null, 'Direction ?', encode(extensions.digest('mxbi_test_direction_intrus_00000', 'sha256'), 'hex'), '0000',
            array['offres'], now() + interval '30 days');
    raise exception 'ECHEC clé Direction créée sans les droits globaux';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bi_access_keys (brand_id, name, token_hash, token_hint, datasets, expires_at)
    values (x, 'Jeu inconnu', encode(extensions.digest('mxbi_test_jeu_inconnu_000000000000', 'sha256'), 'hex'), '0000',
            array['contacts'], now() + interval '30 days');
    raise exception 'ECHEC jeu de données hors liste accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.bi_access_keys (brand_id, name, token_hash, token_hint, datasets, expires_at)
    values (x, 'Trop longue', encode(extensions.digest('mxbi_test_trop_longue_00000000000', 'sha256'), 'hex'), '0000',
            array['offres'], now() + interval '400 days');
    raise exception 'ECHEC clé de plus d''un an acceptée';
  exception when check_violation then null;
  end;
  begin
    perform token_hash from public.bi_access_keys;
    raise exception 'ECHEC empreinte de clé lisible';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bi_access_keys set name = 'Renommée' where id = '00000000-0000-4000-d000-000000000001';
    raise exception 'ECHEC clé modifiée autrement que par révocation';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.bi_access_keys where id = '00000000-0000-4000-d000-000000000001';
    raise exception 'ECHEC clé supprimée';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Commercial X (sans bi.connect) : ne voit ni ne crée de clé
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.bi_access_keys) then
    raise exception 'ECHEC clé visible sans bi.connect';
  end if;
  begin
    insert into public.bi_access_keys (brand_id, name, token_hash, token_hint, datasets, expires_at)
    values ('00000000-0000-4000-9000-00000000000a', 'Commercial',
            encode(extensions.digest('mxbi_test_commercial_0000000000000', 'sha256'), 'hex'), '0000',
            array['offres'], now() + interval '30 days');
    raise exception 'ECHEC clé créée sans bi.connect';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Administrateur Y : ne voit pas la clé de X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.bi_access_keys) then
    raise exception 'ECHEC clé d''une autre marque visible';
  end if;
end $$;
reset role;

-- Direction : clé toutes marques
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
insert into public.bi_access_keys (id, brand_id, name, token_hash, token_hint, datasets, expires_at) values
  ('00000000-0000-4000-d000-000000000002', null, 'Power BI Direction',
   encode(extensions.digest('mxbi_test_cle_direction_000000000002', 'sha256'), 'hex'), '0002',
   array['marques', 'offres'], now() + interval '90 days');
reset role;

do $$
begin
  if (select count(*) from public.audit_log
      where table_name = 'bi_access_keys' and action = 'insert'
        and record_id in ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-d000-000000000002')) <> 2 then
    raise exception 'ECHEC création de clé absente du journal d''audit';
  end if;
end $$;

-- =====================================================================
-- Lecture par clé (sans session : rôle anon)
-- =====================================================================

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare
  v jsonb;
begin
  -- Clé X : les offres de X seulement, avec client et responsable
  v := public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres');
  if jsonb_array_length(v) <> 1 or v -> 0 ->> 'marque' <> 'TESTX' or v -> 0 ->> 'objet' <> 'Offre X' then
    raise exception 'ECHEC clé X : % au lieu de la seule offre de X', v;
  end if;
  if v -> 0 ->> 'client' is distinct from 'Client X' or v -> 0 ->> 'numero' is null then
    raise exception 'ECHEC colonnes de l''offre : %', v -> 0;
  end if;
  v := public.bi_read('mxbi_test_cle_marque_x_000000000001', 'marques');
  if jsonb_array_length(v) <> 1 or v -> 0 ->> 'code' <> 'TESTX' then
    raise exception 'ECHEC marques de la clé X : %', v;
  end if;
  v := public.bi_catalog('mxbi_test_cle_marque_x_000000000001');
  if v ->> 'portee' <> 'marque' or v -> 'marques' <> '["TESTX"]'::jsonb then
    raise exception 'ECHEC catalogue de la clé X : %', v;
  end if;

  -- Clé Direction : les deux marques
  v := public.bi_read('mxbi_test_cle_direction_000000000002', 'offres');
  if (select count(*) from jsonb_array_elements(v) e where e ->> 'marque' in ('TESTX', 'TESTY')) <> 2 then
    raise exception 'ECHEC clé Direction : offres de X et Y attendues, reçu %', v;
  end if;

  -- Jeu non ouvert par la clé, clé inconnue, pagination invalide
  begin
    perform public.bi_read('mxbi_test_cle_marque_x_000000000001', 'budgets');
    raise exception 'ECHEC jeu non ouvert par la clé lu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bi_read('mxbi_test_cle_marque_x_000000000001', null);
    raise exception 'ECHEC jeu vide accepté';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bi_read('mxbi_test_cle_inconnue_0000000000000', 'offres');
    raise exception 'ECHEC clé inconnue acceptée';
  exception when sqlstate '28000' then null;
  end;
  begin
    perform public.bi_read('court', 'offres');
    raise exception 'ECHEC clé trop courte acceptée';
  exception when sqlstate '28000' then null;
  end;
  begin
    perform public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres', 0, 50000);
    raise exception 'ECHEC page de plus de 5 000 lignes acceptée';
  exception when invalid_parameter_value then null;
  end;

  -- Table et fonctions internes inaccessibles sans session
  begin
    perform 1 from public.bi_access_keys;
    raise exception 'ECHEC table des clés lisible sans session';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app.bi_open_key('mxbi_test_cle_marque_x_000000000001');
    raise exception 'ECHEC fonction interne appelable sans session';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if (select use_count from public.bi_access_keys where id = '00000000-0000-4000-d000-000000000001') < 3
     or (select last_used_at from public.bi_access_keys where id = '00000000-0000-4000-d000-000000000001') is null then
    raise exception 'ECHEC usage de la clé non compté';
  end if;
end $$;

-- Module Offres coupé pour X : plus aucune offre de X
update public.brand_modules set enabled = false
where brand_id = '00000000-0000-4000-9000-00000000000a' and module_key = 'offers';
set local role anon;
do $$
begin
  if jsonb_array_length(public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres')) <> 0 then
    raise exception 'ECHEC offres lues alors que le module est coupé';
  end if;
  if (select count(*) from jsonb_array_elements(public.bi_read('mxbi_test_cle_direction_000000000002', 'offres')) e
      where e ->> 'marque' = 'TESTX') <> 0 then
    raise exception 'ECHEC clé Direction : offres de X lues alors que le module est coupé';
  end if;
end $$;
reset role;
update public.brand_modules set enabled = true
where brand_id = '00000000-0000-4000-9000-00000000000a' and module_key = 'offers';

-- Limite de débit : au-delà de 1 000 lectures dans l'heure, refus
update public.bi_access_keys set window_started_at = now(), window_count = 1000
where id = '00000000-0000-4000-d000-000000000001';
set local role anon;
do $$
begin
  perform public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres');
  raise exception 'ECHEC limite de 1 000 lectures par heure non appliquée';
exception when sqlstate '53400' then null;
end $$;
reset role;
update public.bi_access_keys set window_count = 0 where id = '00000000-0000-4000-d000-000000000001';

-- Clé expirée : refusée
update public.bi_access_keys set created_at = now() - interval '100 days', expires_at = now() - interval '1 day'
where id = '00000000-0000-4000-d000-000000000002';
set local role anon;
do $$
begin
  perform public.bi_read('mxbi_test_cle_direction_000000000002', 'offres');
  raise exception 'ECHEC clé expirée acceptée';
exception when sqlstate '28000' then null;
end $$;
reset role;
update public.bi_access_keys set created_at = now(), expires_at = now() + interval '90 days'
where id = '00000000-0000-4000-d000-000000000002';

-- Auteur qui perd la permission bi.connect : clé suspendue
delete from public.role_permissions
where permission = 'bi.connect' and role_id = (select id from public.roles where key = 'direction');
set local role anon;
do $$
begin
  perform public.bi_read('mxbi_test_cle_direction_000000000002', 'offres');
  raise exception 'ECHEC clé utilisable après retrait de bi.connect à son auteur';
exception when sqlstate '28000' then null;
end $$;
reset role;

-- Auteur désactivé : clé suspendue
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000003';
set local role anon;
do $$
begin
  perform public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres');
  raise exception 'ECHEC clé utilisable après désactivation de son auteur';
exception when sqlstate '28000' then null;
end $$;
reset role;
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-000000000003';

-- Révocation par l'administrateur X : datée, signée, définitive
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  update public.bi_access_keys set revoked_at = '2000-01-01' where id = '00000000-0000-4000-d000-000000000001';
  if (select revoked_at < now() - interval '1 minute' or revoked_by is distinct from '00000000-0000-4000-8000-000000000003'
      from public.bi_access_keys where id = '00000000-0000-4000-d000-000000000001') then
    raise exception 'ECHEC révocation non datée ou non signée par la base';
  end if;
  begin
    update public.bi_access_keys set revoked_at = null where id = '00000000-0000-4000-d000-000000000001';
    raise exception 'ECHEC clé révoquée réactivée';
  exception when check_violation then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.bi_read('mxbi_test_cle_marque_x_000000000001', 'offres');
  raise exception 'ECHEC clé révoquée acceptée';
exception when sqlstate '28000' then null;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.audit_log
                 where table_name = 'bi_access_keys' and action = 'update'
                   and record_id = '00000000-0000-4000-d000-000000000001') then
    raise exception 'ECHEC révocation absente du journal d''audit';
  end if;
end $$;

select 'Connexion BI : tous les tests sont passés' as resultat;

rollback;
