// Valide qu'une URL est bien http(s) — bloque javascript:, data:, etc. (anti-XSS).
// Renvoie l'URL nettoyée si sûre, sinon une chaîne vide.
export function safeHttpUrl(value: string | undefined | null): string {
  if (!value) return "";
  const v = String(value).trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return v;
    return "";
  } catch {
    return "";
  }
}
