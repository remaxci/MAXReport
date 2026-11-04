-- Tests · Choix des graphiques du tableau de bord et lecture par commercial
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'responsable-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-a@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'commercial-b@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000c', 'TESTZ', 'test-z', 'Marque Z');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000003'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'sales_manager'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000a', 'sales_rep')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Une fiche soumise pour chaque commercial.
insert into public.weekly_reports (brand_id, user_id, week_start, calls_prospecting, status) values
  ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-8000-000000000004', date '2026-10-05', 10, 'submitted'),
  ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-8000-000000000005', date '2026-10-05', 25, 'submitted');

-- ---------------------------------------------------------------------
-- Préférences : chacun les siennes
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

insert into public.dashboard_chart_preferences (brand_id, hidden)
values ('00000000-0000-4000-9000-00000000000a', '{commercial.revenue,social.followers}');

do $$
begin
  if (select user_id from public.dashboard_chart_preferences) <> '00000000-0000-4000-8000-000000000004' then
    raise exception 'ECHEC la préférence n''appartient pas à son auteur';
  end if;

  -- Pour une autre personne : refusé.
  begin
    insert into public.dashboard_chart_preferences (user_id, brand_id)
    values ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000a');
    raise exception 'ECHEC préférence créée pour une autre personne';
  exception when insufficient_privilege then null;
  end;

  -- Sur une marque non lisible : refusé.
  begin
    insert into public.dashboard_chart_preferences (brand_id)
    values ('00000000-0000-4000-9000-00000000000c');
    raise exception 'ECHEC préférence créée sur une marque non lisible';
  exception when insufficient_privilege then null;
  end;

  -- Contenu libre : refusé.
  begin
    insert into public.dashboard_chart_preferences (brand_id, hidden)
    values ('00000000-0000-4000-9000-00000000000a', '{"<script>"}')
    on conflict (user_id, brand_id) do update set hidden = excluded.hidden;
    raise exception 'ECHEC clé de graphique invalide acceptée';
  exception when check_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.dashboard_chart_preferences) then
    raise exception 'ECHEC préférences d''un autre lues';
  end if;
  update public.dashboard_chart_preferences set hidden = '{}';
  if found then
    raise exception 'ECHEC préférences d''un autre modifiées';
  end if;
  begin
    delete from public.dashboard_chart_preferences;
    raise exception 'ECHEC suppression autorisée';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Lecture par commercial : le responsable voit chacun, un commercial seulement lui-même
-- ---------------------------------------------------------------------
do $$
declare
  v_ids uuid[];
begin
  select array_agg(distinct user_id) into v_ids
  from public.metric_actuals('00000000-0000-4000-9000-00000000000a', date '2026-10-01', date '2026-10-31')
  where user_id is not null;
  if v_ids <> array['00000000-0000-4000-8000-000000000005'::uuid] then
    raise exception 'ECHEC un commercial voit les chiffres individuels d''un collègue : %', v_ids;
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

do $$
declare
  v_count int;
begin
  select count(distinct user_id) into v_count
  from public.metric_actuals('00000000-0000-4000-9000-00000000000a', date '2026-10-01', date '2026-10-31')
  where user_id is not null;
  if v_count <> 2 then
    raise exception 'ECHEC le responsable devrait voir 2 commerciaux, il en voit %', v_count;
  end if;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Sans session : rien
-- ---------------------------------------------------------------------
set local role anon;
do $$
begin
  perform 1 from public.dashboard_chart_preferences;
  raise exception 'ECHEC lecture sans session';
exception when insufficient_privilege then null;
end;
$$;
reset role;

select 'OK : tous les tests des préférences de graphiques passent' as resultat;

rollback;
