-- Tests · Sprint 7 (budgets, lignes, dépenses, taux de change, import des dépenses)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'super@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'admin-x@test.local'),
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'marketing-x@test.local'),
  ('00000000-0000-4000-8000-000000000008', 'responsable-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, null::uuid, 'super_admin'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-9000-00000000000a', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000a', 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-9000-00000000000a', 'marketing'),
  ('00000000-0000-4000-8000-000000000008', '00000000-0000-4000-9000-00000000000a', 'sales_manager')
) as v(u, b, k) join public.roles r on r.key = v.k;

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Marketing X : budget, lignes, dépenses et garde-fous
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_campaign uuid; v_other uuid; v_budget uuid; v_line uuid; v_free uuid; v_expense uuid;
  v_camp_of uuid; v_paid date; n int;
begin
  insert into public.campaigns (brand_id, platform, name) values (x, 'meta_ads', 'Lancement') returning id into v_campaign;
  insert into public.campaigns (brand_id, platform, name) values (x, 'google_ads', 'Recherche') returning id into v_other;
  insert into public.budgets (brand_id, name, period_start, period_end, amount, currency)
  values (x, 'Marketing 2026', '2026-01-01', '2026-12-31', 10000000, 'XOF') returning id into v_budget;
  insert into public.budget_lines (brand_id, budget_id, label, category, campaign_id, amount)
  values (x, v_budget, 'Meta Ads', 'media', v_campaign, 3000000) returning id into v_line;
  insert into public.budget_lines (brand_id, budget_id, label, category, amount)
  values (x, v_budget, 'Impression', 'impression', 1000000) returning id into v_free;
  insert into ids values ('budget', v_budget), ('line', v_line), ('free', v_free);

  begin
    insert into public.budget_lines (brand_id, budget_id, label, campaign_id, amount) values (x, v_budget, 'Doublon', v_campaign, 1);
    raise exception 'ECHEC deux lignes pour une même campagne';
  exception when unique_violation then null;
  end;

  -- La campagne de la ligne est reprise par la dépense ; le paiement est daté.
  insert into public.expenses (brand_id, budget_line_id, supplier, description, expense_date, amount, currency, status, external_ref)
  values (x, v_line, 'Meta', 'Facture octobre', '2026-10-31', 450000, 'XOF', 'paid', 'F-001')
  returning id, campaign_id, paid_on into v_expense, v_camp_of, v_paid;
  if v_camp_of is distinct from v_campaign then raise exception 'ECHEC campagne non reprise de la ligne'; end if;
  if v_paid is null then raise exception 'ECHEC paiement non daté'; end if;
  insert into ids values ('expense', v_expense);

  begin
    insert into public.expenses (brand_id, budget_line_id, campaign_id, description, expense_date, amount, currency)
    values (x, v_line, v_other, 'Mauvaise campagne', '2026-10-01', 10, 'XOF');
    raise exception 'ECHEC dépense rattachée à une autre campagne que sa ligne';
  exception when check_violation then null;
  end;
  begin
    insert into public.expenses (brand_id, budget_line_id, supplier, description, expense_date, amount, currency, external_ref)
    values (x, v_free, 'META', 'Même facture', '2026-11-02', 1, 'XOF', 'F-001');
    raise exception 'ECHEC facture enregistrée deux fois';
  exception when unique_violation then null;
  end;
  begin
    insert into public.expenses (brand_id, budget_line_id, description, expense_date, amount, currency)
    values (x, v_free, 'Montant nul', '2026-11-02', 0, 'XOF');
    raise exception 'ECHEC dépense à zéro';
  exception when check_violation then null;
  end;

  -- Repasser en engagé efface la date de paiement.
  update public.expenses set status = 'committed' where id = v_expense returning paid_on into v_paid;
  if v_paid is not null then raise exception 'ECHEC date de paiement conservée'; end if;

  begin
    delete from public.budget_lines where id = v_line;
    raise exception 'ECHEC ligne supprimée malgré ses dépenses';
  exception when foreign_key_violation then null;
  end;
  delete from public.expenses where id = v_expense;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC dépense saisie supprimée (elle s''archive)'; end if;

  update public.budgets set status = 'closed' where id = v_budget;
  begin
    insert into public.expenses (brand_id, budget_line_id, description, expense_date, amount, currency)
    values (x, v_free, 'Après clôture', '2026-12-15', 100, 'XOF');
    raise exception 'ECHEC dépense sur un budget clôturé';
  exception when check_violation then null;
  end;
  update public.budgets set status = 'approved' where id = v_budget;
