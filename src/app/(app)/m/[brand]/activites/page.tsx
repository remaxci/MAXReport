import { ActivitiesPage } from "@/features/activities/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/activites">) {
  return <ActivitiesPage params={params} searchParams={searchParams} />;
}
