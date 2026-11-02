import { Suspense } from "react";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";

export default function BrandSettingsLayout({ children }: LayoutProps<"/m/[brand]/parametres">) {
  return (
    <>
      <Suspense fallback={<div className="h-11 border-b" />}>
        <SettingsTabs />
      </Suspense>
      {children}
    </>
  );
}
