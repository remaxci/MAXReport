-- Tests · Assistant IA (journal d'usage)
--
-- À exécuter sur MAXreport-dev uniquement, jamais en production.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000004', 'commercial-x@test.local'),
  ('00000000-0000-4000-8000-000000000005', 'admin-y@test.local');

insert into public.brands (id, code, slug, name) values
  ('00000000-0000-4000-9000-00000000000a', 'TESTX', 'test-x', 'Marque X'),
  ('00000000-0000-4000-9000-00000000000b', 'TESTY', 'test-y', 'Marque Y');

insert into public.memberships (user_id, brand_id, role_id)
select v.u, v.b, r.id from (values
  ('00000000-0000-4000-8000-000000000004'::uuid, '00000000-0000-4000-9000-00000000000a'::uuid, 'sales_rep'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'brand_admin')
) as v(u, b, k) join public.roles r on r.key = v.k;

-- Un usage de l'administrateur de Y, pour vérifier l'isolement.
insert into public.assistant_usage (user_id, brand_id, model, status) values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000b', 'claude-opus-5-5', 'ok');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  insert into public.assistant_usage (brand_id, model, status, input_tokens, output_tokens, tool_calls)
  values ('00000000-0000-4000-9000-00000000000a', 'claude-opus-5-5', 'ok', 1200, 300, 2);
  if (select user_id from public.assistant_usage where brand_id = '00000000-0000-4000-9000-00000000000a') <> '00000000-0000-4000-8000-000000000004' then
    raise exception 'ECHEC usage non rattaché à son auteur';
  end if;

  select count(*) into n from public.assistant_usage;
  if n <> 1 then raise exception 'ECHEC le commercial voit % usage(s) au lieu de 1 (le sien)', n; end if;

  begin
    insert into public.assistant_usage (brand_id, model, status) values ('00000000-0000-4000-9000-00000000000b', 'claude-opus-5-5', 'ok');
    raise exception 'ECHEC usage enregistré sur une marque non lisible';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_usage (user_id, brand_id, model, status)
    values ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-9000-00000000000a', 'claude-opus-5-5', 'ok');
    raise exception 'ECHEC usage enregistré au nom d''un autre';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assistant_usage set output_tokens = 0;
    raise exception 'ECHEC usage modifié';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.assistant_usage;
    raise exception 'ECHEC usage effacé';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistant_usage (brand_id, model, status) values ('00000000-0000-4000-9000-00000000000a', 'claude-opus-5-5', 'inconnu');
    raise exception 'ECHEC issue inconnue acceptée';
  exception when check_violation then null;
  end;
end $$;
reset role;

select 'OK : tous les tests de l''assistant passent' as resultat;

rollback;
