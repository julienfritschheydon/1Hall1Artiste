// POST   → soumission d'une contribution galerie (public, validé, écrit via secret).
// DELETE  → suppression (modération) : exige l'en-tête x-mod-key == MODERATION_SECRET.
// Les règles RTDB peuvent rester en .write:false ; seul ce endpoint écrit.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbPut, rtdbDelete } from "./_firebase.js";

const PATH = "community-photos";

function safeHttpUrl(v: unknown): string {
  const s = String(v || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : "";
  } catch {
    return "";
  }
}

function clean(v: unknown, max: number): string {
  return String(v || "").trim().slice(0, max);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-mod-key");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "POST") {
      const b = (req.body || {}) as Record<string, unknown>;
      const imageUrl = safeHttpUrl(b.imageUrl);
      const content = clean(b.content, 2000);
      // Une contribution doit avoir une image (URL Cloudinary http(s)) ou un texte.
      if (!imageUrl && !content) return res.status(400).json({ error: "Image ou texte requis" });

      const id = `${imageUrl ? "photo" : "text"}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const now = new Date().toISOString();
      const entry = {
        id,
        type: imageUrl ? "photo" : "testimonial",
        displayName: clean(b.displayName, 80) || "Anonyme",
        content,
        imageUrl,
        thumbnailUrl: imageUrl,
        description: clean(b.description, 500),
        createdAt: now,
        timestamp: now,
        moderation: { status: "approved", moderatedAt: now },
      };
      await rtdbPut(`${PATH}/${id}`, entry);
      return res.status(200).json(entry);
    }

    if (req.method === "DELETE") {
      const key = req.headers["x-mod-key"];
      if (!process.env.MODERATION_SECRET || key !== process.env.MODERATION_SECRET) {
        return res.status(401).json({ error: "Non autorisé" });
      }
      const id = String((req.query.id as string) || (req.body as { id?: string })?.id || "").replace(/[.#$/\[\]]/g, "");
      if (!id) return res.status(400).json({ error: "id requis" });
      await rtdbDelete(`${PATH}/${id}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[community] erreur:", err);
    return res.status(500).json({ error: "Échec" });
  }
}
