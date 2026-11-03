import { SnapshotEditPage } from "@/features/marketing/pages";

export default function Page({ params }: PageProps<"/m/[brand]/sites-web/[id]/releves/[releve]">) {
  return <SnapshotEditPage kind="website" params={params} />;
}
