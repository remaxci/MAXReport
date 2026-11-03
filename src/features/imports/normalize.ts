import { CURRENCIES, type Currency } from "@/lib/metrics/currency";
import { METRICS } from "@/lib/metrics/actuals";
import { formatDate } from "@/lib/format";
import { PERIOD_KINDS, periodRange, rangeLabel, type PeriodKind } from "@/lib/periods";
import { matchMetric, TARGETS, type ImportTarget, type Mapping, type TargetField } from "./targets";
import { cellText, isBlank, normalizeKey, parseDateValue, parseNumberValue, type Cell, type DateFormat, type NumberFormat } from "./values";

// Vérification d'un lot ligne par ligne : erreurs, doublons (avec la base et
// au sein du fichier) et enregistrements prêts pour commit_import.

export type ImportOptions = {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  /** Sans colonne « fin » : période déduite de la date de début. */
  periodKind: "day" | PeriodKind;
  /** Objet suivi quand le fichier n'a pas de colonne pour le désigner. */
  defaultParentId?: string;
  /** Devise du chiffre d'affaires sans colonne « devise ». */
  currency?: Currency;
};

export const DEFAULT_OPTIONS: ImportOptions = { dateFormat: "dmy", numberFormat: "fr", periodKind: "day" };

export function readOptions(raw: unknown): ImportOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    dateFormat: o.dateFormat === "mdy" ? "mdy" : "dmy",
    numberFormat: o.numberFormat === "en" ? "en" : "fr",
    periodKind: (PERIOD_KINDS as readonly string[]).includes(String(o.periodKind)) ? (o.periodKind as PeriodKind) : "day",
    defaultParentId: typeof o.defaultParentId === "string" && o.defaultParentId ? o.defaultParentId : undefined,
    currency: (CURRENCIES as readonly string[]).includes(String(o.currency)) ? (o.currency as Currency) : undefined,
  };
}

export type Period = { start: string; end: string };

/** Données de la marque utiles à la vérification (lues sous RLS). */
export type ImportContext = {
  /** Comptes, campagnes ou sites, avec les clés qui les désignent (nom, identifiant, adresse…). */
  parents?: { id: string; label: string; keys: string[] }[];
  /** Périodes déjà relevées, par objet suivi. */
  existingPeriods?: (Period & { parentId: string })[];
  /** Noms de prospects existants (clés normalisées). */
  existingNames?: ReadonlySet<string>;
  /** Choix actifs des listes (secteurs, origines). */
  options?: Record<string, { value: string; label: string }[]>;
  members?: { id: string; label: string; keys: string[] }[];
  existingHistorical?: (Period & { metric: string; userId: string | null; currency: string | null })[];
  /** Dépenses déjà saisies (non archivées) : ligne, date, montant, devise, fournisseur et référence. */
  existingExpenses?: { lineId: string; date: string; amount: number; currency: string; supplier: string; ref: string | null }[];
};

export type LineStatus = "ok" | "duplicate" | "error";
export type LineResult = {
  line: number;
  status: LineStatus;
  message: string | null;
  summary: string;
  record: Record<string, unknown> | null;
};

export type BatchCheck = { lines: LineResult[]; counts: Record<LineStatus, number> };

const overlaps = (a: Period, b: Period) => a.start <= b.end && b.start <= a.end;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DAYS = 366;

class LineError extends Error {}
const fail = (message: string): never => {
  throw new LineError(message);
};

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

export function checkBatch(
  target: ImportTarget,
  rows: readonly Cell[][],
  mapping: Mapping,
  options: ImportOptions,
  context: ImportContext,
  firstLine = 2,
): BatchCheck {
  const fields = TARGETS[target].fields;
  const accepted: { line: number; key: string; period?: Period }[] = [];
  const lines: LineResult[] = [];

  rows.forEach((row, index) => {
    const line = firstLine + index;
    if (row.every((cell) => isBlank(cell))) return;
    const cell = (key: string): Cell => (mapping[key] === undefined ? null : (row[mapping[key]] ?? null));

    try {
      const { record, summary, dedupKey, period, existing } = readLine(target, fields, cell, options, context);
      if (existing) {
        lines.push({ line, status: "duplicate", message: existing, summary, record: null });
        return;
      }
      const twin = accepted.find((a) => a.key === dedupKey && (!a.period || !period || overlaps(a.period, period)));
      if (twin) {
        const message = period ? `Chevauche la ligne ${twin.line} du fichier.` : `Déjà présent ligne ${twin.line} du fichier.`;
        lines.push({ line, status: "duplicate", message, summary, record: null });
        return;
      }
      accepted.push({ line, key: dedupKey, period });
      lines.push({ line, status: "ok", message: null, summary, record });
    } catch (error) {
      if (!(error instanceof LineError)) throw error;
      lines.push({ line, status: "error", message: error.message, summary: summaryOf(target, fields, cell), record: null });
    }
  });

  const counts = { ok: 0, duplicate: 0, error: 0 };
  lines.forEach((l) => counts[l.status]++);
  return { lines, counts };
}

