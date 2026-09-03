// POST { artistId, fields } → écrit l'override d'un artiste depuis l'interface admin.
// Contrairement à /api/artist-update (portail artiste), l'artistId est fourni directement
// par l'appelant : l'accès admin est protégé côté client par le code PIN (voir AdminLogin.tsx).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { putArtistOverride, sanitizeOverrideFields } from "./_overrides.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const artistId = String(req.body?.artistId || "").trim();
    if (!artistId) return res.status(400).json({ error: "artistId requis" });

    const fields = (req.body?.fields || {}) as Record<string, unknown>;
    const override = sanitizeOverrideFields(fields);

    await putArtistOverride(artistId, override);

    return res.status(200).json({ ok: true, artistId });
  } catch (err) {
    console.error("[artist-admin-update] erreur:", err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
