import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AmountText } from "@/components/amount-text";
import { dateInputValue, PERIOD_KINDS, PERIOD_LABELS, PERIOD_SLUGS, periodLabel, periodSearch, RANGE_SLUG, shiftPeriod, type Period } from "@/lib/periods";
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

/** Choix de la période (type et date de référence, ou intervalle du… au…) avec période précédente / suivante. */
export function PeriodPicker({ action, period, maxStart, keep }: { action: string; period: Period; maxStart?: string; keep?: Record<string, string> }) {
  const kept = keep ? Object.entries(keep) : [];
  const link = (p: Period) => {
    const params = new URLSearchParams(periodSearch(p));
    for (const [name, value] of kept) params.set(name, value);
    return `${action}?${params}`;
  };
  const hiddenFields = kept.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  const hasNext = !maxStart || next.start <= maxStart;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
      <Form key={`periode-${period.kind}-${period.start}`} action={action} className="flex flex-wrap items-end gap-3">
        {hiddenFields}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periode">Période</Label>
          <NativeSelect id="periode" name="periode" defaultValue={PERIOD_SLUGS[period.kind === "range" ? "month" : period.kind]}>
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
      <Form key={`intervalle-${period.start}-${period.end}`} action={action} className="flex flex-wrap items-end gap-3 border-t pt-3">
        {hiddenFields}
        <input type="hidden" name="periode" value={RANGE_SLUG} />
        <p className="self-center text-sm font-medium">Ou un intervalle de dates</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intervalle-du">Du</Label>
          <Input id="intervalle-du" name="du" required inputMode="numeric" placeholder="JJ/MM/AAAA" pattern={DATE_PATTERN} title={DATE_HELP} defaultValue={dateInputValue(period.start)} className="w-36" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intervalle-au">Au</Label>
          <Input id="intervalle-au" name="au" required inputMode="numeric" placeholder="JJ/MM/AAAA" pattern={DATE_PATTERN} title={DATE_HELP} defaultValue={dateInputValue(period.end)} className="w-36" />
        </div>
        <Button type="submit" variant="secondary">
          Afficher l&apos;intervalle
        </Button>
      </Form>
    </div>
  );
}

// Saisie au clavier, en JJ/MM/AAAA quelle que soit la langue du navigateur.
const DATE_PATTERN = "\\d{1,2}/\\d{1,2}/\\d{4}";
const DATE_HELP = "Date au format JJ/MM/AAAA, par exemple 10/09/2026";

export { formatMetric } from "@/lib/metrics/actuals";

export function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums [overflow-wrap:anywhere]">
          <AmountText value={value} />
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}
