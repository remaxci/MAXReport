import { BatchPage } from "@/features/imports/pages";

export default function Page({ params }: PageProps<"/m/[brand]/imports/[id]">) {
  return <BatchPage params={params} />;
}
