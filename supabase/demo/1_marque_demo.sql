-- Marque DEMO : données FICTIVES de démonstration, mai à octobre 2026, en XOF seulement.
-- Aucune ligne n'est ajoutée à une autre marque ni aux tables communes (taux de change, plateformes).
do $demo$
declare
  v_owner uuid;
  v_brand uuid;
  v_status jsonb;
  v_stage jsonb;
  v_names text[] := array['Alpha Habitat','Bêta Patrimoine','Gamma Invest','Delta Résidences','Epsilon Conseil','Zêta Assurances','Êta Distribution','Thêta Industrie','Iota Services','Kappa Foncier','Lambda Logistique','Mu Promotion','Nu Télécoms','Xi Hôtellerie','Omicron Santé','Pi Éducation','Rhô Énergie','Sigma Construction','Tau Transports','Upsilon Agro','Phi Finance','Chi Communication','Psi Technologies','Oméga Immobilier'];
  v_sectors text[] := array['immobilier','banque_assurance','industrie','commerce','services','secteur_public','autre'];
  v_sources text[] := array['recommandation','site_web','reseaux_sociaux','evenement','prospection','partenaire'];
  v_cities text[] := array['Abidjan','Bouaké','San-Pédro','Yamoussoukro'];
  v_jobs text[] := array['Direction générale','Direction administrative','Responsable patrimoine','Responsable achats'];
  v_co_status text[] := array['contacte','qualifie','client','nouveau','qualifie','client','contacte','perdu'];
  v_titles text[] := array['Mandat de vente','Mandat de gestion','Accompagnement à l''acquisition','Location de bureaux','Estimation de patrimoine','Mise en location'];
  v_lost text[] := array['Budget insuffisant','Concurrent retenu','Projet reporté'];
  v_suppliers text[] := array['Prestataire Démo A','Prestataire Démo B','Prestataire Démo C','Prestataire Démo D','Prestataire Démo E'];
  v_today constant date := date '2026-11-04';
  v_first constant date := date '2026-05-01';
  v_last constant date := date '2026-10-31';
  v_note constant text := 'Donnée fictive de démonstration.';
  v_companies uuid[] := '{}';
  v_contacts uuid[] := '{}';
  v_n int;
  i int; k int; m int;
  r numeric;
  v_id uuid; v_prev uuid; v_line uuid; v_budget uuid; v_budget2 uuid;
  v_date date; v_sent date; v_follow date; v_closed date; v_start date; v_end date; v_s date; v_e date; v_paid date;
  v_key text; v_expense_status text;
  v_amount numeric; v_spend numeric; v_imp bigint; v_clicks bigint; v_leads bigint; v_conv bigint; v_sessions bigint; v_users bigint;
  v_org bigint; v_dir bigint; v_soc bigint; v_paid_s bigint; v_ref bigint; v_mail bigint;
  v_followers bigint; v_new bigint; v_interactions bigint;
  v_nb int; v_seq int := 0;
  v_rec record; v_p jsonb;
  v_span int; v_ntasks int;
  v_milestones uuid[]; v_ms_due date; v_task_start date; v_task_due date; v_progress int;
