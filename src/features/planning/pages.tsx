import { Plus } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Forbidden, Notice, Page, PageHeader, PageSkeleton } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackLink, customRows, Details } from "@/features/crm/view";
import { getCustomFields } from "@/features/custom-fields/queries";
import { listCampaigns } from "@/features/marketing/queries";
import { StatusBadge } from "@/features/registers/components/status-badge";
import { getCompanyOptions, getMemberOptions } from "@/features/registers/queries";
import { ActionButton, EditDetails } from "@/features/settings/components/controls";
import { formatDate, todayIso } from "@/lib/format";
import { getAuthContext, type BrandSummary } from "@/server/authz/context";
import { can, type Access, type Permission } from "@/server/authz/permissions";
import { AttachmentsPanel } from "@/features/registers/components/document-panels";
import type { ActionState } from "@/lib/form";
import {
  addDependency,
  addTaskComment,
  deleteMilestone,
  deleteTaskAttachment,
  getTaskAttachmentUrl,
  removeDependency,
  saveMilestone,
  saveProject,
  saveTask,
  setMilestoneReached,
  setProjectArchived,
  setTaskArchived,
  updateTaskProgress,
  uploadTaskAttachment,
} from "./actions";
import { PRIORITIES, PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "./config";
import {
  CommentForm,
  DependencyForm,
  MilestoneForm,
  ProjectForm,
  TaskForm,
  TaskProgressForm,
  type ProjectDefaults,
  type TaskDefaults,
} from "./components/forms";
import { DueDate, PriorityBadge, ProgressBar, TaskTimeline, TaskViewTabs } from "./components/view";
import { loadPlanningBrand, memberOptions } from "./load";
import {
  getDocumentOptions,
  getProject,
  getStatusCategories,
  getTask,
  getTasksByIds,
  getTaskStatuses,
  listAssignedTasks,
  listDependencies,
  listMilestones,
  listProjects,
  listTaskAttachments,
  listTaskEvents,
  listTasks,
  type ProjectRow,
  type TaskRow,
  type TaskStatus,
} from "./queries";
import { compareTasks, DUE_BUCKET_LABELS, dueBucket, isOpen, isOverdue, parseTaskFilters, projectProgress, type DueBucket } from "./rules";
import { createsCycle, dependencyConflict, isBlocked, milestoneConflict } from "./schedule";

type Params = Promise<{ brand: string }>;
type ParamsWithId = Promise<{ brand: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Query = Record<string, string | string[] | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function first(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const statusMap = (statuses: TaskStatus[]) => new Map(statuses.map((s) => [s.id, s]));

function TaskStatusBadge({ status }: { status: TaskStatus | undefined }) {
  return status ? <StatusBadge label={status.label} color={status.color} /> : <span>—</span>;
}

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Prédécesseurs ou successeurs d'une tâche, avec l'alerte de dates. */
function DependencyList({
  title,
  rows,
  base,
  statuses,
}: {
  title: string;
  rows: { task: TaskRow; conflict: boolean; remove?: FormAction }[];
  base: string;
  statuses: Map<string, TaskStatus>;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune tâche.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map(({ task, conflict, remove }) => (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={`${base}/taches/${task.id}`} className="min-w-0 flex-1 basis-40 truncate text-sm font-medium underline-offset-4 hover:underline">
                {task.title}
              </Link>
              <TaskStatusBadge status={statuses.get(task.statusId)} />
              <span className="text-xs text-muted-foreground">
                {formatDate(task.startOn)} → {formatDate(task.dueOn)}
              </span>
              {conflict && <Badge variant="destructive">Dates incompatibles</Badge>}
              {task.archivedAt && <Badge variant="secondary">Archivée</Badge>}
              {remove && (
                <ActionButton action={remove} variant="ghost">
                  Retirer
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// =====================================================================
// Projets
// =====================================================================

export function ProjectsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Projects slug={brand} archived={first(query.archives) === "1"} />
      ))}
    </Suspense>
  );
}

async function Projects({ slug, archived }: { slug: string; archived: boolean }) {
  const { brand, canRead, canManage } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const today = todayIso();
  const [projects, tasks, statuses, members] = await Promise.all([
    listProjects(brand.id, archived),
    listTasks(brand.id, { archived: false }),
    getTaskStatuses(brand.id),
    getMemberOptions(brand.id),
  ]);
  const byStatus = statusMap(statuses);
  const owners = new Map(members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}/projets`;

  return (
    <Page>
      <PageHeader title="Projets" description={`${brand.name} · chantiers, jalons et tâches`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href={archived ? base : `${base}?archives=1`} />}>
            {archived ? "Projets en cours" : "Projets archivés"}
          </Button>
          {canManage && !archived && (
            <Button nativeButton={false} render={<Link href={`${base}/nouveau`} />}>
              <Plus />
              Nouveau projet
            </Button>
          )}
        </div>
      </PageHeader>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projet</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">Tâches à faire</TableHead>
                <TableHead className="text-right">En retard</TableHead>
                <TableHead>Avancement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    {archived ? "Aucun projet archivé." : "Aucun projet pour l'instant."}
                  </TableCell>
                </TableRow>
              )}
              {projects.map((p) => {
                const own = tasks
                  .filter((t) => t.projectId === p.id && !t.parentId)
                  .map((t) => ({ ...t, category: byStatus.get(t.statusId)?.category ?? "draft" }));
                const open = own.filter((t) => isOpen(t.category)).length;
                const late = own.filter((t) => isOverdue(t, today)).length;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`${base}/${p.id}`} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }} />
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{(p.ownerId && owners.get(p.ownerId)) ?? "—"}</TableCell>
                    <TableCell>{PROJECT_STATUS_LABELS[p.status]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.startOn || p.endOn ? `${formatDate(p.startOn)} → ${formatDate(p.endOn)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{open}</TableCell>
                    <TableCell className={`text-right tabular-nums ${late > 0 ? "font-medium text-destructive" : ""}`}>{late}</TableCell>
                    <TableCell>
                      <ProgressBar value={projectProgress(own)} label={`Avancement de ${p.name}`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}

function projectDefaults(p: ProjectRow | null, userId: string): ProjectDefaults {
  return {
    name: p?.name ?? "",
    description: p?.description ?? "",
    ownerId: p ? (p.ownerId ?? "") : userId,
    status: p?.status ?? "planned",
    startOn: p?.startOn ?? "",
    endOn: p?.endOn ?? "",
    color: p?.color ?? "",
  };
}

export function NewProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand }) => (
        <NewProject slug={brand} />
      ))}
    </Suspense>
  );
}

