import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SectionsView({ sections }: { sections: Section[] }) {
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
