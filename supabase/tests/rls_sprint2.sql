-- Tests · Sprint 2 (modules, listes, statuts, pipeline, champs personnalisés)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- Le script s'arrête sur la première règle non respectée (message « ECHEC … »).

begin;

-- ---------------------------------------------------------------------
-- Données de test (les marques reçoivent leurs valeurs par défaut par trigger)
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'super@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, null::uuid, 'super_admin'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-9000-00000000000a', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin')
) as v(u, b, k)
join public.roles r on r.key = v.k;

-- ---------------------------------------------------------------------
-- Valeurs par défaut posées à la création d'une marque
-- ---------------------------------------------------------------------
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  n int;
begin
  select count(*) into n from public.brand_modules where brand_id = x and enabled;
  if n <> 13 then raise exception 'ECHEC valeurs par défaut : % modules au lieu de 13', n; end if;
  select count(*) into n from public.option_lists where brand_id = x and is_system;
  if n <> 4 then raise exception 'ECHEC valeurs par défaut : % listes au lieu de 4', n; end if;
  select count(*) into n from public.statuses where brand_id = x and entity = 'offer';
  if n <> 7 then raise exception 'ECHEC valeurs par défaut : % statuts d''offre au lieu de 7', n; end if;
  select count(*) into n from public.statuses where brand_id = x and is_default;
  if n <> 4 then raise exception 'ECHEC valeurs par défaut : % statuts par défaut au lieu de 4', n; end if;
  select count(*) into n from public.pipeline_stages where brand_id = x and category in ('won', 'lost') and is_system;
  if n <> 2 then raise exception 'ECHEC valeurs par défaut : étapes gagnée/perdue absentes'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Commercial X : lit le paramétrage de sa marque, ne le modifie pas
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  n int;
begin
  select count(*) into n from public.statuses where brand_id = x;
  if n <> 23 then raise exception 'ECHEC commercial X : % statuts lisibles au lieu de 23', n; end if;
  select count(*) into n from public.statuses where brand_id = y;
  if n <> 0 then raise exception 'ECHEC commercial X : lit les statuts de Y'; end if;
  select count(*) into n from public.option_items where brand_id = y;
  if n <> 0 then raise exception 'ECHEC commercial X : lit les listes de Y'; end if;

  begin
    insert into public.statuses (brand_id, entity, key, label, category)
    values (x, 'offer', 'test', 'Test', 'active');
    raise exception 'ECHEC commercial X : a créé un statut';
  exception when insufficient_privilege then null;
  end;

  update public.pipeline_stages set label = 'Piraté' where brand_id = x;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC commercial X : a modifié le pipeline'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Administrateur X : paramètre sa marque, dans les limites des garde-fous
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  y constant uuid := '00000000-0000-4000-9000-00000000000b';
  n int;
  v_list uuid;
  v_ids uuid[];
