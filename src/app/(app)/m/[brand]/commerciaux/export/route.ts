import { exportSellers } from "@/features/sellers/routes";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/commerciaux/export">) {
  const { brand } = await params;
  return exportSellers(request, brand);
}
