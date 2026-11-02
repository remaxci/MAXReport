-- Sprint 0 · Fondations
-- Voir docs/architecture.md, section 4 (conventions).

-- Schéma privé pour les fonctions internes : il n'est pas exposé par l'API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Contraintes d'exclusion sur les périodes des relevés (pas de chevauchement).
create extension if not exists btree_gist with schema extensions;

-- Met à jour updated_at à chaque modification d'une ligne.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app.set_updated_at() from public;
