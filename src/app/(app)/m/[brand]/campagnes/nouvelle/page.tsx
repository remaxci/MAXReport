import { MarketingNewPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/campagnes/nouvelle">) {
  return <MarketingNewPage kind="campaign" params={params} />;
}
