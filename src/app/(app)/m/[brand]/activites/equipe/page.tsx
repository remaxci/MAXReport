import { TeamActivitiesPage } from "@/features/activities/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/activites/equipe">) {
  return <TeamActivitiesPage params={params} searchParams={searchParams} />;
}
