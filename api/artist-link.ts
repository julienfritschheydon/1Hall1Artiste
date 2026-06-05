// POST { email } → si l'email est inscrit dans le programme, envoie un lien magique d'édition.
// Réponse toujours générique pour ne pas divulguer la liste des emails.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildEmailToArtistId } from "./_sheets";
import { createToken } from "./_token";

function appBaseUrl(req: VercelRequest): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
}

// Envoi via EmailJS (compte Gmail déjà branché sur l'app — aucun domaine requis).
// Appel REST serveur : nécessite la clé privée + "Allow EmailJS API for non-browser apps".
async function sendEmail(to: string, link: string): Promise<void> {
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!privateKey) throw new Error("EMAILJS_PRIVATE_KEY manquant");
  const serviceId = process.env.EMAILJS_SERVICE_ID || "service_14prhl5";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || "HoNWMyqrINGzjeK6E";
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  if (!templateId) throw new Error("EMAILJS_TEMPLATE_ID manquant");

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: to,
        link,
        app_name: "Collectif Île Feydeau",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EmailJS ${res.status}: ${body}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const generic = { ok: true, message: "Si cet email est inscrit au programme, un lien vient d'être envoyé." };

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const map = await buildEmailToArtistId();
    const artistId = map.get(email);

    if (artistId) {
      const link = `${appBaseUrl(req)}/#/artiste/edit?token=${encodeURIComponent(createToken(artistId, email))}`;
      try {
        await sendEmail(email, link);
      } catch (e) {
        console.error("[artist-link] envoi email échoué:", e);
        // On garde une réponse générique côté client mais on log l'erreur réelle.
      }
    } else {
      console.log(`[artist-link] email non trouvé: ${email}`);
    }

    return res.status(200).json(generic);
  } catch (err) {
    console.error("[artist-link] erreur:", err);
    return res.status(200).json(generic); // rester générique même en erreur
  }
}
