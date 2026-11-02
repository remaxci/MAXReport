import { CompaniesPage } from "@/features/crm/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/prospects">) {
  return <CompaniesPage params={params} searchParams={searchParams} />;
}
