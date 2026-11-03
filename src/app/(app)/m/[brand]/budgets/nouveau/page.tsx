import { NewBudgetPage } from "@/features/budgets/pages";

export default function Page({ params }: PageProps<"/m/[brand]/budgets/nouveau">) {
  return <NewBudgetPage params={params} />;
}
