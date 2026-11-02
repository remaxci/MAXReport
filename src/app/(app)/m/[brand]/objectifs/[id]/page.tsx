import { EditObjectivePage } from "@/features/objectives/pages";

export default function Page({ params }: PageProps<"/m/[brand]/objectifs/[id]">) {
  return <EditObjectivePage params={params} />;
}
