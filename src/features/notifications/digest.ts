import { z } from "zod";
import { formatDate } from "@/lib/format";

// Contenu du récapitulatif quotidien : préparé par la base (task_digests),
// mis en forme ici. Aucun chiffre inventé : seulement les tâches renvoyées.

export const DIGEST_KINDS = ["due_today", "overdue", "due_soon", "assigned"] as const;
export type DigestKind = (typeof DIGEST_KINDS)[number];

const itemSchema = z.object({
  taskId: z.uuid(),
  title: z.string(),
  dueOn: z.string().nullable(),
  brandName: z.string(),
  brandSlug: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(DIGEST_KINDS),
  isNew: z.boolean(),
});
export type DigestItem = z.infer<typeof itemSchema>;

/** Tâches lisibles d'un récapitulatif ; une entrée mal formée est écartée. */
export function readItems(value: unknown): DigestItem[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const parsed = itemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const SECTIONS: Record<DigestKind, string> = {
  due_today: "À rendre aujourd'hui",
  overdue: "En retard",
  due_soon: "Échéance proche",
  assigned: "Nouvelles tâches qui vous sont confiées",
};

/** Au plus 20 tâches par rubrique ; au-delà, le nombre restant. */
export const MAX_PER_SECTION = 20;

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type RenderedDigest = { subject: string; text: string; html: string; count: number };

/** Objet, version texte et version HTML du récapitulatif d'une personne. */
export function renderDigest(input: { name: string | null; items: readonly DigestItem[]; today: string; appUrl: string }): RenderedDigest {
  const { items, appUrl } = input;
  const link = (item: DigestItem) => `${appUrl}/m/${item.brandSlug}/taches/${item.taskId}`;
  const detail = (item: DigestItem) =>
    [item.brandName, item.dueOn ? `échéance ${formatDate(item.dueOn)}` : "sans échéance", ...(item.isNew && item.kind !== "assigned" ? ["nouvelle"] : [])].join(" · ");
  const sections = DIGEST_KINDS.map((kind) => ({ kind, title: SECTIONS[kind], items: items.filter((i) => i.kind === kind) })).filter(
    (s) => s.items.length > 0,
  );

  const late = items.filter((i) => i.kind === "overdue").length;
  const today = items.filter((i) => i.kind === "due_today").length;
  const subject =
    `MAXreport · ${items.length} tâche${items.length > 1 ? "s" : ""} à suivre` +
    (today > 0 ? ` · ${today} pour aujourd'hui` : "") +
    (late > 0 ? ` · ${late} en retard` : "");
  const greeting = input.name?.trim() ? `Bonjour ${input.name.trim()},` : "Bonjour,";
  const intro = `Voici vos tâches à suivre au ${formatDate(input.today)}.`;
  const footer = `Pour régler ou couper ces rappels : ${appUrl}/compte`;

  const text = [
    greeting,
    "",
    intro,
    ...sections.flatMap((s) => [
      "",
      `${s.title} (${s.items.length})`,
      ...s.items.slice(0, MAX_PER_SECTION).map((i) => `- ${i.title} (${detail(i)})\n  ${link(i)}`),
      ...(s.items.length > MAX_PER_SECTION ? [`… et ${s.items.length - MAX_PER_SECTION} autre(s) dans MAXreport.`] : []),
    ]),
    "",
    footer,
  ].join("\n");

  const html = `<!doctype html><html lang="fr"><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b;line-height:1.5">
<p>${escape(greeting)}</p>
<p>${escape(intro)}</p>
${sections
  .map(
    (s) => `<h2 style="font-size:16px;margin:20px 0 8px">${escape(s.title)} (${s.items.length})</h2>
<ul style="padding-left:20px;margin:0">
${s.items
  .slice(0, MAX_PER_SECTION)
  .map((i) => `<li style="margin-bottom:6px"><a href="${escape(link(i))}">${escape(i.title)}</a><br><span style="color:#52514e;font-size:13px">${escape(detail(i))}</span></li>`)
  .join("\n")}
</ul>${s.items.length > MAX_PER_SECTION ? `\n<p style="color:#52514e;font-size:13px">… et ${s.items.length - MAX_PER_SECTION} autre(s) dans MAXreport.</p>` : ""}`,
  )
  .join("\n")}
<p style="color:#52514e;font-size:13px;margin-top:24px">Pour régler ou couper ces rappels : <a href="${escape(`${appUrl}/compte`)}">Mon compte</a>.</p>
</body></html>`;

  return { subject, text, html, count: items.length };
}
