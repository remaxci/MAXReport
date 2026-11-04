import { SellersPage } from "@/features/sellers/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]/commerciaux">) {
  return <SellersPage params={params} searchParams={searchParams} />;
}
