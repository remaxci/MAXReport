import { ReportsPage } from "@/features/reports/pages";

export default function Page({ params }: PageProps<"/m/[brand]/rapports">) {
  return <ReportsPage params={params} />;
}
