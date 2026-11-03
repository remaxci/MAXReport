import { KanbanPage } from "@/features/planning/view-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches/kanban">) {
  return <KanbanPage params={params} searchParams={searchParams} />;
}
