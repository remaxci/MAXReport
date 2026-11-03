-- Évolution · Notifications des tâches : un récapitulatif quotidien par e-mail
-- (tâches confiées depuis le dernier envoi, échéances du jour et proches,
-- retards). La base prépare le contenu, sous les droits de chaque destinataire ;
-- l'application envoie (tâche planifiée protégée), seulement une fois la
-- messagerie configurée. D'ici là, rien n'est envoyé.

-- =====================================================================
-- Préférences : une ligne par personne ; sans ligne, les valeurs par défaut
-- =====================================================================

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_digest boolean not null default true,
  -- Rappel d'échéance : 0 = le jour même seulement, 1 = dès la veille, … jusqu'à 7 jours avant.
  due_soon_days smallint not null default 1 check (due_soon_days between 0 and 7),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function app.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
revoke delete, truncate on public.notification_preferences from authenticated;

create policy notification_preferences_select on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- Journal des envois : un récapitulatif par personne et par jour au plus
-- =====================================================================

create table public.notification_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  digest_on date not null,
  status text not null check (status in ('sent', 'failed')),
  task_count integer not null default 0 check (task_count >= 0),
  error text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, digest_on)
);

alter table public.notification_digests enable row level security;
revoke all on public.notification_digests from anon;
-- Écrit seulement par l'envoi planifié (clé serveur) ; chacun lit ses propres envois.
revoke insert, update, delete, truncate on public.notification_digests from authenticated;

create policy notification_digests_select on public.notification_digests for select to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================
-- Contenu du jour : pour chaque destinataire, ses tâches à signaler
-- =====================================================================

-- Mêmes règles d'accès que l'application : profil actif, droit planning.read
-- sur la marque (ou global), marque active avec la planification activée.
-- Tâches à faire (catégorie brouillon ou en cours), non archivées, confiées au
-- destinataire. Réservée à l'envoi planifié (rôle service_role).
create function public.task_digests(p_today date)
returns table (user_id uuid, email text, full_name text, items jsonb)
language sql stable security definer
set search_path = ''
as $$
  with recipients as (
    select
      p.id as user_id,
      p.email,
      p.full_name,
      coalesce(np.due_soon_days, 1) as due_soon_days,
      coalesce(
        (select max(d.created_at) from public.notification_digests d where d.user_id = p.id and d.status = 'sent'),
        (p_today - 1)::timestamptz
      ) as since
    from public.profiles p
    left join public.notification_preferences np on np.user_id = p.id
    where p.is_active
      and coalesce(np.daily_digest, true)
      and not exists (
        select 1 from public.notification_digests d
        where d.user_id = p.id and d.digest_on = p_today and d.status = 'sent'
      )
  ),
  tasks as (
    select
      r.user_id,
      t.id,
      t.title,
      t.due_on,
      b.name as brand_name,
      b.slug as brand_slug,
      exists (
        select 1 from public.task_events e
        where e.task_id = t.id
          and e.type = 'assigned'
          and e.occurred_at > r.since
          and e.actor_id is distinct from r.user_id
      ) as is_new,
      case
        when t.due_on < p_today then 'overdue'
        when t.due_on = p_today then 'due_today'
        when t.due_on <= p_today + r.due_soon_days then 'due_soon'
      end as due_kind
    from recipients r
    join public.tasks t on t.assignee_id = r.user_id and t.archived_at is null
    join public.statuses s on s.id = t.status_id and s.category in ('draft', 'active')
    join public.brands b on b.id = t.brand_id and b.is_active and b.archived_at is null
    join public.brand_modules bm on bm.brand_id = b.id and bm.module_key = 'planning' and bm.enabled
    where exists (
      select 1
      from public.memberships m
      join public.role_permissions rp on rp.role_id = m.role_id and rp.permission = 'planning.read'
      where m.user_id = r.user_id and (m.brand_id = b.id or m.brand_id is null)
    )
  )
  select
    r.user_id,
    r.email,
    r.full_name,
    jsonb_agg(
      jsonb_build_object(
        'taskId', t.id,
        'title', t.title,
        'dueOn', t.due_on,
        'brandName', t.brand_name,
        'brandSlug', t.brand_slug,
        'kind', coalesce(t.due_kind, 'assigned'),
        'isNew', t.is_new
      )
      order by t.due_on nulls last, t.title
    ) as items
  from recipients r
  join tasks t on t.user_id = r.user_id
  where t.due_kind is not null or t.is_new
  group by r.user_id, r.email, r.full_name;
$$;

revoke all on function public.task_digests(date) from public, anon, authenticated;
grant execute on function public.task_digests(date) to service_role;
