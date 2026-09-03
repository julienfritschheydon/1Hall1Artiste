// POST { token, fields } → portail artiste : vérifie le token et écrit l'override.
//   L'artistId provient UNIQUEMENT du token : un artiste ne peut éditer que sa propre fiche.
// POST { artistId, fields } → admin : l'artistId est fourni directement par l'appelant.
//   L'accès admin est protégé côté client par le code PIN (voir AdminLogin.tsx).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken } from "./_token.js";
import { putArtistOverride, sanitizeOverrideFields } from "./_overrides.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const adminArtistId = String(req.body?.artistId || "").trim();
    const fields = (req.body?.fields || {}) as Record<string, unknown>;
    const override = sanitizeOverrideFields(fields);

    let artistId: string;
    if (adminArtistId) {
      artistId = adminArtistId;
    } else {
      const token = String(req.body?.token || "");
      const result = verifyToken(token);
      if (!result.valid) return res.status(401).json({ error: "Lien invalide" });
      if (result.expired) return res.status(401).json({ error: "Lien expiré" });
      artistId = result.artistId;
    }

    await putArtistOverride(artistId, override);

    return res.status(200).json({ ok: true, artistId });
  } catch (err) {
    console.error("[artist-update] erreur:", err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
