-- Tests · Numéro des offres (N°0001, suite continue par marque)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin')
) as v(u, b, k) join public.roles r on r.key = v.k;

insert into public.companies (id, brand_id, name) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-9000-00000000000a', 'Client X'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-9000-00000000000b', 'Client Y');

do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  admin_x constant uuid := '00000000-0000-4000-8000-000000000003';
  admin_y constant uuid := '00000000-0000-4000-8000-000000000005';
  v_ref text;
begin
  -- Deux offres de X sur deux années : la suite continue (pas de remise à zéro).
  insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject, issued_on)
  values (x, 'offer', '00000000-0000-4000-c000-00000000000a', admin_x, 'Première', '2026-11-03') returning reference into v_ref;
  if v_ref <> 'N°0001' then raise exception 'ECHEC première offre : % au lieu de N°0001', v_ref; end if;
  insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject, issued_on)
  values (x, 'offer', '00000000-0000-4000-c000-00000000000a', admin_x, 'Année suivante', '2027-01-04') returning reference into v_ref;
  if v_ref <> 'N°0002' then raise exception 'ECHEC deuxième offre : % au lieu de N°0002', v_ref; end if;

  -- Chaque marque a sa propre suite.
  insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject)
  values (y, 'offer', '00000000-0000-4000-c000-00000000000b', admin_y, 'Offre Y') returning reference into v_ref;
  if v_ref <> 'N°0001' then raise exception 'ECHEC première offre de Y : % au lieu de N°0001', v_ref; end if;

  -- Les mémos gardent leur format annuel.
  insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject, issued_on)
  values (x, 'memo', '00000000-0000-4000-c000-00000000000a', admin_x, 'Mémo', '2026-11-03') returning reference into v_ref;
  if v_ref <> 'MS-TESTX-2026-0001' then raise exception 'ECHEC mémo : % au lieu de MS-TESTX-2026-0001', v_ref; end if;

  -- Au-delà de 9999, le numéro s'allonge au lieu d'être tronqué.
  update app.reference_counters set last_value = 9999 where brand_id = x and kind = 'offer' and year = 0;
  insert into public.commercial_documents (brand_id, kind, company_id, owner_id, subject)
  values (x, 'offer', '00000000-0000-4000-c000-00000000000a', admin_x, 'Dix-millième') returning reference into v_ref;
  if v_ref <> 'N°10000' then raise exception 'ECHEC dix-millième offre : %', v_ref; end if;

  -- Un numéro attribué ne change plus.
  begin
    update public.commercial_documents set reference = 'N°0999' where brand_id = x and reference = 'N°0001';
    raise exception 'ECHEC numéro modifié';
  exception when check_violation then null;
  end;
end $$;

select 'OK : tous les tests du numéro des offres passent' as resultat;

rollback;
