import type { Metadata } from "next";
import { MyTasksPage } from "@/features/planning/pages";

export const metadata: Metadata = { title: "Mes tâches · MAXreport" };

export default function Page() {
  return <MyTasksPage />;
}
