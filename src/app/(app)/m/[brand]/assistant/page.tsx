import { AssistantPage } from "@/features/assistant/page";

export default function Page({ params }: PageProps<"/m/[brand]/assistant">) {
  return <AssistantPage params={params} />;
}
