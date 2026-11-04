-- MAXreport : 4 commerciaux fictifs pour la marque DEMO. Aucun mot de passe : personne ne peut s'y connecter.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''
from unnest(array['aminata.demo@exemple.test', 'koffi.demo@exemple.test', 'mariam.demo@exemple.test', 'yao.demo@exemple.test']) as e
where not exists (select 1 from auth.users u where u.email = e);
