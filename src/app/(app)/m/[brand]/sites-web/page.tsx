import { MarketingListPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/sites-web">) {
  return <MarketingListPage kind="website" params={params} searchParams={searchParams} />;
}
