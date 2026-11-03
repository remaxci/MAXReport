import { TasksPage } from "@/features/planning/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches">) {
  return <TasksPage params={params} searchParams={searchParams} />;
}
