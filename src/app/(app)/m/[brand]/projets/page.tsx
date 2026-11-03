import { ProjectsPage } from "@/features/planning/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/projets">) {
  return <ProjectsPage params={params} searchParams={searchParams} />;
}