function summaryOf(target: ImportTarget, fields: TargetField[], cell: (key: string) => Cell): string {
  const first = fields.find((f) => f.kind === "parent" || f.key === "name" || f.key === "metric_key");
  return [first && cellText(cell(first.key)), cellText(cell("period_start"))].filter(Boolean).join(" · ") || "—";
}

type Read = {
  record: Record<string, unknown>;
  summary: string;
  dedupKey: string;
  period?: Period;
  /** Motif si la ligne existe déjà en base. */
  existing: string | null;
};

function readLine(
  target: ImportTarget,
  fields: TargetField[],
  cell: (key: string) => Cell,
  options: ImportOptions,
  context: ImportContext,
): Read {
  switch (target) {
    case "social_snapshots":
    case "campaign_snapshots":
    case "website_snapshots":
      return readSnapshot(target, fields, cell, options, context);
    case "companies":
      return readCompany(fields, cell, options, context);
    case "historical_metrics":
      return readHistorical(cell, options, context);
    case "expenses":
      return readExpense(fields, cell, options, context);
  }
}

function readPeriod(cell: (key: string) => Cell, options: ImportOptions): Period {
  const rawStart = cell("period_start");
  if (isBlank(rawStart)) fail("Date de début manquante.");
  const start = parseDateValue(rawStart, options.dateFormat) ?? fail(`Date de début illisible : « ${cellText(rawStart)} ».`);
  const rawEnd = cell("period_end");
  if (!isBlank(rawEnd)) {
    const end = parseDateValue(rawEnd, options.dateFormat) ?? fail(`Date de fin illisible : « ${cellText(rawEnd)} ».`);
    if (end < start) fail("La date de fin précède la date de début.");
    return { start, end };
  }
  return options.periodKind === "day" ? { start, end: start } : periodRange(options.periodKind, start);
}

function readMeasure(field: TargetField, raw: Cell, options: ImportOptions): number | null {
  if (isBlank(raw)) return null;
  const value = parseNumberValue(raw, options.numberFormat) ?? fail(`${field.label} : nombre attendu (« ${cellText(raw)} »).`);
  if (value < 0) fail(`${field.label} : valeur positive attendue.`);
  if (value > 1e12) fail(`${field.label} : valeur trop grande.`);
  if (field.kind === "count") {
    if (!Number.isInteger(value)) fail(`${field.label} : nombre entier attendu.`);
    return value;
  }
  return Math.round(value * 100) / 100;
}

function readText(field: TargetField, raw: Cell): string | null {
  if (isBlank(raw)) return null;
  const text = cellText(raw);
  if (field.max && text.length > field.max) fail(`${field.label} : ${field.max} caractères au maximum.`);
  return text;
}

function readSnapshot(
  target: "social_snapshots" | "campaign_snapshots" | "website_snapshots",
  fields: TargetField[],
  cell: (key: string) => Cell,
  options: ImportOptions,
  context: ImportContext,
): Read {
  const parents = context.parents ?? [];
  const rawParent = cell("parent");
  let parent = parents.find((p) => p.id === options.defaultParentId);
  if (!isBlank(rawParent)) {
    const key = normalizeKey(cellText(rawParent));
    parent = parents.find((p) => p.keys.includes(key)) ?? fail(`Introuvable dans MAXreport : « ${cellText(rawParent)} ».`);
  }
  if (!parent) fail("Objet suivi non précisé : choisissez-le dans les options ou associez une colonne.");
  const owner = parent!;

  const period = readPeriod(cell, options);
  if (daysBetween(period.start, period.end) > MAX_DAYS) fail("Un relevé couvre un an au plus.");

  const values: Record<string, number | null> = {};
  for (const field of fields.filter((f) => f.kind === "count" || f.kind === "money")) {
    values[field.key] = readMeasure(field, cell(field.key), options);
  }
  if (Object.values(values).every((v) => v === null)) fail("Aucune mesure renseignée.");
  if (target === "website_snapshots" && values.sessions != null) {
    const channels = Object.entries(values)
      .filter(([key]) => key.startsWith("sessions_"))
      .reduce((sum, [, v]) => sum + (v ?? 0), 0);
    if (channels > values.sessions) fail("La ventilation par canal dépasse le total des sessions.");
  }
  const comments = readText(fields.find((f) => f.key === "comments")!, cell("comments"));

  const parentColumn = { social_snapshots: "account_id", campaign_snapshots: "campaign_id", website_snapshots: "website_id" }[target];
  const existing = (context.existingPeriods ?? []).some((p) => p.parentId === owner.id && overlaps(p, period))
    ? "Déjà en base : un relevé couvre tout ou partie de cette période."
    : null;
  return {
    record: { [parentColumn]: owner.id, period_start: period.start, period_end: period.end, ...values, comments },
    summary: `${owner.label} · ${rangeLabel(period.start, period.end)}`,
    dedupKey: owner.id,
    period,
    existing,
  };
}

