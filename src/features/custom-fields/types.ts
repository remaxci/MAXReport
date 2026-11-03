// Champs personnalisés : miroir des contraintes de `custom_field_definitions`.

export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "money",
  "date",
  "boolean",
  "select",
  "multiselect",
  "user",
  "url",
  "email",
  "phone",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texte court",
  long_text: "Texte long",
  number: "Nombre",
  money: "Montant",
  date: "Date",
  boolean: "Oui / non",
  select: "Liste (un choix)",
  multiselect: "Liste (plusieurs choix)",
  user: "Collaborateur",
  url: "Adresse web",
  email: "E-mail",
  phone: "Téléphone",
};

export const FIELD_ENTITIES = [
  "company",
  "contact",
  "opportunity",
  "offer",
  "memo",
  "contract",
  "weekly_report",
  "campaign",
  "expense",
  "project",
  "task",
] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

export const FIELD_ENTITY_LABELS: Record<FieldEntity, string> = {
  company: "Prospects",
  contact: "Contacts",
  opportunity: "Opportunités",
  offer: "Offres",
  memo: "Mémos stratégiques",
  contract: "Contrats",
  weekly_report: "Activités hebdomadaires",
  campaign: "Campagnes",
  expense: "Dépenses",
  project: "Projets",
  task: "Tâches",
};

export type FieldOption = { value: string; label: string; isActive: boolean };

export type FieldDefinition = {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: FieldType;
  required: boolean;
  isActive: boolean;
  validation: { min?: number; max?: number; max_length?: number };
  /** Choix de la liste associée (types select et multiselect). */
  options: FieldOption[];
};

export type MoneyValue = { amount: number; currency: "XOF" | "USD" | "EUR" };
export type CustomValue = string | number | boolean | string[] | MoneyValue;
