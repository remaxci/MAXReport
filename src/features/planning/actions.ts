"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseNumber } from "@/features/custom-fields/parse";
import { readCustomValues } from "@/features/custom-fields/read";
import { failed, forbidden, formValues, invalid, type ActionState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { PRIORITIES, PROJECT_STATUSES } from "./config";

// Chaque action : identifiants vérifiés, droits revérifiés côté serveur,
// écriture sous RLS ; les triggers de la base restent l'arbitre final
// (statut de tâche, responsable membre de la marque, jalon du projet…).

const uuid = z.uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max, `${max} caractères au maximum.`).optional());
const optionalDate = z.preprocess(blank, z.string().regex(DATE, "Date invalide.").optional());
const optionalUuid = z.preprocess(blank, z.uuid().optional());

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Marque lisible par l'utilisateur, module de planification activé. */
async function planningScope(brandId: string) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("planning")) return null;
  return { ctx, brand, canManage: can(ctx.access, "planning.manage", brandId) };
}

const datesInOrder = (start?: string, end?: string) => !start || !end || end >= start;

// ---------------------------------------------------------------------
// Projets
// ---------------------------------------------------------------------

const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
    description: text(5000),
    ownerId: optionalUuid,
    status: z.enum(PROJECT_STATUSES),
    startOn: optionalDate,
    endOn: optionalDate,
    color: z.preprocess(blank, z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide.").optional()),
  })
  .refine((d) => datesInOrder(d.startOn, d.endOn), { path: ["endOn"], message: "La fin précède le début." });

export async function saveProject(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const supabase = await createClient();

  let existing: Record<string, unknown> = {};
  if (id !== null) {
    const { data } = await supabase.from("projects").select("custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data) return forbidden();
    existing = asRecord(data.custom);
  }

  const parsed = projectSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const custom = await readCustomValues(brandId, "project", formData, existing);
  if ("state" in custom) return custom.state;

  const values = {
    name: d.name,
    description: d.description ?? null,
    owner_id: d.ownerId ?? null,
    status: d.status,
    start_on: d.startOn ?? null,
    end_on: d.endOn ?? null,
    color: d.color ?? null,
    custom: custom.values,
  };

  if (id === null) {
    const { data, error } = await supabase.from("projects").insert({ ...values, brand_id: brandId }).select("id").single();
    if (error) return failed(error);
    redirect(`/m/${scope.brand.slug}/projets/${data.id}`);
  }
  const { data, error } = await supabase.from("projects").update(values).eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Projet enregistré." };
}

export async function setProjectArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: archived ? "Projet archivé." : "Projet restauré." };
}

// ---------------------------------------------------------------------
// Jalons
// ---------------------------------------------------------------------

const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  dueOn: z.string().regex(DATE, "Date invalide."),
});

export async function saveMilestone(
  brandId: string,
  projectId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || !uuid.safeParse(projectId).success || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const parsed = milestoneSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const values = { name: parsed.data.name, due_on: parsed.data.dueOn };
  const { data, error } =
    id === null
      ? await supabase.from("milestones").insert({ ...values, brand_id: brandId, project_id: projectId }).select("id")
      : await supabase.from("milestones").update(values).eq("id", id).eq("brand_id", brandId).eq("project_id", projectId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: id === null ? "Jalon ajouté." : "Jalon enregistré." };
}

export async function setMilestoneReached(
  brandId: string,
  id: string,
  reached: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milestones")
    .update({ reached_on: reached ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: reached ? "Jalon atteint." : "Jalon rouvert." };
}

export async function deleteMilestone(
  brandId: string,
  id: string,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase.from("milestones").delete().eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Jalon supprimé ; ses tâches restent dans le projet." };
}

// ---------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------

const progressValue = z.preprocess(
  (value) => (blank(value) === undefined ? 0 : Number(value)),
  z.number({ error: "Avancement invalide." }).int("Nombre entier attendu.").min(0).max(100, "100 % au maximum."),
);

const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est obligatoire.").max(300),
    description: text(10000),
    projectId: optionalUuid,
    milestoneId: optionalUuid,
    parentId: optionalUuid,
    assigneeId: optionalUuid,
    statusId: z.uuid("Choisissez un statut."),
    priority: z.enum(PRIORITIES),
    startOn: optionalDate,
    dueOn: optionalDate,
    progress: progressValue,
    estimateHours: z.preprocess(
      (value) => (blank(value) === undefined ? undefined : (parseNumber(String(value)) ?? Number.NaN)),
      z.number({ error: "Estimation invalide." }).min(0, "Valeur positive attendue.").max(10000).optional(),
    ),
    campaignId: optionalUuid,
    documentId: optionalUuid,
    companyId: optionalUuid,
  })
  .refine((d) => datesInOrder(d.startOn, d.dueOn), { path: ["dueOn"], message: "L'échéance précède le début." })
  .refine((d) => !d.milestoneId || d.projectId, { path: ["milestoneId"], message: "Un jalon appartient à un projet : choisissez-le." });

