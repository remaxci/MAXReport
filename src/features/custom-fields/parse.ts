import type { CustomValue, FieldDefinition } from "./types";

// Lecture et validation des champs personnalisés d'un formulaire.
// Reprend les règles de app.custom_values_errors (base de données), qui reste
// l'arbitre final : ici, on produit des messages clairs, champ par champ.

/** Nom du champ de formulaire pour une clé (et une partie, pour les montants). */
export function inputName(key: string, part?: "amount" | "currency"): string {
  return part ? `cf_${key}__${part}` : `cf_${key}`;
}

type FormReader = {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
};

export type ParseResult = {
  values: Record<string, CustomValue>;
  errors: Record<string, string>;
};

const CURRENCIES = ["XOF", "USD", "EUR"] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_FORMAT = /^https?:\/\/\S+$/;
const PHONE = /^[+0-9 ().-]{6,30}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « 1 250,5 » → 1250.5 ; renvoie null si ce n'est pas un nombre. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function isRealDate(raw: string): boolean {
  if (!DATE.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function text(form: FormReader, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseCustomFields(
  fields: readonly FieldDefinition[],
  form: FormReader,
  allowedUserIds: ReadonlySet<string> = new Set(),
): ParseResult {
  const values: Record<string, CustomValue> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!field.isActive) continue;
    const name = inputName(field.key);
    const { min, max, max_length: maxLength } = field.validation;
    const fail = (message: string) => {
      errors[name] = message;
    };

    let value: CustomValue | null = null;

    switch (field.type) {
      case "text":
      case "long_text":
      case "url":
      case "email":
      case "phone": {
        const raw = text(form, name);
        if (!raw) break;
        const limit = maxLength ?? (field.type === "long_text" ? 5000 : 500);
        if (raw.length > limit) fail(`${limit} caractères au maximum.`);
        else if (field.type === "email" && !EMAIL.test(raw)) fail("E-mail invalide.");
        else if (field.type === "url" && !URL_FORMAT.test(raw)) fail("L'adresse doit commencer par http:// ou https://.");
        else if (field.type === "phone" && !PHONE.test(raw)) fail("Numéro invalide.");
        else value = raw;
        break;
      }
      case "number": {
        const raw = text(form, name);
        if (!raw) break;
        const number = parseNumber(raw);
        if (number === null) fail("Nombre attendu.");
        else if (min !== undefined && number < min) fail(`Minimum : ${min}.`);
        else if (max !== undefined && number > max) fail(`Maximum : ${max}.`);
        else value = number;
        break;
      }
      case "money": {
        const raw = text(form, inputName(field.key, "amount"));
        if (!raw) break;
        const amount = parseNumber(raw);
        const currency = text(form, inputName(field.key, "currency"));
        if (amount === null) fail("Montant invalide.");
        else if (!(CURRENCIES as readonly string[]).includes(currency)) fail("Devise invalide.");
        else if (min !== undefined && amount < min) fail(`Minimum : ${min}.`);
        else if (max !== undefined && amount > max) fail(`Maximum : ${max}.`);
        else value = { amount, currency: currency as (typeof CURRENCIES)[number] };
        break;
      }
      case "date": {
        const raw = text(form, name);
        if (!raw) break;
        if (!isRealDate(raw)) fail("Date invalide.");
        else value = raw;
        break;
      }
      case "boolean": {
        // Une case décochée n'envoie rien : la valeur est alors « non ».
        value = form.get(name) === "on";
        break;
      }
      case "select": {
        const raw = text(form, name);
        if (!raw) break;
        if (!field.options.some((o) => o.value === raw && o.isActive)) fail("Choix invalide.");
        else value = raw;
        break;
      }
      case "multiselect": {
        const chosen = form
          .getAll(name)
          .filter((v): v is string => typeof v === "string" && v !== "");
        if (chosen.length === 0) break;
        if (!chosen.every((v) => field.options.some((o) => o.value === v && o.isActive))) {
          fail("Choix invalide.");
        } else value = [...new Set(chosen)];
        break;
      }
      case "user": {
        const raw = text(form, name);
        if (!raw) break;
        if (!allowedUserIds.has(raw)) fail("Collaborateur inconnu pour cette marque.");
        else value = raw;
        break;
      }
    }

    if (value !== null) {
      values[field.key] = value;
    } else if (field.required && !errors[name]) {
      errors[name] = "Champ obligatoire.";
    }
  }

  return { values, errors };
}
