-- Les compteurs de références ne servent qu'aux triggers : hors de l'API.
alter table public.reference_counters set schema app;

create or replace function app.prepare_document()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status record;
  v_code text;
  v_year int;
  v_number int;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.owner_id := coalesce(new.owner_id, auth.uid());
    if new.status_id is null then
      select id into new.status_id from public.statuses
       where brand_id = new.brand_id and entity = new.kind and is_default;
    end if;

    select code into v_code from public.brands where id = new.brand_id;
    v_year := extract(year from new.issued_on)::int;
    insert into app.reference_counters as c (brand_id, kind, year, last_value)
    values (new.brand_id, new.kind, v_year, 1)
    on conflict (brand_id, kind, year) do update set last_value = c.last_value + 1
    returning last_value into v_number;
    new.reference := case new.kind when 'offer' then 'OF' else 'MS' end
      || '-' || v_code || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
  else
    if new.reference is distinct from old.reference or new.kind is distinct from old.kind
       or new.brand_id is distinct from old.brand_id then
      raise exception 'La référence, le type et la marque d''un document sont figés.'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;

  select s.entity, s.is_active into v_status from public.statuses s
   where s.id = new.status_id and s.brand_id = new.brand_id;
  if v_status.entity is distinct from new.kind then
    raise exception 'Statut invalide pour ce document.' using errcode = 'check_violation';
  end if;
  if not v_status.is_active and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id) then
    raise exception 'Ce statut est désactivé.' using errcode = 'check_violation';
  end if;

  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and not app.is_brand_member(new.owner_id, new.brand_id) then
    raise exception 'Le commercial responsable doit être un collaborateur de la marque.'
      using errcode = 'check_violation';
  end if;

  if new.contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = new.contact_id and c.company_id = new.company_id
  ) then
    raise exception 'Le contact n''appartient pas à cette entreprise.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
