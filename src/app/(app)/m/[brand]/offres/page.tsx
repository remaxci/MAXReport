import { RegisterListPage } from "@/features/registers/pages";

export default function OffersPage({ params, searchParams }: PageProps<"/m/[brand]/offres">) {
  return <RegisterListPage kind="offer" params={params} searchParams={searchParams} />;
}
