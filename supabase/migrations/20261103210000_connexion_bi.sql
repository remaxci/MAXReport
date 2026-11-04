-- Évolution · Connexion BI (lecture seule) : clés d'accès pour Power BI, Excel
-- ou tout outil qui lit un flux JSON ou CSV.
--
-- Une clé couvre une marque, ou toutes les marques (clé Direction). Elle est
-- créée par une personne qui a la permission « bi.connect » (accordée par le
-- super-administrateur via les rôles) et ne donne jamais plus que les droits
-- actuels de cette personne : chaque lecture revérifie son compte, sa
-- permission « bi.connect », la lecture du jeu de données et les modules
-- activés. Seule l'empreinte SHA-256 de la clé est conservée.
--
-- Les jeux de données sont des lignes détaillées, sans coordonnées des
-- contacts ni commentaires libres ; les fiches archivées en sont exclues.
-- Un nom de personne n'apparaît que si l'auteur de la clé peut voir les
-- membres de la marque, un nom de client que s'il peut lire les prospects.

-- =====================================================================
-- Permission
-- =====================================================================

insert into public.permissions (key, module, label) values
  ('bi.connect', 'rapports', 'Créer et révoquer les clés de connexion BI (Power BI, Excel)');

insert into public.role_permissions (role_id, permission)
select id, 'bi.connect' from public.roles where key = 'super_admin';

-- Droits d'une personne donnée (même règle que app.brands_with et
-- app.has_global_permission) : sert à revérifier l'auteur d'une clé.
create function app.user_brands_with(p_user uuid, p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.brands b
  where exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = p_user
      and p.is_active
      and rp.permission = p_permission
      and (m.brand_id = b.id or m.brand_id is null)
  );
$$;

create function app.user_has_global_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.profiles p on p.id = m.user_id
    where m.user_id = p_user
      and p.is_active
      and m.brand_id is null
      and rp.permission = p_permission
  );
$$;

revoke all on function app.user_brands_with(uuid, text) from public, anon, authenticated;
revoke all on function app.user_has_global_permission(uuid, text) from public, anon, authenticated;

-- =====================================================================
-- Clés d'accès
-- =====================================================================

create table public.bi_access_keys (
  id uuid primary key default gen_random_uuid(),
  -- null : clé Direction (toutes les marques).
  brand_id uuid references public.brands (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (token_hint ~ '^[A-Za-z0-9_-]{4}$'),
  datasets text[] not null check (
    cardinality(datasets) between 1 and 20
    and datasets <@ array[
      'marques', 'offres', 'memos', 'opportunites', 'contrats', 'activites', 'objectifs',
      'reseaux_sociaux', 'campagnes', 'campagnes_releves', 'sites_web_releves',
      'budgets', 'lignes_budget', 'depenses', 'projets', 'jalons', 'taches', 'taux_de_change'
    ]::text[]
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  use_count integer not null default 0,
  window_started_at timestamptz,
  window_count integer not null default 0,
  check (expires_at > created_at and expires_at <= created_at + interval '366 days')
);
create index bi_access_keys_brand_idx on public.bi_access_keys (brand_id);
create index bi_access_keys_created_by_idx on public.bi_access_keys (created_by);
create index bi_access_keys_revoked_by_idx on public.bi_access_keys (revoked_by);

alter table public.bi_access_keys enable row level security;

-- L'empreinte et les compteurs ne sont ni lisibles ni modifiables depuis
-- l'application ; une clé ne se supprime pas (elle se révoque).
revoke all on public.bi_access_keys from anon, authenticated;
grant select (id, brand_id, name, token_hint, datasets, expires_at, created_at, created_by,
              revoked_at, revoked_by, last_used_at, use_count)
  on public.bi_access_keys to authenticated;
grant insert (id, brand_id, name, token_hash, token_hint, datasets, expires_at)
  on public.bi_access_keys to authenticated;
grant update (revoked_at) on public.bi_access_keys to authenticated;

-- Gestion : « bi.connect » sur la marque ; clé Direction : « bi.connect » et
-- « direction.read » au niveau global.
create policy bi_access_keys_select on public.bi_access_keys for select to authenticated
  using (
    (brand_id is not null and brand_id = any ((select app.brands_with('bi.connect'))::uuid[]))
    or (brand_id is null
        and (select app.has_global_permission('bi.connect'))
        and (select app.has_global_permission('direction.read')))
  );
create policy bi_access_keys_insert on public.bi_access_keys for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (brand_id is not null and brand_id = any ((select app.brands_with('bi.connect'))::uuid[]))
      or (brand_id is null
          and (select app.has_global_permission('bi.connect'))
          and (select app.has_global_permission('direction.read')))
    )
  );
