-- Tests · Sprint 4a (opportunités, échanges, contrats)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000007', 'commercial2-x@test.local'),
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
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-9000-00000000000a', 'sales_manager'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer')
) as v(u, b, k) join public.roles r on r.key = v.k;

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Commercial X : opportunité, clôture automatique, échanges, contrat
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_company uuid; v_other uuid; v_opp uuid; v_offer uuid; v_other_offer uuid;
  v_stage text; v_closed date; n int;
begin
  insert into public.companies (brand_id, name) values (x, 'Alpha') returning id into v_company;
  insert into public.companies (brand_id, name) values (x, 'Beta') returning id into v_other;
  insert into ids values ('company', v_company), ('other', v_other);

  insert into public.opportunities (brand_id, company_id, title, stage_id, amount, currency)
  values (x, v_company, 'Mandat de vente', (select id from public.pipeline_stages where brand_id = x and key = 'qualification'), 50000000, 'XOF')
  returning id into v_opp;
  insert into ids values ('opp', v_opp);

  update public.opportunities set stage_id = (select id from public.pipeline_stages where brand_id = x and key = 'gagnee')
   where id = v_opp;
  select closed_on into v_closed from public.opportunities where id = v_opp;
  if v_closed is null then raise exception 'ECHEC opportunité gagnée sans date de clôture'; end if;

  update public.opportunities set stage_id = (select id from public.pipeline_stages where brand_id = x and key = 'negociation')
   where id = v_opp;
  select closed_on into v_closed from public.opportunities where id = v_opp;
  if v_closed is not null then raise exception 'ECHEC date de clôture conservée après réouverture'; end if;

  begin
    insert into public.opportunities (brand_id, company_id, title, stage_id, owner_id)
    values (x, v_company, 'Pour un collègue', (select id from public.pipeline_stages where brand_id = x and key = 'qualification'),
            '00000000-0000-4000-8000-000000000007');
    raise exception 'ECHEC opportunité au nom d''un collègue';
  exception when insufficient_privilege then null;
  end;

  insert into public.interactions (brand_id, company_id, opportunity_id, type, summary)
  values (x, v_company, v_opp, 'call', 'Premier appel');
  begin
    insert into public.interactions (brand_id, company_id, opportunity_id, type, summary)
    values (x, v_other, v_opp, 'call', 'Mauvaise entreprise');
    raise exception 'ECHEC échange rattaché à l''opportunité d''une autre entreprise';
  exception when check_violation then null;
  end;

  insert into public.commercial_documents (brand_id, kind, company_id, subject) values (x, 'offer', v_company, 'Offre Alpha')
  returning id into v_offer;
  insert into public.commercial_documents (brand_id, kind, company_id, subject) values (x, 'offer', v_other, 'Offre Beta')
  returning id into v_other_offer;

  begin
    insert into public.contracts (brand_id, company_id, offer_id, title, signed_on, amount, currency)
    values (x, v_company, v_other_offer, 'Mauvaise offre', current_date, 1000, 'XOF');
    raise exception 'ECHEC contrat lié à l''offre d''une autre entreprise';
  exception when check_violation then null;
  end;
  insert into public.contracts (brand_id, company_id, opportunity_id, offer_id, title, signed_on, amount, currency)
  values (x, v_company, v_opp, v_offer, 'Mandat signé', current_date, 50000000, 'XOF');

  select count(*) into n from public.contracts;
  if n <> 1 then raise exception 'ECHEC commercial X : % contrat(s) visible(s)', n; end if;
end $$;
reset role;

-- Second commercial : ne voit ni l'opportunité ni le contrat, ne modifie pas l'échange
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.opportunities;
  if n <> 0 then raise exception 'ECHEC commercial 2 voit % opportunité(s)', n; end if;
  select count(*) into n from public.contracts;
  if n <> 0 then raise exception 'ECHEC commercial 2 voit % contrat(s)', n; end if;
  select count(*) into n from public.interactions;
  if n <> 1 then raise exception 'ECHEC historique des échanges non partagé (%)', n; end if;
  update public.interactions set summary = 'Modifié';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC commercial 2 a modifié l''échange d''un collègue'; end if;
end $$;
reset role;

-- Responsable : voit et réattribue
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.opportunities;
  if n <> 1 then raise exception 'ECHEC responsable : % opportunité(s)', n; end if;
  update public.opportunities set owner_id = '00000000-0000-4000-8000-000000000007' where id = (select id from ids where name = 'opp');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC responsable : réattribution refusée'; end if;
  select count(*) into n from public.contracts;
  if n <> 1 then raise exception 'ECHEC responsable : % contrat(s)', n; end if;
end $$;
reset role;

-- Lecture seule et autre marque
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.opportunities;
  if n <> 1 then raise exception 'ECHEC lecture : % opportunité(s)', n; end if;
  update public.opportunities set title = 'Modifié';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lecture : opportunité modifiée'; end if;
  update public.contracts set title = 'Modifié';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lecture : contrat modifié'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.opportunities) + (select count(*) from public.contracts)
       + (select count(*) from public.interactions) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit des données de la marque X'; end if;
end $$;
reset role;

-- Champ personnalisé obligatoire sur les opportunités
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x constant uuid := '00000000-0000-4000-9000-00000000000a';
begin
  insert into public.custom_field_definitions (brand_id, entity, key, label, type, required)
  values (x, 'opportunity', 'type_bien', 'Type de bien', 'text', true);
  begin
    insert into public.opportunities (brand_id, company_id, title, stage_id)
    values (x, (select id from ids where name = 'company'), 'Sans champ',
            (select id from public.pipeline_stages where brand_id = x and key = 'qualification'));
    raise exception 'ECHEC champ obligatoire ignoré sur une opportunité';
  exception when check_violation then null;
  end;
end $$;
reset role;

select 'OK : tous les tests du Sprint 4a passent' as resultat;

rollback;
