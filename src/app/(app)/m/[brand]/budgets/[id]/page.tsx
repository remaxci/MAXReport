import { BudgetDetailPage } from "@/features/budgets/pages";

export default function Page({ params }: PageProps<"/m/[brand]/budgets/[id]">) {
  return <BudgetDetailPage params={params} />;
}
