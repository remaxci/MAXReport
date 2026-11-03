import { ChevronLeft, ChevronRight } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StatusCategory } from "@/features/settings/constants";
import { addDays, formatDate, todayIso } from "@/lib/format";
import { monthKey, monthLabel, parseMonth, shiftMonth } from "./calendar";
import { TaskViewTabs } from "./components/view";
import { connectorPath, dayOffset, ganttBar, ganttTicks, ganttWindow, GANTT_MONTHS, taskSpan, type GanttBar } from "./gantt";
import { loadPlanningBrand, memberOptions } from "./load";
import { getTaskStatuses, listDependencies, listMilestones, listProjects, listTasks, type TaskRow } from "./queries";
import { isOpen, isOverdue, parseTaskFilters, type TaskFilters } from "./rules";
import { dependencyConflict, isBlocked, isoWeek, loadLevel, milestoneConflict, parseCapacity, weekStart, weeksFrom, workload } from "./schedule";
import { ScopeFilters } from "./view-pages";

type Params = Promise<{ brand: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Responsable et projet, filtrés en mémoire : les alertes ont besoin de toutes les tâches de la marque. */
function matches(task: TaskRow, filters: TaskFilters): boolean {
  if (filters.assignee && task.assigneeId !== (filters.assignee === "aucun" ? null : filters.assignee)) return false;
  if (filters.project && task.projectId !== (filters.project === "aucun" ? null : filters.project)) return false;
  return true;
}

function scopeParams(filters: TaskFilters): URLSearchParams {
  return new URLSearchParams(
    Object.entries({ responsable: filters.assignee, projet: filters.project }).filter((e): e is [string, string] => !!e[1]),
  );
}

// =====================================================================
// Gantt
// =====================================================================

export function GanttPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Gantt slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

const DAY_WIDTH = 16;
const LABEL_WIDTH = 176;
const ROW_HEIGHT = 36;

type GanttRow =
  | { kind: "project"; key: string; label: string; href?: string; milestones: { id: string; name: string; date: string; at: number; reached: boolean }[] }
  | { kind: "task"; key: string; task: TaskRow; label: string; sub: boolean; bar: GanttBar; category: StatusCategory; color: string | null; alert: boolean };

type Alert = { key: string; href: string; text: string };

async function Gantt({ slug, query }: { slug: string; query: Query }) {
  const { brand, canRead } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const today = todayIso();
  const month = parseMonth(first(query.mois), today);
  const filters = { ...parseTaskFilters(query), archived: false };
  const window = ganttWindow(month);
  const [allTasks, statuses, milestones, projects, dependencies, members] = await Promise.all([
    listTasks(brand.id, { archived: false }),
    getTaskStatuses(brand.id),
    listMilestones(brand.id),
    listProjects(brand.id, false),
    listDependencies(brand.id),
    memberOptions(brand.id),
  ]);
  const base = `/m/${brand.slug}`;
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const category = (t: TaskRow) => categories.get(t.statusId) ?? "draft";
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const tasks = allTasks.filter((t) => matches(t, filters));
  const shown = new Set(tasks.map((t) => t.id));
  const dated = (t: TaskRow) => ({ startOn: t.startOn, dueOn: t.dueOn, category: category(t) });

  // Alertes : dates incompatibles avec une dépendance ou un jalon, démarrage retenu par une dépendance.
  const alerts: Alert[] = [];
  const flagged = new Set<string>();
  for (const d of dependencies) {
    const task = byId.get(d.taskId);
    const before = byId.get(d.dependsOnId);
    if (!task || !before || !shown.has(task.id)) continue;
    if (dependencyConflict(dated(task), dated(before))) {
      flagged.add(task.id);
      alerts.push({
        key: `dep-${task.id}-${before.id}`,
        href: `${base}/taches/${task.id}`,
        text: `« ${task.title} » commence le ${formatDate(task.startOn ?? task.dueOn)}, avant l'échéance de « ${before.title} » (${formatDate(before.dueOn)}).`,
      });
    }
  }
  for (const task of tasks) {
    const milestone = task.milestoneId ? milestoneById.get(task.milestoneId) : undefined;
    if (milestone && milestoneConflict({ dueOn: task.dueOn, category: category(task) }, milestone)) {
      flagged.add(task.id);
      alerts.push({
        key: `jalon-${task.id}`,
        href: `${base}/taches/${task.id}`,
        text: `« ${task.title} » finit le ${formatDate(task.dueOn)}, après le jalon « ${milestone.name} » (${formatDate(milestone.dueOn)}).`,
      });
    }
    const predecessors = dependencies.filter((d) => d.taskId === task.id).map((d) => byId.get(d.dependsOnId)).filter((t) => t !== undefined);
    if (isOpen(category(task)) && task.startOn && task.startOn <= today && isBlocked(predecessors.map(dated))) {
      alerts.push({
        key: `bloque-${task.id}`,
        href: `${base}/taches/${task.id}`,
        text: `« ${task.title} » devait commencer le ${formatDate(task.startOn)} mais attend encore ${predecessors
          .filter((p) => isOpen(category(p)))
          .map((p) => `« ${p.title} »`)
          .join(", ")}.`,
      });
    }
  }

  // Lignes : un groupe par projet (dans l'ordre des projets), puis les tâches sans projet.
  const projectColor = new Map(projects.map((p) => [p.id, p.color]));
  let undated = 0;
  let outside = 0;
  const bars = new Map<string, GanttBar>();
  for (const t of tasks) {
    const span = taskSpan(t);
    if (!span) {
      undated++;
      continue;
    }
    const bar = ganttBar(span, window);
    if (bar) bars.set(t.id, bar);
    else outside++;
  }
  const startOf = (t: TaskRow) => taskSpan(t)!.start;
  const order = (list: TaskRow[]) =>
    [...list].sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.title.localeCompare(b.title, "fr"));
  const taskRows = (list: TaskRow[]): GanttRow[] => {
    const inList = list.filter((t) => bars.has(t.id));
    const ids = new Set(inList.map((t) => t.id));
    const tops = order(inList.filter((t) => !t.parentId || !ids.has(t.parentId)));
    return tops.flatMap((top) =>
      [top, ...order(inList.filter((t) => t.parentId === top.id))].map((t) => ({
        kind: "task" as const,
        key: t.id,
        task: t,
        label: t.title,
        sub: t !== top,
        bar: bars.get(t.id)!,
        category: category(t),
        color: t.projectId ? (projectColor.get(t.projectId) ?? null) : null,
        alert: flagged.has(t.id),
      })),
    );
  };
  const rows: GanttRow[] = [];
  for (const p of projects) {
    if (filters.project && filters.project !== p.id) continue;
    const own = taskRows(tasks.filter((t) => t.projectId === p.id));
    const marks = milestones
      .filter((m) => m.projectId === p.id && m.dueOn >= window.start && m.dueOn <= window.end)
      .map((m) => ({ id: m.id, name: m.name, date: m.dueOn, at: dayOffset(m.dueOn, window), reached: m.reachedOn !== null }));
    // Filtre par responsable : un projet sans tâche de cette personne n'apparaît pas, même avec des jalons.
    if (own.length === 0 && (marks.length === 0 || filters.assignee)) continue;
    rows.push({ kind: "project", key: `p-${p.id}`, label: p.name, href: `${base}/projets/${p.id}`, milestones: marks }, ...own);
  }
  const loose = taskRows(tasks.filter((t) => !t.projectId));
  if (loose.length > 0) rows.push({ kind: "project", key: "p-aucun", label: "Sans projet", milestones: [] }, ...loose);

  // Traits de dépendance entre deux tâches affichées, quand leurs extrémités sont visibles.
  const rowIndex = new Map(rows.map((r, i) => [r.key, i]));
  const connectors = dependencies.flatMap((d) => {
    const from = bars.get(d.dependsOnId);
    const to = bars.get(d.taskId);
    const i = rowIndex.get(d.dependsOnId);
    const j = rowIndex.get(d.taskId);
    if (!from || !to || i === undefined || j === undefined || from.clippedEnd || to.clippedStart) return [];
    const task = byId.get(d.taskId)!;
    const before = byId.get(d.dependsOnId)!;
    return [
      {
        key: `${d.dependsOnId}-${d.taskId}`,
        path: connectorPath(from.to * DAY_WIDTH, i * ROW_HEIGHT + ROW_HEIGHT / 2, to.from * DAY_WIDTH, j * ROW_HEIGHT + ROW_HEIGHT / 2),
        conflict: dependencyConflict(dated(task), dated(before)),
      },
    ];
  });

  const ticks = ganttTicks(window);
  const width = window.days * DAY_WIDTH;
  const height = rows.length * ROW_HEIGHT;
  const todayAt = today >= window.start && today <= window.end ? dayOffset(today, window) : null;
  const monthHref = (m: typeof month) => {
    const params = scopeParams(filters);
    params.set("mois", monthKey(m));
    return `${base}/taches/gantt?${params}`;
  };
  const lastMonth = shiftMonth(month, GANTT_MONTHS - 1);

  return (
    <Page>
      <PageHeader title="Tâches" description={`${brand.name} · Gantt : périodes des tâches, dépendances et jalons (◆)`} />
      <TaskViewTabs base={base} current="gantt" />
      <ScopeFilters
        action={`${base}/taches/gantt`}
        filters={filters}
        members={members}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        extra={{ mois: monthKey(month) }}
      />

      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Alertes ({alerts.length})</CardTitle>
            <CardDescription>Dates à revoir : dépendances, jalons et tâches qui attendent encore.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {alerts.slice(0, 30).map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="underline-offset-4 hover:underline">
                    {a.text}
                  </Link>
                </li>
              ))}
              {alerts.length > 30 && <li className="text-muted-foreground">… et {alerts.length - 30} autre(s).</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              {monthLabel(month)} – {monthLabel(lastMonth)}
            </CardTitle>
            <CardDescription>
              Barre : du début à l&apos;échéance (une seule date : un jour). Trait : « attend la fin de ».
              {undated > 0 && ` ${undated} tâche(s) sans date.`}
              {outside > 0 && ` ${outside} tâche(s) hors de la période.`}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" nativeButton={false} render={<Link href={monthHref(shiftMonth(month, -1))} aria-label="Mois précédent" />}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={monthHref(parseMonth(undefined, today))} />}>
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" nativeButton={false} render={<Link href={monthHref(shiftMonth(month, 1))} aria-label="Mois suivant" />}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune tâche datée sur cette période.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <div className="relative" style={{ width: LABEL_WIDTH + width }}>
                {/* Repères : mois et semaines */}
                <div className="flex border-b">
                  <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: LABEL_WIDTH }} />
                  <div className="relative h-11" style={{ width }}>
                    {ticks.months.map((m) => (
                      <span
                        key={m.label}
                        className="absolute top-0 h-6 truncate border-l px-1.5 pt-1 text-xs font-medium"
                        style={{ left: m.from * DAY_WIDTH, width: m.days * DAY_WIDTH }}
                      >
                        {m.label}
                      </span>
                    ))}
                    {ticks.weeks.map((w) => (
                      <span key={w.date} className="absolute bottom-0 h-5 border-l pl-1 text-[10px] text-muted-foreground" style={{ left: w.at * DAY_WIDTH }} title={`Semaine du ${formatDate(w.date)}`}>
                        S{w.week}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  {/* Grille : lundis et aujourd'hui, sous les barres */}
                  <svg aria-hidden className="absolute top-0" style={{ left: LABEL_WIDTH }} width={width} height={height}>
                    {ticks.weeks.map((w) => (
                      <line key={w.date} x1={w.at * DAY_WIDTH} x2={w.at * DAY_WIDTH} y1={0} y2={height} className="stroke-border" />
                    ))}
                    {todayAt !== null && (
                      <line x1={todayAt * DAY_WIDTH + DAY_WIDTH / 2} x2={todayAt * DAY_WIDTH + DAY_WIDTH / 2} y1={0} y2={height} strokeWidth={2} className="stroke-primary/60" />
                    )}
                  </svg>

                  {rows.map((row) =>
                    row.kind === "project" ? (
                      <div key={row.key} className="flex border-b bg-muted/40" style={{ height: ROW_HEIGHT }}>
                        <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-muted px-2" style={{ width: LABEL_WIDTH }}>
                          {row.href ? (
                            <Link href={row.href} className="truncate text-sm font-semibold underline-offset-4 hover:underline" title={row.label}>
                              {row.label}
                            </Link>
                          ) : (
                            <span className="truncate text-sm font-semibold">{row.label}</span>
                          )}
                        </div>
                        <div className="relative" style={{ width }}>
                          {row.milestones.map((m) => (
                            <span
                              key={m.id}
                              title={`${m.name} · ${formatDate(m.date)}${m.reached ? " · atteint" : ""}`}
                              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm leading-none"
                              style={{ left: m.at * DAY_WIDTH + DAY_WIDTH / 2 }}
                            >
                              <span aria-hidden>{m.reached ? "◆" : "◇"}</span>
                              <span className="sr-only">
                                Jalon {m.name}, {formatDate(m.date)}
                                {m.reached ? ", atteint" : ""}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div key={row.key} className="flex border-b last:border-0" style={{ height: ROW_HEIGHT }}>
                        <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-2" style={{ width: LABEL_WIDTH }}>
                          <Link
                            href={`${base}/taches/${row.task.id}`}
                            className={`truncate text-sm underline-offset-4 hover:underline ${row.sub ? "pl-3 text-muted-foreground" : ""}`}
                            title={row.label}
                          >
                            {row.sub && <span aria-hidden>↳ </span>}
                            {row.label}
                          </Link>
                        </div>
                        <div className="relative" style={{ width }}>
                          <TaskBar row={row} base={base} today={today} />
                        </div>
                      </div>
                    ),
                  )}

                  {/* Dépendances, au-dessus des barres */}
                  <svg aria-hidden className="pointer-events-none absolute top-0" style={{ left: LABEL_WIDTH }} width={width} height={height}>
                    <defs>
                      <marker id="gantt-fleche" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0 0 L8 4 L0 8 z" className="fill-muted-foreground" />
                      </marker>
                      <marker id="gantt-fleche-alerte" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0 0 L8 4 L0 8 z" className="fill-destructive" />
                      </marker>
                    </defs>
                    {connectors.map((c) => (
                      <path
                        key={c.key}
                        d={c.path}
                        fill="none"
                        strokeWidth={1.5}
                        className={c.conflict ? "stroke-destructive" : "stroke-muted-foreground"}
                        markerEnd={`url(#${c.conflict ? "gantt-fleche-alerte" : "gantt-fleche"})`}
                      />
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

function TaskBar({ row, base, today }: { row: Extract<GanttRow, { kind: "task" }>; base: string; today: string }) {
  const { task, bar, category } = row;
  const done = !isOpen(category);
  const overdue = isOverdue({ dueOn: task.dueOn, category }, today);
  const progress = category === "success" ? 100 : task.progress;
  const label = `${task.title}, du ${formatDate(task.startOn ?? task.dueOn)} au ${formatDate(task.dueOn ?? task.startOn)}, avancement ${progress} %${
    overdue ? ", en retard" : ""
  }${row.alert ? ", dates à revoir" : ""}`;
  return (
    <Link
      href={`${base}/taches/${task.id}`}
      aria-label={label}
      title={label}
      className={`absolute top-2 h-5 overflow-hidden rounded ${done ? "opacity-45" : ""} ${
        overdue || row.alert ? "ring-2 ring-destructive" : ""
      } ${bar.clippedStart ? "rounded-l-none" : ""} ${bar.clippedEnd ? "rounded-r-none" : ""}`}
      style={{
        left: bar.from * DAY_WIDTH + 1,
        width: Math.max((bar.to - bar.from) * DAY_WIDTH - 2, 6),
        backgroundColor: row.color ? `${row.color}66` : "color-mix(in oklab, var(--primary) 35%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${progress}%`, backgroundColor: row.color ?? "var(--primary)" }}
      />
    </Link>
  );
}

// =====================================================================
// Charge
// =====================================================================

export function WorkloadPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <WorkloadView slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

const WEEKS = 8;
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;
const HOURS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

async function WorkloadView({ slug, query }: { slug: string; query: Query }) {
  const { brand, canRead } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const today = todayIso();
  const currentWeek = weekStart(today);
  const requested = first(query.semaine);
  // Charge restante : rien avant la semaine en cours.
  const fromWeek = requested && DATE_PARAM.test(requested) && weekStart(requested) > currentWeek ? weekStart(requested) : currentWeek;
  const capacity = parseCapacity(first(query.capacite));
  const filters = { ...parseTaskFilters(query), archived: false };
  const [tasks, statuses, members, projects] = await Promise.all([
    listTasks(brand.id, filters),
    getTaskStatuses(brand.id),
    memberOptions(brand.id),
    listProjects(brand.id, false),
  ]);
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const result = workload(
    tasks.map((t) => ({ ...t, category: categories.get(t.statusId) ?? "draft" })),
    today,
  );
  const weeks = weeksFrom(fromWeek, WEEKS);
  const labels = new Map(members.map((m) => [m.id, m.label]));
  const people = [...new Set([...result.weeks.keys(), ...result.undated.keys(), ...result.unestimated.keys()])]
    .map((id) => ({ id, label: labels.get(id) ?? "Ancien collaborateur" }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const base = `/m/${brand.slug}`;
  const href = (week: string) => {
    const params = scopeParams(filters);
    params.set("semaine", week);
    if (capacity !== 40) params.set("capacite", String(capacity));
    return `${base}/taches/charge?${params}`;
  };
  const cellClass = (hours: number) => {
    const level = loadLevel(hours, capacity);
    return level === "over" ? "bg-destructive/15 font-semibold text-destructive" : level === "busy" ? "bg-amber-500/15 font-medium" : "";
  };

  return (
    <Page>
      <PageHeader title="Tâches" description={`${brand.name} · charge restante par collaborateur et par semaine`} />
      <TaskViewTabs base={base} current="charge" />
      <ScopeFilters
        action={`${base}/taches/charge`}
        filters={filters}
        members={members}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        extra={{ semaine: fromWeek, capacite: String(capacity) }}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-2xl flex-col gap-1">
            <CardTitle>Charge en heures</CardTitle>
            <CardDescription>
              Heures restantes de chaque tâche à faire (estimation × part non réalisée), réparties sur ses jours ouvrés à partir
              d&apos;aujourd&apos;hui ; une tâche en retard pèse sur aujourd&apos;hui. Orange : 80 % de la capacité ou plus ; rouge : au-delà.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Form action={`${base}/taches/charge`} className="flex items-end gap-2">
              {Object.entries({ responsable: filters.assignee, projet: filters.project, semaine: fromWeek }).map(
                ([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />,
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capacite">Capacité (h / semaine)</Label>
                <Input id="capacite" name="capacite" type="number" min={1} max={80} defaultValue={capacity} className="w-24" />
              </div>
              <Button type="submit" variant="outline">
                Appliquer
              </Button>
            </Form>
            <div className="flex gap-1">
              {fromWeek === currentWeek ? (
                <Button variant="outline" size="icon" disabled aria-label="Semaines précédentes">
                  <ChevronLeft />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  nativeButton={false}
                  render={<Link href={href(shiftWeek(fromWeek, -WEEKS, currentWeek))} aria-label="Semaines précédentes" />}
                >
                  <ChevronLeft />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                nativeButton={false}
                render={<Link href={href(shiftWeek(fromWeek, WEEKS, currentWeek))} aria-label="Semaines suivantes" />}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune tâche à faire confiée à un collaborateur.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Collaborateur</TableHead>
                  {weeks.map((w) => (
                    <TableHead key={w} className="text-right whitespace-nowrap">
                      <span className="block">S{isoWeek(w)}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{SHORT_DATE.format(new Date(`${w}T00:00:00Z`))}</span>
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap">Sans date</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Sans estimation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const byWeek = result.weeks.get(person.id);
                  const undatedHours = result.undated.get(person.id) ?? 0;
                  const unestimated = result.unestimated.get(person.id) ?? 0;
                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        <Link href={`${base}/taches?responsable=${person.id}`} className="font-medium underline-offset-4 hover:underline">
                          {person.label}
                        </Link>
                      </TableCell>
                      {weeks.map((w) => {
                        const hours = byWeek?.get(w) ?? 0;
                        return (
                          <TableCell key={w} className={`text-right tabular-nums ${hours > 0 ? cellClass(hours) : "text-muted-foreground"}`}>
                            {hours > 0 ? `${HOURS.format(hours)} h` : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums">{undatedHours > 0 ? `${HOURS.format(undatedHours)} h` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{unestimated > 0 ? `${unestimated} tâche(s)` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}

/** Lundi décalé de `count` semaines, jamais avant `floor` (la semaine en cours). */
function shiftWeek(monday: string, count: number, floor: string): string {
  const shifted = addDays(monday, count * 7);
  return shifted < floor ? floor : shifted;
}