function readCompany(fields: TargetField[], cell: (key: string) => Cell, options: ImportOptions, context: ImportContext): Read {
  const field = (key: string) => fields.find((f) => f.key === key)!;
  const name = readText(field("name"), cell("name")) ?? fail("Nom de l'entreprise manquant.");

  const option = (key: "sector" | "source") => {
    const raw = cell(key);
    if (isBlank(raw)) return null;
    const wanted = normalizeKey(cellText(raw));
    const items = context.options?.[field(key).list!] ?? [];
    const item = items.find((i) => normalizeKey(i.label) === wanted || normalizeKey(i.value) === wanted);
    return item?.value ?? fail(`${field(key).label} inconnu(e) : « ${cellText(raw)} » (à ajouter dans Paramètres › Listes).`);
  };

  const email = readText(field("email"), cell("email"));
  if (email && !EMAIL.test(email)) fail(`E-mail invalide : « ${email} ».`);
  let website = readText(field("website"), cell("website"));
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website && website.length > 300) fail("Site web : 300 caractères au maximum.");
  const rawFollowUp = cell("next_follow_up_on");
  const nextFollowUp = isBlank(rawFollowUp)
    ? null
    : (parseDateValue(rawFollowUp, options.dateFormat) ?? fail(`Date de relance illisible : « ${cellText(rawFollowUp)} ».`));

  const key = normalizeKey(name);
  return {
    record: {
      name,
      sector: option("sector"),
      source: option("source"),
      city: readText(field("city"), cell("city")),
      country: readText(field("country"), cell("country")),
      phone: readText(field("phone"), cell("phone")),
      email,
      website,
      next_follow_up_on: nextFollowUp,
    },
    summary: nextFollowUp ? `${name} · relance ${formatDate(nextFollowUp)}` : name,
    dedupKey: key,
    existing: context.existingNames?.has(key) ? "Déjà dans l'annuaire des prospects." : null,
  };
}

function readHistorical(cell: (key: string) => Cell, options: ImportOptions, context: ImportContext): Read {
  const rawMetric = cell("metric_key");
  if (isBlank(rawMetric)) fail("Indicateur manquant.");
  const metric = matchMetric(cellText(rawMetric)) ?? fail(`Indicateur inconnu : « ${cellText(rawMetric)} ».`);

  const rawMember = cell("member");
  let member: { id: string; label: string } | null = null;
  if (!isBlank(rawMember)) {
    const key = normalizeKey(cellText(rawMember));
    member = (context.members ?? []).find((m) => m.keys.includes(key)) ?? fail(`Collaborateur introuvable : « ${cellText(rawMember)} ».`);
  }

  const period = readPeriod(cell, options);
  const money = METRICS[metric].money === true;
  const value = readMeasure(
    { key: "value", label: "Valeur", kind: money ? "money" : "count", aliases: [] },
    cell("value"),
    options,
  );
  if (value === null) fail("Valeur manquante.");

  let currency: string | null = null;
  if (money) {
    const raw = cell("currency");
    currency = isBlank(raw) ? (options.currency ?? null) : cellText(raw).toUpperCase();
    if (!currency) fail("Devise manquante pour le chiffre d'affaires.");
    if (!(CURRENCIES as readonly string[]).includes(currency!)) fail(`Devise non prise en charge : « ${currency} » (XOF, EUR ou USD).`);
  }
  const comments = readText({ key: "comments", label: "Commentaires", kind: "text", max: 2000, aliases: [] }, cell("comments"));

  const userId = member?.id ?? null;
  const existing = (context.existingHistorical ?? []).some(
    (h) => h.metric === metric && h.userId === userId && h.currency === currency && overlaps(h, period),
  )
    ? "Déjà en base : un chiffre couvre tout ou partie de cette période."
    : null;
  return {
    record: { user_id: userId, metric_key: metric, period_start: period.start, period_end: period.end, value, currency, comments },
    summary: `${METRICS[metric].label} · ${member?.label ?? "Équipe"} · ${rangeLabel(period.start, period.end)}`,
    dedupKey: `${metric}|${userId ?? ""}|${currency ?? ""}`,
    period,
    existing,
  };
}

