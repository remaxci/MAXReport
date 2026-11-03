import Link from "next/link";
import type { ReactNode } from "react";
import { FileSpreadsheet } from "lucide-react";
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
    <div className="flex flex-col gap-1 rounded-lg border p-3 break-inside-avoid">
      <span className="text-xs text-muted-foreground">{kpi.label}</span>
      <span className="text-xl font-semibold tabular-nums">{formatKpi(kpi)}</span>
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

/** Sections du tableau de bord ; `charts` : graphiques à placer sous les indicateurs de chaque section. */
export function SectionsView({ sections, charts }: { sections: Section[]; charts?: Partial<Record<string, ReactNode>> }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <Card key={section.key} className="break-inside-avoid">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {section.kpis.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {section.kpis.map((kpi) => (
                  <KpiTile key={kpi.key} kpi={kpi} />
                ))}
              </div>
            )}
            {charts?.[section.key]}
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
