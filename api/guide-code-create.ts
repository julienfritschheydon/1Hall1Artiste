// Admin endpoint to create custom guide access code
// POST /api/guide-code-create with { code: "...", revokeOld?: true, oldCode?: "..." }
// Requires ADMIN_SETUP_KEY env var (temporary setup endpoint)

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbGuideCodeCreateCustom, rtdbGuideCodeRevoke } from "./_visit-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const setupKey = process.env.ADMIN_SETUP_KEY;
  const authHeader = req.headers.authorization;

  if (setupKey && authHeader !== `Bearer ${setupKey}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { code, revokeOld, oldCode } = req.body;
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return res.status(400).json({ error: "code: non-empty string required" });
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
    return res.status(500).json({ error: "Failed to create guide code" });
  }
}
