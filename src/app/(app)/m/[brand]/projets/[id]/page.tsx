import { ProjectDetailPage } from "@/features/planning/pages";

export default function Page({ params }: PageProps<"/m/[brand]/projets/[id]">) {
  return <ProjectDetailPage params={params} />;
}