export async function saveTask(
  brandId: string,
  id: string | null,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || (id !== null && !uuid.safeParse(id).success)) return forbidden();
  const supabase = await createClient();

  let existing: Record<string, unknown> = {};
  if (id !== null) {
    const { data } = await supabase.from("tasks").select("custom").eq("id", id).eq("brand_id", brandId).maybeSingle();
    if (!data) return forbidden();
    existing = asRecord(data.custom);
  }

  const parsed = taskSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (id !== null && d.parentId === id) {
    return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { parentId: ["Une tâche ne peut pas être sa propre sous-tâche."] } };
  }
  const custom = await readCustomValues(brandId, "task", formData, existing);
  if ("state" in custom) return custom.state;

  // Un lien ne vise qu'un élément que l'utilisateur peut lui-même consulter (RLS).
  const linked = [
    ["campaigns", "campaignId", d.campaignId],
    ["commercial_documents", "documentId", d.documentId],
    ["companies", "companyId", d.companyId],
  ] as const;
  for (const [table, field, linkId] of linked) {
    if (!linkId) continue;
    const { data: target } = await supabase.from(table).select("id").eq("id", linkId).eq("brand_id", brandId).maybeSingle();
    if (!target) return { ok: false, message: "Vérifiez les champs signalés.", fieldErrors: { [field]: ["Élément introuvable."] } };
  }

  const values = {
    title: d.title,
    description: d.description ?? null,
    project_id: d.projectId ?? null,
    milestone_id: d.milestoneId ?? null,
    parent_id: d.parentId ?? null,
    assignee_id: d.assigneeId ?? null,
    status_id: d.statusId,
    priority: d.priority,
    start_on: d.startOn ?? null,
    due_on: d.dueOn ?? null,
    progress: d.progress,
    estimate_hours: d.estimateHours ?? null,
    campaign_id: d.campaignId ?? null,
    document_id: d.documentId ?? null,
    company_id: d.companyId ?? null,
    custom: custom.values,
  };

  if (id === null) {
    const { data, error } = await supabase.from("tasks").insert({ ...values, brand_id: brandId }).select("id").single();
    if (error) return failed(error);
    redirect(`/m/${scope.brand.slug}/taches/${data.id}`);
  }
  const { data, error } = await supabase.from("tasks").update(values).eq("id", id).eq("brand_id", brandId).select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Tâche enregistrée." };
}

const progressSchema = z.object({ statusId: z.uuid("Choisissez un statut."), progress: progressValue });

/** Statut et avancement : par un gestionnaire du planning ou par le responsable de la tâche. */
export async function updateTaskProgress(
  brandId: string,
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope || !uuid.safeParse(id).success) return forbidden();
  const parsed = progressSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("assignee_id").eq("id", id).eq("brand_id", brandId).maybeSingle();
  if (!task || !(scope.canManage || task.assignee_id === scope.ctx.userId)) return forbidden();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status_id: parsed.data.statusId, progress: parsed.data.progress })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: "Avancement enregistré." };
}

export async function setTaskArchived(
  brandId: string,
  id: string,
  archived: boolean,
  _previous: ActionState,
  _formData?: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope?.canManage || !uuid.safeParse(id).success) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return forbidden();
  refresh();
  return { ok: true, message: archived ? "Tâche archivée." : "Tâche restaurée." };
}

const commentSchema = z.object({ text: z.string().trim().min(1, "Le commentaire est vide.").max(5000) });

/** Commentaire : par un gestionnaire du planning ou par le responsable de la tâche (RLS). */
export async function addTaskComment(
  brandId: string,
  taskId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const scope = await planningScope(brandId);
  if (!scope || !uuid.safeParse(taskId).success) return forbidden();
  const parsed = commentSchema.safeParse(formValues(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("task_events").insert({
    brand_id: brandId,
    task_id: taskId,
    type: "comment",
    actor_id: scope.ctx.userId,
    payload: { text: parsed.data.text },
  });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Commentaire ajouté." };
}
