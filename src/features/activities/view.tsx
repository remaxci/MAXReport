import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PERIOD_KINDS, PERIOD_LABELS, PERIOD_SLUGS, periodLabel, shiftPeriod, type Period } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { REPORT_STATUS_LABELS, type ReportStatus } from "./queries";

export function ReportStatusBadge({ status }: { status: ReportStatus | "missing" | "todo" }) {
  if (status === "missing") return <Badge variant="destructive">Manquante</Badge>;
  if (status === "todo") return <Badge variant="outline">À remplir</Badge>;
  const variant = status === "validated" ? "default" : status === "submitted" ? "secondary" : "outline";
  return <Badge variant={variant}>{REPORT_STATUS_LABELS[status]}</Badge>;
}

/** Onglets « Ma fiche » / « Équipe ». */
export function ActivityTabs({ base, active, own, team }: { base: string; active: "own" | "team"; own: boolean; team: boolean }) {
  if (!own || !team) return null;
  const tab = (href: string, label: string, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        current ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Vues" className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
      {tab(base, "Ma fiche", active === "own")}
      {tab(`${base}/equipe`, "Équipe", active === "team")}
    </nav>
  );
}

/** Choix de la période (type et date de référence) avec période précédente / suivante. */
export function PeriodPicker({ action, period, maxStart }: { action: string; period: Period; maxStart?: string }) {
  const link = (p: Period) => `${action}?periode=${PERIOD_SLUGS[p.kind]}&du=${p.start}`;
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  const hasNext = !maxStart || next.start <= maxStart;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" nativeButton={false} render={<Link href={link(previous)} aria-label="Période précédente" />}>
          <ChevronLeft />
        </Button>
        <p className="min-w-0 text-sm font-medium first-letter:uppercase">{periodLabel(period)}</p>
        {hasNext ? (
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={link(next)} aria-label="Période suivante" />}>
            <ChevronRight />
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Période suivante">
            <ChevronRight />
          </Button>
        )}
      </div>
      <Form action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periode">Période</Label>
          <NativeSelect id="periode" name="periode" defaultValue={PERIOD_SLUGS[period.kind]}>
            {PERIOD_KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={PERIOD_SLUGS[kind]}>
                {PERIOD_LABELS[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="du">Contenant le</Label>
          <Input id="du" name="du" type="date" defaultValue={period.start} className="w-40" />
        </div>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </Form>
    </div>
  );
}

export { formatMetric } from "@/lib/metrics/actuals";

export function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}
