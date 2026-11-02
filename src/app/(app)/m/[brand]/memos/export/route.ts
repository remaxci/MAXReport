import { exportRegister } from "@/features/registers/export";

export async function GET(request: Request, { params }: RouteContext<"/m/[brand]/memos/export">) {
  const { brand } = await params;
  return exportRegister("memo", request, brand);
}
