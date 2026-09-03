// Doodates Waitlist API — File d'attente + activation
// POST /api/visit-waitlist/activate — accepter offre place libérée (public)
// DELETE /api/visit-waitlist/{id} — annuler file attente (public)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbWaitlistGet,
  rtdbWaitlistSoftDelete,
  rtdbWaitlistUpdate,
  rtdbWaitlistListByTour,
  rtdbWaitlistReorderAfter,
  rtdbRegistrationCreate,
  rtdbRegistrationsListByTour,
  rtdbTourGet,
  rtdbGuideCodeValidate,
} from "./_visit-db.js";
import { verifyRegistrationToken } from "./_token.js";
import { promoteWaitlist, sendRegistrationEmail } from "./visit-register.js";
import { googleCalendarUrl } from "./_ics.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MEETING_ADDRESS = "17 allée Duguay Trouin, Île Feydeau, 44000 Nantes";

// POST /api/visit-waitlist/activate — accepter offre (Q4: sequential, 1 per sec)
async function handleActivateWaitlist(req: VercelRequest, res: VercelResponse) {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token: string required" });
  }

  try {
    const verified = verifyRegistrationToken(token);

    if (!verified.valid) {
      return res.status(400).json({ error: "invalid token" });
    }

    if (verified.expired) {
      return res.status(400).json({ error: "token expired" });
    }

    const waitlistId = verified.registrationId;
    const waitlist = await rtdbWaitlistGet(waitlistId);

    if (!waitlist) {
      return res.status(404).json({ error: "waitlist entry not found" });
    }

    // Q5: Check if already rejected (after 24H auto-reject)
    if (waitlist.rejectedAt) {
      return res.status(400).json({ error: "offer already rejected, you were passed over" });
    }

    // Entrée déjà consommée (soft-deleted) : sans ce test, recharger la page du
    // lien d'acceptation créait une DEUXIÈME inscription confirmée (doublon sur
    // la feuille d'appel + dépassement de capacité). Idempotence : si une
    // inscription confirmée existe déjà pour cet email, renvoyer succès.
    if (waitlist.deletedAt) {
      const regs = await rtdbRegistrationsListByTour(waitlist.tourId);
      const existing = regs.find(
        (r) =>
          r.email.toLowerCase() === waitlist.email.toLowerCase() &&
          (r.status === "confirmé" || r.status === "présent")
      );
      if (existing) {
        return res.json({ ok: true, registrationId: existing.id, message: "Inscription déjà confirmée" });
      }
      return res.status(410).json({ error: "offer no longer valid" });
    }

    // Create registration from waitlist (carry companions + legacy fields)
    const registration = await rtdbRegistrationCreate({
      tourId: waitlist.tourId,
      email: waitlist.email,
      firstName: waitlist.firstName,
      lastName: waitlist.lastName,
      companions: waitlist.companions,
      companionFirstName: waitlist.companionFirstName,
      companionLastName: waitlist.companionLastName,
      status: "confirmé",
    });

    // Soft delete waitlist entry
    await rtdbWaitlistSoftDelete(waitlistId);

    // Log: Offer accepted
    console.log(`[waitlist] Offer accepted: waitlist_${waitlistId} → registration_${registration.id}`);

    try {
      const tour = await rtdbTourGet(waitlist.tourId);
      const location = tour
        ? tour.startLocationName
          ? `${tour.startLocationName}, ${MEETING_ADDRESS}`
          : MEETING_ADDRESS
        : undefined;
      await sendRegistrationEmail("waitlist_accepted", {
        to: registration.email,
        firstName: registration.firstName,
        tourTitle: tour?.title || "",
        tourDate: tour?.date || "",
        location,
        icsUrl: `${SITE_URL.replace(/\/$/, "")}/api/visit-ics?id=${registration.id}`,
        googleCalUrl: tour
          ? googleCalendarUrl({
              uid: registration.id,
              title: tour.title,
              description: tour.description,
              location: location!,
              startIso: tour.date,
              durationMinutes: tour.durationMinutes,
            })
          : undefined,
        idempotencyKey: `${registration.id}_waitlist_accepted`,
      });
    } catch (e) {
      console.error("[visit-waitlist] accepted email failed:", e);
    }

    return res.json({
      ok: true,
      registrationId: registration.id,
      message: "Inscription confirmée",
    });
  } catch (e) {
    console.error("[visit-waitlist activate]", e);
    return res.status(500).json({ error: "activation failed" });
  }
}

