// Valide qu'une URL est bien http(s) — bloque javascript:, data:, etc. (anti-XSS).
// Renvoie l'URL nettoyée si sûre, sinon une chaîne vide.
// Construit une URL absolue de partage vers une route interne (HashRouter).
// Ex: buildShareUrl("/map?event=foo") -> "https://site.tld/#/map?event=foo"
export function buildShareUrl(route: string): string {
  if (typeof window === "undefined") return route;
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${window.location.origin}${window.location.pathname}#${path}`;
}

// Construit une URL passant par l'API Vercel pour générer les balises Open Graph
// Utile pour afficher la photo de l'artiste/événement lors du partage sur les réseaux sociaux
export function buildApiShareUrl(route: string, title?: string, desc?: string, img?: string): string {
  if (typeof window === "undefined") return route;
  
  const baseUrl = window.location.origin;
  const path = route.startsWith("/") ? route : `/${route}`;
  
  const apiUrl = new URL(`${baseUrl}/api/share`);
  if (title) apiUrl.searchParams.set("title", title);
  if (desc) apiUrl.searchParams.set("desc", desc);
  if (img) apiUrl.searchParams.set("img", img);
  apiUrl.searchParams.set("redirect", path);
  
  return apiUrl.toString();
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
