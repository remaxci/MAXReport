-- Tests d'isolation RLS · Sprint 1 (marques, profils, rôles, affectations, audit)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- Le script s'arrête sur la première règle non respectée (message « ECHEC … »).

begin;

-- ---------------------------------------------------------------------
-- Données de test
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'super@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'direction@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'sans-role@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, null::uuid, 'super_admin'),
  ('00000000-0000-4000-8000-000000000002', null, 'direction'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-9000-00000000000a', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin')
) as v(u, b, k)
join public.roles r on r.key = v.k;

-- Rôle de marque plus étendu que celui d'un administrateur de marque.
insert into public.roles (id, key, label, scope) values
  ('00000000-0000-4000-a000-000000000001', 'test_escalade', 'Test escalade', 'brand');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-4000-a000-000000000001', 'brand.read'),
  ('00000000-0000-4000-a000-000000000001', 'roles.manage');

-- ---------------------------------------------------------------------
-- Visiteur non connecté : aucun accès
-- ---------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform 1 from public.brands;
    raise exception 'ECHEC anonyme : lecture des marques autorisée';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Compte sans rôle : ne voit que son profil
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands;
  if n <> 0 then raise exception 'ECHEC sans rôle : % marque(s) visible(s)', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'ECHEC sans rôle : % profil(s) visible(s) au lieu de 1', n; end if;
  select count(*) into n from public.memberships;
  if n <> 0 then raise exception 'ECHEC sans rôle : % affectation(s) visible(s)', n; end if;
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'ECHEC sans rôle : journal lisible'; end if;
  begin
    perform public.add_brand_member('00000000-0000-4000-9000-00000000000a',
      'sans-role@test.local', (select id from public.roles where key = 'viewer'));
    raise exception 'ECHEC sans rôle : s''est ajouté à une marque';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Administrateur de la marque X
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands;
  if n <> 1 then raise exception 'ECHEC admin X : % marques visibles au lieu de 1', n; end if;
  perform 1 from public.brands where code = 'TESTX';
  if not found then raise exception 'ECHEC admin X : sa marque est invisible'; end if;

  -- Collaborateurs de X uniquement (lui-même et le commercial).
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'ECHEC admin X : % profils visibles au lieu de 2', n; end if;

  update public.brands set name = 'Marque X modifiée' where code = 'TESTX';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC admin X : modification de sa marque refusée'; end if;

  update public.brands set name = 'Piratée' where code = 'TESTY';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC admin X : a modifié la marque Y'; end if;

  begin
    update public.brands set is_active = false where code = 'TESTX';
    raise exception 'ECHEC admin X : a désactivé sa marque';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.brands (code, slug, name) values ('TESTZ', 'test-z', 'Marque Z');
    raise exception 'ECHEC admin X : a créé une marque';
  exception when insufficient_privilege then null;
  end;

  perform public.add_brand_member('00000000-0000-4000-9000-00000000000a',
    'sans-role@test.local', (select id from public.roles where key = 'viewer'));

  begin
    perform public.add_brand_member('00000000-0000-4000-9000-00000000000b',
      'sans-role@test.local', (select id from public.roles where key = 'viewer'));
    raise exception 'ECHEC admin X : ajout dans la marque Y accepté';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.memberships set role_id = (select id from public.roles where key = 'direction')
     where user_id = '00000000-0000-4000-8000-000000000004';
    raise exception 'ECHEC admin X : a attribué un rôle global';
  exception when check_violation then null;
  end;

  begin
    update public.memberships set role_id = '00000000-0000-4000-a000-000000000001'
     where user_id = '00000000-0000-4000-8000-000000000004';
    raise exception 'ECHEC admin X : a attribué un rôle plus étendu que le sien';
  exception when insufficient_privilege then null;
  end;

  update public.memberships set role_id = (select id from public.roles where key = 'marketing')
   where user_id = '00000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC admin X : changement de rôle refusé'; end if;

  select count(*) into n from public.audit_log where brand_id = '00000000-0000-4000-9000-00000000000b';
  if n <> 0 then raise exception 'ECHEC admin X : lit le journal de la marque Y'; end if;
  select count(*) into n from public.audit_log where brand_id = '00000000-0000-4000-9000-00000000000a';
  if n = 0 then raise exception 'ECHEC admin X : journal de sa marque vide ou illisible'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Commercial de la marque X (devenu Marketing au test précédent)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands;
  if n <> 1 then raise exception 'ECHEC commercial X : % marques visibles au lieu de 1', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'ECHEC commercial X : voit % profils au lieu de 1', n; end if;
  select count(*) into n from public.memberships;
  if n <> 1 then raise exception 'ECHEC commercial X : voit % affectations au lieu de 1', n; end if;

  update public.brands set name = 'Piratée' where code = 'TESTX';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC commercial X : a modifié la marque'; end if;

  update public.profiles set full_name = 'Commercial X'
   where id = '00000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC commercial X : ne peut pas modifier son nom'; end if;

  begin
    update public.profiles set is_active = false
     where id = '00000000-0000-4000-8000-000000000004';
    raise exception 'ECHEC commercial X : a désactivé son propre compte';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_brand_member('00000000-0000-4000-9000-00000000000a',
      'admin-y@test.local', (select id from public.roles where key = 'viewer'));
    raise exception 'ECHEC commercial X : a ajouté un collaborateur';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Administrateur de la marque Y
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands;
  if n <> 1 then raise exception 'ECHEC admin Y : % marques visibles au lieu de 1', n; end if;
  select count(*) into n from public.memberships where brand_id = '00000000-0000-4000-9000-00000000000a';
  if n <> 0 then raise exception 'ECHEC admin Y : voit les affectations de la marque X'; end if;
  delete from public.memberships where brand_id = '00000000-0000-4000-9000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC admin Y : a retiré des collaborateurs de X'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Direction : lecture de toutes les marques, aucune écriture
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands where code in ('TESTX', 'TESTY');
  if n <> 2 then raise exception 'ECHEC direction : % marques de test visibles au lieu de 2', n; end if;

  update public.brands set name = 'Modifiée' where code = 'TESTX';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC direction : a modifié une marque'; end if;

  begin
    insert into public.brands (code, slug, name) values ('TESTZ', 'test-z', 'Marque Z');
    raise exception 'ECHEC direction : a créé une marque';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_brand_member('00000000-0000-4000-9000-00000000000b',
      'admin-x@test.local', (select id from public.roles where key = 'viewer'));
    raise exception 'ECHEC direction : a ajouté un collaborateur';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Super-administrateur
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands where code in ('TESTX', 'TESTY');
  if n <> 2 then raise exception 'ECHEC super-admin : % marques de test visibles au lieu de 2', n; end if;

  insert into public.brands (code, slug, name) values ('TESTZ', 'test-z', 'Marque Z');

  update public.brands set is_active = false where code = 'TESTZ';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC super-admin : désactivation d''une marque refusée'; end if;

  begin
    update public.brands set code = 'AUTRE' where code = 'TESTZ';
    raise exception 'ECHEC super-admin : le code d''une marque a changé';
  exception when check_violation then null;
  end;

  -- Ne peut pas supprimer le dernier super-administrateur (si c'est le cas).
  select count(*) into n from public.memberships m
    join public.roles r on r.id = m.role_id and r.key = 'super_admin';
  if n = 1 then
    begin
      delete from public.memberships where user_id = '00000000-0000-4000-8000-000000000001';
      raise exception 'ECHEC super-admin : dernier super-administrateur supprimé';
    exception when check_violation then null;
    end;
    begin
      update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000001';
      raise exception 'ECHEC super-admin : dernier super-administrateur désactivé';
    exception when check_violation then null;
    end;
  end if;

  begin
    delete from public.roles where key = 'viewer';
    raise exception 'ECHEC super-admin : rôle système supprimé';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Compte désactivé : perd tout accès
-- ---------------------------------------------------------------------
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.brands;
  if n <> 0 then raise exception 'ECHEC compte désactivé : % marque(s) encore visible(s)', n; end if;
end $$;
reset role;

select 'OK : tous les tests RLS du Sprint 1 passent' as resultat;

rollback;
