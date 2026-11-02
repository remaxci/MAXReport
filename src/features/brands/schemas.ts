import { z } from "zod";
import { CURRENCIES } from "@/lib/metrics/currency";

const name = z
  .string()
  .trim()
  .min(1, "Le nom est obligatoire.")
  .max(120, "120 caractères au maximum.");

const primaryColor = z
  .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide.")])
  .transform((value) => value || null);

const reportingCurrency = z.enum(CURRENCIES, { error: "Devise invalide." });

export const brandCreateSchema = z.object({
  name,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "2 à 10 lettres ou chiffres, sans espace."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(40, "40 caractères au maximum.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets uniquement."),
  primaryColor,
  reportingCurrency,
});

export const brandUpdateSchema = z.object({ name, primaryColor, reportingCurrency });

/** Adresse proposée à partir du nom : « RE/MAX Côte d'Ivoire » → « re-max-cote-d-ivoire ». */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}
