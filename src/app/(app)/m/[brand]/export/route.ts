import { exportDashboard } from "@/features/dashboard/routes";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/export">) {
  const { brand } = await params;
  return exportDashboard(request, brand);
}
