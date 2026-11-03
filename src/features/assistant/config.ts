// Réglages de l'assistant IA, lus dans l'environnement du serveur (jamais de
// préfixe NEXT_PUBLIC_). Sans clé d'API, l'assistant n'est pas en service :
// la page le dit, rien n'est simulé.

/** Modèle Claude utilisé par l'assistant. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

/** Questions par personne et par jour, par défaut. */
export const DEFAULT_DAILY_LIMIT = 50;

type Env = Readonly<Record<string, string | undefined>>;

export type AssistantConfig = { enabled: true; apiKey: string; dailyLimit: number } | { enabled: false; dailyLimit: number };

/** ASSISTANT_DAILY_LIMIT : entier de 1 à 1000, sinon la valeur par défaut. */
export function dailyLimit(env: Env): number {
  const value = Number(env.ASSISTANT_DAILY_LIMIT);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : DEFAULT_DAILY_LIMIT;
}

export function assistantConfig(env: Env): AssistantConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  return apiKey ? { enabled: true, apiKey, dailyLimit: dailyLimit(env) } : { enabled: false, dailyLimit: dailyLimit(env) };
}

/** Début du jour (UTC, donc heure d'Abidjan) : point de départ du quota quotidien. */
export function startOfDay(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00Z`;
}
