import { DirectionPage } from "@/features/dashboard/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/direction">) {
  return <DirectionPage params={params} searchParams={searchParams} />;
}
