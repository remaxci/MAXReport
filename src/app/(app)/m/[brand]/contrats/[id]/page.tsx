import { ContractDetailPage } from "@/features/crm/pages";

export default function Page({ params }: PageProps<"/m/[brand]/contrats/[id]">) {
  return <ContractDetailPage params={params} />;
}
