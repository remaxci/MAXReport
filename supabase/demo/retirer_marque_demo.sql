-- Retrait complet de la marque DEMO. Testé sur la base de test le 2026-11-04.
-- Les lignes du journal d'audit sont conservées. La garde est réactivée dans la même transaction.
do $retrait$
declare
  v_brand uuid;
begin
  select id into strict v_brand from public.brands where code = 'DEMO' and slug = 'demo';
  delete from public.task_dependencies where brand_id = v_brand;
  delete from public.tasks where brand_id = v_brand;
  delete from public.milestones where brand_id = v_brand;
  delete from public.projects where brand_id = v_brand;
  delete from public.expenses where brand_id = v_brand;
  delete from public.budget_lines where brand_id = v_brand;
  delete from public.budgets where brand_id = v_brand;
  delete from public.campaign_snapshots where brand_id = v_brand;
  delete from public.campaigns where brand_id = v_brand;
  delete from public.social_snapshots where brand_id = v_brand;
  delete from public.social_accounts where brand_id = v_brand;
  delete from public.website_snapshots where brand_id = v_brand;
  delete from public.websites where brand_id = v_brand;
  delete from public.contracts where brand_id = v_brand;
  delete from public.opportunities where brand_id = v_brand;
  delete from public.commercial_documents where brand_id = v_brand;
  delete from public.contacts where brand_id = v_brand;
  delete from public.companies where brand_id = v_brand;
  delete from public.weekly_reports where brand_id = v_brand;
  delete from public.objectives where brand_id = v_brand;
  alter table public.option_lists disable trigger option_lists_guard_delete;
  delete from public.brands where id = v_brand;
  alter table public.option_lists enable trigger option_lists_guard_delete;
end;
$retrait$;