begin
  insert into public.statuses (brand_id, entity, key, label, category, color)
  values (x, 'offer', 'en_attente_signature', 'En attente de signature', 'active', '#0ea5e9');

  begin
    insert into public.statuses (brand_id, entity, key, label, category)
    values (y, 'offer', 'pirate', 'Piraté', 'active');
    raise exception 'ECHEC admin X : statut créé dans la marque Y';
  exception when insufficient_privilege then null;
  end;

  update public.statuses set label = 'Signée' where brand_id = x and entity = 'offer' and key = 'acceptee';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC admin X : renommage d''un statut refusé'; end if;

  begin
    update public.statuses set category = 'failure' where brand_id = x and key = 'acceptee';
    raise exception 'ECHEC admin X : catégorie d''un statut modifiée';
  exception when check_violation then null;
  end;

  begin
    update public.statuses set is_active = false where brand_id = x and entity = 'offer' and is_default;
    raise exception 'ECHEC admin X : statut par défaut désactivé';
  exception when check_violation then null;
  end;

  begin
    update public.pipeline_stages set is_active = false where brand_id = x and key = 'gagnee';
    raise exception 'ECHEC admin X : étape « gagnée » désactivée';
  exception when check_violation then null;
  end;

  begin
    insert into public.pipeline_stages (brand_id, key, label, category, is_system)
    values (x, 'faux_systeme', 'Faux', 'won', true);
    raise exception 'ECHEC admin X : étape système créée';
  exception when insufficient_privilege then null;
  end;

  update public.brand_modules set enabled = false where brand_id = x and module_key = 'budgets';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC admin X : a désactivé un module (réservé au super-admin)'; end if;

  delete from public.option_lists where brand_id = x and is_system;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC admin X : a supprimé une liste système'; end if;

  insert into public.option_lists (brand_id, key, label) values (x, 'types_bien', 'Types de bien')
  returning id into v_list;
  insert into public.option_items (brand_id, list_id, value, label, position) values
    (x, v_list, 'appartement', 'Appartement', 10),
    (x, v_list, 'villa', 'Villa', 20),
    (x, v_list, 'bureau', 'Bureau', 30);

  begin
    update public.option_items set value = 'autre' where list_id = v_list and value = 'villa';
    raise exception 'ECHEC admin X : valeur d''un choix modifiée';
  exception when check_violation then null;
  end;

  -- Réordonnancement : marque X acceptée, marque Y ignorée par la RLS.
  select array_agg(id order by position desc) into v_ids from public.pipeline_stages where brand_id = x;
  perform public.reorder_config('pipeline_stages', x, v_ids);
  select count(*) into n from public.pipeline_stages where brand_id = x and key = 'perdue' and position = 10;
  if n <> 1 then raise exception 'ECHEC admin X : réordonnancement non appliqué'; end if;

  begin
    perform public.reorder_config('brands', x, v_ids);
    raise exception 'ECHEC admin X : réordonnancement d''une table non autorisée';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Champs personnalisés : définition et validation des valeurs
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_sources uuid;
  v_industries uuid;
  e text[];
  v_valid jsonb;
