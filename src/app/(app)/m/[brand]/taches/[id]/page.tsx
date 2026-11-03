import { TaskDetailPage } from "@/features/planning/pages";

export default function Page({ params }: PageProps<"/m/[brand]/taches/[id]">) {
  return <TaskDetailPage params={params} />;
}
