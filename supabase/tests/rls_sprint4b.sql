-- Tests · Sprint 4b (fiches d'activité, objectifs, réalisés)
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

-- Commercial X : fiche de la semaine, opportunité, contrat
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  monday constant date := date_trunc('week', current_date)::date;
  v_company uuid;
  v_submitted timestamptz;
begin
  insert into public.weekly_reports (brand_id, week_start, calls_prospecting, calls_follow_up, emails_sent, qualified_meetings, status)
  values (x, monday, 10, 5, 20, 3, 'submitted');
  select submitted_at into v_submitted from public.weekly_reports where brand_id = x and week_start = monday;
  if v_submitted is null then raise exception 'ECHEC fiche soumise sans date de soumission'; end if;

  begin
    insert into public.weekly_reports (brand_id, week_start) values (x, monday + 2);
    raise exception 'ECHEC fiche acceptée sur un autre jour que le lundi';
  exception when check_violation then null;
  end;
  begin
    insert into public.weekly_reports (brand_id, week_start, status) values (x, monday - 7, 'validated');
    raise exception 'ECHEC fiche créée directement validée';
  exception when check_violation then null;
  end;
  begin
    update public.weekly_reports set status = 'validated' where brand_id = x and week_start = monday;
    raise exception 'ECHEC le commercial a validé sa propre fiche';
  exception when insufficient_privilege then null;
  end;

  insert into public.companies (brand_id, name) values (x, 'Alpha') returning id into v_company;
  insert into public.opportunities (brand_id, company_id, title, stage_id)
  values (x, v_company, 'Mandat', (select id from public.pipeline_stages where brand_id = x and key = 'qualification'));
  insert into public.contracts (brand_id, company_id, title, signed_on, amount, currency)
  values (x, v_company, 'Contrat', current_date, 1000000, 'XOF');
end $$;
reset role;

-- Second commercial : ne voit ni la fiche ni le détail des réalisés du collègue
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  n int;
  v_team numeric;
begin
  select count(*) into n from public.weekly_reports;
  if n <> 0 then raise exception 'ECHEC commercial 2 voit la fiche d''un collègue'; end if;
  select count(*) into n from public.metric_actuals(x, date_trunc('month', current_date)::date, current_date + 7)
   where user_id = '00000000-0000-4000-8000-000000000004';
  if n <> 0 then raise exception 'ECHEC commercial 2 voit le détail des réalisés d''un collègue'; end if;
  select sum(value) into v_team from public.metric_actuals(x, date_trunc('week', current_date)::date, current_date + 7)
   where metric_key = 'calls';
  if v_team is distinct from 15 then raise exception 'ECHEC total d''équipe des appels : % au lieu de 15', v_team; end if;
end $$;
reset role;

-- Responsable : voit, valide ; la fiche validée se verrouille pour son auteur
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_by uuid;
  v_calls numeric;
  v_opps numeric;
  v_revenue numeric;
begin
  update public.weekly_reports set status = 'validated' where brand_id = x and week_start = date_trunc('week', current_date)::date;
  select validated_by into v_by from public.weekly_reports where brand_id = x and week_start = date_trunc('week', current_date)::date;
  if v_by is distinct from '00000000-0000-4000-8000-000000000008' then raise exception 'ECHEC validation non tracée'; end if;

  select value into v_calls from public.metric_actuals(x, date_trunc('week', current_date)::date, current_date + 7)
   where user_id = '00000000-0000-4000-8000-000000000004' and metric_key = 'calls';
  if v_calls is distinct from 15 then raise exception 'ECHEC appels du commercial : %', v_calls; end if;
  select value into v_opps from public.metric_actuals(x, current_date - 1, current_date + 1)
   where user_id = '00000000-0000-4000-8000-000000000004' and metric_key = 'opportunities_created';
  if v_opps is distinct from 1 then raise exception 'ECHEC opportunités créées (CRM) : %', v_opps; end if;
  select value into v_revenue from public.metric_actuals(x, current_date - 1, current_date + 1)
   where user_id = '00000000-0000-4000-8000-000000000004' and metric_key = 'revenue_signed' and currency = 'XOF';
  if v_revenue is distinct from 1000000 then raise exception 'ECHEC CA signé : %', v_revenue; end if;

  insert into public.objectives (brand_id, user_id, metric_key, period_start, period_end, target_value)
  values
    (x, '00000000-0000-4000-8000-000000000004', 'calls', date_trunc('month', current_date), date_trunc('month', current_date) + interval '1 month' - interval '1 day', 100),
    (x, '00000000-0000-4000-8000-000000000007', 'calls', date_trunc('month', current_date), date_trunc('month', current_date) + interval '1 month' - interval '1 day', 80),
    (x, null, 'contracts_signed', date_trunc('year', current_date), date_trunc('year', current_date) + interval '1 year' - interval '1 day', 5);
  begin
    insert into public.objectives (brand_id, metric_key, period_start, period_end, target_value)
    values (x, 'revenue_signed', current_date, current_date + 30, 1000);
    raise exception 'ECHEC objectif de chiffre d''affaires sans devise';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Le commercial : fiche validée verrouillée, objectifs visibles (les siens et l'équipe)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  n int;
begin
  begin
    update public.weekly_reports set calls_prospecting = 99 where brand_id = x and week_start = date_trunc('week', current_date)::date;
    raise exception 'ECHEC fiche validée modifiée par son auteur';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.objectives;
  if n <> 2 then raise exception 'ECHEC objectifs visibles par le commercial : % au lieu de 2', n; end if;
  begin
    insert into public.objectives (brand_id, metric_key, period_start, period_end, target_value)
    values (x, 'calls', current_date, current_date + 30, 10);
    raise exception 'ECHEC le commercial a défini un objectif';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Lecture seule et autre marque
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.weekly_reports;
  if n <> 1 then raise exception 'ECHEC lecture : % fiche(s)', n; end if;
  update public.weekly_reports set comments = 'x';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC lecture : fiche modifiée'; end if;
  select count(*) into n from public.objectives;
  if n <> 3 then raise exception 'ECHEC lecture : % objectif(s) au lieu de 3', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.weekly_reports) + (select count(*) from public.objectives)
       + (select count(*) from public.metric_actuals('00000000-0000-4000-9000-00000000000a', current_date - 30, current_date + 30))
    into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit des données de la marque X'; end if;
end $$;
reset role;

-- Module CRM désactivé : les opportunités viennent de la déclaration hebdomadaire.
-- (opérations d'administration : aucun utilisateur connecté)
select set_config('request.jwt.claims', '', true);
update public.brand_modules set enabled = false
 where brand_id = '00000000-0000-4000-9000-00000000000a' and module_key = 'crm';
update public.weekly_reports set opportunities_declared = 4
 where brand_id = '00000000-0000-4000-9000-00000000000a';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v numeric;
begin
  select value into v from public.metric_actuals('00000000-0000-4000-9000-00000000000a', date_trunc('week', current_date)::date, current_date + 7)
   where user_id = '00000000-0000-4000-8000-000000000004' and metric_key = 'opportunities_created';
  if v is distinct from 4 then raise exception 'ECHEC source déclarative des opportunités : %', v; end if;
end $$;
reset role;

-- Collaborateurs suivis : les rôles qui remplissent une fiche, pas le lecteur ni l'admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.activity_members('00000000-0000-4000-9000-00000000000a');
  if n <> 4 then raise exception 'ECHEC collaborateurs suivis : % au lieu de 4', n; end if;
  if exists (select 1 from public.activity_members('00000000-0000-4000-9000-00000000000a')
             where user_id = '00000000-0000-4000-8000-000000000009') then
    raise exception 'ECHEC le lecteur figure parmi les collaborateurs suivis';
  end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.activity_members('00000000-0000-4000-9000-00000000000a');
  if n <> 0 then raise exception 'ECHEC admin Y voit les collaborateurs suivis de la marque X'; end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 4b passent' as resultat;

rollback;
