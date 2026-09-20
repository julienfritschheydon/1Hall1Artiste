// Doodates Waitlist API — File d'attente + activation
// POST /api/visit-waitlist/activate — accepter offre place libérée (public)
// POST /api/visit-waitlist?action=register — le guide inscrit directement une
//   personne de la file (portail guide, x-guide-code requis)
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
  rtdbRegistrationUpdate,
  rtdbCountRegisteredByTour,
  rtdbAuditLog,
} from "./_visit-db.js";
import { placesOf, bookableCapacity } from "../src/types/visitTypes.js";
import { verifyRegistrationToken } from "./_token.js";
import { promoteWaitlist, sendRegistrationEmail } from "./visit-register.js";
import { googleCalendarUrl } from "./_ics.js";
import { withTourLock } from "./_tour-lock.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MEETING_ADDRESS = "17 allée Duguay Trouin, Île Feydeau, 44000 Nantes";

// Email « vous êtes inscrit » envoyé quand une entrée de file devient une
// inscription — que ce soit la personne qui accepte l'offre ou le guide qui
// l'inscrit depuis le portail. Ne jamais faire échouer l'inscription pour un
// email : la place est déjà attribuée en base.
async function sendWaitlistAcceptedEmail(
  tourId: string,
  registration: { id: string; email: string; firstName: string }
): Promise<void> {
  try {
    const tour = await rtdbTourGet(tourId);
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
      icsUrl: `${SITE_URL.replace(/\/$/, "")}/api/visit-register?action=ics&id=${registration.id}`,
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
      cancelLink: `${SITE_URL}/#/reservations/cancel?id=${registration.id}`,
      idempotencyKey: `${registration.id}_waitlist_accepted`,
    });
  } catch (e) {
    console.error("[visit-waitlist] accepted email failed:", e);
  }
}

// POST /api/visit-waitlist/activate — accepter offre (Q4: sequential, 1 per sec)
async function handleActivateWaitlist(req: VercelRequest, res: VercelResponse) {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token requis" });
  }

  try {
    const verified = verifyRegistrationToken(token);

    if (!verified.valid) {
      return res.status(400).json({ error: "Lien invalide" });
    }

    if (verified.expired) {
      return res.status(400).json({ error: "Lien expiré", code: "token_expired" });
    }

    const waitlistId = verified.registrationId;
    const waitlist = await rtdbWaitlistGet(waitlistId);

    if (!waitlist) {
      return res.status(404).json({ error: "Inscription en file d'attente introuvable" });
    }

    // Q5: Check if already rejected (after 24H auto-reject)
    if (waitlist.rejectedAt) {
      return res.status(400).json({ error: "Offre déjà refusée : la place a été proposée à la personne suivante" });
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
      return res.status(410).json({ error: "Cette offre n'est plus valable" });
    }

    // Conversion file d'attente → inscription, sous le même verrou que
    // l'inscription publique : les deux consomment la même place, et une
    // acceptation d'offre qui croise une inscription directe doit rester
    // sérialisée. La suppression de l'entrée de file fait partie de la même
    // section critique, sinon la place serait comptée deux fois.
    const registration = await withTourLock(waitlist.tourId, async () => {
      const created = await rtdbRegistrationCreate({
        tourId: waitlist.tourId,
        email: waitlist.email,
        firstName: waitlist.firstName,
        lastName: waitlist.lastName,
        companions: waitlist.companions,
        companionFirstName: waitlist.companionFirstName,
        companionLastName: waitlist.companionLastName,
        status: "confirmé",
      });
      await rtdbWaitlistSoftDelete(waitlistId);
      return created;
    });

    // Log: Offer accepted
    console.log(`[waitlist] Offer accepted: waitlist_${waitlistId} → registration_${registration.id}`);

    await sendWaitlistAcceptedEmail(waitlist.tourId, registration);

    return res.json({
      ok: true,
      registrationId: registration.id,
      message: "Inscription confirmée",
    });
  } catch (e) {
    console.error("[visit-waitlist activate]", e);
    return res.status(500).json({ error: "Échec de l'activation" });
  }
}

