-- Tests · Sprint 3 (prospects, offres, mémos, chronologie, pièces jointes)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- Le script s'arrête sur la première règle non respectée (message « ECHEC … »).

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
select v.u, v.b, r.id
from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-9000-00000000000a', 'sales_manager'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer')
) as v(u, b, k)
join public.roles r on r.key = v.k;

-- Identifiants fixes des données créées pendant le test.
create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------
-- Commercial X : crée prospect, offres et mémo ; références automatiques
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  v_company uuid;
  v_other_company uuid;
  v_contact uuid;
  v_doc uuid;
  v_ref text;
  v_status text;
  n int;
begin
  insert into public.companies (brand_id, name) values (x, 'Entreprise Alpha') returning id into v_company;
  insert into public.companies (brand_id, name) values (x, 'Entreprise Beta') returning id into v_other_company;
  insert into public.contacts (brand_id, company_id, full_name) values (x, v_company, 'Awa Koné')
  returning id into v_contact;
  insert into ids values ('company', v_company), ('other_company', v_other_company), ('contact', v_contact);

  select s.label into v_status from public.companies c join public.statuses s on s.id = c.status_id
   where c.id = v_company;
  if v_status is distinct from 'Nouveau' then
    raise exception 'ECHEC prospect : statut par défaut absent (%)', v_status;
  end if;

  -- Refus par la RLS, ou avant elle par le contrôle du responsable (triggers exécutés d'abord).
  begin
    insert into public.companies (brand_id, name) values (y, 'Intrus');
    raise exception 'ECHEC commercial X : prospect créé dans la marque Y';
  exception when insufficient_privilege or check_violation then null;
  end;

  insert into public.commercial_documents (brand_id, kind, company_id, contact_id, subject, amount, currency)
  values (x, 'offer', v_company, v_contact, 'Gestion locative', 1500000, 'XOF')
  returning id, reference into v_doc, v_ref;
  insert into ids values ('offer1', v_doc);
  if v_ref <> 'OF-TESTX-' || extract(year from current_date) || '-0001' then
    raise exception 'ECHEC référence : % au lieu de OF-TESTX-…-0001', v_ref;
  end if;

  select s.label into v_status from public.commercial_documents d join public.statuses s on s.id = d.status_id
   where d.id = v_doc;
  if v_status <> 'Brouillon' then raise exception 'ECHEC offre : statut par défaut % au lieu de Brouillon', v_status; end if;

  insert into public.commercial_documents (brand_id, kind, company_id, subject)
  values (x, 'offer', v_company, 'Vente d''un terrain') returning id, reference into v_doc, v_ref;
  insert into ids values ('offer2', v_doc);
  if v_ref not like 'OF-TESTX-%-0002' then raise exception 'ECHEC référence : numérotation (%)', v_ref; end if;

  insert into public.commercial_documents (brand_id, kind, company_id, subject)
  values (x, 'memo', v_company, 'Stratégie 2027') returning id, reference into v_doc, v_ref;
  insert into ids values ('memo1', v_doc);
  if v_ref not like 'MS-TESTX-%-0001' then raise exception 'ECHEC référence mémo : %', v_ref; end if;

  begin
    insert into public.commercial_documents (brand_id, kind, company_id, subject, owner_id)
    values (x, 'offer', v_company, 'Pour un collègue', '00000000-0000-4000-8000-000000000007');
    raise exception 'ECHEC commercial X : offre créée au nom d''un collègue';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.commercial_documents (brand_id, kind, company_id, subject, amount, currency)
    values (x, 'memo', v_company, 'Mémo chiffré', 1000, 'XOF');
    raise exception 'ECHEC cohérence : montant accepté sur un mémo';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_documents (brand_id, kind, company_id, contact_id, subject)
    values (x, 'offer', v_other_company, v_contact, 'Mauvais contact');
    raise exception 'ECHEC cohérence : contact d''une autre entreprise accepté';
  exception when check_violation then null;
  end;

  begin
    insert into public.commercial_documents (brand_id, kind, company_id, subject, status_id)
    values (x, 'offer', v_company, 'Mauvais statut',
            (select id from public.statuses where brand_id = x and entity = 'company' and key = 'client'));
    raise exception 'ECHEC cohérence : statut de prospect accepté sur une offre';
  exception when check_violation then null;
  end;

  -- Envoi, relance, changement de statut : chronologie automatique.
  update public.commercial_documents
     set status_id = (select id from public.statuses where brand_id = x and entity = 'offer' and key = 'envoyee'),
         sent_on = current_date,
         follow_up_on = current_date + 7
   where id = (select id from ids where name = 'offer1');
  select count(*) into n from public.document_events
   where document_id = (select id from ids where name = 'offer1')
     and type in ('created', 'status_changed', 'sent', 'follow_up_scheduled');
  if n <> 4 then raise exception 'ECHEC chronologie : % événements au lieu de 4', n; end if;

  begin
    update public.commercial_documents set reference = 'OF-PIRATE' where id = (select id from ids where name = 'offer1');
    raise exception 'ECHEC référence modifiée';
  exception when check_violation then null;
  end;

  begin
    update public.commercial_documents set owner_id = '00000000-0000-4000-8000-000000000007'
     where id = (select id from ids where name = 'offer2');
    raise exception 'ECHEC commercial X : a réattribué son offre';
  exception when insufficient_privilege then null;
  end;

  insert into public.document_events (brand_id, document_id, type, payload)
  values (x, (select id from ids where name = 'offer1'), 'comment', '{"text": "Client intéressé"}');

  begin
    insert into public.document_events (brand_id, document_id, type)
    values (x, (select id from ids where name = 'offer1'), 'created');
    raise exception 'ECHEC chronologie : événement automatique saisi à la main';
  exception when insufficient_privilege then null;
  end;

  -- Pièce jointe : chemin de la marque et du document obligatoire.
  insert into public.document_attachments (brand_id, document_id, storage_path, file_name, mime_type, size_bytes)
  values (x, (select id from ids where name = 'offer1'),
          x || '/' || (select id from ids where name = 'offer1') || '/offre.pdf', 'offre.pdf', 'application/pdf', 1000);
  begin
    insert into public.document_attachments (brand_id, document_id, storage_path, file_name, mime_type, size_bytes)
    values (x, (select id from ids where name = 'offer1'), 'ailleurs/offre.pdf', 'offre.pdf', 'application/pdf', 1000);
    raise exception 'ECHEC pièce jointe : chemin hors du document accepté';
  exception when insufficient_privilege then null;
  end;

  if not app.can_write_document_file(x || '/' || (select id from ids where name = 'offer1') || '/a.pdf') then
    raise exception 'ECHEC stockage : dépôt refusé sur sa propre offre';
  end if;
  if app.can_write_document_file(y || '/' || (select id from ids where name = 'offer1') || '/a.pdf') then
    raise exception 'ECHEC stockage : dépôt accepté avec une autre marque dans le chemin';
  end if;

  select count(*) into n from public.brand_member_options(x) where not is_global;
  if n <> 5 then raise exception 'ECHEC liste des collaborateurs : % au lieu de 5', n; end if;
  select count(*) into n from public.brand_member_options(y);
  if n <> 0 then raise exception 'ECHEC liste des collaborateurs : marque Y visible'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Second commercial : ne voit pas les documents de son collègue
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.commercial_documents;
  if n <> 0 then raise exception 'ECHEC commercial 2 : voit % document(s) d''un collègue', n; end if;
  select count(*) into n from public.document_events;
  if n <> 0 then raise exception 'ECHEC commercial 2 : voit la chronologie d''un collègue'; end if;
  select count(*) into n from public.document_attachments;
  if n <> 0 then raise exception 'ECHEC commercial 2 : voit les pièces jointes d''un collègue'; end if;
  select count(*) into n from public.companies;
  if n <> 2 then raise exception 'ECHEC commercial 2 : % prospect(s) au lieu de 2 (annuaire partagé)', n; end if;

  begin
    insert into public.document_events (brand_id, document_id, type, payload)
    values ('00000000-0000-4000-9000-00000000000a', (select id from ids where name = 'offer1'), 'comment', '{}');
    raise exception 'ECHEC commercial 2 : commentaire sur le document d''un collègue';
  exception when insufficient_privilege then null;
  end;
  if app.can_write_document_file('00000000-0000-4000-9000-00000000000a/' || (select id from ids where name = 'offer1') || '/a.pdf') then
    raise exception 'ECHEC commercial 2 : dépôt de fichier sur le document d''un collègue';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Responsable commercial : voit tout, réattribue
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.commercial_documents;
  if n <> 3 then raise exception 'ECHEC responsable : % documents visibles au lieu de 3', n; end if;

  update public.commercial_documents set owner_id = '00000000-0000-4000-8000-000000000007'
   where id = (select id from ids where name = 'offer2');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC responsable : réattribution refusée'; end if;

  begin
    update public.commercial_documents set owner_id = '00000000-0000-4000-8000-000000000005'
     where id = (select id from ids where name = 'offer2');
    raise exception 'ECHEC responsable : attribution à une personne hors de la marque';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Après réattribution, le premier commercial ne voit plus cette offre.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.commercial_documents where id = (select id from ids where name = 'offer2');
  if n <> 0 then raise exception 'ECHEC réattribution : l''ancien commercial voit encore l''offre'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Lecture seule et autre marque
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.commercial_documents;
  if n <> 3 then raise exception 'ECHEC lecture : % documents au lieu de 3', n; end if;
  update public.commercial_documents set subject = 'Modifié';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lecture : a modifié un document'; end if;
end $$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.commercial_documents;
  if n <> 0 then raise exception 'ECHEC admin Y : voit les documents de la marque X'; end if;
  select count(*) into n from public.companies;
  if n <> 0 then raise exception 'ECHEC admin Y : voit les prospects de la marque X'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Champ personnalisé obligatoire appliqué par la base
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x constant uuid := '00000000-0000-4000-9000-00000000000a';
begin
  insert into public.custom_field_definitions (brand_id, entity, key, label, type, required)
  values (x, 'offer', 'type_bien', 'Type de bien', 'text', true);

  begin
    insert into public.commercial_documents (brand_id, kind, company_id, subject)
    values (x, 'offer', (select id from ids where name = 'company'), 'Sans champ obligatoire');
    raise exception 'ECHEC champ obligatoire ignoré à la création';
  exception when check_violation then null;
  end;

  insert into public.commercial_documents (brand_id, kind, company_id, subject, custom)
  values (x, 'offer', (select id from ids where name = 'company'), 'Avec champ', '{"type_bien": "Villa"}');

  -- Les offres plus anciennes restent modifiables.
  update public.commercial_documents set comments = 'Note' where id = (select id from ids where name = 'offer1');
end $$;
reset role;

select 'OK : tous les tests du Sprint 3 passent' as resultat;

rollback;
