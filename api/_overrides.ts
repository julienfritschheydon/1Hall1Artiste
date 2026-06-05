// Overrides artistes stockés dans Firebase RTDB (artist-overrides/{artistId}).
// Écrits par /api/artist-update, fusionnés par /api/program par-dessus les données Sheet.

const FIREBASE_DB_URL =
  "https://collectif-ile-feydeau----app-default-rtdb.europe-west1.firebasedatabase.app";

// Champs qu'un artiste peut éditer via le portail. Whitelist stricte.
export const EDITABLE_FIELDS = [
  "presentation",
  "instagram",
  "facebook",
  "website",
  "thumbnail",
] as const;

export type ArtistOverride = Partial<Record<(typeof EDITABLE_FIELDS)[number], string>> & {
  updatedAt?: number;
};

// Secret legacy de la RTDB (Firebase console → Paramètres → Comptes de service → Secrets DB).
// Présent uniquement côté serveur (env Vercel). Les requêtes ?auth=SECRET ont les droits admin
// et contournent les règles : seules les fonctions /api peuvent écrire les overrides.
function authQuery(): string {
  const s = process.env.FIREBASE_DB_SECRET;
  return s ? `?auth=${encodeURIComponent(s)}` : "";
}

// Récupère tous les overrides. Renvoie {} en cas d'erreur (le programme Sheet reste affiché).
// Lecture côté serveur avec le secret → indépendant des règles RTDB (.read peut rester false).
export async function fetchArtistOverrides(): Promise<Record<string, ArtistOverride>> {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/artist-overrides.json${authQuery()}`, { cache: "no-cache" });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

// Applique les overrides champ par champ (valeur non-vide écrase la valeur Sheet).
export function applyOverrides<T extends { id: string }>(
  artists: T[],
  overrides: Record<string, ArtistOverride>
): T[] {
  return artists.map((artist) => {
    const ov = overrides[artist.id];
    if (!ov) return artist;
    const merged = { ...artist } as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) {
      const v = ov[field];
      if (typeof v === "string" && v.trim() !== "") merged[field] = v.trim();
    }
    return merged as T;
  });
}

// Écrit l'override d'un artiste (PUT remplace l'entrée entière).
export async function putArtistOverride(
  artistId: string,
  override: ArtistOverride
): Promise<void> {
  const res = await fetch(
    `${FIREBASE_DB_URL}/artist-overrides/${encodeURIComponent(artistId)}.json${authQuery()}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(override),
    }
  );
  if (!res.ok) throw new Error(`Firebase PUT failed: ${res.status}`);
}
