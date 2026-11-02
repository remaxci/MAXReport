import { RegisterNewPage } from "@/features/registers/pages";

export default function NewOfferPage({ params }: PageProps<"/m/[brand]/offres/nouvelle">) {
  return <RegisterNewPage kind="offer" params={params} />;
}
