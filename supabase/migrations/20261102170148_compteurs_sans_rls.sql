-- Table interne (schéma app, non exposé, aucun droit accordé) : la RLS n'y sert à rien.
alter table app.reference_counters disable row level security;
revoke all on app.reference_counters from public, anon, authenticated;
