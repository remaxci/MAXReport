// Liens envoyés par e-mail (modèles dans supabase/templates/) :
// /confirmer-acces?token_hash=…&type=invite|recovery.
// Le jeton n'est consommé qu'à l'envoi du formulaire (POST), jamais à
// l'ouverture du lien : un antivirus de messagerie qui visite les liens
// ne peut pas le griller avant la personne.

/**
 * Liens par e-mail en service : SMTP configuré dans Supabase et modèles de
 * supabase/templates/ en place. Variable serveur EMAIL_LINKS_ENABLED=true,
 * puis redéploiement. Sans elle, « Mot de passe oublié ? » est masqué et les
 * comptes se créent avec un mot de passe provisoire.
 */
export function emailLinksEnabled(): boolean {
  return process.env.EMAIL_LINKS_ENABLED === "true";
}

export type EmailLinkType = "invite" | "recovery";
export type EmailLink = { type: EmailLinkType; tokenHash: string };

// Empreinte du jeton (hexadécimal, préfixée « pkce_ » selon le parcours).
const TOKEN_HASH = /^[A-Za-z0-9_-]{16,128}$/;

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** Lien valide, ou null : type inconnu, jeton absent ou mal formé. */
export function parseEmailLink(type: unknown, tokenHash: unknown): EmailLink | null {
  const t = first(type);
  const hash = first(tokenHash);
  if (t !== "invite" && t !== "recovery") return null;
  if (typeof hash !== "string" || !TOKEN_HASH.test(hash)) return null;
  return { type: t, tokenHash: hash };
}
