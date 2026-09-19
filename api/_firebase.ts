// Accès RTDB côté serveur via le Database Secret legacy (?auth=).
// Permet de verrouiller les règles RTDB en écriture (.write:false) : seules les
// fonctions /api peuvent écrire, en contournant les règles grâce au secret admin.

const FIREBASE_DB_URL =
  "https://collectif-ile-feydeau----app-default-rtdb.europe-west1.firebasedatabase.app";

function authQuery(): string {
  const s = process.env.FIREBASE_DB_SECRET;
  return s ? `?auth=${encodeURIComponent(s)}` : "";
}

export async function rtdbGet<T = unknown>(path: string): Promise<T | null> {
  // Pas d'option `cache` : le fetch Node (undici) n'implémente pas le cache HTTP
  // (option no-op) et les types Node ne la connaissent pas.
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function rtdbPut(path: string, value: unknown): Promise<void> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`RTDB PUT ${path} failed: ${res.status}`);
}

export async function rtdbPatch(path: string, value: unknown): Promise<void> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`RTDB PATCH ${path} failed: ${res.status}`);
}

// ── Écriture conditionnelle (compare-and-set) ────────────────────────────────
// RTDB expose, en REST, un ETag par nœud : on le demande avec l'en-tête
// `X-Firebase-ETag`, et un PUT porteur de `if-match` n'est appliqué que si le
// nœud n'a pas bougé entre-temps (sinon 412). C'est la seule primitive
// atomique disponible sans le SDK Admin, et elle suffit à bâtir un verrou.

export async function rtdbGetWithEtag<T = unknown>(
  path: string
): Promise<{ value: T | null; etag: string }> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, {
    headers: { "X-Firebase-ETag": "true" },
  });
  if (!res.ok) return { value: null, etag: "" };
  const value = (await res.json()) as T | null;
  return { value, etag: res.headers.get("ETag") ?? "" };
}

/** `true` si l'écriture a été appliquée, `false` si le nœud avait changé (412). */
export async function rtdbPutIfMatch(path: string, value: unknown, etag: string): Promise<boolean> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "if-match": etag },
    body: JSON.stringify(value),
  });
  if (res.status === 412) return false; // quelqu'un d'autre est passé avant
  if (!res.ok) throw new Error(`RTDB conditional PUT ${path} failed: ${res.status}`);
  return true;
}

export async function rtdbDelete(path: string): Promise<void> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`RTDB DELETE ${path} failed: ${res.status}`);
}
