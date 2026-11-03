import { WorkloadPage } from "@/features/planning/schedule-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches/charge">) {
  return <WorkloadPage params={params} searchParams={searchParams} />;
}
