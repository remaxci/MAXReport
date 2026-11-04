import { serveDataset } from "@/features/bi/serve";

// Connexion BI : un jeu de données, en JSON ou en CSV (?format=csv).
export const maxDuration = 60;

export async function GET(request: Request, { params }: RouteContext<"/api/bi/v1/[jeu]">) {
  const { jeu } = await params;
  return serveDataset(request, jeu);
}
