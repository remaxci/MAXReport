import { CompanyDetailPage } from "@/features/crm/pages";

export default function Page({ params }: PageProps<"/m/[brand]/prospects/[id]">) {
  return <CompanyDetailPage params={params} />;
}
