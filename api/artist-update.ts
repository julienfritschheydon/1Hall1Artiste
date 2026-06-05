// POST { token, fields } → vérifie le token et écrit l'override de l'artiste dans Firebase.
// L'artistId provient UNIQUEMENT du token : un artiste ne peut éditer que sa propre fiche.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken } from "./_token.js";
import { EDITABLE_FIELDS, ArtistOverride, putArtistOverride } from "./_overrides.js";

const URL_FIELDS = new Set(["instagram", "facebook", "website", "thumbnail"]);
const MAX_LEN: Record<string, number> = {
  presentation: 2000,
  instagram: 500,
  facebook: 500,
  website: 500,
  thumbnail: 1000,
};

// Garde uniquement les URLs http(s) (bloque javascript:, data: → anti-XSS).
function safeHttpUrl(v: string): string {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = String(req.body?.token || "");
    const result = verifyToken(token);

    if (!result.valid) return res.status(401).json({ error: "Lien invalide" });
    if (result.expired) return res.status(401).json({ error: "Lien expiré" });

    const fields = (req.body?.fields || {}) as Record<string, unknown>;
    const override: ArtistOverride = { updatedAt: Date.now() };
    for (const field of EDITABLE_FIELDS) {
      const raw = fields[field];
      if (typeof raw !== "string") continue;
      let v = raw.trim().slice(0, MAX_LEN[field] ?? 1000);
      // Champs URL : on n'accepte que http(s). Une valeur non-vide invalide est rejetée (ignorée).
      if (URL_FIELDS.has(field) && v !== "") {
        v = safeHttpUrl(v);
        if (v === "") continue;
      }
      override[field] = v;
    }

    await putArtistOverride(result.artistId, override);

    return res.status(200).json({ ok: true, artistId: result.artistId });
  } catch (err) {
    console.error("[artist-update] erreur:", err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
