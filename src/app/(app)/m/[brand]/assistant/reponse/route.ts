import { respond } from "@/features/assistant/respond";

// Une question peut demander plusieurs lectures de données : jusqu'à 5 minutes.
export const maxDuration = 300;

export async function POST(request: Request, { params }: RouteContext<"/m/[brand]/assistant/reponse">) {
  const { brand } = await params;
  return respond(request, brand);
}
