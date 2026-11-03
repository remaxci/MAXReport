import { MarketingListPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/reseaux-sociaux">) {
  return <MarketingListPage kind="social" params={params} searchParams={searchParams} />;
}
