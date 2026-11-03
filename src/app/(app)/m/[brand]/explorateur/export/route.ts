import { exportExploration } from "@/features/explorer/export";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/explorateur/export">) {
  const { brand } = await params;
  return exportExploration(request, brand);
}
