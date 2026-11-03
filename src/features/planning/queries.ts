import { getStatuses } from "@/features/settings/queries";
import type { StatusCategory } from "@/features/settings/constants";
import { createClient } from "@/lib/supabase/server";
import type { Priority, ProjectStatus } from "./config";
import type { TaskFilters } from "./rules";

// Lectures sous RLS : projets, jalons et tâches exigent planning.read sur la
// marque. Les filtres réduisent le résultat, ils ne donnent aucun droit.

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------
// Statuts de tâche
// ---------------------------------------------------------------------

export type TaskStatus = {
  id: string;
  label: string;
  color: string | null;
  category: StatusCategory;
  isDefault: boolean;
  isActive: boolean;
};

export async function getTaskStatuses(brandId: string): Promise<TaskStatus[]> {
  return (await getStatuses(brandId))
    .filter((s) => s.entity === "task")
    .map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      category: s.category as StatusCategory,
      isDefault: s.isDefault,
      isActive: s.isActive,
    }));
}

// ---------------------------------------------------------------------
// Projets et jalons
// ---------------------------------------------------------------------

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  status: ProjectStatus;
  startOn: string | null;
  endOn: string | null;
  color: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

const PROJECT_COLUMNS = "id, name, description, owner_id, status, start_on, end_on, color, custom, archived_at";

type RawProject = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  status: string;
  start_on: string | null;
  end_on: string | null;
  color: string | null;
  custom: unknown;
  archived_at: string | null;
};

function toProject(p: RawProject): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    ownerId: p.owner_id,
    status: p.status as ProjectStatus,
    startOn: p.start_on,
    endOn: p.end_on,
    color: p.color,
    custom: asRecord(p.custom),
    archivedAt: p.archived_at,
  };
}

export async function listProjects(brandId: string, archived: boolean): Promise<ProjectRow[]> {
  const supabase = await createClient();
  let query = supabase.from("projects").select(PROJECT_COLUMNS).eq("brand_id", brandId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("start_on", { ascending: true, nullsFirst: false }).order("name").limit(500);
  if (error) throw error;
  return data.map(toProject);
}

export async function getProject(brandId: string, id: string): Promise<ProjectRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProject(data) : null;
}

export type MilestoneRow = { id: string; projectId: string; name: string; dueOn: string; reachedOn: string | null };

export async function listMilestones(brandId: string, projectId?: string): Promise<MilestoneRow[]> {
  const supabase = await createClient();
  let query = supabase.from("milestones").select("id, project_id, name, due_on, reached_on").eq("brand_id", brandId);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.order("due_on").limit(1000);
  if (error) throw error;
  return data.map((m) => ({ id: m.id, projectId: m.project_id, name: m.name, dueOn: m.due_on, reachedOn: m.reached_on }));
}

// ---------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------

export type TaskRow = {
  id: string;
  brandId: string;
  projectId: string | null;
  milestoneId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  statusId: string;
  priority: Priority;
  startOn: string | null;
  dueOn: string | null;
  progress: number;
  estimateHours: number | null;
  completedAt: string | null;
  position: number;
  campaignId: string | null;
  documentId: string | null;
  companyId: string | null;
  custom: Record<string, unknown>;
  archivedAt: string | null;
};

const TASK_COLUMNS =
  "id, brand_id, project_id, milestone_id, parent_id, title, description, assignee_id, status_id, priority, start_on, due_on, progress, estimate_hours, completed_at, position, campaign_id, document_id, company_id, custom, archived_at";

type RawTask = {
  id: string;
  brand_id: string;
  project_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status_id: string;
  priority: string;
  start_on: string | null;
  due_on: string | null;
  progress: number;
  estimate_hours: number | null;
  completed_at: string | null;
  position: number;
  campaign_id: string | null;
  document_id: string | null;
  company_id: string | null;
  custom: unknown;
  archived_at: string | null;
};

function toTask(t: RawTask): TaskRow {
  return {
    id: t.id,
    brandId: t.brand_id,
    projectId: t.project_id,
    milestoneId: t.milestone_id,
    parentId: t.parent_id,
    title: t.title,
    description: t.description,
    assigneeId: t.assignee_id,
    statusId: t.status_id,
    priority: t.priority as Priority,
    startOn: t.start_on,
    dueOn: t.due_on,
    progress: t.progress,
    estimateHours: t.estimate_hours === null ? null : Number(t.estimate_hours),
    completedAt: t.completed_at,
    position: t.position,
    campaignId: t.campaign_id,
    documentId: t.document_id,
    companyId: t.company_id,
    custom: asRecord(t.custom),
    archivedAt: t.archived_at,
  };
}

/**
 * Tâches d'une marque. Le filtre « en retard » porte aussi sur la catégorie
 * du statut : il est appliqué par l'appelant, qui connaît les statuts.
 */
export async function listTasks(
  brandId: string,
  filters: TaskFilters,
  scope: { projectId?: string; parentId?: string } = {},
): Promise<TaskRow[]> {
  const supabase = await createClient();
  let query = supabase.from("tasks").select(TASK_COLUMNS).eq("brand_id", brandId);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (scope.projectId) query = query.eq("project_id", scope.projectId);
  if (scope.parentId) query = query.eq("parent_id", scope.parentId);
  if (filters.status) query = query.eq("status_id", filters.status);
  if (filters.assignee === "aucun") query = query.is("assignee_id", null);
  else if (filters.assignee) query = query.eq("assignee_id", filters.assignee);
  if (filters.project === "aucun") query = query.is("project_id", null);
  else if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  const { data, error } = await query.order("due_on", { ascending: true, nullsFirst: false }).order("title").limit(1000);
  if (error) throw error;
  return (data as RawTask[]).map(toTask);
}

export async function getTask(brandId: string, id: string): Promise<TaskRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select(TASK_COLUMNS).eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toTask(data as RawTask) : null;
}

/** Tâches non archivées confiées à un collaborateur, dans toutes les marques qu'il peut lire. */
export async function listAssignedTasks(userId: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("assignee_id", userId)
    .is("archived_at", null)
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) throw error;
  return (data as RawTask[]).map(toTask);
}

/** Catégorie de chaque statut de tâche des marques demandées. */
export async function getStatusCategories(brandIds: string[]): Promise<Map<string, { label: string; color: string | null; category: StatusCategory }>> {
  if (brandIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statuses")
    .select("id, label, color, category")
    .eq("entity", "task")
    .in("brand_id", brandIds);
  if (error) throw error;
  return new Map(data.map((s) => [s.id, { label: s.label, color: s.color, category: s.category as StatusCategory }]));
}

export type TaskEvent = {
  id: string;
  type: string;
  occurredAt: string;
  actorId: string | null;
  payload: Record<string, unknown>;
};

export async function listTaskEvents(brandId: string, taskId: string): Promise<TaskEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_events")
    .select("id, type, occurred_at, actor_id, payload")
    .eq("brand_id", brandId)
    .eq("task_id", taskId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map((e) => ({ id: e.id, type: e.type, occurredAt: e.occurred_at, actorId: e.actor_id, payload: asRecord(e.payload) }));
}

// ---------------------------------------------------------------------
// Liens vers les autres modules
// ---------------------------------------------------------------------

export type LinkOption = { id: string; label: string };

/** Offres et mémos non archivés, désignés par leur référence et leur objet. */
export async function getDocumentOptions(brandId: string): Promise<LinkOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_documents")
    .select("id, reference, subject")
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .order("issued_on", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data.map((d) => ({ id: d.id, label: `${d.reference} · ${d.subject}` }));
}