async function NewProject({ slug }: { slug: string }) {
  const { ctx, brand, canManage } = await loadPlanningBrand(slug);
  if (!canManage) return <Forbidden />;
  const [members, fields] = await Promise.all([memberOptions(brand.id), getCustomFields(brand.id, "project")]);
  return (
    <Page>
      <BackLink href={`/m/${brand.slug}/projets`} label="Projets" />
      <PageHeader title="Nouveau projet" description={brand.name} />
      <Card>
        <CardContent>
          <ProjectForm
            action={saveProject.bind(null, brand.id, null)}
            defaults={projectDefaults(null, ctx.userId)}
            owners={members}
            fields={fields}
            members={members}
            submitLabel="Créer le projet"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

export function ProjectDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <ProjectDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function ProjectDetail({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand, canRead, canManage } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const project = await getProject(brand.id, id);
  if (!project) notFound();
  const today = todayIso();
  const [milestones, tasks, statuses, members, fields] = await Promise.all([
    listMilestones(brand.id, project.id),
    listTasks(brand.id, { archived: false }, { projectId: project.id }),
    getTaskStatuses(brand.id),
    memberOptions(brand.id),
    getCustomFields(brand.id, "project"),
  ]);
  const byStatus = statusMap(statuses);
  const labels = new Map(members.map((m) => [m.id, m.label]));
  const withCategory = tasks.map((t) => ({ ...t, category: byStatus.get(t.statusId)?.category ?? "draft" }));
  const progress = projectProgress(withCategory.filter((t) => !t.parentId));
  const base = `/m/${brand.slug}`;

  return (
    <Page>
      <BackLink href={`${base}/projets`} label="Projets" />
      <PageHeader title={project.name} description={`${PROJECT_STATUS_LABELS[project.status]} · ${brand.name}`}>
        <div className="flex flex-wrap items-center gap-2">
          {project.archivedAt && <Badge variant="secondary">Archivé</Badge>}
          {canManage && (
            <ActionButton action={setProjectArchived.bind(null, brand.id, project.id, !project.archivedAt)} variant="ghost">
              {project.archivedAt ? "Restaurer" : "Archiver"}
            </ActionButton>
          )}
          {canManage && !project.archivedAt && (
            <Button nativeButton={false} render={<Link href={`${base}/taches/nouvelle?projet=${project.id}`} />}>
              <Plus />
              Nouvelle tâche
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tâches</CardTitle>
              <CardDescription>
                {withCategory.filter((t) => isOpen(t.category)).length} à faire, dont{" "}
                {withCategory.filter((t) => isOverdue(t, today)).length} en retard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaskTable tasks={withCategory} statuses={byStatus} labels={labels} base={base} today={today} showProject={false} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProgressBar value={progress} label="Avancement du projet" />
              <Details
                rows={[
                  ["Responsable", (project.ownerId && labels.get(project.ownerId)) ?? "—"],
                  ["Statut", PROJECT_STATUS_LABELS[project.status]],
                  ["Début", formatDate(project.startOn)],
                  ["Fin prévue", formatDate(project.endOn)],
                  ...(project.description ? ([["Description", project.description]] as [string, string][]) : []),
                  ...customRows(fields, project.custom, labels),
                ]}
              />
              {canManage && (
                <EditDetails label="Modifier le projet">
                  <ProjectForm
                    action={saveProject.bind(null, brand.id, project.id)}
                    defaults={projectDefaults(project, ctx.userId)}
                    owners={members}
                    fields={fields}
                    members={members}
                    customValues={project.custom}
                    submitLabel="Enregistrer"
                  />
                </EditDetails>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jalons</CardTitle>
              <CardDescription>Étapes datées du projet, reprises sur la feuille de route.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {milestones.length === 0 && <p className="text-sm text-muted-foreground">Aucun jalon.</p>}
              <ul className="flex flex-col gap-3">
                {milestones.map((m) => {
                  const late = !m.reachedOn && m.dueOn < today;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className={`text-xs ${late ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                          {m.reachedOn ? `Atteint le ${formatDate(m.reachedOn)}` : `Prévu le ${formatDate(m.dueOn)}${late ? " · en retard" : ""}`}
                        </span>
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap gap-1">
                          <ActionButton action={setMilestoneReached.bind(null, brand.id, m.id, !m.reachedOn)} variant="ghost">
                            {m.reachedOn ? "Rouvrir" : "Atteint"}
                          </ActionButton>
                          <ActionButton action={deleteMilestone.bind(null, brand.id, m.id)} variant="ghost">
                            Supprimer
                          </ActionButton>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {canManage && <MilestoneForm action={saveMilestone.bind(null, brand.id, project.id, null)} submitLabel="Ajouter" />}
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

// =====================================================================
// Tâches
// =====================================================================

function TaskTable({
  tasks,
  statuses,
  labels,
  base,
  today,
  showProject,
  projects,
}: {
  tasks: (TaskRow & { category: TaskStatus["category"] })[];
  statuses: Map<string, TaskStatus>;
  labels: Map<string, string>;
  base: string;
  today: string;
  showProject: boolean;
  projects?: Map<string, string>;
}) {
  const sorted = [...tasks].sort(compareTasks);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tâche</TableHead>
          {showProject && <TableHead>Projet</TableHead>}
          <TableHead>Responsable</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Échéance</TableHead>
          <TableHead>Avancement</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={showProject ? 6 : 5} className="text-muted-foreground">
              Aucune tâche.
            </TableCell>
          </TableRow>
        )}
        {sorted.map((t) => (
          <TableRow key={t.id}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                {t.parentId && <span className="text-xs text-muted-foreground">↳</span>}
                <Link href={`${base}/taches/${t.id}`} className="font-medium underline-offset-4 hover:underline">
                  {t.title}
                </Link>
                <PriorityBadge priority={t.priority} />
              </div>
            </TableCell>
            {showProject && <TableCell>{(t.projectId && projects?.get(t.projectId)) ?? "—"}</TableCell>}
            <TableCell>{(t.assigneeId && labels.get(t.assigneeId)) ?? <span className="text-muted-foreground">Non attribuée</span>}</TableCell>
            <TableCell>
              <TaskStatusBadge status={statuses.get(t.statusId)} />
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <DueDate dueOn={t.dueOn} overdue={isOverdue(t, today)} />
            </TableCell>
            <TableCell>
              <ProgressBar value={t.category === "success" ? 100 : t.progress} label={`Avancement de ${t.title}`} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TasksPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <Tasks slug={brand} query={query} />
      ))}
    </Suspense>
  );
}

async function Tasks({ slug, query }: { slug: string; query: Query }) {
  const { brand, canRead, canManage } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  const filters = parseTaskFilters(query);
  const today = todayIso();
  const [tasks, statuses, members, projects] = await Promise.all([
    listTasks(brand.id, filters),
    getTaskStatuses(brand.id),
    memberOptions(brand.id),
    listProjects(brand.id, false),
  ]);
  const byStatus = statusMap(statuses);
  let rows = tasks.map((t) => ({ ...t, category: byStatus.get(t.statusId)?.category ?? ("draft" as const) }));
  if (filters.due === "retard") rows = rows.filter((t) => isOverdue(t, today));
  if (filters.due === "semaine") rows = rows.filter((t) => isOpen(t.category) && t.dueOn !== null && dueBucket(t.dueOn, today) !== "later");
  const base = `/m/${brand.slug}`;
  const action = `${base}/taches`;

  return (
    <Page>
      <PageHeader title="Tâches" description={`${brand.name} · ${rows.length} tâche(s)`}>
        {canManage && (
          <Button nativeButton={false} render={<Link href={`${base}/taches/nouvelle`} />}>
            <Plus />
            Nouvelle tâche
          </Button>
        )}
      </PageHeader>
      <TaskViewTabs base={base} current="liste" />
      <Form action={action} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="filtre-q">Recherche</Label>
          <Input id="filtre-q" name="q" defaultValue={filters.q} placeholder="Titre de la tâche" />
        </div>
        <FilterSelect id="statut" label="Statut" value={filters.status} options={statuses.map((s) => ({ id: s.id, label: s.label }))} />
        <FilterSelect
          id="responsable"
          label="Responsable"
          value={filters.assignee}
          options={[{ id: "aucun", label: "Non attribuée" }, ...members]}
        />
        <FilterSelect
          id="projet"
          label="Projet"
          value={filters.project}
          options={[{ id: "aucun", label: "Sans projet" }, ...projects.map((p) => ({ id: p.id, label: p.name }))]}
        />
        <FilterSelect id="priorite" label="Priorité" value={filters.priority} options={PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABELS[p] }))} />
        <FilterSelect
          id="echeance"
          label="Échéance"
          value={filters.due}
          options={[
            { id: "retard", label: "En retard" },
            { id: "semaine", label: "D'ici 7 jours" },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="archives" value="1" defaultChecked={filters.archived} className="size-4 accent-primary" />
            Archivées
          </label>
          <Button type="submit">Filtrer</Button>
          <Button variant="ghost" nativeButton={false} render={<Link href={action} />}>
            Réinitialiser
          </Button>
        </div>
      </Form>
      <Card>
        <CardContent>
          <TaskTable
            tasks={rows}
            statuses={byStatus}
            labels={new Map(members.map((m) => [m.id, m.label]))}
            base={base}
            today={today}
            showProject
            projects={new Map(projects.map((p) => [p.id, p.name]))}
          />
        </CardContent>
      </Card>
    </Page>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: { id: string; label: string }[];
}) {
  return (
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
}

const DOCUMENT_PERMISSIONS: Permission[] = [
  "offers.read_all",
  "offers.manage_all",
  "offers.manage_own",
  "memos.read_all",
  "memos.manage_all",
  "memos.manage_own",
];

/** Choix des formulaires de tâche (liens : seulement les modules actifs et lisibles). */
async function taskFormData(brand: BrandSummary, access: Access) {
  const modules = brand.enabledModules;
  const readsDocuments = DOCUMENT_PERMISSIONS.some((p) => can(access, p, brand.id));
  const [statuses, projects, milestones, members, parents, fields, campaigns, documents, companies] = await Promise.all([
    getTaskStatuses(brand.id),
    listProjects(brand.id, false),
    listMilestones(brand.id),
    memberOptions(brand.id),
    listTasks(brand.id, { archived: false }),
    getCustomFields(brand.id, "task"),
    modules.includes("campaigns") && (can(access, "marketing.read", brand.id) || can(access, "marketing.manage", brand.id))
      ? listCampaigns(brand.id, false)
      : Promise.resolve(null),
    (modules.includes("offers") || modules.includes("memos")) && readsDocuments ? getDocumentOptions(brand.id) : Promise.resolve(null),
    modules.includes("crm") && can(access, "crm.read", brand.id) ? getCompanyOptions(brand.id) : Promise.resolve(null),
  ]);
  return {
    statuses,
    taskRows: parents,
    milestoneRows: milestones,
    projects: projects.map((p) => ({ id: p.id, label: p.name })),
    milestones: milestones.map((m) => ({ id: m.id, label: `${m.name} (${formatDate(m.dueOn)})`, projectId: m.projectId })),
    members,
    parents: parents.filter((t) => !t.parentId).map((t) => ({ id: t.id, label: t.title, projectId: t.projectId })),
    fields,
    campaigns: campaigns?.map((c) => ({ id: c.id, label: c.name })) ?? null,
    documents,
    companies: companies?.map((c) => ({ id: c.id, label: c.name })) ?? null,
  };
}

function taskDefaults(t: TaskRow | null, prefill: { projectId?: string; parentId?: string; statusId: string }): TaskDefaults {
  return {
    title: t?.title ?? "",
    description: t?.description ?? "",
    projectId: t?.projectId ?? prefill.projectId ?? "",
    milestoneId: t?.milestoneId ?? "",
    parentId: t?.parentId ?? prefill.parentId ?? "",
    assigneeId: t?.assigneeId ?? "",
    statusId: t?.statusId ?? prefill.statusId,
    priority: t?.priority ?? "normal",
    startOn: t?.startOn ?? "",
    dueOn: t?.dueOn ?? "",
    progress: String(t?.progress ?? 0),
    estimateHours: t?.estimateHours !== null && t?.estimateHours !== undefined ? String(t.estimateHours) : "",
    campaignId: t?.campaignId ?? "",
    documentId: t?.documentId ?? "",
    companyId: t?.companyId ?? "",
  };
}

export function NewTaskPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ brand }, query]) => (
        <NewTask slug={brand} projectId={first(query.projet)} parentId={first(query.parent)} />
      ))}
    </Suspense>
  );
}

async function NewTask({ slug, projectId, parentId }: { slug: string; projectId: string; parentId: string }) {
  const { ctx, brand, canManage } = await loadPlanningBrand(slug);
  if (!canManage) return <Forbidden />;
  const data = await taskFormData(brand, ctx.access);
  const parent = data.parents.find((p) => p.id === parentId);
  const project = data.projects.some((p) => p.id === projectId) ? projectId : (parent?.projectId ?? undefined);
  const defaultStatus = data.statuses.find((s) => s.isDefault)?.id ?? "";
  const back = parent ? `/m/${brand.slug}/taches/${parent.id}` : project ? `/m/${brand.slug}/projets/${project}` : `/m/${brand.slug}/taches`;

  return (
    <Page>
      <BackLink href={back} label="Retour" />
      <PageHeader title={parent ? "Nouvelle sous-tâche" : "Nouvelle tâche"} description={parent ? parent.label : brand.name} />
      <Card>
        <CardContent>
          <TaskForm
            action={saveTask.bind(null, brand.id, null)}
            defaults={taskDefaults(null, { projectId: project, parentId: parent?.id, statusId: defaultStatus })}
            statuses={data.statuses.filter((s) => s.isActive).map((s) => ({ id: s.id, label: s.label }))}
            projects={data.projects}
            milestones={data.milestones}
            parents={data.parents}
            assignees={data.members}
            campaigns={data.campaigns}
            documents={data.documents}
            companies={data.companies}
            fields={data.fields}
            members={data.members}
            submitLabel="Créer la tâche"
          />
        </CardContent>
      </Card>
    </Page>
  );
}

export function TaskDetailPage({ params }: { params: ParamsWithId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ brand, id }) => (
        <TaskDetail slug={brand} id={id} />
      ))}
    </Suspense>
  );
}

async function TaskDetail({ slug, id }: { slug: string; id: string }) {
  const { ctx, brand, canRead, canManage } = await loadPlanningBrand(slug);
  if (!canRead) return <Forbidden />;
  if (!UUID.test(id)) notFound();
  const task = await getTask(brand.id, id);
  if (!task) notFound();
  const today = todayIso();
  const isAssignee = task.assigneeId === ctx.userId;
  const [data, events, subtasks, dependencies, attachments] = await Promise.all([
    taskFormData(brand, ctx.access),
    listTaskEvents(brand.id, task.id),
    task.parentId ? Promise.resolve([] as TaskRow[]) : listTasks(brand.id, { archived: false }, { parentId: task.id }),
    listDependencies(brand.id),
    listTaskAttachments(brand.id, task.id),
  ]);
  const byStatus = statusMap(data.statuses);
  const status = byStatus.get(task.statusId);

  // Dépendances : prédécesseurs (ce que la tâche attend) et successeurs (ce qu'elle bloque).
  const predecessorIds = dependencies.filter((d) => d.taskId === task.id).map((d) => d.dependsOnId);
  const successorIds = dependencies.filter((d) => d.dependsOnId === task.id).map((d) => d.taskId);
  const known = new Map(data.taskRows.map((t) => [t.id, t]));
  const missing = [...predecessorIds, ...successorIds].filter((linkedId) => !known.has(linkedId));
  for (const t of await getTasksByIds(brand.id, missing)) known.set(t.id, t);
  const dated = (t: TaskRow) => ({ startOn: t.startOn, dueOn: t.dueOn, category: byStatus.get(t.statusId)?.category ?? ("draft" as const) });
  const self = dated(task);
  const predecessors = predecessorIds.map((linkedId) => known.get(linkedId)).filter((t): t is TaskRow => t !== undefined);
  const successors = successorIds.map((linkedId) => known.get(linkedId)).filter((t): t is TaskRow => t !== undefined);
  const blocked = isBlocked(predecessors.filter((p) => !p.archivedAt).map(dated));
  const milestoneRow = data.milestoneRows.find((m) => m.id === task.milestoneId);
  const afterMilestone = milestoneRow ? milestoneConflict(self, milestoneRow) : false;
  const projectNames = new Map(data.projects.map((p) => [p.id, p.label]));
  const candidates = data.taskRows
    .filter((t) => t.id !== task.id && !predecessorIds.includes(t.id) && !createsCycle(dependencies, task.id, t.id))
    .map((t) => ({ id: t.id, label: t.projectId && projectNames.has(t.projectId) ? `${t.title} · ${projectNames.get(t.projectId)}` : t.title }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const canEditFiles = (canManage || isAssignee) && !task.archivedAt;
  const labels = new Map(data.members.map((m) => [m.id, m.label]));
  const base = `/m/${brand.slug}`;
  const project = data.projects.find((p) => p.id === task.projectId);
  const milestone = data.milestones.find((m) => m.id === task.milestoneId);
  const parent = task.parentId ? await getTask(brand.id, task.parentId) : null;
  const statusChoices = data.statuses
    .filter((s) => s.isActive || s.id === task.statusId)
    .map((s) => ({ id: s.id, label: s.isActive ? s.label : `${s.label} (désactivé)` }));
  const overdue = isOverdue({ dueOn: task.dueOn, category: status?.category ?? "draft" }, today);
  const linkLabel = (list: { id: string; label: string }[] | null, value: string | null) =>
    (value && list?.find((o) => o.id === value)?.label) ?? null;
  const links = (
    [
      ["Campagne", linkLabel(data.campaigns, task.campaignId)],
      ["Offre ou mémo", linkLabel(data.documents, task.documentId)],
      ["Prospect", linkLabel(data.companies, task.companyId)],
    ] as [string, string | null][]
  ).filter((row): row is [string, string] => row[1] !== null);

  return (
    <Page>
      <BackLink href={parent ? `${base}/taches/${parent.id}` : project ? `${base}/projets/${project.id}` : `${base}/taches`} label={parent ? parent.title : project ? project.label : "Tâches"} />
      <PageHeader title={task.title} description={project ? `${project.label} · ${brand.name}` : brand.name}>
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={status} />
          <PriorityBadge priority={task.priority} />
          {overdue && <Badge variant="destructive">En retard</Badge>}
          {blocked && isOpen(self.category) && <Badge variant="secondary">Bloquée</Badge>}
          {afterMilestone && <Badge variant="destructive">Après son jalon</Badge>}
          {task.archivedAt && <Badge variant="secondary">Archivée</Badge>}
          {canManage && (
            <ActionButton action={setTaskArchived.bind(null, brand.id, task.id, !task.archivedAt)} variant="ghost">
              {task.archivedAt ? "Restaurer" : "Archiver"}
            </ActionButton>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProgressBar value={status?.category === "success" ? 100 : task.progress} label="Avancement de la tâche" />
              <Details
                rows={[
                  ["Responsable", (task.assigneeId && labels.get(task.assigneeId)) ?? "Non attribuée"],
                  ["Priorité", PRIORITY_LABELS[task.priority]],
                  ["Début", formatDate(task.startOn)],
                  ["Échéance", <DueDate key="d" dueOn={task.dueOn} overdue={overdue} />],
                  ["Jalon", milestone?.label ?? "—"],
                  ["Estimation", task.estimateHours !== null ? `${task.estimateHours} h` : "—"],
                  ...(task.completedAt ? ([["Terminée le", formatDate(task.completedAt.slice(0, 10))]] as [string, string][]) : []),
                  ...(task.description ? ([["Description", task.description]] as [string, string][]) : []),
                  ...links,
                  ...customRows(data.fields, task.custom, labels),
                ]}
              />
              {(canManage || isAssignee) && !task.archivedAt && (
                <TaskProgressForm
                  action={updateTaskProgress.bind(null, brand.id, task.id)}
                  statuses={statusChoices}
                  statusId={task.statusId}
                  progress={task.progress}
                />
              )}
              {canManage && (
                <EditDetails label="Modifier la tâche">
                  <TaskForm
                    action={saveTask.bind(null, brand.id, task.id)}
                    defaults={taskDefaults(task, { statusId: task.statusId })}
                    statuses={statusChoices}
                    projects={data.projects}
                    milestones={data.milestones}
                    parents={data.parents.filter((p) => p.id !== task.id)}
                    assignees={data.members}
                    campaigns={data.campaigns}
                    documents={data.documents}
                    companies={data.companies}
                    fields={data.fields}
                    members={data.members}
                    customValues={task.custom}
                    submitLabel="Enregistrer"
                  />
                </EditDetails>
              )}
            </CardContent>
          </Card>

          {!task.parentId && (
            <Card>
              <CardHeader>
                <CardTitle>Sous-tâches</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <TaskTable
                  tasks={subtasks.map((t) => ({ ...t, category: byStatus.get(t.statusId)?.category ?? ("draft" as const) }))}
                  statuses={byStatus}
                  labels={labels}
                  base={base}
                  today={today}
                  showProject={false}
                />
                {canManage && !task.archivedAt && (
                  <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link href={`${base}/taches/nouvelle?parent=${task.id}`} />}>
                    <Plus />
                    Ajouter une sous-tâche
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Dépendances</CardTitle>
              <CardDescription>Une tâche commence quand celles qu&apos;elle attend sont terminées.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {blocked && isOpen(self.category) && (
                <p className="text-sm font-medium">Bloquée : au moins une tâche attendue n&apos;est pas terminée.</p>
              )}
              <DependencyList
                title="Attend la fin de"
                base={base}
                statuses={byStatus}
                rows={predecessors.map((p) => ({
                  task: p,
                  conflict: dependencyConflict(self, dated(p)),
                  remove: canManage ? removeDependency.bind(null, brand.id, task.id, p.id) : undefined,
                }))}
              />
              <DependencyList
                title="Bloque"
                base={base}
                statuses={byStatus}
                rows={successors.map((s) => ({
                  task: s,
                  conflict: dependencyConflict(dated(s), self),
                  remove: canManage ? removeDependency.bind(null, brand.id, s.id, task.id) : undefined,
                }))}
              />
              {canManage && !task.archivedAt && <DependencyForm action={addDependency.bind(null, brand.id, task.id)} tasks={candidates} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pièces jointes</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                attachments={attachments}
                canManage={canEditFiles}
                getUrl={getTaskAttachmentUrl}
                uploadAction={uploadTaskAttachment.bind(null, brand.id, task.id)}
                deleteActions={Object.fromEntries(attachments.map((a) => [a.id, deleteTaskAttachment.bind(null, brand.id, task.id, a.id)]))}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Chronologie</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {(canManage || isAssignee) && <CommentForm action={addTaskComment.bind(null, brand.id, task.id)} />}
            <TaskTimeline events={events} actorLabels={labels} />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

// =====================================================================
// Mes tâches (toutes marques)
// =====================================================================

export function MyTasksPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyTasks />
    </Suspense>
  );
}

const BUCKETS: DueBucket[] = ["overdue", "today", "week", "later", "none"];

async function MyTasks() {
  const ctx = await getAuthContext();
  const brands = ctx.brands.filter((b) => b.enabledModules.includes("planning") && can(ctx.access, "planning.read", b.id));
  if (brands.length === 0) {
    return (
      <Page>
        <PageHeader title="Mes tâches" />
        <Notice title="Aucune planification accessible">La planification n&apos;est activée sur aucune de vos marques.</Notice>
      </Page>
    );
  }
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const today = todayIso();
  const tasks = (await listAssignedTasks(ctx.userId)).filter((t) => brandById.has(t.brandId));
  const statuses = await getStatusCategories([...new Set(tasks.map((t) => t.brandId))]);
  const open = tasks
    .map((t) => ({ ...t, status: statuses.get(t.statusId) }))
    .filter((t) => t.status && isOpen(t.status.category))
    .sort(compareTasks);

  return (
    <Page>
      <PageHeader title="Mes tâches" description={`${open.length} tâche(s) à faire, toutes marques confondues`} />
      {open.length === 0 && <Notice title="Rien à faire pour l'instant">Aucune tâche ouverte ne vous est confiée.</Notice>}
      {BUCKETS.map((bucket) => {
        const items = open.filter((t) => dueBucket(t.dueOn, today) === bucket);
        if (items.length === 0) return null;
        return (
          <Card key={bucket}>
            <CardHeader>
              <CardTitle className={bucket === "overdue" ? "text-destructive" : undefined}>
                {DUE_BUCKET_LABELS[bucket]} ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {items.map((t) => {
                  const brand = brandById.get(t.brandId)!;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="flex min-w-0 flex-col">
                        <Link href={`/m/${brand.slug}/taches/${t.id}`} className="font-medium underline-offset-4 hover:underline">
                          {t.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">{brand.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <PriorityBadge priority={t.priority} />
                        {t.status && <StatusBadge label={t.status.label} color={t.status.color} />}
                        <DueDate dueOn={t.dueOn} overdue={bucket === "overdue"} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}