begin
  select id into v_sources from public.option_lists where brand_id = x and key = 'lead_sources';
  select id into v_industries from public.option_lists where brand_id = x and key = 'industries';

  insert into public.custom_field_definitions
    (brand_id, entity, key, label, type, options_list_id, required, validation, write_permission, position)
  values
    (x, 'offer', 'ref_interne', 'Référence interne', 'text', null, true, '{"max_length": 10}', null, 10),
    (x, 'offer', 'surface', 'Surface', 'number', null, false, '{"min": 0, "max": 1000}', null, 20),
    (x, 'offer', 'budget_client', 'Budget client', 'money', null, false, '{}', null, 30),
    (x, 'offer', 'echeance', 'Échéance', 'date', null, false, '{}', null, 40),
    (x, 'offer', 'vip', 'Client VIP', 'boolean', null, false, '{}', null, 50),
    (x, 'offer', 'source', 'Source', 'select', v_sources, false, '{}', null, 60),
    (x, 'offer', 'secteurs', 'Secteurs', 'multiselect', v_industries, false, '{}', null, 70),
    (x, 'offer', 'contact_mail', 'E-mail du contact', 'email', null, false, '{}', null, 80),
    (x, 'offer', 'site', 'Site', 'url', null, false, '{}', null, 90),
    (x, 'offer', 'tel', 'Téléphone', 'phone', null, false, '{}', null, 100),
    (x, 'offer', 'responsable', 'Responsable', 'user', null, false, '{}', null, 110),
    (x, 'offer', 'note_direction', 'Note de la direction', 'long_text', null, false, '{}', 'members.manage', 120);

  begin
    update public.custom_field_definitions set type = 'number' where brand_id = x and key = 'ref_interne';
    raise exception 'ECHEC champs : type d''un champ modifié';
  exception when check_violation then null;
  end;

  begin
    insert into public.custom_field_definitions (brand_id, entity, key, label, type, validation)
    values (x, 'offer', 'regle_libre', 'Règle libre', 'text', '{"pattern": ".*"}');
    raise exception 'ECHEC champs : règle de validation non autorisée acceptée';
  exception when check_violation then null;
  end;

  v_valid := jsonb_build_object(
    'ref_interne', 'OF-12',
    'surface', 120.5,
    'budget_client', jsonb_build_object('amount', 25000000, 'currency', 'XOF'),
    'echeance', '2026-12-31',
    'vip', true,
    'source', 'recommandation',
    'secteurs', jsonb_build_array('immobilier', 'services'),
    'contact_mail', 'contact@exemple.ci',
    'site', 'https://exemple.ci',
    'tel', '+225 07 00 00 00 00',
    'responsable', '00000000-0000-4000-8000-000000000004',
    'note_direction', 'Priorité haute'
  );

  e := app.custom_values_errors(x, 'offer', v_valid);
  if cardinality(e) <> 0 then
    raise exception 'ECHEC validation : valeurs valides refusées (%)', array_to_string(e, ' | ');
  end if;

  e := app.custom_values_errors(x, 'offer', v_valid - 'ref_interne');
  if not exists (select 1 from unnest(e) m where m like '%Référence interne%obligatoire%') then
    raise exception 'ECHEC validation : champ obligatoire manquant accepté à la création';
  end if;

  -- En modification, un champ obligatoire jamais rempli ne bloque pas…
  e := app.custom_values_errors(x, 'offer', v_valid - 'ref_interne', v_valid - 'ref_interne');
  if cardinality(e) <> 0 then
    raise exception 'ECHEC validation : fiche ancienne bloquée par un champ obligatoire (%)', array_to_string(e, ' | ');
  end if;
  -- … mais on ne peut pas vider une valeur existante.
  e := app.custom_values_errors(x, 'offer', v_valid - 'ref_interne', v_valid);
  if cardinality(e) = 0 then raise exception 'ECHEC validation : champ obligatoire vidé accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"inconnu": 1}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : champ inconnu accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"ref_interne": "TROP-LONG-123"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : longueur maximale ignorée'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"surface": "120"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : nombre en texte accepté'; end if;
  e := app.custom_values_errors(x, 'offer', v_valid || '{"surface": 5000}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : maximum ignoré'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"budget_client": {"amount": 10, "currency": "GBP"}}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : devise invalide acceptée'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"echeance": "2026-02-30"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : date impossible acceptée'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"vip": "oui"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : booléen en texte accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"source": "inexistante"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : choix inexistant accepté'; end if;

  update public.option_items set is_active = false where list_id = v_sources and value = 'partenaire';
  e := app.custom_values_errors(x, 'offer', v_valid || '{"source": "partenaire"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : choix désactivé accepté'; end if;

  -- Une fiche qui portait déjà ce choix reste modifiable.
  e := app.custom_values_errors(x, 'offer',
    v_valid || '{"source": "partenaire", "surface": 200}',
    v_valid || '{"source": "partenaire"}');
  if cardinality(e) <> 0 then
    raise exception 'ECHEC validation : valeur inchangée revalidée (%)', array_to_string(e, ' | ');
  end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"secteurs": ["immobilier", "inexistant"]}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : choix multiple invalide accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"contact_mail": "pas-un-email"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : e-mail invalide accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"site": "exemple.ci"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : URL sans http accepté'; end if;

  e := app.custom_values_errors(x, 'offer', v_valid || '{"responsable": "00000000-0000-4000-8000-000000000005"}');
  if cardinality(e) = 0 then raise exception 'ECHEC validation : collaborateur d''une autre marque accepté'; end if;
end $$;
reset role;

-- Le commercial ne peut pas modifier un champ protégé par une permission.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  e text[];
begin
  e := app.custom_values_errors(x, 'offer',
    '{"ref_interne": "OF-12", "note_direction": "Modifiée"}',
    '{"ref_interne": "OF-12", "note_direction": "Priorité haute"}');
  if not exists (select 1 from unnest(e) m where m like '%Note de la direction%') then
    raise exception 'ECHEC validation : champ protégé modifié sans la permission';
  end if;

  e := app.custom_values_errors(x, 'offer',
    '{"ref_interne": "OF-13", "note_direction": "Priorité haute"}',
    '{"ref_interne": "OF-12", "note_direction": "Priorité haute"}');
  if cardinality(e) <> 0 then
    raise exception 'ECHEC validation : champ libre refusé au commercial (%)', array_to_string(e, ' | ');
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Super-administrateur : active et désactive les modules
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update public.brand_modules set enabled = false
   where brand_id = '00000000-0000-4000-9000-00000000000a' and module_key = 'budgets';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC super-admin : désactivation d''un module refusée'; end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 2 passent' as resultat;

rollback;
