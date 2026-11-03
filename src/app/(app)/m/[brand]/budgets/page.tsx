import { BudgetsPage } from "@/features/budgets/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/budgets">) {
  return <BudgetsPage params={params} searchParams={searchParams} />;
}
