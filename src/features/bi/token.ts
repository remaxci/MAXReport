import { createHash, randomBytes } from "node:crypto";

// Clés d'accès BI : 32 octets aléatoires (256 bits), montrées une seule fois
// à la création. La base n'en garde que l'empreinte SHA-256 et les quatre
// derniers caractères (pour les reconnaître dans la liste).

export const TOKEN_PREFIX = "mxbi_";

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** Empreinte hexadécimale, identique à encode(digest(token, 'sha256'), 'hex') en base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenHint(token: string): string {
  return token.slice(-4);
}

/** Clé lue dans l'en-tête « Authorization: Bearer … » ; jamais dans l'adresse. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  const token = match?.[1];
  return token && token.length >= 20 && token.length <= 200 ? token : null;
}
