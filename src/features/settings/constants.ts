// Libellés des natures fixes utilisées par le paramétrage.

export const STATUS_ENTITIES = ["company", "offer", "memo"] as const;
export type StatusEntity = (typeof STATUS_ENTITIES)[number];

export const STATUS_ENTITY_LABELS: Record<StatusEntity, string> = {
  company: "Prospects",
  offer: "Offres",
  memo: "Mémos stratégiques",
};

export const STATUS_CATEGORIES = ["draft", "active", "success", "failure", "closed"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Les indicateurs s'appuient sur ces catégories, jamais sur les libellés. */
export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  draft: "Brouillon",
  active: "En cours",
  success: "Succès",
  failure: "Échec",
  closed: "Clôturé",
};

export const STAGE_CATEGORY_LABELS: Record<string, string> = {
  open: "En cours",
  won: "Gagnée",
  lost: "Perdue",
};

/** Tables dont l'ordre d'affichage est réglable (voir public.reorder_config). */
export const REORDERABLE_TABLES = [
  "option_items",
  "statuses",
  "pipeline_stages",
  "custom_field_definitions",
] as const;
export type ReorderableTable = (typeof REORDERABLE_TABLES)[number];
