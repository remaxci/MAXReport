import { Suspense } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthContext } from "@/server/authz/context";
import { BrandSwitcher } from "./brand-switcher";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { toSidebarData } from "./sidebar-data";

// Les parties qui lisent la session sont derrière un Suspense (Cache Components).
// Pas de SidebarMenuSkeleton : il utilise Math.random(), refusé au prérendu.
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-md" />}>
          <SidebarBrand />
        </Suspense>
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavSkeleton />}>
          <SidebarNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-md" />}>
          <SidebarUser />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

async function SidebarBrand() {
  const ctx = await getAuthContext();
  return <BrandSwitcher brands={toSidebarData(ctx).brands} />;
}

async function SidebarNav() {
  const ctx = await getAuthContext();
  return <NavMain data={toSidebarData(ctx)} />;
}

async function SidebarUser() {
  const ctx = await getAuthContext();
  return <NavUser email={ctx.email} name={ctx.fullName} />;
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"].map((width) => (
        <Skeleton key={width} className={`h-7 ${width}`} />
      ))}
    </div>
  );
}
