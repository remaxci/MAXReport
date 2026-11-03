"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failed, forbidden, type ActionState } from "@/lib/form";
import { CURRENCIES } from "@/lib/metrics/currency";
import { PERIOD_KINDS } from "@/lib/periods";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { canImport } from "./access";
import { checkBatch, readOptions } from "./normalize";
import { findPreviousMapping, getBatch, getImportContext, getParents } from "./queries";
import { MAX_IMPORT_BYTES, readSpreadsheet } from "./read";
import { isImportTarget, suggestMapping, TARGETS, type ImportTarget, type Mapping } from "./targets";

// Droits revérifiés ici (imports.manage et droit sur la table cible) ; la RLS,
// les triggers et les fonctions commit_import / rollback_import restent
// l'arbitre final.

const uuid = z.uuid();

async function importScope(brandId: string, target?: ImportTarget) {
  if (!uuid.safeParse(brandId).success) return null;
  const ctx = await getAuthContext();
  const brand = ctx.brands.find((b) => b.id === brandId);
  if (!brand || !brand.enabledModules.includes("imports") || !can(ctx.access, "imports.manage", brandId)) return null;
  if (target && !canImport(ctx.access, brand, target)) return null;
  return { ctx, brand };
}

async function batchScope(brandId: string, batchId: string) {
  if (!uuid.safeParse(batchId).success) return null;
  const scope = await importScope(brandId);
  if (!scope) return null;
  const batch = await getBatch(brandId, batchId);
  if (!batch || !canImport(scope.ctx.access, scope.brand, batch.target)) return null;
  return { ...scope, batch };
}

export async function uploadImport(brandId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const target = String(formData.get("target") ?? "");
  if (!isImportTarget(target)) return { ok: false, message: "Choisissez ce que vous importez.", fieldErrors: { target: ["Champ requis."] } };
  const scope = await importScope(brandId, target);
  if (!scope) return forbidden();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez un fichier.", fieldErrors: { file: ["Fichier requis."] } };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "4 Mo au maximum par fichier.", fieldErrors: { file: ["Fichier trop lourd."] } };
  if (file.name.length > 255) return { ok: false, message: "Nom de fichier trop long." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = await readSpreadsheet(file.name, bytes);
  if (!read.ok) return { ok: false, message: read.message, fieldErrors: { file: [read.message] } };
  const { headers, rows, firstLine } = read.sheet;

  // Correspondance : celle du dernier fichier aux mêmes en-têtes, sinon une proposition.
  const previous = await findPreviousMapping(brandId, target, headers);
  const options = {
    ...(previous?.options ?? { currency: scope.brand.reportingCurrency || "XOF" }),
    firstLine,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      brand_id: brandId,
      target,
      file_name: file.name,
      file_size: file.size,
      file_sha256: createHash("sha256").update(bytes).digest("hex"),
      headers: headers as Json,
      rows: rows as Json,
      row_count: rows.length,
      mapping: (previous?.mapping ?? suggestMapping(target, headers)) as Json,
      options: options as Json,
    })
    .select("id")
    .single();
  if (error) return failed(error);
  redirect(`/m/${scope.brand.slug}/imports/${data.id}`);
}

export async function saveMapping(brandId: string, batchId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const scope = await batchScope(brandId, batchId);
  if (!scope) return forbidden();
  const { batch } = scope;
  if (batch.status !== "uploaded") return { ok: false, message: "Ce lot est déjà importé ou annulé." };

  const mapping: Mapping = {};
  const used = new Set<number>();
  for (const field of TARGETS[batch.target].fields) {
    const raw = String(formData.get(`map_${field.key}`) ?? "");
    if (raw === "") continue;
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index >= batch.headers.length) return forbidden();
    if (used.has(index)) {
      return { ok: false, message: `La colonne « ${batch.headers[index]} » est associée à deux champs.` };
    }
    used.add(index);
    mapping[field.key] = index;
  }

  const options: Record<string, unknown> = {
    dateFormat: formData.get("dateFormat") === "mdy" ? "mdy" : "dmy",
    numberFormat: formData.get("numberFormat") === "en" ? "en" : "fr",
    periodKind: (["day", ...PERIOD_KINDS] as string[]).includes(String(formData.get("periodKind"))) ? formData.get("periodKind") : "day",
    firstLine: batch.options.firstLine,
  };
  const currency = String(formData.get("currency") ?? "");
  if ((CURRENCIES as readonly string[]).includes(currency)) options.currency = currency;
  const defaultParentId = String(formData.get("defaultParentId") ?? "");
  if (defaultParentId) {
    const parents = await getParents(batch.target, brandId);
    if (!parents.some((p) => p.id === defaultParentId)) return forbidden();
    options.defaultParentId = defaultParentId;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("import_batches")
    .update({ mapping: mapping as Json, options: options as Json })
    .eq("id", batchId)
    .eq("brand_id", brandId)
    .eq("status", "uploaded");
  if (error) return failed(error);
  refresh();
  return { ok: true, message: "Correspondance enregistrée : vérifiez l'aperçu." };
}

export async function commitBatch(brandId: string, batchId: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const scope = await batchScope(brandId, batchId);
  if (!scope) return forbidden();
  const { batch } = scope;
  if (batch.status !== "uploaded") return { ok: false, message: "Ce lot est déjà importé ou annulé." };
  const missing = TARGETS[batch.target].fields.filter((f) => f.required && batch.mapping[f.key] === undefined);
  if (missing.length > 0) return { ok: false, message: `Associez d'abord : ${missing.map((f) => f.label).join(", ")}.` };

  // Vérification refaite au moment d'importer : la base a pu changer depuis l'aperçu.
  const context = await getImportContext(batch.target, brandId);
  const options = readOptions(batch.options);
  const firstLine = Number(batch.options.firstLine) || 2;
  const check = checkBatch(batch.target, batch.rows, batch.mapping, options, context, firstLine);
  const records = check.lines.filter((l) => l.status === "ok").map((l) => l.record);
  if (records.length === 0) return { ok: false, message: "Aucune ligne valide à importer." };
  const report = {
    lines: check.lines
      .filter((l) => l.status !== "ok")
      .slice(0, 500)
      .map((l) => ({ line: l.line, status: l.status, message: l.message })),
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("commit_import", {
    p_batch_id: batchId,
    p_rows: records as Json,
    p_skipped: check.counts.duplicate,
    p_errors: check.counts.error,
    p_report: report as Json,
  });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: `${data} ligne(s) importée(s).` };
}

export async function rollbackBatch(brandId: string, batchId: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const scope = await batchScope(brandId, batchId);
  if (!scope) return forbidden();
  if (scope.batch.status !== "committed") return { ok: false, message: "Seul un lot importé peut être annulé." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rollback_import", { p_batch_id: batchId });
  if (error) return failed(error);
  refresh();
  return { ok: true, message: `Import annulé : ${data} ligne(s) supprimée(s).` };
}

export async function discardBatch(brandId: string, batchId: string, _previous: ActionState, _formData?: FormData): Promise<ActionState> {
  const scope = await batchScope(brandId, batchId);
  if (!scope) return forbidden();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .delete()
    .eq("id", batchId)
    .eq("brand_id", brandId)
    .eq("status", "uploaded")
    .select("id");
  if (error) return failed(error);
  if (data.length === 0) return { ok: false, message: "Ce lot est déjà importé : annulez-le plutôt." };
  redirect(`/m/${scope.brand.slug}/imports`);
}
