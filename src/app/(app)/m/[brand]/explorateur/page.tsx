import { ExplorerPage } from "@/features/explorer/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/explorateur">) {
  return <ExplorerPage params={params} searchParams={searchParams} />;
}
