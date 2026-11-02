-- Une valeur inchangée n'est pas revalidée : désactiver un choix de liste ou
-- durcir une règle ne bloque pas la modification des fiches existantes.
create or replace function app.custom_values_errors(
  p_brand uuid,
  p_entity text,
  p_new jsonb,
  p_old jsonb default null
)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_errors text[] := '{}';
  v_def public.custom_field_definitions%rowtype;
  v_key text;
  v_val jsonb;
  v_old_val jsonb;
  v_empty boolean;
  v_item jsonb;
  v_text text;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'object' then
    return array['Valeurs personnalisées invalides.'];
  end if;

  for v_key in select jsonb_object_keys(p_new) loop
    if not exists (
      select 1 from public.custom_field_definitions d
      where d.brand_id = p_brand and d.entity = p_entity and d.key = v_key
    ) then
      v_errors := v_errors || format('Champ inconnu : %s.', v_key);
    end if;
  end loop;

  for v_def in
    select * from public.custom_field_definitions d
    where d.brand_id = p_brand and d.entity = p_entity
    order by d.position
  loop
    v_val := p_new -> v_def.key;
    v_old_val := p_old -> v_def.key;
    v_empty := v_val is null or v_val in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);

    -- Droit de modification propre au champ.
    if v_def.write_permission is not null
       and v_val is distinct from v_old_val
       and auth.uid() is not null
       and not (p_brand = any (app.brands_with(v_def.write_permission))) then
      v_errors := v_errors || format('Vous ne pouvez pas modifier « %s ».', v_def.label);
    end if;

    -- Valeur inchangée depuis la dernière version : déjà acceptée, pas de revalidation.
    if p_old is not null and v_val is not distinct from v_old_val then
      continue;
    end if;

    if not v_def.is_active then
      continue;
    end if;

    if v_empty then
      if v_def.required and (
        p_old is null
        or not (v_old_val is null or v_old_val in ('null'::jsonb, '""'::jsonb, '[]'::jsonb))
      ) then
        v_errors := v_errors || format('« %s » est obligatoire.', v_def.label);
      end if;
      continue;
    end if;

    case v_def.type
      when 'text', 'long_text', 'url', 'email', 'phone' then
        if jsonb_typeof(v_val) <> 'string' then
          v_errors := v_errors || format('« %s » doit être un texte.', v_def.label);
          continue;
        end if;
        v_text := v_val #>> '{}';
        if v_def.validation ? 'max_length'
           and length(v_text) > (v_def.validation ->> 'max_length')::numeric then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        elsif v_def.type = 'email' and v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          v_errors := v_errors || format('« %s » n''est pas un e-mail valide.', v_def.label);
        elsif v_def.type = 'url' and v_text !~ '^https?://[^[:space:]]+$' then
          v_errors := v_errors || format('« %s » doit commencer par http:// ou https://.', v_def.label);
        elsif v_def.type = 'phone' and v_text !~ '^[+0-9 ().-]{6,30}$' then
          v_errors := v_errors || format('« %s » n''est pas un numéro valide.', v_def.label);
        elsif v_def.type in ('text', 'url', 'email', 'phone') and length(v_text) > 500 then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        elsif v_def.type = 'long_text' and length(v_text) > 5000 then
          v_errors := v_errors || format('« %s » est trop long.', v_def.label);
        end if;

      when 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          v_errors := v_errors || format('« %s » doit être un nombre.', v_def.label);
        elsif v_def.validation ? 'min' and (v_val #>> '{}')::numeric < (v_def.validation ->> 'min')::numeric then
          v_errors := v_errors || format('« %s » est trop petit.', v_def.label);
        elsif v_def.validation ? 'max' and (v_val #>> '{}')::numeric > (v_def.validation ->> 'max')::numeric then
          v_errors := v_errors || format('« %s » est trop grand.', v_def.label);
        end if;

      when 'money' then
        if jsonb_typeof(v_val) <> 'object'
           or jsonb_typeof(v_val -> 'amount') <> 'number'
           or coalesce(v_val ->> 'currency', '') not in ('XOF', 'USD', 'EUR')
           or (v_val - array['amount', 'currency']) <> '{}'::jsonb then
          v_errors := v_errors || format('« %s » doit être un montant avec sa devise.', v_def.label);
        elsif v_def.validation ? 'min' and (v_val ->> 'amount')::numeric < (v_def.validation ->> 'min')::numeric then
          v_errors := v_errors || format('« %s » est trop petit.', v_def.label);
        elsif v_def.validation ? 'max' and (v_val ->> 'amount')::numeric > (v_def.validation ->> 'max')::numeric then
          v_errors := v_errors || format('« %s » est trop grand.', v_def.label);
        end if;

      when 'date' then
        if jsonb_typeof(v_val) <> 'string' or (v_val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          v_errors := v_errors || format('« %s » doit être une date.', v_def.label);
        else
          begin
            perform (v_val #>> '{}')::date;
          exception when others then
            v_errors := v_errors || format('« %s » doit être une date.', v_def.label);
          end;
        end if;

      when 'boolean' then
        if jsonb_typeof(v_val) <> 'boolean' then
          v_errors := v_errors || format('« %s » doit valoir oui ou non.', v_def.label);
        end if;

      when 'select' then
        if jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from public.option_items i
          where i.list_id = v_def.options_list_id and i.value = (v_val #>> '{}') and i.is_active
        ) then
          v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
        end if;

      when 'multiselect' then
        if jsonb_typeof(v_val) <> 'array' then
          v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
        else
          for v_item in select jsonb_array_elements(v_val) loop
            if jsonb_typeof(v_item) <> 'string' or not exists (
              select 1 from public.option_items i
              where i.list_id = v_def.options_list_id and i.value = (v_item #>> '{}') and i.is_active
            ) then
              v_errors := v_errors || format('« %s » : choix invalide.', v_def.label);
              exit;
            end if;
          end loop;
        end if;

      when 'user' then
        if jsonb_typeof(v_val) <> 'string'
           or (v_val #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1 from public.memberships m
             where m.user_id = (v_val #>> '{}')::uuid
               and (m.brand_id = p_brand or m.brand_id is null)
           ) then
          v_errors := v_errors || format('« %s » : collaborateur inconnu pour cette marque.', v_def.label);
        end if;
    end case;
  end loop;

  return v_errors;
end;
$$;
