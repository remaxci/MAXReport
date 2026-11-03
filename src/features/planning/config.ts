// Planification : valeurs fixes, miroir des contraintes de la base.

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Prévu",
  active: "En cours",
  on_hold: "En pause",
  done: "Terminé",
  cancelled: "Abandonné",
};

/** Champs cités dans la chronologie d'une tâche. */
export const TASK_FIELD_LABELS: Record<string, string> = {
  title: "titre",
  description: "description",
  project: "projet",
  milestone: "jalon",
  parent: "tâche principale",
  priority: "priorité",
  start_on: "début",
  progress: "avancement",
  estimate_hours: "estimation",
  links: "liens",
  custom: "informations complémentaires",
};
