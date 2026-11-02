import { ContractsPage } from "@/features/crm/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/contrats">) {
  return <ContractsPage params={params} searchParams={searchParams} />;
}
