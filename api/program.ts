// Vercel Serverless Function — proxy + parse Google Sheets CSV
// Résultat mis en cache 1h côté edge (s-maxage=3600).
// L'app fetch /api/program au lieu de Google Sheets directement.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  SHEETS,
  csvUrl,
  slugify,
  ensureUniqueId,
  parseYesNo,
  pick,
  fetchCsv,
  parseCsv,
  locationSet,
} from "./_sheets.js";
import { fetchArtistOverrides, applyOverrides } from "./_overrides.js";

const EXPO_DEFAULT_TIME = "12h00 - 19h00, samedi et dimanche";

// ── Parsers ───────────────────────────────────────────────────────────────────

function buildExpos(rows: Record<string, string>[], artistIds: Set<string>, eventIds: Set<string>) {
  const events: object[] = [];
  const artists: object[] = [];

  for (const row of rows) {
    const name = pick(row, "Prénom et Nom de l'artiste", "Prénom et Nom", "Nom de l'artiste");
    if (!name) continue;

    const samedi = parseYesNo(pick(row, "Samedi"));
    const dimanche = parseYesNo(pick(row, "Dimanche"));
    if (!samedi && !dimanche) continue;

    const days: string[] = [];
    if (samedi) days.push("samedi");
    if (dimanche) days.push("dimanche");

    const adresse = pick(row, "Adresse expo", "Adresse");
    const locationId = locationSet.has(adresse) ? adresse : null;
    if (!locationId) {
      console.warn(`[program] expo "${name}" — lieu introuvable: "${adresse}"`);
      continue;
    }

    const presentation = pick(row, "Deux lignes pour vous présenter", "Présentation");
    const title =
      pick(row, "Titre", "Titre de l'exposition") ||
      presentation.split(".")[0]?.slice(0, 80) ||
      name;

    const artistId = ensureUniqueId(slugify(name), artistIds);
    artists.push({
      id: artistId,
      name,
      type: "exposition",
      title,
      presentation,
      email: pick(row, "Adresse e-mail", "Email") || undefined,
      instagram: pick(row, "Compte Instagram (si vous en avez un)", "Compte Instagram", "Instagram") || undefined,
      facebook: pick(row, "Compte Facebook (si vous en avez un)", "Compte Facebook", "Facebook") || undefined,
      website: pick(row, "Site internet (si vous en avez un)", "Site internet", "Website") || undefined,
    });

    const eventId = ensureUniqueId(`expo-${artistId}`, eventIds);
    events.push({
      id: eventId,
      artistId,
      title,
      time: EXPO_DEFAULT_TIME,
      days,
      locationId,
      locationName: locationId,
      artistName: name,
      type: "exposition",
    });
  }

  return { events, artists };
}

function buildConcerts(rows: Record<string, string>[], artistIds: Set<string>, eventIds: Set<string>) {
  const events: object[] = [];
  const artists: object[] = [];

  for (const row of rows) {
    const name = pick(row, "Nom du groupe", "Groupe", "Nom");
    if (!name) continue;

    const samedi = parseYesNo(pick(row, "Samedi"));
    const dimanche = parseYesNo(pick(row, "Dimanche"));
    if (!samedi && !dimanche) continue;

    const days: string[] = [];
    if (samedi) days.push("samedi");
    if (dimanche) days.push("dimanche");

    const time = pick(row, "Horaires", "Horaire") || "";
    const adresse = pick(row, "Adresse concert", "Adresse");
    const locationId = locationSet.has(adresse) ? adresse : "quai-turenne-9-concert";

    const photos = [
      pick(row, "Liens vers une photo", "Photo 1"),
      pick(row, "Liens vers une seconde photo", "Photo 2"),
      pick(row, "Liens vers une troisième photo", "Photo 3"),
    ].filter(Boolean);

    const artistId = ensureUniqueId(slugify(name), artistIds);
    artists.push({
      id: artistId,
      name,
      type: "concert",
      title: name,
      presentation: pick(row, "Présentation") || undefined,
      email: pick(row, "Email") || undefined,
      instagram: pick(row, "Compte Instagram", "Instagram") || undefined,
      facebook: pick(row, "Compte Facebook", "Facebook") || undefined,
      website: pick(row, "Site internet", "Website") || undefined,
      image: photos[0] || undefined,
      photos: photos.length > 0 ? photos : undefined,
    });

    for (const day of days) {
      const eventId = ensureUniqueId(`concert-${artistId}-${day}`, eventIds);
      events.push({
        id: eventId,
        artistId,
        title: name,
        time,
        days: [day],
        locationId,
        locationName: locationId,
        artistName: name,
        type: "concert",
        image: photos[0] || undefined,
      });
    }
  }

  return { events, artists };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS pour dev local (app tourne sur localhost:8082)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [expoCsv, concertCsv] = await Promise.all([
      fetchCsv(csvUrl(SHEETS.expositions.id, SHEETS.expositions.gid)),
      fetchCsv(csvUrl(SHEETS.concerts.id, SHEETS.concerts.gid)),
    ]);

    const artistIds = new Set<string>();
    const eventIds = new Set<string>();

    const expo = buildExpos(parseCsv(expoCsv), artistIds, eventIds);
    const concert = buildConcerts(parseCsv(concertCsv), artistIds, eventIds);

    // Fusionne les éditions artistes (Firebase) par-dessus les données Sheet.
    const overrides = await fetchArtistOverrides();
    const artists = applyOverrides([...expo.artists, ...concert.artists], overrides);

    // Propage la vignette (thumbnail prioritaire) vers les événements pour l'affichage des cartes.
    const artistById = new Map(artists.map((a: any) => [a.id, a]));
    const events = [...expo.events, ...concert.events].map((ev: any) => {
      const a = artistById.get(ev.artistId);
      const img = a?.thumbnail || ev.image || a?.image;
      return img ? { ...ev, image: img, imageUrl: img } : ev;
    });

    const program = {
      events,
      artists,
      fetchedAt: Date.now(),
    };

    console.log(`[program] ${program.events.length} events, ${program.artists.length} artistes`);

    // Cache court (60s) pour que les éditions artistes apparaissent vite.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=3600");
    return res.status(200).json(program);
  } catch (err) {
    console.error("[program] Erreur fetch Sheets:", err);
    return res.status(502).json({ error: "Impossible de charger le programme depuis Google Sheets" });
  }
}
