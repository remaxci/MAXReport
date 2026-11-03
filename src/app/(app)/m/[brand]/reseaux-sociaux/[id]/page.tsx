import { MarketingDetailPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/reseaux-sociaux/[id]">) {
  return <MarketingDetailPage kind="social" params={params} searchParams={searchParams} />;
}
