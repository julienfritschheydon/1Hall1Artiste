// Visit Locations API — points de départ prédéfinis (gérés par l'admin dans Firebase).
// GET /api/visit-locations — lister les lieux (pour le menu déroulant guide)
import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbLocationsList } from "./_visit-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }
  try {
    const locations = await rtdbLocationsList();
    return res.status(200).json(locations);
  } catch (e) {
    console.error("[visit-locations GET]", e);
    return res.status(500).json({ error: "list failed" });
  }
}
