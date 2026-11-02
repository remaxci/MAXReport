import { NewContractPage } from "@/features/crm/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/contrats/nouveau">) {
  return <NewContractPage params={params} searchParams={searchParams} />;
}
