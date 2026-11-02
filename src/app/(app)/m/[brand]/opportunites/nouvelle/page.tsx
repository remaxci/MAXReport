import { NewOpportunityPage } from "@/features/crm/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/opportunites/nouvelle">) {
  return <NewOpportunityPage params={params} searchParams={searchParams} />;
}
