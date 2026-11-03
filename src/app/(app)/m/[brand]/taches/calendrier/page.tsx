import { CalendarPage } from "@/features/planning/view-pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/taches/calendrier">) {
  return <CalendarPage params={params} searchParams={searchParams} />;
}
