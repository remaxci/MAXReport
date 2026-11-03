import { BrandDashboardPage } from "@/features/dashboard/pages";

export default function Page({ params, searchParams }: PageProps<"/m/[brand]">) {
  return <BrandDashboardPage params={params} searchParams={searchParams} />;
}
