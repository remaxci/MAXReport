import { exportRegister } from "@/features/registers/export";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/offres/export">) {
  const { brand } = await params;
  return exportRegister("offer", request, brand);
}
