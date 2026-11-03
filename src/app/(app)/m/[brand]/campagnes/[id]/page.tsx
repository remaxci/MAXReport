import { MarketingDetailPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/campagnes/[id]">) {
  return <MarketingDetailPage kind="campaign" params={params} searchParams={searchParams} />;
}
