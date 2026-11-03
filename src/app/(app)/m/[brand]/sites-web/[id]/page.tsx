import { MarketingDetailPage } from "@/features/marketing/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/sites-web/[id]">) {
  return <MarketingDetailPage kind="website" params={params} searchParams={searchParams} />;
}
