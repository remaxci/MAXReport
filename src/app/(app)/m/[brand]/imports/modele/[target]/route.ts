import { downloadTemplate } from "@/features/imports/template-download";

export async function GET(_request: Request, { params }: RouteContext<"/m/[brand]/imports/modele/[target]">) {
  const { brand, target } = await params;
  return downloadTemplate(brand, target);
}
