import { RegisterNewPage } from "@/features/registers/pages";

export default function NewMemoPage({ params }: PageProps<"/m/[brand]/memos/nouveau">) {
  return <RegisterNewPage kind="memo" params={params} />;
}
