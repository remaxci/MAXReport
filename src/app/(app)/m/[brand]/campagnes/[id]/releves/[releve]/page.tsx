import { SnapshotEditPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/campagnes/[id]/releves/[releve]">) {
  return <SnapshotEditPage kind="campaign" params={params} />;
}
