import { RoadmapPage } from "@/features/planning/view-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/feuille-de-route">) {
  return <RoadmapPage params={params} searchParams={searchParams} />;
}
