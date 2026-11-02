import { NewObjectivePage } from "@/features/objectives/pages";

export default function Page({ params }: PageProps<"/m/[brand]/objectifs/nouveau">) {
  return <NewObjectivePage params={params} />;
}
