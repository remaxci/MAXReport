import { OpportunitiesPage } from "@/features/crm/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/opportunites">) {
  return <OpportunitiesPage params={params} searchParams={searchParams} />;
}