// POST /api/visit-waitlist?action=register — le guide inscrit une personne de
// la file depuis le portail (bouton « Inscrire »).
//
// Pourquoi un endpoint dédié : passer par l'inscription manuelle du guide
// échouait en « already in waitlist for this tour », et supprimer l'entrée
// d'abord envoyait à la personne un email « vous avez quitté la file » alors
// qu'on vient justement de l'inscrire. Ici la suppression de la file et la
// création de l'inscription sont une seule opération, sous le verrou de visite.
//
// Comme l'inscription manuelle sur place, la capacité est contournée (le guide
// décide), mais le dépassement est signalé pour qu'il le voie.
async function handleRegisterFromWaitlist(req: VercelRequest, res: VercelResponse) {
  const guideCode = req.headers["x-guide-code"] as string | undefined;
  if (!guideCode || !(await rtdbGuideCodeValidate(guideCode))) {
    return res.status(401).json({ error: "Code guide invalide" });
  }

  const { waitlistId } = req.body || {};
  if (!waitlistId || typeof waitlistId !== "string") {
    return res.status(400).json({ error: "Identifiant de file d'attente requis" });
  }

  try {
    const waitlist = await rtdbWaitlistGet(waitlistId);
    if (!waitlist) {
      return res.status(404).json({ error: "Inscription en file d'attente introuvable" });
    }

    // Entrée déjà consommée : si la personne a accepté l'offre entre-temps,
    // répondre succès plutôt que de créer un doublon (même idempotence que
    // l'activation par lien email).
    const existingRegs = await rtdbRegistrationsListByTour(waitlist.tourId);
    const already = existingRegs.find(
      (r) =>
        r.email.toLowerCase() === waitlist.email.toLowerCase() &&
        (r.status === "confirmé" || r.status === "présent")
    );
    if (already) {
      if (!waitlist.deletedAt) await rtdbWaitlistSoftDelete(waitlistId);
      return res.json({ ok: true, registrationId: already.id, message: "Inscription déjà confirmée" });
    }
    if (waitlist.deletedAt) {
      return res.status(410).json({ error: "Cette inscription en file d'attente n'est plus active" });
    }

    const tour = await rtdbTourGet(waitlist.tourId);
    if (!tour || tour.deletedAt) {
      return res.status(404).json({ error: "Visite introuvable" });
    }
    // Même règle que l'inscription manuelle sur place : autorisée tant que la
    // visite n'est pas terminée (les retardataires sont inscrits pendant).
    const tourEnd = new Date(tour.date).getTime() + (tour.durationMinutes || 0) * 60 * 1000;
    if (tourEnd < Date.now()) {
      return res.status(400).json({ error: "Cette visite est terminée" });
    }

    const groupSize = placesOf(waitlist);

    const outcome = await withTourLock(waitlist.tourId, async () => {
      const registeredPlaces = await rtdbCountRegisteredByTour(waitlist.tourId);
      const overCapacity = registeredPlaces + groupSize > bookableCapacity(tour);

      const created = await rtdbRegistrationCreate({
        tourId: waitlist.tourId,
        email: waitlist.email,
        firstName: waitlist.firstName,
        lastName: waitlist.lastName,
        companions: waitlist.companions,
        companionFirstName: waitlist.companionFirstName,
        companionLastName: waitlist.companionLastName,
        status: "confirmé",
      });
      await rtdbRegistrationUpdate(created.id, { confirmedAt: new Date().toISOString() });
      await rtdbWaitlistSoftDelete(waitlistId);
      return { registration: created, overCapacity };
    });

    // Hors verrou : réordonner la file et prévenir la personne ne consomment
    // aucune place, inutile de retenir les autres inscriptions pendant ce temps.
    await rtdbWaitlistReorderAfter(waitlist.tourId, waitlist.position);

    console.log(
      `[waitlist] Guide registration: waitlist_${waitlistId} → registration_${outcome.registration.id}`
    );
    await rtdbAuditLog("waitlist_registered_by_guide", {
      waitlistId,
      tourId: waitlist.tourId,
      registrationId: outcome.registration.id,
      email: waitlist.email,
      overCapacity: outcome.overCapacity,
    });

    await sendWaitlistAcceptedEmail(waitlist.tourId, outcome.registration);

    return res.status(201).json({
      ok: true,
      registrationId: outcome.registration.id,
      overCapacity: outcome.overCapacity,
      message: outcome.overCapacity
        ? "Inscription confirmée — capacité dépassée"
        : "Inscription confirmée",
    });
  } catch (e) {
    console.error("[visit-waitlist register]", e);
    return res.status(500).json({ error: "Échec de l'inscription" });
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
    return res.status(400).json({ error: "Identifiant de file d'attente requis" });
  }
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Adresse email requise" });
  }

  try {
    const waitlist = await rtdbWaitlistGet(id);

    if (!waitlist) {
      return res.status(404).json({ error: "Inscription en file d'attente introuvable" });
    }

    if (waitlist.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: "L'adresse email ne correspond pas à l'inscription en file d'attente" });
    }

    if (waitlist.deletedAt) {
      return res.status(410).json({ error: "Inscription déjà annulée", code: "already_cancelled" });
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
    return res.status(500).json({ error: "Échec de l'annulation" });
  }
}

// GET /api/visit-waitlist/{tourId} — voir liste d'attente (public)
async function handleGetWaitlist(req: VercelRequest, res: VercelResponse) {
  const { tourId } = req.query;

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "Identifiant de visite requis" });
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
      return res.status(401).json({ error: "Code guide invalide" });
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
    return res.status(500).json({ error: "Échec du chargement de la liste" });
  }
}

// Main router
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url?.split("?")[0];

  if (req.method === "POST") {
    if (req.query.action === "activate" || path?.endsWith("/activate")) {
      return handleActivateWaitlist(req, res);
    }
    if (req.query.action === "register" || path?.endsWith("/register")) {
      return handleRegisterFromWaitlist(req, res);
    }
    return res.status(405).json({ error: "Chemin POST invalide" });
  } else if (req.method === "DELETE") {
    return handleDeleteWaitlist(req, res);
  } else if (req.method === "GET") {
    return handleGetWaitlist(req, res);
  } else {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }
}
