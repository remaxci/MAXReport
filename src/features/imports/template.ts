import ExcelJS from "exceljs";
import { METRIC_KEYS, METRICS } from "@/lib/metrics/actuals";
import { CURRENCIES } from "@/lib/metrics/currency";
import { TARGETS, type ImportTarget, type TargetField } from "./targets";

// Modèle Excel d'un import : un onglet à remplir dont les en-têtes sont les
// libellés des champs (la correspondance des colonnes se fait seule), un
// onglet d'aide, et un onglet masqué des listes de la marque pour les choix
// déroulants. Aucune ligne d'exemple : rien ne peut être importé par mégarde.

/** Valeurs acceptées propres à la marque, lues sous les droits de l'utilisateur. */
export type TemplateLists = {
  /** Comptes, campagnes, sites ou lignes budgétaires. */
  parents?: string[];
  /** Choix des listes de la marque (secteurs, origines), par clé de liste. */
  options?: Record<string, string[]>;
  /** Collaborateurs de la marque. */
  members?: string[];
};

export const TEMPLATE_ROWS = 1000;

// Validation posée sur une plage entière (sans créer de lignes vides) : API
// d'exceljs que ses déclarations de types n'exposent pas.
type RangeValidations = { dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void } };
const STATUS_CHOICES = ["Engagée", "Payée"];

const PARENT_HELP: Partial<Record<ImportTarget, string>> = {
  social_snapshots: "Nom du compte, tel qu'il figure dans MAXreport (ou son identifiant @, ou son adresse).",
  campaign_snapshots: "Nom de la campagne dans MAXreport, ou sa référence sur la plateforme.",
  website_snapshots: "Nom du site dans MAXreport, ou son adresse.",
  expenses: "Libellé de la ligne budgétaire (« Budget › Ligne » ou le libellé seul).",
};

/** Choix proposés dans la colonne, ou null pour une saisie libre. */
function choicesFor(target: ImportTarget, field: TargetField, lists: TemplateLists): string[] | null {
  switch (field.kind) {
    case "parent":
      return lists.parents ?? [];
    case "option":
      return lists.options?.[field.list!] ?? [];
    case "member":
      return lists.members ?? [];
    case "metric":
      return METRIC_KEYS.map((key) => METRICS[key].label);
    case "currency":
      return [...CURRENCIES];
    default:
      return target === "expenses" && field.key === "status" ? STATUS_CHOICES : null;
  }
}

function fieldHelp(target: ImportTarget, field: TargetField, choices: string[] | null): string {
  const limit = field.max ? ` ${field.max} caractères au maximum.` : "";
  switch (field.kind) {
    case "parent": {
      const base = PARENT_HELP[target] ?? "";
      return choices?.length
        ? `${base} Choix dans la liste.`
        : `${base} Aucun pour l'instant : créez-les dans MAXreport avant d'importer, ou choisissez-le à l'import.`;
    }
    case "date":
      return "Date au format JJ/MM/AAAA.";
    case "count":
      return "Nombre entier. Vide si la valeur n'est pas connue (jamais 0 par défaut).";
    case "money":
      return field.key === "amount" ? "Montant, sans le symbole de la devise." : "Montant dans la devise de la campagne. Vide si inconnu.";
    case "number":
      return "Nombre. Pour le chiffre d'affaires, renseignez aussi la devise.";
    case "email":
      return `Adresse e-mail.${limit}`;
    case "url":
      return `Adresse du site (https:// ajouté si absent).${limit}`;
    case "option":
      return choices?.length
        ? "Choix dans la liste de la marque (Paramètres › Listes)."
        : "Aucun choix dans la liste de la marque : ajoutez-les dans Paramètres › Listes.";
    case "member":
      return "Collaborateur de la marque. Vide : chiffre de toute l'équipe.";
    case "metric":
      return "Indicateur, choisi dans la liste.";
    case "currency":
      return field.key === "currency" && target === "historical_metrics"
        ? "XOF, EUR ou USD : obligatoire pour le chiffre d'affaires, vide pour les autres indicateurs."
        : "XOF, EUR ou USD. Vide : devise choisie à l'import.";
    default:
      if (target === "expenses" && field.key === "status") return "Engagée ou Payée. Vide : payée si une date de paiement est saisie, sinon engagée.";
      return `Texte libre.${limit}`;
  }
}

