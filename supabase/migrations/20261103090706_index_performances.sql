-- Sprint 9 · Index des lectures fréquentes des tableaux de bord.
-- Offres et mémos envoyés sur une période (metric_actuals, taux de
-- transformation) ; relevés d'une marque sur une période, tous objets
-- confondus (listes marketing, tableaux de bord, vue Direction).

create index if not exists documents_brand_kind_sent_idx
  on public.commercial_documents (brand_id, kind, sent_on);
create index if not exists social_snapshots_brand_period_idx
  on public.social_snapshots (brand_id, period_start, period_end);
create index if not exists campaign_snapshots_brand_period_idx
  on public.campaign_snapshots (brand_id, period_start, period_end);
create index if not exists website_snapshots_brand_period_idx
  on public.website_snapshots (brand_id, period_start, period_end);
