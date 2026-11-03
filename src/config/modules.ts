// Miroir de la table `public.modules` (migrations Supabase).
export const MODULE_KEYS = [
  "social",
  "campaigns",
  "websites",
  "activities",
  "crm",
  "offers",
  "memos",
  "contracts",
  "objectives",
  "budgets",
  "reports",
  "imports",
  "planning",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
