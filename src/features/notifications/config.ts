import { timingSafeEqual } from "node:crypto";

// Réglages de l'envoi des récapitulatifs, lus dans l'environnement du serveur
// (jamais de préfixe NEXT_PUBLIC_). Tant qu'un réglage manque, rien n'est
// envoyé : l'application le dit, sans rien simuler.

export type SmtpSettings = { host: string; port: number; user: string; password: string; from: string };

export type NotificationsConfig =
  | { enabled: true; smtp: SmtpSettings; secretKey: string; cronSecret: string; appUrl: string }
  | { enabled: false; missing: string[] };

type Env = Readonly<Record<string, string | undefined>>;

const filled = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

/** Adresse publique de l'application : APP_URL, sinon le domaine de production fourni par Vercel. */
export function appUrl(env: Env): string | undefined {
  const explicit = filled(env.APP_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = filled(env.VERCEL_PROJECT_PRODUCTION_URL);
  return vercel ? `https://${vercel}` : undefined;
}

/**
 * Envoi actif seulement si NOTIFICATIONS_ENABLED=true et si tous les réglages
 * sont fournis. `missing` liste les noms des réglages absents (jamais leurs valeurs).
 */
export function notificationsConfig(env: Env): NotificationsConfig {
  const values = {
    NOTIFICATIONS_ENABLED: env.NOTIFICATIONS_ENABLED === "true" ? "true" : undefined,
    SMTP_HOST: filled(env.SMTP_HOST),
    SMTP_USER: filled(env.SMTP_USER),
    SMTP_PASSWORD: filled(env.SMTP_PASSWORD),
    SMTP_FROM: filled(env.SMTP_FROM),
    SUPABASE_SECRET_KEY: filled(env.SUPABASE_SECRET_KEY),
    CRON_SECRET: filled(env.CRON_SECRET) && env.CRON_SECRET!.trim().length >= 16 ? env.CRON_SECRET!.trim() : undefined,
    APP_URL: appUrl(env),
  };
  const port = Number(filled(env.SMTP_PORT) ?? "465");
  const missing = Object.entries(values)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) missing.push("SMTP_PORT");
  if (missing.length > 0) return { enabled: false, missing };
  return {
    enabled: true,
    smtp: { host: values.SMTP_HOST!, port, user: values.SMTP_USER!, password: values.SMTP_PASSWORD!, from: values.SMTP_FROM! },
    secretKey: values.SUPABASE_SECRET_KEY!,
    cronSecret: values.CRON_SECRET!,
    appUrl: values.APP_URL!,
  };
}

/** En-tête Authorization de la tâche planifiée : « Bearer <CRON_SECRET> », comparé en temps constant. */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
