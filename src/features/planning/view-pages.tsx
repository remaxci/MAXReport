import { ChevronLeft, ChevronRight } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Forbidden, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatDate, todayIso } from "@/lib/format";
import type { BrandSummary } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { compareCards } from "./board";
import { monthGrid, monthKey, monthLabel, parseMonth, shiftMonth } from "./calendar";
import { KanbanBoard, type KanbanCard } from "./components/kanban";
import { TaskViewTabs } from "./components/view";
import { loadPlanningBrand, memberOptions } from "./load";
import { getTaskStatuses, listMilestones, listProjects, listTasks } from "./queries";
import { isOpen, isOverdue, parseTaskFilters, projectProgress, type TaskFilters } from "./rules";
import { barPosition, parseYear, pointPosition, projectSpan, yearRange, yearTicks } from "./timeline";

type Params = Promise<{ brand: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Filtres communs au Kanban et au calendrier : responsable et projet. */
export function ScopeFilters({
  action,
  filters,
  members,
  projects,
  extra,
}: {
  action: string;
  filters: TaskFilters;
  members: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  extra?: Record<string, string>;
}) {
  const select = (id: string, label: string, value: string | undefined, options: { id: string; label: string }[]) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`filtre-${id}`}>{label}</Label>
      <NativeSelect id={`filtre-${id}`} name={id} defaultValue={value ?? ""} className="w-full">
        <NativeSelectOption value="">Tous</NativeSelectOption>
        {options.map((o) => (
          <NativeSelectOption key={o.id} value={o.id}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
  return (
    <Form action={action} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3">
      {Object.entries(extra ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {select("responsable", "Responsable", filters.assignee, [{ id: "aucun", label: "Non attribuée" }, ...members])}
      {select("projet", "Projet", filters.project, [{ id: "aucun", label: "Sans projet" }, ...projects])}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit">Filtrer</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={action} />}>
          Réinitialiser
        </Button>
      </div>
    </Form>
  );
}

// =====================================================================
// Kanban
// =====================================================================

export function KanbanPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Kanban slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Kanban({ slug, query }: { slug: string; query: Query }) {
  const { ctx, brand, canRead, canManage } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const filters = { ...parseTaskFilters(query), archived: false };
  const today = todayIso();
  const [tasks, statuses, members, projects] = await Promise.all([
    listTasks(brand.id, filters),
    getTaskStatuses(brand.id),
    memberOptions(brand.id),
    listProjects(brand.id, false),
  ]);
  const labels = new Map(members.map((m) => [m.id, m.label]));
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const base = `/m/${brand.slug}`;
  const cards: KanbanCard[] = [...tasks].sort(compareCards).map((t) => ({
    id: t.id,
    statusId: t.statusId,
    title: t.title,
    href: `${base}/taches/${t.id}`,
    assignee: t.assigneeId ? (labels.get(t.assigneeId) ?? null) : null,
    project: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
    dueOn: t.dueOn,
    overdue: isOverdue({ dueOn: t.dueOn, category: categories.get(t.statusId) ?? "draft" }, today),
    priority: t.priority,
    canMove: canManage || t.assigneeId === ctx.userId,
  }));
  const columns = statuses
    .filter((s) => s.isActive || tasks.some((t) => t.statusId === s.id))
    .map((s) => ({ id: s.id, label: s.label, color: s.color, isActive: s.isActive }));
  const action = `${base}/taches/kanban`;

  return (
    <Page>
      <PageHeader
        title="Tâches"
        description={
          canManage
            ? `${brand.name} · faites glisser une carte pour changer son statut ou son ordre`
            : `${brand.name} · vous pouvez déplacer vos propres tâches`
        }
      />
      <TaskViewTabs base={base} current="kanban" />
      <ScopeFilters
        action={action}
        filters={filters}
        members={members}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
      {/* Clé : un changement de filtre repart des cartes du serveur. */}
      <KanbanBoard key={JSON.stringify(filters)} brandId={brand.id} columns={columns} cards={cards} />
    </Page>
  );
}

// =====================================================================
// Calendrier
// =====================================================================

export function CalendarPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Calendar slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type CalendarItem = { key: string; date: string; href: string; label: string; kind: "task" | "milestone"; tone: "late" | "done" | "normal" };

async function Calendar({ slug, query }: { slug: string; query: Query }) {
  const { brand, canRead } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const today = todayIso();
  const month = parseMonth(first(query.mois), today);
  const filters = { ...parseTaskFilters(query), archived: false };
  const weeks = monthGrid(month);
  const start = weeks[0][0].date;
  const end = weeks[weeks.length - 1][6].date;
  const [tasks, statuses, milestones, members, projects] = await Promise.all([
    listTasks(brand.id, filters),
    getTaskStatuses(brand.id),
    listMilestones(brand.id),
    memberOptions(brand.id),
    listProjects(brand.id, false),
  ]);
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const base = `/m/${brand.slug}`;
  const projectFilter = filters.project;

  const items: CalendarItem[] = [
    ...tasks
      .filter((t) => t.dueOn && t.dueOn >= start && t.dueOn <= end)
      .map((t) => {
        const category = categories.get(t.statusId) ?? "draft";
        return {
          key: t.id,
          date: t.dueOn!,
          href: `${base}/taches/${t.id}`,
          label: t.title,
          kind: "task" as const,
          tone: isOverdue({ dueOn: t.dueOn, category }, today) ? ("late" as const) : isOpen(category) ? ("normal" as const) : ("done" as const),
        };
      }),
    ...milestones
      .filter((m) => m.dueOn >= start && m.dueOn <= end && (!projectFilter || projectFilter === m.projectId) && !filters.assignee)
      .map((m) => ({
        key: m.id,
        date: m.dueOn,
        href: `${base}/projets/${m.projectId}`,
        label: m.name,
        kind: "milestone" as const,
        tone: m.reachedOn ? ("done" as const) : m.dueOn < today ? ("late" as const) : ("normal" as const),
      })),
  ];
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);

  const scope = new URLSearchParams(
    Object.entries({ responsable: filters.assignee, projet: filters.project }).filter((e): e is [string, string] => !!e[1]),
  );
  const monthHref = (m: typeof month) => {
    const params = new URLSearchParams(scope);
    params.set("mois", monthKey(m));
    return `${base}/taches/calendrier?${params}`;
  };
  const tone = (item: CalendarItem) =>
    item.tone === "late" ? "text-destructive font-medium" : item.tone === "done" ? "text-muted-foreground line-through" : "";

  const entry = (item: CalendarItem) => (
    <li key={item.key} className="truncate">
      <Link href={item.href} className={`text-xs underline-offset-4 hover:underline ${tone(item)}`} title={item.label}>
        {item.kind === "milestone" ? "◆ " : ""}
        {item.label}
      </Link>
    </li>
  );

  return (
    <Page>
      <PageHeader title="Tâches" description={`${brand.name} · échéances des tâches et jalons (◆)`} />
      <TaskViewTabs base={base} current="calendrier" />
      <ScopeFilters
        action={`${base}/taches/calendrier`}
        filters={filters}
        members={members}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        extra={{ mois: monthKey(month) }}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{monthLabel(month)}</CardTitle>
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
          {/* Grand écran : grille du mois. */}
          <div className="hidden md:block">
            <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-1">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0].date} className="grid grid-cols-7 border-b last:border-0">
                {week.map((day) => {
                  const dayItems = byDate.get(day.date) ?? [];
                  return (
                    <div key={day.date} className={`min-h-24 border-r p-1.5 last:border-r-0 ${day.inMonth ? "" : "bg-muted/40"}`}>
                      <div
                        className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs ${
                          day.date === today ? "bg-primary font-semibold text-primary-foreground" : day.inMonth ? "" : "text-muted-foreground"
                        }`}
                      >
                        {Number(day.date.slice(8))}
                      </div>
                      <ul className="flex flex-col gap-0.5">{dayItems.map(entry)}</ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* Petit écran : liste des jours qui ont des échéances. */}
          <ul className="flex flex-col divide-y md:hidden">
            {weeks
              .flat()
              .filter((day) => day.inMonth && byDate.has(day.date))
              .map((day) => (
                <li key={day.date} className="py-2">
                  <p className={`text-sm font-medium ${day.date === today ? "text-primary" : ""}`}>{formatDate(day.date)}</p>
                  <ul className="mt-1 flex flex-col gap-1">{(byDate.get(day.date) ?? []).map(entry)}</ul>
                </li>
              ))}
            {!weeks.flat().some((day) => day.inMonth && byDate.has(day.date)) && (
              <li className="py-2 text-sm text-muted-foreground">Aucune échéance ce mois-ci.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </Page>
  );
}

// =====================================================================
// Feuille de route
// =====================================================================

export function RoadmapPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Roadmap slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

type RoadmapRow = {
  id: string;
  name: string;
  href: string;
  color: string | null;
  bar: { left: number; width: number } | null;
  label: string;
  progress: number | null;
  milestones: { id: string; name: string; left: number; date: string; reached: boolean }[];
};

async function brandRoadmap(brand: BrandSummary, year: number, today: string) {
  const range = yearRange(year);
  const [projects, milestones, tasks, statuses] = await Promise.all([
    listProjects(brand.id, false),
    listMilestones(brand.id),
    listTasks(brand.id, { archived: false }),
    getTaskStatuses(brand.id),
  ]);
  const categories = new Map(statuses.map((s) => [s.id, s.category]));
  const rows: RoadmapRow[] = [];
  const undated: { id: string; name: string; href: string }[] = [];
  let outside = 0;
  for (const p of projects.filter((p) => p.status !== "cancelled")) {
    const own = milestones.filter((m) => m.projectId === p.id);
    const span = projectSpan(p, own.map((m) => m.dueOn));
    const href = `/m/${brand.slug}/projets/${p.id}`;
    if (!span) {
      undated.push({ id: p.id, name: p.name, href });
      continue;
    }
    const bar = barPosition(span, range);
    const marks = own
      .map((m) => ({ id: m.id, name: m.name, date: m.dueOn, reached: m.reachedOn !== null, left: pointPosition(m.dueOn, range) }))
      .filter((m): m is RoadmapRow["milestones"][number] => m.left !== null);
    if (!bar && marks.length === 0) {
      outside++;
      continue;
    }
    const progress = projectProgress(
      tasks
        .filter((t) => t.projectId === p.id && !t.parentId)
        .map((t) => ({ category: categories.get(t.statusId) ?? "draft", progress: t.progress, estimateHours: t.estimateHours })),
    );
    rows.push({
      id: p.id,
      name: p.name,
      href,
      color: p.color,
      bar,
      progress,
      label: `${p.name}, du ${formatDate(span.start)} au ${formatDate(span.end)}${progress !== null ? `, avancement ${progress} %` : ""}`,
      milestones: marks,
    });
  }
  rows.sort((a, b) => (a.bar?.left ?? 101) - (b.bar?.left ?? 101));
  return { brand, rows, undated, outside, today };
}

async function Roadmap({ slug, query }: { slug: string; query: Query }) {
  const { ctx, brand, canRead } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const today = todayIso();
  const year = parseYear(first(query.annee), today);
  // Toutes marques : pour qui lit la planification de plusieurs marques (Direction, administrateurs).
  const readable = ctx.brands.filter((b) => b.enabledModules.includes("planning") && can(ctx.access, "planning.read", b.id));
  const all = first(query.toutes) === "1" && readable.length > 1;
  const groups = await Promise.all((all ? readable : [brand]).map((b) => brandRoadmap(b, year, today)));
  const ticks = yearTicks(year);
  const todayLeft = pointPosition(today, yearRange(year));
  const base = `/m/${brand.slug}/feuille-de-route`;
  const href = (y: number, toutes: boolean) => `${base}?annee=${y}${toutes ? "&toutes=1" : ""}`;

  return (
    <Page>
      <PageHeader title="Feuille de route" description={all ? `Toutes vos marques · ${year}` : `${brand.name} · ${year}`}>
        <div className="flex flex-wrap items-center gap-2">
          {readable.length > 1 && (
            <Button variant="ghost" nativeButton={false} render={<Link href={href(year, !all)} />}>
              {all ? `Seulement ${brand.name}` : "Toutes les marques"}
            </Button>
          )}
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={href(year - 1, all)} aria-label="Année précédente" />}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={href(year + 1, all)} aria-label="Année suivante" />}>
            <ChevronRight />
          </Button>
        </div>
      </PageHeader>

      {groups.map((group) => (
        <Card key={group.brand.id}>
          <CardHeader>
            <CardTitle>{all ? group.brand.name : "Projets"}</CardTitle>
            <CardDescription>
              Barres : période du projet (dates du projet, ou à défaut de ses jalons). ◆ : jalon, plein s&apos;il est atteint.
              {group.outside > 0 && ` ${group.outside} projet(s) hors de ${year}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[12rem_1fr] text-xs text-muted-foreground">
                  <div />
                  <div className="relative h-10 border-b">
                    {ticks.quarters.map((q) => (
                      <span key={q.label} className="absolute top-0 border-l pl-1 font-medium text-foreground" style={{ left: `${q.left}%`, width: `${q.width}%` }}>
                        {q.label}
                      </span>
                    ))}
                    {ticks.months.map((m) => (
                      <span key={m.label} className="absolute bottom-0 pl-1" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
                {group.rows.length === 0 && <p className="py-4 text-sm text-muted-foreground">Aucun projet daté sur {year}.</p>}
                {group.rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[12rem_1fr] items-center border-b last:border-0">
                    <Link href={row.href} className="truncate py-2 pr-3 text-sm font-medium underline-offset-4 hover:underline" title={row.name}>
                      {row.name}
                    </Link>
                    <div className="relative h-10">
                      {ticks.quarters.map((q) => (
                        <span key={q.label} aria-hidden className="absolute inset-y-0 border-l border-dashed" style={{ left: `${q.left}%` }} />
                      ))}
                      {todayLeft !== null && <span aria-hidden className="absolute inset-y-0 border-l-2 border-primary/60" style={{ left: `${todayLeft}%` }} />}
                      {row.bar && (
                        <Link
                          href={row.href}
                          aria-label={row.label}
                          title={row.label}
                          className="absolute top-2.5 flex h-5 items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium text-white"
                          style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%`, backgroundColor: row.color ?? "#3b82f6" }}
                        >
                          {row.progress !== null && <span className="truncate">{row.progress} %</span>}
                        </Link>
                      )}
                      {row.milestones.map((m) => (
                        <span
                          key={m.id}
                          title={`${m.name} · ${formatDate(m.date)}${m.reached ? " · atteint" : ""}`}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm leading-none"
                          style={{ left: `${m.left}%` }}
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
                ))}
              </div>
            </div>
            {group.undated.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Sans date :{" "}
                {group.undated.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <Link href={p.href} className="underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </Page>
  );
}
