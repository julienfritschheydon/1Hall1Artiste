// Helpers partagés pour lire les Google Sheets (programme expos + concerts).
// Utilisés par /api/program (lecture du programme) et /api/artist-link (lookup email → artistId).

import Papa from "papaparse";

export const SHEETS = {
  expositions: {
    id: "1nNHSqXRpS4YOJ58tFtaTyizhR2J-Us9Uyx3rh99G_GE",
    gid: "2034614073",
  },
  concerts: {
    id: "1bGPyPmm0BLo23JTZ_zMn_OY6x88nrUBfnpIKCTAVl2U",
    gid: "1948932501",
  },
};

const FETCH_TIMEOUT_MS = 8000;

// IDs de lieux valides (copie de src/data/locations.ts). Ajoutez ici si de nouveaux lieux sont créés.
export const LOCATION_IDS = [
  "maison-jules-verne",
  "quai-turenne-8",
  "quai-turenne-9",
  "quai-turenne-9-concert",
  "quai-turenne-10",
  "rue-kervegan-17",
  "quai-turenne-11",
  "allee-duguay-trouin-11",
  "allee-duguay-trouin-15",
  "allee-duguay-trouin-16",
  "rue-kervegan-32",
  "rue-duguesclin",
  "quai-turenne-12",
  "place-petite-hollande-3",
  "quai-turenne-13",
  "allee-duguay-trouin-12",
  "allee-duguay-trouin-9-10",
];

export const locationSet = new Set(LOCATION_IDS);

export function csvUrl(id: string, gid: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

export function slugify(v: string): string {
  return (
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "anonyme"
  );
}

export function ensureUniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) { used.add(base); return base; }
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  const id = `${base}-${i}`;
  used.add(id);
  return id;
}

export function parseYesNo(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim();
  if (s === "" || s === "-") return false;
  return !/^(non|no|n|0|false|faux)$/i.test(s);
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && String(direct).trim() !== "") return String(direct).trim();
    const lk = key.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === lk) {
        const v = row[rk];
        if (v !== undefined && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

export async function fetchCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

// Construit la table email → artistId à partir des deux Sheets.
// Réutilise la même logique de nom + slug que /api/program pour garantir des IDs identiques.
export async function buildEmailToArtistId(): Promise<Map<string, string>> {
  const [expoCsv, concertCsv] = await Promise.all([
    fetchCsv(csvUrl(SHEETS.expositions.id, SHEETS.expositions.gid)),
    fetchCsv(csvUrl(SHEETS.concerts.id, SHEETS.concerts.gid)),
  ]);

  const artistIds = new Set<string>();
  const map = new Map<string, string>();

  // Expos — mêmes filtres que buildExpos dans program.ts pour garantir des IDs identiques.
  for (const row of parseCsv(expoCsv)) {
    const name = pick(row, "Prénom et Nom de l'artiste", "Prénom et Nom", "Nom de l'artiste");
    if (!name) continue;
    if (!parseYesNo(pick(row, "Samedi")) && !parseYesNo(pick(row, "Dimanche"))) continue;
    const adresse = pick(row, "Adresse expo", "Adresse");
    if (!locationSet.has(adresse)) continue;
    const email = pick(row, "Adresse e-mail", "Email").toLowerCase();
    const artistId = ensureUniqueId(slugify(name), artistIds);
    if (email) map.set(email, artistId);
  }

  // Concerts — mêmes filtres que buildConcerts dans program.ts.
  for (const row of parseCsv(concertCsv)) {
    const name = pick(row, "Nom du groupe", "Groupe", "Nom");
    if (!name) continue;
    if (!parseYesNo(pick(row, "Samedi")) && !parseYesNo(pick(row, "Dimanche"))) continue;
    const email = pick(row, "Email").toLowerCase();
    const artistId = ensureUniqueId(slugify(name), artistIds);
    if (email) map.set(email, artistId);
  }

  return map;
}