create policy bi_access_keys_update on public.bi_access_keys for update to authenticated
  using (
    (brand_id is not null and brand_id = any ((select app.brands_with('bi.connect'))::uuid[]))
    or (brand_id is null
        and (select app.has_global_permission('bi.connect'))
        and (select app.has_global_permission('direction.read')))
  );

-- Révocation : définitive, datée et signée par la base.
create function app.guard_bi_key_revocation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revoked_at is distinct from old.revoked_at then
    if old.revoked_at is not null then
      raise exception 'Une clé révoquée le reste.' using errcode = 'check_violation';
    end if;
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger bi_access_keys_revocation
  before update on public.bi_access_keys
  for each row execute function app.guard_bi_key_revocation();

-- Création et révocation au journal d'audit (pas les lectures).
create trigger bi_access_keys_audit
  after insert or update of revoked_at on public.bi_access_keys
  for each row execute function app.audit('brand_id');

-- =====================================================================
-- Lecture par clé (appelée sans session, par la route /api/bi)
-- =====================================================================

-- Clé valide, auteur toujours habilité ; compte l'usage (1 000 lectures par
-- heure au plus).
create function app.bi_open_key(p_token text)
returns public.bi_access_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.bi_access_keys;
  v_count integer;
begin
  if p_token is null or length(p_token) not between 20 and 200 then
    raise exception 'Clé d''accès invalide, expirée ou révoquée.' using errcode = '28000';
  end if;

  select k.* into v_key
  from public.bi_access_keys k
  where k.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and k.revoked_at is null
    and k.expires_at > now();
  if not found then
    raise exception 'Clé d''accès invalide, expirée ou révoquée.' using errcode = '28000';
  end if;

  if not (
    (v_key.brand_id is null
     and app.user_has_global_permission(v_key.created_by, 'bi.connect')
     and app.user_has_global_permission(v_key.created_by, 'direction.read'))
    or (v_key.brand_id is not null
        and v_key.brand_id = any (app.user_brands_with(v_key.created_by, 'bi.connect')))
  ) then
    raise exception 'Clé suspendue : son auteur n''a plus les droits nécessaires.' using errcode = '28000';
  end if;

  update public.bi_access_keys k set
    window_started_at = case when k.window_started_at is null or k.window_started_at < now() - interval '1 hour'
                             then now() else k.window_started_at end,
    window_count = case when k.window_started_at is null or k.window_started_at < now() - interval '1 hour'
                        then 1 else k.window_count + 1 end,
    last_used_at = now(),
    use_count = k.use_count + 1
  where k.id = v_key.id
  returning k.window_count into v_count;
  if v_count > 1000 then
    raise exception 'Trop de lectures avec cette clé : réessayez dans une heure.' using errcode = '53400';
  end if;
  return v_key;
end;
$$;

-- Marques couvertes par une clé : la sienne, ou toutes (Direction), hors archivées.
create function app.bi_key_scope(p_key public.bi_access_keys)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.brands b
  where b.archived_at is null
    and (p_key.brand_id is null or b.id = p_key.brand_id);
$$;

revoke all on function app.bi_open_key(text) from public, anon, authenticated;
revoke all on function app.bi_key_scope(public.bi_access_keys) from public, anon, authenticated;

