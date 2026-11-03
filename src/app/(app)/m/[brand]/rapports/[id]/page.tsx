import { ReportPage } from "@/features/reports/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/rapports/[id]">) {
  return <ReportPage params={params} searchParams={searchParams} />;
}
