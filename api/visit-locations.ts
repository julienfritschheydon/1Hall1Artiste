// Visit Locations API — points de départ prédéfinis pour les visites guidées.
// GET /api/visit-locations — lister les lieux (pour le menu déroulant guide)
//
// Source unique : data/locations.ts, la même liste de bâtiments que la carte.
// Avant, ce endpoint lisait un noeud RTDB (visit_locations) géré séparément,
// avec ses propres x/y — jamais garanti d'être identique aux coordonnées de
// data/locations.ts, donc le point "cette visite part d'ici" ne matchait
// jamais le point du bâtiment sur la carte. En réutilisant directement
// data/locations.ts, une visite créée par un guide a désormais des
// coordonnées strictement identiques à un point réel de la carte.
import { VercelRequest, VercelResponse } from "@vercel/node";
import { locations } from "../src/data/locations.js";
import type { LocationPoint } from "../src/types/visitTypes.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const points: LocationPoint[] = locations.map((l) => ({
      id: l.id,
      name: l.name,
      x: l.x,
      y: l.y,
    }));
    return res.status(200).json(points);
  } catch (e) {
    console.error("[visit-locations GET]", e);
    return res.status(500).json({ error: "list failed" });
  }
}
