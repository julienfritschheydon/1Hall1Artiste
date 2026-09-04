// Point d'entrée « accès au portail artiste ». Regroupe trois actions dans UNE fonction
// serverless : le plan Vercel Hobby en plafonne le nombre à 12 et le projet est à la
// limite. Même motif que /api/visit-emails?type=… qui multiplexe déjà ses actions.
//
// POST { action: "admin-login", password } → échange le mot de passe admin contre un token signé.
// POST { email } → si l'email est inscrit dans le programme, envoie un lien magique d'édition.
//   Réponse toujours générique pour ne pas divulguer la liste des emails.
// POST { adminToken, artistId } → admin : renvoie DIRECTEMENT le lien de la fiche, sans
//   passer par l'email. Sert à dépanner un artiste qui n'a rien reçu, et à tester le
//   portail sans écrire dans la boîte de quelqu'un. Le lien émis est exactement celui que
//   l'artiste recevrait : il couvre toutes les fiches de son adresse.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildEmailToArtistIds } from "./_sheets.js";
import { createToken } from "./_token.js";
import {
  adminPasswordConfigured,
  checkAdminPassword,
  clientIp,
  isAdminRequest,
  loginRateLimited,
} from "./_admin.js";
import { createAdminToken } from "./_token.js";

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

  // Le 200 générique du catch final protège la confidentialité de la liste d'emails du
  // flux public. Pour un appel admin, il transformerait une vraie panne (secret absent en
  // env, par exemple) en faux succès : on distingue donc les deux dès l'entrée.
  const isAdminCall =
    req.body?.action === "admin-login" || String(req.body?.artistId || "").trim() !== "";

  try {
    // ── Connexion admin ──────────────────────────────────────────────────────
    // Placée avant tout le reste : ce chemin ne doit toucher ni le Sheet ni EmailJS.
    if (req.body?.action === "admin-login") {
      if (loginRateLimited(clientIp(req))) {
        return res.status(429).json({ error: "Trop de tentatives, réessayez dans une minute" });
      }
      // Config incomplète : on refuse au lieu de laisser passer.
      if (!adminPasswordConfigured()) {
        console.error("[artist-link] ADMIN_PASSWORD non configuré");
        return res.status(500).json({ error: "Authentification admin non configurée" });
      }
      const password = String(req.body?.password || "");
      if (!password || !checkAdminPassword(password)) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
      }
      return res.status(200).json({ token: createAdminToken() });
    }

    // ── Mode admin : lien rendu à l'écran, aucun email envoyé ────────────────
    const wantedArtistId = String(req.body?.artistId || "").trim();
    if (wantedArtistId) {
      if (!isAdminRequest(req)) {
        return res.status(401).json({ error: "Authentification admin requise" });
      }

      const map = await buildEmailToArtistIds();
      // On retrouve l'adresse propriétaire de la fiche pour émettre le lien tel que
      // l'artiste le recevrait (toutes ses fiches, pas seulement celle sélectionnée).
      let ownerEmail = "";
      let ownerIds: string[] = [];
      for (const [mail, ids] of map) {
        if (ids.includes(wantedArtistId)) {
          ownerEmail = mail;
          ownerIds = ids;
          break;
        }
      }
      if (!ownerEmail) {
        return res.status(404).json({ error: "Fiche inconnue ou sans adresse email au programme" });
      }

      const link = `${appBaseUrl(req)}/#/artiste/edit?token=${encodeURIComponent(createToken(ownerIds, ownerEmail))}`;
      return res.status(200).json({ ok: true, link, email: ownerEmail, artistIds: ownerIds });
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const map = await buildEmailToArtistIds();
    const artistIds = map.get(email);

    if (artistIds && artistIds.length > 0) {
      // Un seul lien couvre toutes les fiches de l'email ; le portail affiche des onglets
      // quand il y en a plusieurs.
      const link = `${appBaseUrl(req)}/#/artiste/edit?token=${encodeURIComponent(createToken(artistIds, email))}`;
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
    if (isAdminCall) {
      // getSecret lève un message qui nomme la variable absente (« X manquant »). Le
      // renvoyer évite d'envoyer l'admin chercher au mauvais endroit : la génération de
      // lien signe un token ARTISTE, elle échoue donc sur ARTIST_SECRET et non sur les
      // variables d'authentification admin.
      const detail = err instanceof Error && /manquant/.test(err.message) ? ` (${err.message})` : "";
      return res.status(500).json({
        error: `Opération admin impossible — vérifiez la configuration serveur${detail}`,
      });
    }
    return res.status(200).json(generic); // flux public : rester générique même en erreur
  }
}