// DELETE /api/visit-waitlist/{id} — annuler (reorder Q4)
// Query: { id, email }. Email = clé d'auth faible (même pattern que
// handleCancelRegistration) : sans elle, n'importe qui connaissant l'id
// (visible dans le lien email, ou dans la réponse JSON d'inscription)
// pouvait annuler la place de quelqu'un d'autre (IDOR).
async function handleDeleteWaitlist(req: VercelRequest, res: VercelResponse) {
  const { id, email } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "waitlist id required" });
  }
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email required" });
  }

  try {
    const waitlist = await rtdbWaitlistGet(id);

    if (!waitlist) {
      return res.status(404).json({ error: "waitlist entry not found" });
    }

    if (waitlist.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: "email does not match waitlist entry" });
    }

    if (waitlist.deletedAt) {
      return res.status(410).json({ error: "already cancelled" });
    }

    // Une offre active (invitationSentAt, ni refusée ni expirée) réservait une
    // place — sa suppression la libère, il faut donc promouvoir le suivant
    // (même bug déjà corrigé pour promoteWaitlist : ne jamais laisser une
    // place silencieusement libre pendant que la file attend).
    const hadActiveOffer =
      Boolean(waitlist.invitationSentAt) &&
      !waitlist.rejectedAt &&
      Boolean(waitlist.invitationExpiresAt) &&
      new Date(waitlist.invitationExpiresAt as string) >= new Date();

    // Soft delete
    await rtdbWaitlistSoftDelete(id);

    // Q4: Reorder positions after this one (position -= 1 for all after)
    await rtdbWaitlistReorderAfter(waitlist.tourId, waitlist.position);

    if (hadActiveOffer) {
      await promoteWaitlist(waitlist.tourId);
    }

    console.log(`[waitlist] Cancelled: position_${waitlist.position} for tour_${waitlist.tourId}`);

    try {
      const tour = await rtdbTourGet(waitlist.tourId);
      await sendRegistrationEmail("waitlist_left", {
        to: waitlist.email,
        firstName: waitlist.firstName,
        tourTitle: tour?.title || "",
        tourDate: tour?.date || "",
        idempotencyKey: `${id}_waitlist_left`,
      });
    } catch (e) {
      console.error("[visit-waitlist] left email failed:", e);
    }

    return res.json({ ok: true, message: "Cancelled" });
  } catch (e) {
    console.error("[visit-waitlist delete]", e);
    return res.status(500).json({ error: "cancellation failed" });
  }
}

// GET /api/visit-waitlist/{tourId} — voir liste d'attente (public)
async function handleGetWaitlist(req: VercelRequest, res: VercelResponse) {
  const { tourId } = req.query;

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId required" });
  }

  try {
    const waits = await rtdbWaitlistListByTour(tourId);

    // Guide (valid x-guide-code) sees full details; public sees anonymized positions.
    // Un code fourni mais invalide/expiré → 401 explicite : sinon le portail
    // guide recevait la réponse publique anonymisée et affichait une file vide
    // sans comprendre pourquoi.
    const guideCode = req.headers["x-guide-code"] as string | undefined;
    const isGuide = guideCode ? await rtdbGuideCodeValidate(guideCode) : false;
    if (guideCode && !isGuide) {
      return res.status(401).json({ error: "invalid guide code" });
    }

    if (isGuide) {
      const detailed = waits.map((w, idx) => ({
        id: w.id,
        position: idx + 1,
        firstName: w.firstName,
        lastName: w.lastName,
        email: w.email,
        companions: w.companions || null,
        companionFirstName: w.companionFirstName || null,
        companionLastName: w.companionLastName || null,
        places: (w.companions && w.companions.length > 0)
          ? 1 + w.companions.length
          : (w.companionFirstName ? 2 : 1),
        hasOffer: Boolean(w.invitationSentAt),
        rejectedAt: w.rejectedAt || null,
      }));
      return res.json({ totalInWaitlist: waits.length, waitlist: detailed });
    }

    // Return only position + offer flag (anonymized, no details)
    const anonymized = waits.map((w, idx) => ({
      position: idx + 1,
      hasOffer: Boolean(w.invitationSentAt),
    }));

    return res.json({ totalInWaitlist: waits.length, positions: anonymized });
  } catch (e) {
    console.error("[visit-waitlist get]", e);
    return res.status(500).json({ error: "list failed" });
  }
}

// Main router
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url?.split("?")[0];

  if (req.method === "POST") {
    if (req.query.action === "activate" || path?.endsWith("/activate")) {
      return handleActivateWaitlist(req, res);
    }
    return res.status(405).json({ error: "invalid POST path" });
  } else if (req.method === "DELETE") {
    return handleDeleteWaitlist(req, res);
  } else if (req.method === "GET") {
    return handleGetWaitlist(req, res);
  } else {
    return res.status(405).json({ error: "method not allowed" });
  }
}
