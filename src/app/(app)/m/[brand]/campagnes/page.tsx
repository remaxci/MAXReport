import { MarketingListPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/campagnes">) {
  return <MarketingListPage kind="campaign" params={params} searchParams={searchParams} />;
}