function numberFormat(field: TargetField): string | undefined {
  if (field.kind === "date") return "dd/mm/yyyy";
  if (field.kind === "count") return "0";
  if (field.kind === "money" || field.kind === "number") return "#,##0.##";
  return undefined;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function buildTemplate(target: ImportTarget, lists: TemplateLists): ExcelJS.Workbook {
  const config = TARGETS[target];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAXreport";

  // L'import lit le premier onglet qui contient des lignes : celui-ci.
  const data = workbook.addWorksheet("À remplir");
  const help = workbook.addWorksheet("Aide");
  const listSheet = workbook.addWorksheet("Listes", { state: "hidden" });

  const fields = config.fields;
  const choices = fields.map((field) => choicesFor(target, field, lists));

  data.columns = fields.map((field) => ({
    header: field.label,
    key: field.key,
    width: Math.max(14, Math.min(40, field.label.length + 4)),
    style: numberFormat(field) ? { numFmt: numberFormat(field) } : {},
  }));
  const header = data.getRow(1);
  header.font = { bold: true };
  fields.forEach((field, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.required ? "FFFDE68A" : "FFE5E7EB" },
    };
    cell.note = `${field.required ? "Obligatoire. " : ""}${fieldHelp(target, field, choices[i])}`;
  });
  data.views = [{ state: "frozen", ySplit: 1 }];

  // Listes déroulantes : avertissement (et non blocage) sur une valeur hors liste.
  let listColumn = 0;
  fields.forEach((field, i) => {
    const values = choices[i];
    if (!values || values.length === 0) return;
    const letter = columnLetter(listColumn++);
    listSheet.getCell(`${letter}1`).value = field.label;
    values.forEach((value, row) => {
      listSheet.getCell(`${letter}${row + 2}`).value = value;
    });
    const range = `Listes!$${letter}$2:$${letter}$${values.length + 1}`;
    const column = columnLetter(i);
    (data as ExcelJS.Worksheet & RangeValidations).dataValidations.add(`${column}2:${column}${TEMPLATE_ROWS + 1}`, {
      type: "list",
      allowBlank: true,
      formulae: [range],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: field.label,
      error: "Valeur absente de la liste : elle sera refusée à l'import si MAXreport ne la reconnaît pas.",
    });
  });

  help.columns = [
    { header: "Colonne", key: "label", width: 32 },
    { header: "Obligatoire", key: "required", width: 12 },
    { header: "À saisir", key: "help", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  fields.forEach((field, i) => {
    help.addRow({ label: field.label, required: field.required ? "Oui" : "", help: fieldHelp(target, field, choices[i]) });
  });
  help.addRow({});
  const notes = [
    config.description,
    "Remplissez l'onglet « À remplir », une ligne par enregistrement, sans modifier la ligne d'en-têtes.",
    "Une colonne inutile peut être supprimée ; l'ordre des colonnes n'a pas d'importance.",
    "Une cellule vide reste vide : MAXreport ne la remplace jamais par 0.",
    "À l'import, le fichier est vérifié ligne par ligne avant tout enregistrement : erreurs et doublons sont signalés, et le lot s'annule d'un bloc.",
  ];
  if (config.marketing) {
    notes.push("Sans colonne « Fin de période », la durée de chaque période (jour, semaine, mois…) se choisit à l'import.");
  }
  notes.forEach((note) => help.addRow({ label: note }));
  help.getColumn("help").alignment = { wrapText: true, vertical: "top" };

  return workbook;
}
