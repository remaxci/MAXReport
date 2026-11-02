import { RegisterDetailPage } from "@/features/registers/pages";

export default function OfferPage({ params }: PageProps<"/m/[brand]/offres/[id]">) {
  return <RegisterDetailPage kind="offer" params={params} />;
}
