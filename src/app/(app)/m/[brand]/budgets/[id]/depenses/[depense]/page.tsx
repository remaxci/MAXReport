import { ExpenseEditPage } from "@/features/budgets/pages";

export default function Page({ params }: PageProps<"/m/[brand]/budgets/[id]/depenses/[depense]">) {
  return <ExpenseEditPage params={params} />;
}
