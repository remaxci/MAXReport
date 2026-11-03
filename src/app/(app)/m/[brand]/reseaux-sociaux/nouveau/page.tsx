import { MarketingNewPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/reseaux-sociaux/nouveau">) {
  return <MarketingNewPage kind="social" params={params} />;
}
