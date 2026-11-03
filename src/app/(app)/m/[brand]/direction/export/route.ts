import { exportDirection } from "@/features/dashboard/routes";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/direction/export">) {
  const { brand } = await params;
  return exportDirection(request, brand);
}
