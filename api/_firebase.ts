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
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, { cache: "no-cache" });
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

export async function rtdbDelete(path: string): Promise<void> {
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json${authQuery()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`RTDB DELETE ${path} failed: ${res.status}`);
}
