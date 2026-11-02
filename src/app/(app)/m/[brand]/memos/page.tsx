import { RegisterListPage } from "@/features/registers/pages";

export default function MemosPage({ params, searchParams }: PageProps<"/m/[brand]/memos">) {
  return <RegisterListPage kind="memo" params={params} searchParams={searchParams} />;
}
