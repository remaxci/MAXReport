import { ImportsPage } from "@/features/imports/pages";

export default function Page({ params }: PageProps<"/m/[brand]/imports">) {
  return <ImportsPage params={params} />;
}
