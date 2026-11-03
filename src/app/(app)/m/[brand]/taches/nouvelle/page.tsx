import { NewTaskPage } from "@/features/planning/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches/nouvelle">) {
  return <NewTaskPage params={params} searchParams={searchParams} />;
}
