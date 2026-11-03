import { GanttPage } from "@/features/planning/schedule-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches/gantt">) {
  return <GanttPage params={params} searchParams={searchParams} />;
}
