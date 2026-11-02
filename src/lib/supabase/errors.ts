// Traduit une erreur Supabase en message affichable.
// Les exceptions levées par nos fonctions SQL sont déjà rédigées en français
// et sont reprises telles quelles ; les messages techniques de Postgres sont
// remplacés par un texte générique.

type DbError = { code?: string; message: string };

const UNIQUE_MESSAGES: Record<string, string> = {
  brands_code_key: "Ce code de marque est déjà utilisé.",
  brands_slug_key: "Cette adresse de marque est déjà utilisée.",
  memberships_user_brand_key: "Ce collaborateur a déjà un rôle dans cette marque.",
};

export function dbErrorMessage(error: DbError): string {
  const { code, message } = error;

  switch (code) {
    case "42501":
      return message.includes("row-level security") || message.startsWith("permission denied")
        ? "Action non autorisée."
        : message;
    case "23505": {
      const constraint = Object.keys(UNIQUE_MESSAGES).find((name) => message.includes(name));
      if (constraint) return UNIQUE_MESSAGES[constraint];
      return message.startsWith("duplicate key") ? "Cette valeur est déjà utilisée." : message;
    }
    case "23514":
      return message.includes("violates check constraint") ? "Valeur invalide." : message;
    case "23503":
      return "Cet élément est encore utilisé ailleurs et ne peut pas être supprimé.";
    case "P0001":
    case "P0002":
      return message;
    default:
      return "Une erreur est survenue. Réessayez.";
  }
}