-- Marques de la portée de la clé où l'auteur peut lire le jeu de données
-- (l'une des permissions) et où le module est activé.
create function app.bi_brands_for(p_key public.bi_access_keys, p_scope uuid[], p_permissions text[], p_module text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.id), '{}')
  from public.brands b
  where b.id = any (p_scope)
    and b.id = any (app.user_brands_with(p_key.created_by, 'brand.read'))
    and (p_permissions is null or exists (
      select 1 from unnest(p_permissions) as perm
      where b.id = any (app.user_brands_with(p_key.created_by, perm))
    ))
    and (p_module is null or exists (
      select 1 from public.brand_modules bm
      where bm.brand_id = b.id and bm.module_key = p_module and bm.enabled
    ));
$$;

revoke all on function app.bi_brands_for(public.bi_access_keys, uuid[], text[], text) from public, anon, authenticated;

-- Ce que la clé permet de lire maintenant : nom, portée, marques, jeux.
create function public.bi_catalog(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.bi_access_keys;
  v_scope uuid[];
begin
  v_key := app.bi_open_key(p_token);
  v_scope := app.bi_key_scope(v_key);
  return jsonb_build_object(
    'nom', v_key.name,
    'portee', case when v_key.brand_id is null then 'direction' else 'marque' end,
    'expire_le', v_key.expires_at,
    'marques', (select coalesce(jsonb_agg(b.code order by b.code), '[]'::jsonb)
                from public.brands b where b.id = any (v_scope)),
    'jeux', to_jsonb(v_key.datasets)
  );
end;
$$;

-- Une page (5 000 lignes au plus) d'un jeu de données, triée par identifiant.
create function public.bi_read(p_token text, p_dataset text, p_offset integer default 0, p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.bi_access_keys;
  v_scope uuid[];
  v_brands uuid[];
  v_people uuid[];
  v_clients uuid[];
  v_rows jsonb;
begin
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'Pagination invalide.' using errcode = '22023';
  end if;
  v_key := app.bi_open_key(p_token);
  v_scope := app.bi_key_scope(v_key);
  if p_dataset is null or not (p_dataset = any (v_key.datasets)) then
    raise exception 'Ce jeu de données n''est pas ouvert par cette clé.' using errcode = '42501';
  end if;

  v_brands := case p_dataset
    when 'marques' then app.bi_brands_for(v_key, v_scope, null, null)
    when 'offres' then app.bi_brands_for(v_key, v_scope, array['offers.read_all', 'offers.manage_all'], 'offers')
    when 'memos' then app.bi_brands_for(v_key, v_scope, array['memos.read_all', 'memos.manage_all'], 'memos')
    when 'opportunites' then app.bi_brands_for(v_key, v_scope, array['opportunities.read_all', 'opportunities.manage_all'], 'crm')
    when 'contrats' then app.bi_brands_for(v_key, v_scope, array['contracts.read_all', 'contracts.manage_all'], 'contracts')
    when 'activites' then app.bi_brands_for(v_key, v_scope, array['activities.read_all'], 'activities')
    when 'objectifs' then app.bi_brands_for(v_key, v_scope, array['objectives.read_all'], 'objectives')
    when 'reseaux_sociaux' then app.bi_brands_for(v_key, v_scope, array['marketing.read', 'marketing.manage'], 'social')
    when 'campagnes' then app.bi_brands_for(v_key, v_scope, array['marketing.read', 'marketing.manage'], 'campaigns')
    when 'campagnes_releves' then app.bi_brands_for(v_key, v_scope, array['marketing.read', 'marketing.manage'], 'campaigns')
    when 'sites_web_releves' then app.bi_brands_for(v_key, v_scope, array['marketing.read', 'marketing.manage'], 'websites')
    when 'budgets' then app.bi_brands_for(v_key, v_scope, array['budgets.read', 'budgets.manage'], 'budgets')
    when 'lignes_budget' then app.bi_brands_for(v_key, v_scope, array['budgets.read', 'budgets.manage'], 'budgets')
    when 'depenses' then app.bi_brands_for(v_key, v_scope, array['budgets.read', 'budgets.manage'], 'budgets')
    when 'projets' then app.bi_brands_for(v_key, v_scope, array['planning.read'], 'planning')
    when 'jalons' then app.bi_brands_for(v_key, v_scope, array['planning.read'], 'planning')
    when 'taches' then app.bi_brands_for(v_key, v_scope, array['planning.read'], 'planning')
    when 'taux_de_change' then '{}'::uuid[]
  end;
  -- Noms de personnes et de clients : seulement là où l'auteur peut les voir.
  v_people := app.bi_brands_for(v_key, v_scope, array['members.read'], null);
  v_clients := app.bi_brands_for(v_key, v_scope, array['crm.read'], null);

  case p_dataset
  when 'marques' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select b.id, b.code, b.name as nom, b.reporting_currency as devise_reporting, b.is_active as active
      from public.brands b where b.id = any (v_brands)
      order by b.id offset p_offset limit p_limit) x;

  when 'offres', 'memos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select d.id, b.code as marque, d.reference as numero, d.subject as objet,
             case when d.brand_id = any (v_clients) then c.name end as client,
             s.label as statut, s.category as categorie_statut,
             d.issued_on as emis_le, d.sent_on as envoye_le, d.follow_up_on as relance_le,
             case when d.kind = 'offer' then d.valid_until end as valable_jusqu_au,
             case when d.kind = 'offer' then d.amount end as montant,
             case when d.kind = 'offer' then d.currency end as devise,
             d.owner_id as responsable_id,
             case when d.brand_id = any (v_people) then pr.full_name end as responsable,
             d.created_at as cree_le, d.updated_at as modifie_le
      from public.commercial_documents d
      join public.brands b on b.id = d.brand_id
      left join public.statuses s on s.id = d.status_id
      left join public.companies c on c.id = d.company_id
      left join public.profiles pr on pr.id = d.owner_id
      where d.brand_id = any (v_brands) and d.archived_at is null
        and d.kind = case p_dataset when 'offres' then 'offer' else 'memo' end
      order by d.id offset p_offset limit p_limit) x;

  when 'opportunites' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select o.id, b.code as marque, o.title as titre,
             case when o.brand_id = any (v_clients) then c.name end as client,
             st.label as etape, st.category as categorie_etape, st.probability as probabilite_pct,
             o.amount as montant, o.currency as devise,
             o.expected_close_on as cloture_prevue_le, o.closed_on as cloturee_le, o.source,
             o.owner_id as responsable_id,
             case when o.brand_id = any (v_people) then pr.full_name end as responsable,
             o.created_at as cree_le, o.updated_at as modifie_le
      from public.opportunities o
      join public.brands b on b.id = o.brand_id
      left join public.pipeline_stages st on st.id = o.stage_id
      left join public.companies c on c.id = o.company_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.brand_id = any (v_brands) and o.archived_at is null
      order by o.id offset p_offset limit p_limit) x;

  when 'contrats' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select ct.id, b.code as marque, ct.title as titre,
             case when ct.brand_id = any (v_clients) then c.name end as client,
             ct.signed_on as signe_le, ct.start_on as debut_le, ct.end_on as fin_le,
             ct.amount as montant, ct.currency as devise,
             ct.offer_id as offre_id, ct.opportunity_id as opportunite_id,
             ct.owner_id as responsable_id,
             case when ct.brand_id = any (v_people) then pr.full_name end as responsable,
             ct.created_at as cree_le, ct.updated_at as modifie_le
      from public.contracts ct
      join public.brands b on b.id = ct.brand_id
      left join public.companies c on c.id = ct.company_id
      left join public.profiles pr on pr.id = ct.owner_id
      where ct.brand_id = any (v_brands) and ct.archived_at is null
      order by ct.id offset p_offset limit p_limit) x;

  when 'activites' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select w.id, b.code as marque, w.user_id as collaborateur_id,
             case when w.brand_id = any (v_people) then pr.full_name end as collaborateur,
             w.week_start as semaine_du, w.status as statut,
             w.calls_prospecting as appels_prospection, w.calls_follow_up as appels_suivi,
             w.emails_sent as emails_envoyes, w.qualified_meetings as rdv_qualifies,
             w.opportunities_declared as opportunites_declarees, w.memos_declared as memos_declares,
             w.submitted_at as soumis_le, w.validated_at as valide_le
      from public.weekly_reports w
      join public.brands b on b.id = w.brand_id
      left join public.profiles pr on pr.id = w.user_id
      where w.brand_id = any (v_brands)
      order by w.id offset p_offset limit p_limit) x;

  when 'objectifs' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select ob.id, b.code as marque, ob.metric_key as indicateur, ob.user_id as collaborateur_id,
             case when ob.brand_id = any (v_people) then pr.full_name end as collaborateur,
             ob.period_start as du, ob.period_end as au, ob.target_value as cible, ob.currency as devise
      from public.objectives ob
      join public.brands b on b.id = ob.brand_id
      left join public.profiles pr on pr.id = ob.user_id
      where ob.brand_id = any (v_brands)
      order by ob.id offset p_offset limit p_limit) x;

  when 'reseaux_sociaux' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select sn.id, b.code as marque, a.id as compte_id, a.name as compte, a.platform as plateforme,
             sn.period_start as du, sn.period_end as au,
             sn.followers_total as abonnes_total, sn.followers_new as nouveaux_abonnes,
             sn.posts as publications, sn.reach as portee, sn.impressions,
             sn.interactions, sn.clicks as clics, sn.source
      from public.social_snapshots sn
      join public.social_accounts a on a.id = sn.account_id
      join public.brands b on b.id = sn.brand_id
      where sn.brand_id = any (v_brands) and a.archived_at is null
      order by sn.id offset p_offset limit p_limit) x;

  when 'campagnes' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select cp.id, b.code as marque, cp.name as nom, cp.platform as plateforme, cp.objective as objectif,
             cp.status as statut, cp.start_on as debut_le, cp.end_on as fin_le,
             cp.planned_budget as budget_prevu, cp.currency as devise
      from public.campaigns cp
      join public.brands b on b.id = cp.brand_id
      where cp.brand_id = any (v_brands) and cp.archived_at is null
      order by cp.id offset p_offset limit p_limit) x;

  when 'campagnes_releves' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select sn.id, b.code as marque, cp.id as campagne_id, cp.name as campagne,
             sn.period_start as du, sn.period_end as au,
             sn.spend as depense, cp.currency as devise, sn.impressions, sn.reach as portee,
             sn.clicks as clics, sn.leads, sn.conversions, sn.conversion_value as valeur_conversions, sn.source
      from public.campaign_snapshots sn
      join public.campaigns cp on cp.id = sn.campaign_id
      join public.brands b on b.id = sn.brand_id
      where sn.brand_id = any (v_brands) and cp.archived_at is null
      order by sn.id offset p_offset limit p_limit) x;

  when 'sites_web_releves' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select sn.id, b.code as marque, ws.id as site_id, ws.name as site,
             sn.period_start as du, sn.period_end as au,
             sn.users as utilisateurs, sn.sessions, sn.page_views as pages_vues,
             sn.conversions, sn.form_submissions as formulaires,
             sn.sessions_organic as sessions_organiques, sn.sessions_direct as sessions_directes,
             sn.sessions_social as sessions_reseaux_sociaux, sn.sessions_paid as sessions_payantes,
             sn.sessions_referral as sessions_referents, sn.sessions_email, sn.sessions_other as sessions_autres,
             sn.source
      from public.website_snapshots sn
      join public.websites ws on ws.id = sn.website_id
      join public.brands b on b.id = sn.brand_id
      where sn.brand_id = any (v_brands) and ws.archived_at is null
      order by sn.id offset p_offset limit p_limit) x;

  when 'budgets' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select bu.id, b.code as marque, bu.name as nom, bu.scope as perimetre, bu.status as statut,
             bu.period_start as du, bu.period_end as au, bu.amount as montant, bu.currency as devise
      from public.budgets bu
      join public.brands b on b.id = bu.brand_id
      where bu.brand_id = any (v_brands) and bu.archived_at is null
      order by bu.id offset p_offset limit p_limit) x;

  when 'lignes_budget' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select l.id, b.code as marque, l.budget_id, l.label as libelle, l.category as categorie,
             l.campaign_id as campagne_id, l.amount as montant, bu.currency as devise
      from public.budget_lines l
      join public.budgets bu on bu.id = l.budget_id
      join public.brands b on b.id = l.brand_id
      where l.brand_id = any (v_brands) and bu.archived_at is null
      order by l.id offset p_offset limit p_limit) x;

  when 'depenses' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select e.id, b.code as marque, e.budget_line_id as ligne_budget_id, e.campaign_id as campagne_id,
             e.supplier as fournisseur, e.expense_date as date_depense, e.amount as montant,
             e.currency as devise, e.status as statut, e.paid_on as payee_le, e.source
      from public.expenses e
      join public.brands b on b.id = e.brand_id
      where e.brand_id = any (v_brands) and e.archived_at is null
      order by e.id offset p_offset limit p_limit) x;

  when 'projets' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select pj.id, b.code as marque, pj.name as nom, pj.status as statut,
             pj.owner_id as responsable_id,
             case when pj.brand_id = any (v_people) then pr.full_name end as responsable,
             pj.start_on as debut_le, pj.end_on as fin_le
      from public.projects pj
      join public.brands b on b.id = pj.brand_id
      left join public.profiles pr on pr.id = pj.owner_id
      where pj.brand_id = any (v_brands) and pj.archived_at is null
      order by pj.id offset p_offset limit p_limit) x;

  when 'jalons' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select m.id, b.code as marque, m.project_id as projet_id, m.name as nom,
             m.due_on as echeance, m.reached_on as atteint_le
      from public.milestones m
      join public.projects pj on pj.id = m.project_id
      join public.brands b on b.id = m.brand_id
      where m.brand_id = any (v_brands) and pj.archived_at is null
      order by m.id offset p_offset limit p_limit) x;

  when 'taches' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select t.id, b.code as marque, t.title as titre, t.project_id as projet_id, t.milestone_id as jalon_id,
             t.parent_id as tache_parente_id, s.label as statut, s.category as categorie_statut,
             t.assignee_id as responsable_id,
             case when t.brand_id = any (v_people) then pr.full_name end as responsable,
             t.priority as priorite, t.progress as avancement_pct,
             t.start_on as debut_le, t.due_on as echeance, t.completed_at as terminee_le,
             t.estimate_hours as estimation_heures, t.created_at as cree_le
      from public.tasks t
      join public.brands b on b.id = t.brand_id
      left join public.statuses s on s.id = t.status_id
      left join public.profiles pr on pr.id = t.assignee_id
      where t.brand_id = any (v_brands) and t.archived_at is null
      order by t.id offset p_offset limit p_limit) x;

  when 'taux_de_change' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') into v_rows from (
      select r.id, r.rate_date as date, r.from_currency as de, r.to_currency as vers, r.rate as taux, r.source
      from public.fx_rates r
      order by r.id offset p_offset limit p_limit) x;
  end case;

  return v_rows;
end;
$$;

-- Appelées par la route /api/bi sans session (rôle anon) : la clé fait foi.
revoke all on function public.bi_catalog(text) from public, authenticated;
revoke all on function public.bi_read(text, text, integer, integer) from public, authenticated;
grant execute on function public.bi_catalog(text) to anon;
grant execute on function public.bi_read(text, text, integer, integer) to anon;
