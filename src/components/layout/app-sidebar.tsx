import { Suspense } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/authz/current-user";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Le sélecteur de marque prendra cette place au Sprint 1. */}
        <div className="flex h-12 items-center px-2 font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          MAXreport
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        {/* Lit la session : doit rester derrière un Suspense (Cache Components). */}
        {/* Pas de SidebarMenuSkeleton : il utilise Math.random(), refusé au prérendu. */}
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-md" />}>
          <SidebarUser />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

async function SidebarUser() {
  const user = await getCurrentUser();
  return <NavUser email={user.email} />;
}
