import { SnapshotEditPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/reseaux-sociaux/[id]/releves/[releve]">) {
  return <SnapshotEditPage kind="social" params={params} />;
}
