// POST { token, artistId?, fields } → portail artiste : vérifie le token et écrit l'override.
//   L'artistId doit appartenir à la liste signée dans le token : un artiste ne peut éditer
//   que ses propres fiches. Sans artistId dans le body, on retombe sur la première (compat
//   avec les liens et clients antérieurs au support multi-fiches).
// POST { adminToken, artistId, fields } → admin : l'artistId est fourni directement,
//   mais le token admin (émis par /api/admin-login) est vérifié côté serveur.
//
// L'ordre compte : dès qu'un token est présent, c'est le chemin portail qui s'applique et
// l'artistId est vérifié contre le token. Tester le mode admin d'abord laisserait n'importe
// quel porteur de lien éditer la fiche d'un autre en joignant simplement un artistId.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken } from "./_token.js";
import { isAdminRequest } from "./_admin.js";
import { putArtistOverride, sanitizeOverrideFields } from "./_overrides.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const bodyArtistId = String(req.body?.artistId || "").trim();
    const token = String(req.body?.token || "");
    const fields = (req.body?.fields || {}) as Record<string, unknown>;
    const override = sanitizeOverrideFields(fields);

    let artistId: string;
    if (token) {
      // Portail artiste : la liste des fiches autorisées vient du token signé, jamais du body.
      const result = verifyToken(token);
      if (!result.valid) return res.status(401).json({ error: "Lien invalide" });
      if (result.expired) return res.status(401).json({ error: "Lien expiré" });

      artistId = bodyArtistId || result.artistId;
      if (!result.artistIds.includes(artistId)) {
        return res.status(403).json({ error: "Cette fiche n'est pas liée à votre lien" });
      }
    } else if (bodyArtistId) {
      // Admin : exige un token signé. Auparavant cette branche n'était protégée que par
      // le code PIN côté client, donc pas protégée du tout.
      if (!isAdminRequest(req)) {
        return res.status(401).json({ error: "Authentification admin requise" });
      }
      artistId = bodyArtistId;
    } else {
      return res.status(401).json({ error: "Lien invalide" });
    }

    await putArtistOverride(artistId, override);

    return res.status(200).json({ ok: true, artistId });
  } catch (err) {
    console.error("[artist-update] erreur:", err);
    return res.status(500).json({ error: "Échec de l'enregistrement" });
  }
}
