import { NewCompanyPage } from "@/features/crm/pages";

export default function Page({ params }: PageProps<"/m/[brand]/prospects/nouveau">) {
  return <NewCompanyPage params={params} />;
}
