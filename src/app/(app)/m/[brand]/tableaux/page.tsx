import { DashboardsPage } from "@/features/explorer/dashboard-pages";

export default function Page({ params }: PageProps<"/m/[brand]/tableaux">) {
  return <DashboardsPage params={params} />;
}
