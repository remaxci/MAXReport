import { OpportunityDetailPage } from "@/features/crm/pages";

export default function Page({ params }: PageProps<"/m/[brand]/opportunites/[id]">) {
  return <OpportunityDetailPage params={params} />;
}
