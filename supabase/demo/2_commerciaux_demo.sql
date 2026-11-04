-- Répartit la marque DEMO entre quatre commerciaux fictifs dont les comptes existent déjà.
-- Ne touche qu'aux lignes de DEMO. Rejouable : les fiches hebdomadaires de DEMO sont recréées.
do $repartition$
declare
  v_brand uuid;
  v_role uuid;
  v_people text[][] := array[
    ['aminata.demo@exemple.test', 'Aminata K. (démo)'],
    ['koffi.demo@exemple.test', 'Koffi B. (démo)'],
    ['mariam.demo@exemple.test', 'Mariam T. (démo)'],
    ['yao.demo@exemple.test', 'Yao S. (démo)']
  ];
  v_sellers uuid[] := '{}';
  v_id uuid;
  -- Portefeuilles inégaux : 9, 7, 5 et 3 prospects sur 24.
  v_pattern int[] := array[1,2,1,3,2,1,4,2,1,3,1,2,4,1,2,3,1,2,3,1,4,2,1,3];
  v_level numeric[] := array[1.20, 1.00, 0.85, 0.65];
  s int; w int;
  v_date date;
begin
  select id into strict v_brand from public.brands where code = 'DEMO' and slug = 'demo';
  select id into strict v_role from public.roles where key = 'sales_rep';
  perform setseed(0.17);

  for s in 1..4 loop
    select id into strict v_id from public.profiles where lower(email) = v_people[s][1];
    if exists (select 1 from public.memberships m where m.user_id = v_id and (m.brand_id is null or m.brand_id <> v_brand)) then
      raise exception 'Le compte % a déjà accès à une autre marque : ce n''est pas un compte fictif.', v_people[s][1];
    end if;
    update public.profiles set full_name = v_people[s][2] where id = v_id;
    insert into public.memberships (user_id, brand_id, role_id) values (v_id, v_brand, v_role) on conflict do nothing;
    v_sellers := v_sellers || v_id;
  end loop;

  with ranked as (
    select id, row_number() over (order by created_at, id) as rn from public.companies where brand_id = v_brand
  )
  update public.companies c set owner_id = v_sellers[v_pattern[1 + ((r.rn - 1) % 24)::int]]
    from ranked r where r.id = c.id;

  update public.opportunities o set owner_id = c.owner_id from public.companies c where c.id = o.company_id and o.brand_id = v_brand;
  update public.commercial_documents d set owner_id = c.owner_id from public.companies c where c.id = d.company_id and d.brand_id = v_brand;
  update public.contracts x set owner_id = c.owner_id from public.companies c where c.id = x.company_id and x.brand_id = v_brand;

  with ranked as (
    select id, row_number() over (order by start_on, id) as rn from public.tasks where brand_id = v_brand
  )
  update public.tasks t set assignee_id = v_sellers[1 + ((r.rn - 1) % 4)::int]
    from ranked r where r.id = t.id;

  delete from public.weekly_reports where brand_id = v_brand;
  for s in 1..4 loop
    for w in 0..25 loop
      -- Yao n'a pas soumis trois fiches : ses chiffres de ces semaines restent inconnus, pas à 0.
      continue when s = 4 and w in (5, 12, 19);
      v_date := date '2026-05-04' + (w * 7);
      insert into public.weekly_reports (brand_id, user_id, week_start, calls_prospecting, calls_follow_up, emails_sent, qualified_meetings, comments, status, created_at)
      values (v_brand, v_sellers[s], v_date,
              floor((28 + random() * 18 + w * 0.5) * v_level[s])::int,
              floor((14 + random() * 12) * v_level[s])::int,
              floor((22 + random() * 24) * v_level[s])::int,
              floor((2 + random() * 3) * v_level[s])::int,
              'Fiche fictive de démonstration.', 'submitted', ((v_date + 4) + time '17:00')::timestamptz);
    end loop;
  end loop;
  update public.weekly_reports set status = 'validated' where brand_id = v_brand and week_start < date '2026-10-12';
end;
$repartition$;