begin
  if exists (select 1 from public.brands where code = 'DEMO' or slug = 'demo') then
    raise exception 'La marque DEMO existe déjà.';
  end if;
  select m0.user_id into strict v_owner
    from public.memberships m0 join public.roles r0 on r0.id = m0.role_id
   where r0.key = 'super_admin' and m0.brand_id is null;

  perform setseed(0.42);

  insert into public.brands (code, slug, name, primary_color, reporting_currency)
  values ('DEMO', 'demo', 'DEMO – Données fictives', '#b45309', 'XOF')
  returning id into v_brand;

  select jsonb_object_agg(entity || ':' || key, id) into v_status from public.statuses where brand_id = v_brand;
  select jsonb_object_agg(key, id) into v_stage from public.pipeline_stages where brand_id = v_brand;

  -- Prospects et contacts ---------------------------------------------
  v_n := array_length(v_names, 1);
  for i in 1..v_n loop
    v_date := date '2026-05-04' + ((i - 1) * 6);
    insert into public.companies (brand_id, name, sector, city, country, owner_id, source, status_id, created_at)
    values (v_brand, v_names[i] || ' (démo)', v_sectors[1 + (i - 1) % 7], v_cities[1 + (i - 1) % 4], 'Côte d''Ivoire', v_owner,
            v_sources[1 + (i - 1) % 6], (v_status ->> ('company:' || v_co_status[1 + (i - 1) % 8]))::uuid, (v_date + time '09:00')::timestamptz)
    returning id into v_id;
    v_companies := v_companies || v_id;
    insert into public.contacts (brand_id, company_id, full_name, job_title, email, created_at)
    values (v_brand, v_id, 'Contact Démo ' || lpad(i::text, 2, '0'), v_jobs[1 + (i - 1) % 4],
            'contact' || lpad(i::text, 2, '0') || '@exemple.test', (v_date + time '09:30')::timestamptz)
    returning id into v_id;
    v_contacts := v_contacts || v_id;
  end loop;

  -- Offres (dans l'ordre chronologique : N°0001, N°0002…) --------------
  for i in 1..36 loop
    v_date := date '2026-05-04' + ((i - 1) * 5);
    k := 1 + (i * 5) % v_n;
    r := random();
    if v_today - v_date > 45 then
      v_key := case when r < 0.40 then 'acceptee' when r < 0.70 then 'refusee' when r < 0.85 then 'expiree' else 'en_negociation' end;
    else
      v_key := case when r < 0.45 then 'envoyee' when r < 0.70 then 'relance_prevue' when r < 0.90 then 'en_negociation' else 'brouillon' end;
    end if;
    v_sent := case when v_key = 'brouillon' then null else v_date + floor(random() * 3)::int end;
    v_follow := case when v_key = 'relance_prevue' then v_today + 3 + floor(random() * 12)::int else null end;
    insert into public.commercial_documents (brand_id, kind, company_id, contact_id, owner_id, subject, issued_on, sent_on, status_id, follow_up_on, amount, currency, valid_until, comments, created_at)
    values (v_brand, 'offer', v_companies[k], v_contacts[k], v_owner, v_titles[1 + i % 6] || ' – ' || v_names[k], v_date, v_sent,
            (v_status ->> ('offer:' || v_key))::uuid, v_follow, (3 + floor(random() * 28)) * 500000, 'XOF', v_date + 30, v_note, (v_date + time '10:00')::timestamptz);
  end loop;

  -- Mémos ---------------------------------------------------------------
  for i in 1..18 loop
    v_date := date '2026-05-06' + ((i - 1) * 10);
    k := 1 + (i * 7) % v_n;
    r := random();
    if v_today - v_date > 40 then
      v_key := case when r < 0.45 then 'reponse_recue' when r < 0.80 then 'cloture' else 'attente_reponse' end;
    else
      v_key := case when r < 0.40 then 'envoye' when r < 0.65 then 'attente_reponse' when r < 0.85 then 'relance_prevue' else 'en_preparation' end;
    end if;
    v_sent := case when v_key = 'en_preparation' then null else v_date + floor(random() * 3)::int end;
    v_follow := case when v_key = 'relance_prevue' then v_today + 3 + floor(random() * 12)::int else null end;
    insert into public.commercial_documents (brand_id, kind, company_id, contact_id, owner_id, subject, issued_on, sent_on, status_id, follow_up_on, recipient_response, comments, created_at)
    values (v_brand, 'memo', v_companies[k], v_contacts[k], v_owner, 'Présentation des services – ' || v_names[k], v_date, v_sent,
            (v_status ->> ('memo:' || v_key))::uuid, v_follow,
            case when v_key = 'reponse_recue' then 'Réponse fictive de démonstration.' end, v_note, (v_date + time '11:00')::timestamptz);
  end loop;

  -- Opportunités et contrats ---------------------------------------------
  for i in 1..54 loop
    v_date := date '2026-05-02' + ((i - 1) * 182 / 54) + floor(random() * 3)::int;
    k := 1 + (i * 7) % v_n;
    v_amount := (2 + floor(random() * 30)) * 500000;
    r := random();
    if i % 4 = 1 and v_today - v_date > 20 then
      v_key := 'gagnee';
    elsif v_today - v_date > 60 then
      v_key := case when r < 0.50 then 'perdue' when r < 0.65 then 'qualification' when r < 0.85 then 'proposition' else 'negociation' end;
    else
      v_key := case when r < 0.12 then 'perdue' when r < 0.50 then 'qualification' when r < 0.80 then 'proposition' else 'negociation' end;
    end if;
    v_closed := case when v_key in ('gagnee', 'perdue') then least(v_date + 15 + floor(random() * 40)::int, date '2026-10-30') end;
    insert into public.opportunities (brand_id, company_id, contact_id, owner_id, title, stage_id, amount, currency, expected_close_on, closed_on, source, lost_reason, created_at)
    values (v_brand, v_companies[k], v_contacts[k], v_owner, v_titles[1 + i % 6] || ' – ' || v_names[k], (v_stage ->> v_key)::uuid, v_amount, 'XOF',
            v_date + 45 + floor(random() * 45)::int, v_closed, v_sources[1 + i % 6],
            case when v_key = 'perdue' then v_lost[1 + i % 3] end, (v_date + time '09:00')::timestamptz)
    returning id into v_id;
    if v_key = 'gagnee' then
      insert into public.contracts (brand_id, company_id, opportunity_id, offer_id, owner_id, title, signed_on, amount, currency, start_on, end_on, comments, created_at)
      values (v_brand, v_companies[k], v_id,
              (select d.id from public.commercial_documents d
                where d.brand_id = v_brand and d.kind = 'offer' and d.company_id = v_companies[k]
                  and d.status_id = (v_status ->> 'offer:acceptee')::uuid order by d.issued_on desc limit 1),
              v_owner, 'Contrat – ' || v_titles[1 + i % 6] || ' – ' || v_names[k], v_closed, v_amount, 'XOF', v_closed, v_closed + 365, v_note, (v_closed + time '15:00')::timestamptz);
    end if;
  end loop;

  -- Fiches hebdomadaires -------------------------------------------------
  for i in 0..25 loop
    v_date := date '2026-05-04' + (i * 7);
    insert into public.weekly_reports (brand_id, user_id, week_start, calls_prospecting, calls_follow_up, emails_sent, qualified_meetings, comments, status, created_at)
    values (v_brand, v_owner, v_date, 40 + floor(random() * 30)::int + i, 20 + floor(random() * 20)::int, 30 + floor(random() * 40)::int,
            3 + floor(random() * 5)::int, 'Fiche fictive de démonstration.', 'submitted', ((v_date + 4) + time '17:00')::timestamptz);
  end loop;
  update public.weekly_reports set status = 'validated' where brand_id = v_brand and week_start < date '2026-10-12';

  -- Objectifs d'équipe, par mois ------------------------------------------
  insert into public.objectives (brand_id, user_id, metric_key, period_start, period_end, target_value, currency, comments)
  select v_brand, null, x.k, g::date, (g + interval '1 month - 1 day')::date, x.v, x.c, 'Objectif fictif de démonstration.'
    from generate_series(v_first::timestamp, date '2026-11-01'::timestamp, interval '1 month') g
   cross join (values ('calls', 340::numeric, null::text), ('emails_sent', 200, null), ('qualified_meetings', 20, null),
                      ('opportunities_created', 8, null), ('offers_sent', 6, null), ('memos_sent', 3, null),
                      ('contracts_signed', 2, null), ('revenue_signed', 25000000, 'XOF')) x(k, v, c);

  -- Réseaux sociaux : relevés mensuels --------------------------------------
  for v_rec in select * from (values
      ('facebook', 'Facebook DEMO', '@demo.fictif', 12400::bigint, 26000::bigint, 0.030::numeric),
      ('instagram', 'Instagram DEMO', '@demo.fictif', 5400, 18000, 0.055),
      ('linkedin', 'LinkedIn DEMO', 'demo-fictif', 3100, 9000, 0.038),
      ('tiktok', 'TikTok DEMO', '@demo.fictif', 800, 14000, 0.070)
    ) as t(platform, name, handle, base, imp, rate)
  loop
    insert into public.social_accounts (brand_id, platform, name, handle) values (v_brand, v_rec.platform, v_rec.name, v_rec.handle) returning id into v_id;
    v_followers := v_rec.base;
    for m in 0..5 loop
      v_start := (v_first + make_interval(months => m))::date;
      v_end := (v_start + interval '1 month - 1 day')::date;
      v_new := floor(v_rec.base * (0.012 + random() * 0.030));
      v_followers := v_followers + v_new;
      v_imp := floor(v_rec.imp * (1 + m * 0.06 + random() * 0.25));
      v_interactions := floor(v_imp * v_rec.rate * (0.85 + random() * 0.30));
      insert into public.social_snapshots (brand_id, account_id, period_start, period_end, followers_total, followers_new, impressions, posts, interactions, clicks, reach, comments)
      values (v_brand, v_id, v_start, v_end, v_followers, v_new, v_imp, 8 + floor(random() * 14)::int, v_interactions, floor(v_interactions * 0.22), floor(v_imp * 0.62), v_note);
    end loop;
  end loop;

  -- Budgets : le budget marketing reçoit une ligne par campagne --------------
  insert into public.budgets (brand_id, name, scope, period_start, period_end, amount, currency, status, comments)
  values (v_brand, 'Budget marketing mai–octobre 2026 (démo)', 'marketing', v_first, v_last, 27050000, 'XOF', 'approved', v_note) returning id into v_budget;
  insert into public.budgets (brand_id, name, scope, period_start, period_end, amount, currency, status, comments)
  values (v_brand, 'Budget commercial mai–octobre 2026 (démo)', 'commercial', v_first, v_last, 6000000, 'XOF', 'approved', v_note) returning id into v_budget2;

  -- Campagnes, relevés et dépenses ---------------------------------------------
  v_nb := 0;
  for v_rec in select * from (values
      ('Lancement résidence (démo)', 'meta_ads', 'leads', 'completed', date '2026-05-05', date '2026-06-30', 3500000::numeric, true, 'media'),
      ('Recherche mandats (démo)', 'google_ads', 'leads', 'active', date '2026-05-01', date '2026-12-31', 6000000, true, 'media'),
      ('Notoriété entreprises (démo)', 'linkedin_ads', 'awareness', 'completed', date '2026-06-01', date '2026-08-31', 2400000, true, 'media'),
      ('Vidéos quartiers (démo)', 'tiktok_ads', 'engagement', 'active', date '2026-08-01', date '2026-11-30', 1800000, true, 'media'),
      ('Lettre aux acquéreurs (démo)', 'emailing', 'traffic', 'active', date '2026-05-01', date '2026-10-31', 450000, true, 'outils'),
      ('Spot de rentrée (démo)', 'radio', 'awareness', 'completed', date '2026-09-01', date '2026-09-30', 2000000, false, 'media'),
      ('Affichage grands axes (démo)', 'billboard', 'awareness', 'paused', date '2026-07-01', date '2026-10-31', 4000000, false, 'impression'),
      ('Salon de l''immobilier (démo)', 'event', 'conversions', 'planned', date '2026-11-20', date '2026-11-22', 3000000, false, 'evenementiel')
    ) as t(name, platform, objective, status, start_on, end_on, budget, digital, category)
  loop
    insert into public.campaigns (brand_id, platform, name, objective, status, start_on, end_on, planned_budget, currency, comments)
    values (v_brand, v_rec.platform, v_rec.name, v_rec.objective, v_rec.status, v_rec.start_on, v_rec.end_on, v_rec.budget, 'XOF', v_note)
    returning id into v_id;
    v_nb := v_nb + 1;
    insert into public.budget_lines (brand_id, budget_id, label, category, campaign_id, amount, position)
    values (v_brand, v_budget, v_rec.name, v_rec.category, v_id, v_rec.budget, v_nb * 10) returning id into v_line;
    i := (extract(year from v_rec.end_on) * 12 + extract(month from v_rec.end_on) - extract(year from v_rec.start_on) * 12 - extract(month from v_rec.start_on))::int + 1;
    for m in 0..5 loop
      v_start := (v_first + make_interval(months => m))::date;
      v_end := (v_start + interval '1 month - 1 day')::date;
      v_s := greatest(v_start, v_rec.start_on);
      v_e := least(v_end, v_rec.end_on);
      continue when v_s > v_e;
      v_spend := round((v_rec.budget / i * (0.75 + random() * 0.35))::numeric, 2);
      if v_rec.digital then
        v_imp := floor(v_spend * (0.18 + random() * 0.10));
        v_clicks := floor(v_imp * (0.012 + random() * 0.018));
        v_leads := floor(v_clicks * (0.04 + random() * 0.06));
        v_conv := floor(v_leads * (0.10 + random() * 0.15));
        insert into public.campaign_snapshots (brand_id, campaign_id, period_start, period_end, spend, impressions, clicks, leads, conversions, conversion_value, reach, comments)
        values (v_brand, v_id, v_s, v_e, v_spend, v_imp, v_clicks, v_leads, v_conv, round((v_conv * (150000 + random() * 250000))::numeric, 2), floor(v_imp * 0.6), v_note);
      else
        insert into public.campaign_snapshots (brand_id, campaign_id, period_start, period_end, spend, reach, comments)
        values (v_brand, v_id, v_s, v_e, v_spend, floor(v_spend * (0.04 + random() * 0.03)), v_note);
      end if;
      v_seq := v_seq + 1;
      v_expense_status := case when v_e < date '2026-10-01' then 'paid' else 'committed' end;
      v_paid := case when v_expense_status = 'paid' then v_e + 15 end;
      insert into public.expenses (brand_id, budget_line_id, supplier, description, expense_date, amount, currency, status, paid_on, external_ref, comments)
      values (v_brand, v_line, v_suppliers[1 + v_seq % 5], 'Campagne ' || v_rec.name || ' – ' || to_char(v_s, 'MM/YYYY'), v_e, v_spend, 'XOF', v_expense_status, v_paid, 'DEMO-FAC-' || lpad(v_seq::text, 4, '0'), v_note);
    end loop;
  end loop;

  -- Lignes hors campagne, une dépense par mois (une ligne volontairement dépassée) ------
  for v_rec in select * from (values
      (v_budget, 'Production de contenu (démo)', 'contenu', 3000000::numeric, 90, 0.90::numeric),
      (v_budget, 'Outils et logiciels (démo)', 'outils', 900000, 100, 0.95),
      (v_budget2, 'Déplacements clients (démo)', 'autre', 1500000, 10, 1.25),
      (v_budget2, 'Documentation commerciale (démo)', 'impression', 1500000, 20, 0.70),
      (v_budget2, 'Événements réseau (démo)', 'evenementiel', 3000000, 30, 0.85)
    ) as t(budget_id, label, category, amount, position, factor)
  loop
    insert into public.budget_lines (brand_id, budget_id, label, category, amount, position)
    values (v_brand, v_rec.budget_id, v_rec.label, v_rec.category, v_rec.amount, v_rec.position) returning id into v_line;
    for m in 0..5 loop
      v_start := (v_first + make_interval(months => m))::date;
      v_end := (v_start + interval '1 month - 1 day')::date;
      v_seq := v_seq + 1;
      v_spend := round((v_rec.amount / 6 * v_rec.factor * (0.92 + random() * 0.16))::numeric, 2);
      v_expense_status := case when v_end < date '2026-10-01' then 'paid' else 'committed' end;
      v_paid := case when v_expense_status = 'paid' then v_end + 15 end;
      insert into public.expenses (brand_id, budget_line_id, supplier, description, expense_date, amount, currency, status, paid_on, external_ref, comments)
      values (v_brand, v_line, v_suppliers[1 + v_seq % 5], v_rec.label || ' – ' || to_char(v_start, 'MM/YYYY'), v_end, v_spend, 'XOF', v_expense_status, v_paid, 'DEMO-FAC-' || lpad(v_seq::text, 4, '0'), v_note);
    end loop;
  end loop;

  -- Site web : relevés mensuels ------------------------------------------------
  insert into public.websites (brand_id, name) values (v_brand, 'Site vitrine DEMO') returning id into v_id;
  for m in 0..5 loop
    v_start := (v_first + make_interval(months => m))::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_sessions := floor(4200 * (1 + m * 0.07 + random() * 0.20));
    v_users := floor(v_sessions * (0.72 + random() * 0.10));
    v_org := floor(v_sessions * 0.38); v_dir := floor(v_sessions * 0.22); v_soc := floor(v_sessions * 0.17);
    v_paid_s := floor(v_sessions * 0.13); v_ref := floor(v_sessions * 0.05); v_mail := floor(v_sessions * 0.03);
    insert into public.website_snapshots (brand_id, website_id, period_start, period_end, users, sessions, page_views, conversions, form_submissions, sessions_organic, sessions_direct, sessions_social, sessions_paid, sessions_referral, sessions_email, sessions_other, comments)
    values (v_brand, v_id, v_start, v_end, v_users, v_sessions, floor(v_sessions * (2.1 + random() * 0.7)), floor(v_sessions * (0.012 + random() * 0.008)), floor(v_sessions * (0.018 + random() * 0.010)),
            v_org, v_dir, v_soc, v_paid_s, v_ref, v_mail, v_sessions - v_org - v_dir - v_soc - v_paid_s - v_ref - v_mail, v_note);
  end loop;

  -- Projets, jalons et tâches ---------------------------------------------------
  for v_p in select * from jsonb_array_elements($json$[
    {"name":"Lancement de la résidence (démo)","status":"done","start":"2026-05-04","end":"2026-07-31","color":"#2563eb",
     "milestones":["Cadrage validé","Campagne en ligne","Bilan présenté"],
     "tasks":["Définir le positionnement","Rédiger l'argumentaire","Préparer les visuels","Créer la page de présentation","Programmer les annonces","Former l'équipe commerciale","Organiser les visites","Suivre les demandes","Analyser les résultats","Présenter le bilan"]},
    {"name":"Salon de l'immobilier (démo)","status":"active","start":"2026-09-01","end":"2026-11-30","color":"#16a34a",
     "milestones":["Stand réservé","Supports livrés","Salon terminé"],
     "tasks":["Réserver le stand","Choisir le prestataire","Concevoir les supports","Valider le budget","Imprimer les brochures","Inviter les clients","Planifier les permanences","Installer le stand","Tenir le salon","Relancer les contacts"]},
    {"name":"Refonte du site vitrine (démo)","status":"active","start":"2026-06-15","end":"2026-12-15","color":"#7c3aed",
     "milestones":["Maquettes validées","Contenus prêts","Mise en ligne"],
     "tasks":["Auditer le site actuel","Définir l'arborescence","Produire les maquettes","Valider les maquettes","Rédiger les contenus","Intégrer les pages","Connecter les formulaires","Tester sur téléphone","Corriger les anomalies","Mettre en ligne"]},
    {"name":"Déploiement CRM interne (démo)","status":"on_hold","start":"2026-07-15","end":"2027-01-31","color":"#b45309",
     "milestones":["Besoins recensés","Paramétrage terminé","Équipe formée"],
     "tasks":["Recenser les besoins","Comparer les solutions","Choisir l'outil","Paramétrer les étapes","Reprendre les contacts","Préparer la formation","Former les commerciaux","Mesurer l'adoption","Ajuster les rapports","Clôturer le projet"]}
  ]$json$::jsonb)
  loop
    v_start := (v_p ->> 'start')::date;
    v_end := (v_p ->> 'end')::date;
    v_span := v_end - v_start;
    insert into public.projects (brand_id, name, description, owner_id, status, start_on, end_on, color, created_at)
    values (v_brand, v_p ->> 'name', 'Projet fictif de démonstration.', v_owner, v_p ->> 'status', v_start, v_end, v_p ->> 'color', (v_start + time '09:00')::timestamptz)
    returning id into v_id;
    v_milestones := '{}';
    for k in 1..3 loop
      v_ms_due := v_start + (v_span * k / 3);
      insert into public.milestones (brand_id, project_id, name, due_on, reached_on)
      values (v_brand, v_id, v_p -> 'milestones' ->> (k - 1), v_ms_due,
              case when v_ms_due < v_today and (v_p ->> 'status') <> 'on_hold' then v_ms_due - floor(random() * 4)::int end)
      returning id into v_line;
      v_milestones := v_milestones || v_line;
    end loop;
    v_ntasks := jsonb_array_length(v_p -> 'tasks');
    v_prev := null;
    for k in 1..v_ntasks loop
      v_task_start := v_start + (v_span * (k - 1) / v_ntasks);
      v_task_due := v_task_start + (v_span / v_ntasks) + 3;
      r := random();
      if (v_p ->> 'status') = 'done' then
        v_key := 'termine'; v_progress := 100;
      elsif (v_p ->> 'status') = 'on_hold' then
        if v_task_start > date '2026-09-15' then v_key := 'a_faire'; v_progress := 0;
        elsif r < 0.6 then v_key := 'termine'; v_progress := 100;
        else v_key := 'annule'; v_progress := 0; end if;
      elsif v_task_due < date '2026-10-20' then
        if r < 0.85 then v_key := 'termine'; v_progress := 100;
        else v_key := 'en_cours'; v_progress := 60; end if;
      elsif v_task_start > v_today then
        v_key := 'a_faire'; v_progress := 0;
      elsif r < 0.6 then
        v_key := 'en_cours'; v_progress := 30 + floor(random() * 50)::int;
      else
        v_key := 'en_revue'; v_progress := 90;
      end if;
      insert into public.tasks (brand_id, project_id, milestone_id, title, assignee_id, status_id, priority, start_on, due_on, progress, estimate_hours, position, created_at)
      values (v_brand, v_id, v_milestones[1 + ((k - 1) * 3 / v_ntasks)], v_p -> 'tasks' ->> (k - 1), v_owner, (v_status ->> ('task:' || v_key))::uuid,
              (array['normal','high','normal','low','urgent'])[1 + k % 5], v_task_start, v_task_due, v_progress, (2 + floor(random() * 15)) * 0.5, k * 10, (v_task_start + time '08:30')::timestamptz)
      returning id into v_line;
      if v_prev is not null and k <= 5 then
        insert into public.task_dependencies (brand_id, task_id, depends_on_id) values (v_brand, v_line, v_prev);
      end if;
      v_prev := v_line;
    end loop;
  end loop;
end;
$demo$;
