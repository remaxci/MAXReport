// Kanban : ordre des cartes dans une colonne (statut) et déplacement d'une carte.
// Les positions sont des entiers espacés : insérer une carte ne réécrit en
// général qu'elle-même ; on ne renumérote la colonne que si l'écart manque.

export const POSITION_STEP = 1024;

export type CardPosition = { id: string; position: number };

/** Ordre d'affichage : position, puis échéance (vides en dernier), puis titre. */
export function compareCards(
  a: { position: number; dueOn: string | null; title: string },
  b: { position: number; dueOn: string | null; title: string },
): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.title.localeCompare(b.title, "fr");
}

/**
 * Positions à écrire pour placer `moving` dans `column` (déjà triée, sans
 * `moving`), juste avant `beforeId`, ou en fin de colonne si `beforeId` est
 * null ou introuvable.
 */
export function planMove(column: readonly CardPosition[], moving: string, beforeId: string | null): CardPosition[] {
  const others = column.filter((c) => c.id !== moving);
  const index = beforeId === null ? -1 : others.findIndex((c) => c.id === beforeId);
  const at = index === -1 ? others.length : index;
  const prev = at > 0 ? others[at - 1].position : null;
  const next = at < others.length ? others[at].position : null;

  if (prev === null && next === null) return [{ id: moving, position: 0 }];
  if (next === null) return [{ id: moving, position: prev! + POSITION_STEP }];
  if (prev === null) return [{ id: moving, position: next - POSITION_STEP }];
  if (next - prev >= 2) return [{ id: moving, position: Math.floor((prev + next) / 2) }];

  // Plus d'écart : la colonne entière est renumérotée.
  const order = [...others.slice(0, at).map((c) => c.id), moving, ...others.slice(at).map((c) => c.id)];
  const current = new Map(column.map((c) => [c.id, c.position]));
  return order
    .map((id, i) => ({ id, position: (i + 1) * POSITION_STEP }))
    .filter((c) => c.id === moving || current.get(c.id) !== c.position);
}
