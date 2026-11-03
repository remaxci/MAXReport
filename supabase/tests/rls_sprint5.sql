-- Tests · Sprint 5 (marketing : comptes sociaux, campagnes, sites web, relevés)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local'),
  ('00000000-0000-4000-8000-000000000006', 'marketing-x@test.local'),
  ('00000000-0000-4000-8000-000000000009', 'lecture-x@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000004'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-9000-00000000000a', 'marketing'),
  ('00000000-0000-4000-8000-000000000009', '00000000-0000-4000-9000-00000000000a', 'viewer')
) as v(u, b, k) join public.roles r on r.key = v.k;

create temporary table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Marketing X : comptes, relevés, garde-fous
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  x constant uuid := '00000000-0000-4000-9000-00000000000a';
  v_account uuid; v_campaign uuid; v_site uuid; v_snapshot uuid; v_by uuid;
begin
  insert into public.social_accounts (brand_id, platform, name, handle)
  values (x, 'facebook', 'Page officielle', '@marquex') returning id, created_by into v_account, v_by;
  if v_by is distinct from '00000000-0000-4000-8000-000000000006' then raise exception 'ECHEC auteur non tracé'; end if;
  insert into ids values ('account', v_account);

  begin
    insert into public.social_accounts (brand_id, platform, name) values (x, 'google_ads', 'Mauvais type');
    raise exception 'ECHEC compte social sur une plateforme publicitaire';
  exception when check_violation then null;
  end;

  insert into public.social_snapshots (brand_id, account_id, period_start, period_end, followers_total, impressions, interactions)
  values (x, v_account, '2026-10-01', '2026-10-31', 1200, 50000, 2500) returning id into v_snapshot;
  insert into ids values ('snapshot', v_snapshot);

  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end, impressions)
    values (x, v_account, '2026-10-26', '2026-11-01', 100);
    raise exception 'ECHEC relevés qui se chevauchent acceptés';
  exception when exclusion_violation then null;
  end;
  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end)
    values (x, v_account, '2026-11-01', '2026-11-07');
    raise exception 'ECHEC relevé vide accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end, impressions)
    values (x, v_account, '2026-11-08', '2026-11-01', 10);
    raise exception 'ECHEC période inversée acceptée';
  exception when check_violation then null;
  end;
  -- Période contiguë (sans chevauchement) : acceptée.
  insert into public.social_snapshots (brand_id, account_id, period_start, period_end, followers_new)
  values (x, v_account, '2026-11-01', '2026-11-07', 40);

  begin
    insert into public.campaigns (brand_id, platform, name) values (x, 'instagram', 'Mauvais type');
    raise exception 'ECHEC campagne sur une plateforme sociale';
  exception when check_violation then null;
  end;
  insert into public.campaigns (brand_id, platform, name, currency, planned_budget, start_on, end_on)
  values (x, 'meta_ads', 'Lancement', 'XOF', 500000, '2026-10-01', '2026-10-31') returning id into v_campaign;
  insert into ids values ('campaign', v_campaign);
  -- Avant tout relevé, la devise se corrige.
  update public.campaigns set currency = 'EUR' where id = v_campaign;
  update public.campaigns set currency = 'XOF' where id = v_campaign;
  insert into public.campaign_snapshots (brand_id, campaign_id, period_start, period_end, spend, impressions, clicks, leads)
  values (x, v_campaign, '2026-10-01', '2026-10-31', 450000, 120000, 3000, 45);
  begin
    update public.campaigns set currency = 'USD' where id = v_campaign;
    raise exception 'ECHEC devise modifiée après relevé';
  exception when check_violation then null;
  end;

  insert into public.websites (brand_id, name, url) values (x, 'Site vitrine', 'https://example.org') returning id into v_site;
  insert into ids values ('site', v_site);
  insert into public.website_snapshots (brand_id, website_id, period_start, period_end, users, sessions, sessions_organic, sessions_direct)
  values (x, v_site, '2026-10-01', '2026-10-31', 800, 1000, 600, 300);
  begin
    insert into public.website_snapshots (brand_id, website_id, period_start, period_end, sessions, sessions_organic)
    values (x, v_site, '2026-11-01', '2026-11-30', 100, 150);
    raise exception 'ECHEC ventilation supérieure au total des sessions';
  exception when check_violation then null;
  end;
  begin
    insert into public.websites (brand_id, name, url) values (x, 'Site', 'javascript:alert(1)');
    raise exception 'ECHEC adresse non web acceptée';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Commercial X : aucun accès au marketing ; la liste des plateformes reste lisible, jamais modifiable
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.social_accounts) + (select count(*) from public.social_snapshots)
       + (select count(*) from public.campaigns) + (select count(*) from public.campaign_snapshots)
       + (select count(*) from public.websites) + (select count(*) from public.website_snapshots) into n;
  if n <> 0 then raise exception 'ECHEC le commercial voit des données marketing : %', n; end if;
  begin
    insert into public.social_accounts (brand_id, platform, name) values ('00000000-0000-4000-9000-00000000000a', 'facebook', 'Intrus');
    raise exception 'ECHEC le commercial crée un compte social';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.platforms where kind = 'social';
  if n < 5 then raise exception 'ECHEC plateformes illisibles'; end if;
  begin
    insert into public.platforms (key, label, kind) values ('intrus', 'Intrus', 'social');
    raise exception 'ECHEC plateforme ajoutée par un utilisateur';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Lecture X : voit tout, ne modifie ni ne supprime rien
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.social_snapshots;
  if n <> 2 then raise exception 'ECHEC lecture : % relevé(s) social(aux) au lieu de 2', n; end if;
  select count(*) into n from public.campaign_snapshots;
  if n <> 1 then raise exception 'ECHEC lecture : % relevé(s) de campagne', n; end if;
  update public.campaigns set name = 'Piraté';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC la lecture a modifié une campagne'; end if;
  delete from public.social_snapshots;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC la lecture a supprimé des relevés'; end if;
end $$;
reset role;

-- Admin Y : rien de la marque X, et aucun relevé rattachable à un compte de X
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select (select count(*) from public.social_accounts) + (select count(*) from public.campaigns)
       + (select count(*) from public.websites) + (select count(*) from public.website_snapshots) into n;
  if n <> 0 then raise exception 'ECHEC admin Y voit des données marketing de X'; end if;
  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end, impressions)
    values ('00000000-0000-4000-9000-00000000000b', (select id from ids where name = 'account'), '2026-12-01', '2026-12-31', 1);
    raise exception 'ECHEC relevé de Y rattaché à un compte de X';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.social_snapshots (brand_id, account_id, period_start, period_end, impressions)
    values ('00000000-0000-4000-9000-00000000000a', (select id from ids where name = 'account'), '2026-12-01', '2026-12-31', 1);
    raise exception 'ECHEC admin Y saisit un relevé dans la marque X';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Marketing X : correction et suppression d'un relevé erroné
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; v_by uuid;
begin
  update public.social_snapshots set followers_total = 1250 where id = (select id from ids where name = 'snapshot')
  returning updated_by into v_by;
  if v_by is distinct from '00000000-0000-4000-8000-000000000006' then raise exception 'ECHEC modification non tracée'; end if;
  delete from public.social_snapshots where id = (select id from ids where name = 'snapshot');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC suppression d''un relevé'; end if;
end $$;
reset role;

select 'OK : tous les tests du Sprint 5 passent' as resultat;

rollback;
