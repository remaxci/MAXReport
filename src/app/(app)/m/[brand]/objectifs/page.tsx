import { ObjectivesPage } from "@/features/objectives/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/objectifs">) {
  return <ObjectivesPage params={params} searchParams={searchParams} />;
}
