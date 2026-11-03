import { serveCatalog } from "@/features/bi/serve";

// Connexion BI : ce que la clé d'accès ouvre (voir docs/connexion-bi.md).
export async function GET(request: Request) {
  return serveCatalog(request);
}
