import { NewProjectPage } from "@/features/planning/pages";

export default function Page({ params }: PageProps<"/m/[brand]/projets/nouveau">) {
  return <NewProjectPage params={params} />;
}
