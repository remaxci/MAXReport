import { BiConnectionPage } from "@/features/bi/page";

export default function Page({ params }: PageProps<"/m/[brand]/parametres/connexion-bi">) {
  return <BiConnectionPage params={params} />;
}