end $$;
reset role;

-- Commercial X : rien ; Responsable X : lecture seule
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.budgets) + (select count(*) from public.budget_lines) + (select count(*) from public.expenses) into n;
  if n <> 0 then raise exception 'ECHEC le commercial voit les budgets'; end if;
  begin
    insert into public.budgets (brand_id, name, period_start, period_end, amount)
    values ('00000000-0000-4000-9000-00000000000a', 'Intrus', '2026-01-01', '2026-12-31', 1);
    raise exception 'ECHEC le commercial crée un budget';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.budget_lines;
  if n <> 2 then raise exception 'ECHEC lecture des lignes : %', n; end if;
  select count(*) into n from public.expenses;
  if n <> 1 then raise exception 'ECHEC lecture des dépenses : %', n; end if;
  update public.budgets set amount = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC la lecture a modifié un budget'; end if;
end $$;
reset role;

-- Admin Y : rien de X, et aucune dépense de Y sur une ligne de X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.budgets) + (select count(*) from public.expenses) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit les budgets de X'; end if;
  begin
    insert into public.expenses (brand_id, budget_line_id, description, expense_date, amount, currency)
    values ('00000000-0000-4000-9000-00000000000b', (select id from ids where name = 'free'), 'Intrus', '2026-11-02', 1, 'XOF');
    raise exception 'ECHEC dépense de Y sur une ligne de X';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;
reset role;

-- Taux de change : lisibles par tous, saisis par un rôle global seulement
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values ('2026-10-31', 'USD', 'XOF', 600, 'BCEAO');
    raise exception 'ECHEC un administrateur de marque saisit un taux';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_by uuid;
begin
  insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source)
  values ('2026-10-31', 'USD', 'XOF', 605.5, 'BCEAO') returning created_by into v_by;
  if v_by is distinct from '00000000-0000-4000-8000-000000000001' then raise exception 'ECHEC auteur du taux'; end if;
  begin
    insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values ('2026-10-31', 'EUR', 'XOF', 656, 'Erreur');
    raise exception 'ECHEC parité EUR/XOF saisie';
  exception when check_violation then null;
  end;
  begin
    insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values ('2026-10-31', 'USD', 'XOF', 610, 'Doublon');
    raise exception 'ECHEC deux taux pour un même jour';
  exception when unique_violation then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.fx_rates where rate_date = '2026-10-31';
  if n <> 1 then raise exception 'ECHEC taux illisible'; end if;
end $$;
reset role;

-- Marketing X : import de dépenses puis annulation du lot
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare x constant uuid := '00000000-0000-4000-9000-00000000000a'; v_batch uuid; n int;
begin
  insert into public.import_batches (brand_id, target, file_name, file_size, file_sha256, headers, rows, row_count)
  values (x, 'expenses', 'factures.xlsx', 900, repeat('f', 64), '["Libellé","Montant"]', '[["Affiches",250000]]', 1)
  returning id into v_batch;
  n := public.commit_import(v_batch, jsonb_build_array(jsonb_build_object(
    'budget_line_id', (select id from ids where name = 'free'), 'supplier', 'Imprimerie', 'description', 'Affiches',
    'expense_date', '2026-11-02', 'amount', 250000, 'currency', 'XOF', 'status', 'paid', 'paid_on', '2026-11-03')), 0, 0, '{}');
  if n <> 1 then raise exception 'ECHEC import de dépenses : %', n; end if;
  select count(*) into n from public.expenses where import_batch_id = v_batch and source = 'import' and paid_on = '2026-11-03';
  if n <> 1 then raise exception 'ECHEC dépense importée'; end if;
  n := public.rollback_import(v_batch);
  if n <> 1 then raise exception 'ECHEC annulation des dépenses : %', n; end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 7 passent' as resultat;

rollback;
