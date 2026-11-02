// Filtres des registres, lus depuis l'URL (?q=…&statut=…), et états de suivi.

export type RegisterFilters = {
  q?: string;
  status?: string;
  owner?: string;
  from?: string;
  to?: string;
  followUp?: "overdue" | "week";
  archived?: boolean;
  /** Fiche prospect : documents d'une seule entreprise (hors URL). */
  companyId?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

export function parseFilters(params: SearchParams): RegisterFilters {
  const filters: RegisterFilters = {};

  // Caractères retirés : ils ont un sens dans la syntaxe de filtre de l'API.
  const q = first(params.q)?.replace(/[,()%*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q) filters.q = q;

  const status = first(params.statut);
  if (status && UUID.test(status)) filters.status = status;

  const owner = first(params.commercial);
  if (owner && UUID.test(owner)) filters.owner = owner;

  const from = first(params.du);
  if (from && DATE.test(from)) filters.from = from;
  const to = first(params.au);
  if (to && DATE.test(to)) filters.to = to;

  const followUp = first(params.relance);
  if (followUp === "en_retard") filters.followUp = "overdue";
  if (followUp === "semaine") filters.followUp = "week";

  if (first(params.archives) === "1") filters.archived = true;

  return filters;
}

/** Remet les filtres sous forme de paramètres d'URL (liens d'export, pagination). */
export function filtersToQuery(filters: RegisterFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("statut", filters.status);
  if (filters.owner) params.set("commercial", filters.owner);
  if (filters.from) params.set("du", filters.from);
  if (filters.to) params.set("au", filters.to);
  if (filters.followUp === "overdue") params.set("relance", "en_retard");
  if (filters.followUp === "week") params.set("relance", "semaine");
  if (filters.archived) params.set("archives", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Les relances et l'expiration ne concernent que les documents encore en cours. */
const OPEN_CATEGORIES = new Set(["draft", "active"]);

export type FollowUpState = "overdue" | "today" | "soon" | null;

export function followUpState(
  followUpOn: string | null,
  statusCategory: string,
  today: string,
): FollowUpState {
  if (!followUpOn || !OPEN_CATEGORIES.has(statusCategory)) return null;
  if (followUpOn < today) return "overdue";
  if (followUpOn === today) return "today";
  const inAWeek = new Date(`${today}T00:00:00Z`);
  inAWeek.setUTCDate(inAWeek.getUTCDate() + 7);
  return followUpOn <= inAWeek.toISOString().slice(0, 10) ? "soon" : null;
}

/** Offre dont la date de validité est dépassée alors qu'elle est encore en cours. */
export function isExpired(validUntil: string | null, statusCategory: string, today: string): boolean {
  return validUntil !== null && validUntil < today && OPEN_CATEGORIES.has(statusCategory);
}
