import Link from "next/link";
import type { ReactNode } from "react";
import { FileSpreadsheet } from "lucide-react";
import { AmountText } from "@/components/amount-text";
import { periodSearch, type Period } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Chart } from "./chart-data";
import { ChartView } from "./components/chart-view";
import { PrintButton } from "./components/print-button";
import type { Kpi, Section } from "./data";
import { formatKpi, kpiEvolution } from "./format";

export { formatKpi } from "./format";

function KpiTile({ kpi }: { kpi: Kpi }) {
  const change = kpiEvolution(kpi);
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-3 break-inside-avoid">
      <span className="text-xs text-muted-foreground">{kpi.label}</span>
      <span className="text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">
        <AmountText value={formatKpi(kpi)} />
      </span>
      {change && <span className="text-xs text-muted-foreground">vs période préc. {change}</span>}
      {kpi.hint && <span className="text-xs text-muted-foreground">{kpi.hint}</span>}
    </div>
  );
}

/** Graphiques côte à côte sur grand écran, l'un sous l'autre sur mobile. */
export function ChartsGrid({ charts }: { charts: Chart[] }) {
  if (charts.length === 0) return null;
  return (
    <div className={`grid gap-6 ${charts.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {charts.map((chart) => (
        <ChartView key={chart.key} chart={chart} />
      ))}
    </div>
  );
}

export function ChartsSkeleton() {
  return <Skeleton className="h-60 w-full rounded-lg" />;
}

export type DashboardView = "chiffres" | "graphiques";

/** Vue demandée dans l'adresse ; par défaut, les chiffres. */
export function readDashboardView(value: string | undefined): DashboardView {
  return value === "graphiques" ? "graphiques" : "chiffres";
}

/** Onglets des sections du tableau de bord ; la période et la vue sont conservées. Défilent sur un petit écran. */
export function SectionTabs({
  base,
  period,
  view,
  tabs,
  active,
}: {
  base: string;
  period: Period;
  view: DashboardView;
  tabs: readonly { slug: string; label: string }[];
  active: string;
}) {
  const href = (slug: string, index: number) => {
    const params = new URLSearchParams(periodSearch(period));
    if (view === "graphiques") params.set("vue", view);
    if (index > 0) params.set("section", slug);
    return `${base}?${params}`;
  };
  return (
    <nav aria-label="Sections du tableau de bord" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border p-1 print:hidden">
      {tabs.map((tab, index) => (
        <Link
          key={tab.slug}
          href={href(tab.slug, index)}
          aria-current={tab.slug === active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
            tab.slug === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Onglets « Chiffres » et « Graphiques » : deux pages distinctes, la période est conservée. */
export function ViewTabs({ base, period, view, keep }: { base: string; period: Period; view: DashboardView; keep?: Record<string, string> }) {
  const href = (target: DashboardView) => {
    const params = new URLSearchParams(periodSearch(period));
    if (target === "graphiques") params.set("vue", target);
    for (const [name, value] of Object.entries(keep ?? {})) params.set(name, value);
    return `${base}?${params}`;
  };
  const tab = (target: DashboardView, label: string) => (
    <Link
      href={href(target)}
      aria-current={view === target ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === target ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Vues du tableau de bord" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1 print:hidden">
      {tab("chiffres", "Chiffres")}
      {tab("graphiques", "Graphiques")}
    </nav>
  );
}

/** Une carte de graphiques ; `children` : le graphique, ou le message quand il n'y en a pas. */
export function ChartsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Sections de chiffres du tableau de bord et des rapports ; `links` : lien à placer sous le titre d'une section. */
export function SectionsView({ sections, links }: { sections: Section[]; links?: Partial<Record<string, ReactNode>> }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <Card key={section.key} className="break-inside-avoid">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            {links?.[section.key]}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {section.kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {section.kpis.map((kpi) => (
                  <KpiTile key={kpi.key} kpi={kpi} />
                ))}
              </div>
            )}
            {section.notes.length > 0 && (
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted-foreground">
                {section.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Boutons d'export : Excel (fichier) et PDF (impression). */
export function ExportBar({ excelHref }: { excelHref: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" nativeButton={false} render={<Link href={excelHref} prefetch={false} />}>
        <FileSpreadsheet />
        Excel
      </Button>
      <PrintButton />
    </div>
  );
}
