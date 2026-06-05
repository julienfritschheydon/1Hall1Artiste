// POST { entryId, sessionId } → toggle like côté serveur (écriture via secret).
// Les règles RTDB peuvent rester en .write:false ; seul ce endpoint écrit.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbGet, rtdbPut } from "./_firebase.js";

const LIKES_PATH = "likes-data";

function sanitizeId(v: unknown): string {
  return String(v || "").replace(/[.#$/\[\]]/g, "").slice(0, 200);
}

async function updateGlobalStats(): Promise<void> {
  try {
    const all = (await rtdbGet<Record<string, { likes?: number }>>(LIKES_PATH)) || {};
    let total = 0, max = 0, top = "";
    for (const [id, d] of Object.entries(all)) {
      const n = d?.likes || 0;
      total += n;
      if (n > max) { max = n; top = id; }
    }
    await rtdbPut("likes-stats", { total, today: 0, topEntry: top || null, lastUpdated: new Date().toISOString() });
  } catch (e) {
    console.error("[likes] updateGlobalStats:", e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const entryId = sanitizeId(req.body?.entryId);
    const sessionId = sanitizeId(req.body?.sessionId);
    if (!entryId || !sessionId) return res.status(400).json({ error: "entryId/sessionId requis" });

    const current = (await rtdbGet<{ likes?: number; likedBy?: string[] }>(`${LIKES_PATH}/${entryId}`)) || { likes: 0, likedBy: [] };
    const likedBy: string[] = Array.isArray(current.likedBy) ? current.likedBy : [];
    const hasLiked = likedBy.includes(sessionId);

    const newLikedBy = hasLiked ? likedBy.filter((id) => id !== sessionId) : [...likedBy, sessionId];
    const newLikes = Math.max(0, newLikedBy.length);

    await rtdbPut(`${LIKES_PATH}/${entryId}`, {
      likes: newLikes,
      likedBy: newLikedBy,
      lastLiked: new Date().toISOString(),
    });

    await updateGlobalStats();

    return res.status(200).json({ success: true, liked: !hasLiked, total: newLikes });
  } catch (err) {
    console.error("[likes] erreur:", err);
    return res.status(500).json({ success: false, error: "Échec du like" });
  }
}
