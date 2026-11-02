import { RegisterDetailPage } from "@/features/registers/pages";

export default function MemoPage({ params }: PageProps<"/m/[brand]/memos/[id]">) {
  return <RegisterDetailPage kind="memo" params={params} />;
}
