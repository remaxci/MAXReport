import { MarketingNewPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/sites-web/nouveau">) {
  return <MarketingNewPage kind="website" params={params} />;
}
