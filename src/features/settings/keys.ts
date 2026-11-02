/**
 * Clé technique figée, dérivée d'un libellé : « Relance prévue » → « relance_prevue ».
 * Format imposé par la base : ^[a-z][a-z0-9_]{1,40}$.
 */
export function toKey(label: string): string {
  let key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!/^[a-z]/.test(key)) key = `x_${key}`;
  key = key.slice(0, 41).replace(/_+$/, "");
  return key.length >= 2 ? key : `${key}_1`;
}

/** Évite une clé déjà prise en ajoutant un suffixe numérique. */
export function uniqueKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = toKey(label);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, 41 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