const PAID = new Set(["payee", "paye", "paid", "reglee", "regle", "oui", "yes", "solde", "soldee"]);
const COMMITTED = new Set(["engagee", "engage", "committed", "commandee", "commande", "non", "no", "apayer", "enattente"]);

function readExpense(fields: TargetField[], cell: (key: string) => Cell, options: ImportOptions, context: ImportContext): Read {
  const field = (key: string) => fields.find((f) => f.key === key)!;
  const lines = context.parents ?? [];
  const rawLine = cell("parent");
  let line = lines.find((l) => l.id === options.defaultParentId);
  if (!isBlank(rawLine)) {
    const key = normalizeKey(cellText(rawLine));
    line = lines.find((l) => l.keys.includes(key)) ?? fail(`Ligne budgétaire introuvable : « ${cellText(rawLine)} ».`);
  }
  if (!line) fail("Ligne budgétaire non précisée : choisissez-la dans les options ou associez une colonne.");
  const owner = line!;

  const rawDate = cell("expense_date");
  if (isBlank(rawDate)) fail("Date manquante.");
  const date = parseDateValue(rawDate, options.dateFormat) ?? fail(`Date illisible : « ${cellText(rawDate)} ».`);
  const description = readText(field("description"), cell("description")) ?? fail("Description manquante.");
  const supplier = readText(field("supplier"), cell("supplier"));
  const amount = readMeasure(field("amount"), cell("amount"), options) ?? fail("Montant manquant.");
  if (amount === 0) fail("Montant : supérieur à 0 attendu.");

  const rawCurrency = cell("currency");
  const currency = isBlank(rawCurrency) ? (options.currency ?? null) : cellText(rawCurrency).toUpperCase();
  if (!currency) fail("Devise manquante.");
  if (!(CURRENCIES as readonly string[]).includes(currency!)) fail(`Devise non prise en charge : « ${currency} » (XOF, EUR ou USD).`);

  const rawStatus = cell("status");
  const statusKey = isBlank(rawStatus) ? "" : normalizeKey(cellText(rawStatus));
  if (statusKey && !PAID.has(statusKey) && !COMMITTED.has(statusKey)) fail(`État inconnu : « ${cellText(rawStatus)} » (engagée ou payée).`);
  const rawPaidOn = cell("paid_on");
  const paidOn = isBlank(rawPaidOn)
    ? null
    : (parseDateValue(rawPaidOn, options.dateFormat) ?? fail(`Date de paiement illisible : « ${cellText(rawPaidOn)} ».`));
  const status = PAID.has(statusKey) || (!statusKey && paidOn) ? "paid" : "committed";
  const ref = readText(field("external_ref"), cell("external_ref"));
  const comments = readText(field("comments"), cell("comments"));

  const supplierKey = normalizeKey(supplier ?? "");
  const existing = (context.existingExpenses ?? []).find(
    (e) =>
      (ref !== null && e.ref === ref && e.supplier === supplierKey) ||
      (e.lineId === owner.id && e.date === date && e.amount === amount && e.currency === currency),
  )
    ? "Déjà en base : même facture, ou même ligne, date et montant."
    : null;
  return {
    record: {
      budget_line_id: owner.id,
      campaign_id: null,
      supplier,
      description,
      expense_date: date,
      amount,
      currency,
      status,
      paid_on: status === "paid" ? (paidOn ?? date) : null,
      external_ref: ref,
      comments,
    },
    summary: `${owner.label} · ${description} · ${formatDate(date)}`,
    dedupKey: ref !== null ? `ref|${supplierKey}|${ref}` : `same|${owner.id}|${date}|${amount}|${currency}`,
    existing,
  };
}
