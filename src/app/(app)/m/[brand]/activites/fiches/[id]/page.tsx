import { ReportPage } from "@/features/activities/pages";

export default function Page({ params }: PageProps<"/m/[brand]/activites/fiches/[id]">) {
  return <ReportPage params={params} />;
}
