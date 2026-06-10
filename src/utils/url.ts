// Valide qu'une URL est bien http(s) — bloque javascript:, data:, etc. (anti-XSS).
// Renvoie l'URL nettoyée si sûre, sinon une chaîne vide.
// Construit une URL absolue de partage vers une route interne (HashRouter).
// Ex: buildShareUrl("/map?event=foo") -> "https://site.tld/#/map?event=foo"
export function buildShareUrl(route: string): string {
  if (typeof window === "undefined") return route;
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${window.location.origin}${window.location.pathname}#${path}`;
}

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
