// Admin endpoint to create custom guide access code
// POST /api/guide-code-create with { code: "...", revokeOld?: true, oldCode?: "..." }
// Auth : token admin (body.adminToken ou Bearer), ou Bearer ADMIN_SETUP_KEY (script de setup).
// Fermé par défaut : sans ADMIN_SETUP_KEY configurée, l'ancienne version laissait
// n'importe qui créer un code guide — donc lire noms et emails des inscrits.

import { VercelRequest, VercelResponse } from "@vercel/node";
import { alertApiError } from "./_alert-email.js";
import { rtdbGuideCodeCreateCustom, rtdbGuideCodeRevoke } from "./_visit-db.js";
import { isAdminRequest } from "./_admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const setupKey = process.env.ADMIN_SETUP_KEY;
  const hasSetupKey = Boolean(setupKey) && req.headers.authorization === `Bearer ${setupKey}`;
  if (!hasSetupKey && !isAdminRequest(req)) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const { code, revokeOld, oldCode } = req.body;
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return res.status(400).json({ error: "Le code est obligatoire" });
  }

  try {
    if (revokeOld && oldCode) {
      await rtdbGuideCodeRevoke(oldCode.trim());
    }

    const gac = await rtdbGuideCodeCreateCustom(code.trim());
    return res.status(200).json({
      success: true,
      message: `Guide code créé: ${code.trim()}`,
      guideAccessCode: gac,
      revokedOld: revokeOld && oldCode ? true : false,
    });
  } catch (e) {
    console.error("Error creating guide code:", e);
    await alertApiError({ route: "guide-code-create", action: String(req.query?.action || req.method || ""), error: e, req });
    return res.status(500).json({ error: "Impossible de créer le code guide" });
  }
}
