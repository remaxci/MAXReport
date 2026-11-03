-- Tests · Sprint 8 (modèles de rapports, vue Direction)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000002', 'direction@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'marketing-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000002'::uuid, null::uuid, 'direction'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-9000-00000000000a', 'marketing')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Marketing X : crée un modèle ; sections hors liste refusées
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x constant uuid := '00000000-0000-4000-9000-00000000000a'; v_by uuid;
begin
  insert into public.report_templates (brand_id, name, sections, period_kind)
  values (x, 'Rapport mensuel', array['social', 'campaigns', 'budgets'], 'month') returning created_by into v_by;
  if v_by is distinct from '00000000-0000-4000-8000-000000000006' then raise exception 'ECHEC auteur du modèle'; end if;
  begin
    insert into public.report_templates (brand_id, name, sections) values (x, 'Pirate', array['salaires']);
    raise exception 'ECHEC section inconnue acceptée';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Commercial X : lit le modèle, ne le modifie pas
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.report_templates;
  if n <> 1 then raise exception 'ECHEC le commercial ne voit pas le modèle'; end if;
  update public.report_templates set name = 'Piraté';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC le commercial a modifié un modèle'; end if;
  begin
    insert into public.report_templates (brand_id, name, sections) values ('00000000-0000-4000-9000-00000000000a', 'Intrus', array['commercial']);
    raise exception 'ECHEC le commercial crée un modèle';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Admin Y : rien de X ; Direction : lit tout, ne crée rien
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.report_templates;
  if n <> 0 then raise exception 'ECHEC admin Y voit les modèles de X'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.report_templates;
  if n <> 1 then raise exception 'ECHEC la Direction ne voit pas le modèle'; end if;
  if not (select app.has_global_permission('direction.read')) then raise exception 'ECHEC la Direction n''a pas la vue consolidée'; end if;
  begin
    insert into public.report_templates (brand_id, name, sections) values ('00000000-0000-4000-9000-00000000000b', 'Direction', array['commercial']);
    raise exception 'ECHEC la Direction crée un modèle';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK : tous les tests du Sprint 8 passent' as resultat;

rollback;
