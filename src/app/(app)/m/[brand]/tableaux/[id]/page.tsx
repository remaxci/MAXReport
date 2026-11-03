import { DashboardPage } from "@/features/explorer/dashboard-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/tableaux/[id]">) {
  return <DashboardPage params={params} searchParams={searchParams} />;
}
