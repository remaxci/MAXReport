import type { ReactNode } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</div>;
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Message simple : état vide, accès refusé, information. */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {children && <CardDescription>{children}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

export function Forbidden() {
  return (
    <Page>
      <Notice title="Accès refusé">
        Vous n&apos;avez pas les droits nécessaires pour consulter cette page.
      </Notice>
    </Page>
  );
}

export function PageSkeleton() {
  return (
    <Page>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </Page>
  );
}
