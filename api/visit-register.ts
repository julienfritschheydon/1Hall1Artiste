// Doodates Registration API — Inscription visites
// POST /api/visit-register — créer inscription (public)
// POST /api/visit-register/confirm — compatibilité des anciens liens email
//   (l'inscription est confirmée directement à la création depuis le retrait du
//   double opt-in ; cet endpoint ne fait plus que rassurer le porteur du lien)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbTourGet,
  rtdbRegistrationCreate,
  rtdbRegistrationGet,
  rtdbRegistrationUpdate,
  rtdbRegistrationExists,
  rtdbCountUserTours,
  rtdbCountRegisteredByTour,
  holdsSeat,
  rtdbCountPendingWaitlistOffers,
  rtdbCountWaitlistedPlaces,
  rtdbRegistrationsListByTour,
  rtdbWaitlistAdd,
  rtdbWaitlistCount,
  rtdbWaitlistExists,
  rtdbWaitlistListByTour,
  rtdbWaitlistErase,
  rtdbRegistrationErase,
  rtdbAuditLog,
  rtdbGuideCodeValidate,
  rtdbWaitlistUpdate,
} from "./_visit-db.js";
import { rtdbGet } from "./_firebase.js";
import { buildVisitEmail, VisitEmailType } from "./_visit-email.js";
import { createRegistrationToken, verifyRegistrationToken } from "./_token.js";
import { placesOf } from "../src/types/visitTypes.js";
import { buildIcs, googleCalendarUrl } from "./_ics.js";
import { rateLimited, clientIp, REGISTER_RULE, GDPR_RULE } from "./_rate-limit.js";
import { withTourLock } from "./_tour-lock.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Public site URL for email links. HashRouter → links use /#/ prefix.
const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MEETING_ADDRESS = "17 allée Duguay Trouin, Île Feydeau, 44000 Nantes";

// Q13: Sanitize — strip HTML tags from names
function sanitizeText(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").trim();
}

// Helper: send email via EmailJS with retry + idempotency (Q1, Q2)
export async function sendRegistrationEmail(
  emailType: VisitEmailType,
  data: Record<string, any>
): Promise<void> {
  const templateIdJson = process.env.VISIT_EMAILJS_TEMPLATE_IDS;
  if (!templateIdJson) throw new Error("VISIT_EMAILJS_TEMPLATE_IDS missing");

  // Sujet + corps sont construits en code (buildVisitEmail) — le template EmailJS
  // ne rend que {{subject}}/{{{message}}}, donc n'importe quel template du compte
  // convient en secours pour les types sans entrée dédiée (ex. gdpr_confirm).
  const templateIds = JSON.parse(templateIdJson);
  const templateId = templateIds[emailType] || templateIds.confirmation;
  if (!templateId) throw new Error(`Template ${emailType} not configured`);

  const idempotencyKey = data.idempotencyKey || `${data.to}_${emailType}_${Date.now()}`;

  // Build subject + body in code (EmailJS can't compare {{#if type}}). Template = {{subject}}/{{message}}.
  const built = buildVisitEmail(emailType as any, data);

  const emailjsData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: templateId,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    accessToken: process.env.EMAILJS_PRIVATE_KEY,
    template_params: {
      to_email: data.to,
      subject: built.subject,
      message: built.message,
      firstName: data.firstName || "",
    },
  };

  // Q2: Retry 3x with backoff
  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(emailjsData),
      });

      if (res.ok) {
        return; // Success
      }

      if (res.status === 409) {
        // Already sent (idempotency), treat as success
        return;
      }

      lastError = await res.text();
      console.warn(`[visit-register] EmailJS attempt ${attempt + 1} failed: ${res.status} ${lastError}`);

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // 1s, 2s, 4s
      }
    } catch (e) {
      lastError = e;
      console.warn(`[visit-register] EmailJS attempt ${attempt + 1} error:`, e);
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Q2: Alert admin if all retries fail
  const alertError = `EmailJS failed after 3 retries: ${emailType} to ${data.to}. Error: ${lastError}`;
  console.error(`[visit-register] ${alertError}`);

  await rtdbAuditLog("email_failure_alert", {
    emailType,
    toEmail: data.to,
    registrationId: data.registrationId,
    attempts: 3,
    lastError: String(lastError),
  });

  // Send alert to admin
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: process.env.VISIT_ALERT_EMAIL,
          subject: "Doodates Email Failure Alert",
          message: alertError,
        },
      }),
    });
  } catch (alertE) {
    console.error("[visit-register] Failed to send alert to admin:", alertE);
  }
}

// Email « c'est confirmé » : détails complets + liens calendrier.
// Best-effort — un échec d'envoi ne doit jamais faire échouer l'inscription.
async function sendConfirmedEmail(reg: {
  id: string;
  tourId: string;
  email: string;
  firstName?: string;
}): Promise<void> {
  try {
    const tour = await rtdbTourGet(reg.tourId);
    if (!tour) return;
    const location = tour.startLocationName
      ? `${tour.startLocationName}, ${MEETING_ADDRESS}`
      : MEETING_ADDRESS;
    await sendRegistrationEmail("registration_confirmed", {
      to: reg.email,
      firstName: reg.firstName,
      tourTitle: tour.title,
      tourDate: tour.date,
      durationMinutes: tour.durationMinutes,
      location,
      icsUrl: `${SITE_URL.replace(/\/$/, "")}/api/visit-register?action=ics&id=${reg.id}`,
      googleCalUrl: googleCalendarUrl({
        uid: reg.id,
        title: tour.title,
        description: tour.description,
        location,
        startIso: tour.date,
        durationMinutes: tour.durationMinutes,
      }),
      cancelLink: `${SITE_URL}/#/reservations/cancel?id=${reg.id}`,
      registrationId: reg.id,
      idempotencyKey: `${reg.id}_registration_confirmed`,
    });
  } catch (e) {
    console.error("[visit-register] Failed to send registration_confirmed email:", e);
  }
}

// POST /api/visit-register — créer inscription
async function handleCreateRegistration(req: VercelRequest, res: VercelResponse) {
  // L'inscription manuelle du guide est exemptée : elle est authentifiée par le
  // code guide, et un guide qui inscrit un groupe sur place enchaîne
  // légitimement les soumissions depuis une seule adresse.
  if (req.body?.manual !== true && rateLimited("visit-register", clientIp(req), REGISTER_RULE)) {
    return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une minute." });
  }

  const { tourId, email, firstName, lastName, companionFirstName, companionLastName } = req.body;

  // Q13: Validate email
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "email: valid email required" });
  }

  // Q13: Sanitize names
  if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
    return res.status(400).json({ error: "firstName: non-empty string required" });
  }
  if (!lastName || typeof lastName !== "string" || lastName.trim().length === 0) {
    return res.status(400).json({ error: "lastName: non-empty string required" });
  }

  const sanitizedFirstName = sanitizeText(firstName);
  const sanitizedLastName = sanitizeText(lastName);

  // Accompagnants : array (nouveau) ou champ legacy (1 accompagnant). Max 4 → 5 places.
  let companions: { firstName: string; lastName?: string }[] = [];
  if (Array.isArray(req.body.companions)) {
    companions = req.body.companions
      .filter((c: any) => c && typeof c.firstName === "string" && c.firstName.trim())
      .map((c: any) => ({
        firstName: sanitizeText(c.firstName),
        lastName: c.lastName ? sanitizeText(c.lastName) : undefined,
      }));
  } else if (companionFirstName) {
    companions = [
      { firstName: sanitizeText(companionFirstName), lastName: companionLastName ? sanitizeText(companionLastName) : undefined },
    ];
  }
  if (companions.length > 4) {
    return res.status(400).json({ error: "max 5 places per inscription (1 + 4 accompagnants)" });
  }
  const groupSize = 1 + companions.length;
  const companionsField = companions.length > 0 ? companions : undefined;

  try {
    // Q7: Check max 3 visites (global, resets when soft-deleted)
    const userTourCount = await rtdbCountUserTours(email);
    if (userTourCount >= 3) {
      return res.status(400).json({ error: "max 3 visites per person" });
    }

    // Check tour exists
    const tour = await rtdbTourGet(tourId);
    if (!tour || tour.deletedAt) {
      return res.status(404).json({ error: "tour not found" });
    }

    // Guide manual on-site registration (spec §2): bypasses capacité, autorisé
    // jusqu'à la fin de la visite (les retardataires s'inscrivent sur place).
    const guideCode = req.headers["x-guide-code"] as string | undefined;
    const isManual = req.body.manual === true && guideCode && (await rtdbGuideCodeValidate(guideCode));

    // Visite déjà commencée/passée : le filtre « futur » du GET ne suffit pas
    // (réponse cachée en edge + onglet resté ouvert) — refuser aussi au POST.
    const tourStart = new Date(tour.date).getTime();
    const tourEnd = tourStart + (tour.durationMinutes || 0) * 60 * 1000;
    if (!isManual && tourStart <= Date.now()) {
      return res.status(400).json({ error: "tour already started" });
    }
    if (isManual && tourEnd < Date.now()) {
      return res.status(400).json({ error: "tour already ended" });
    }

    // Check already registered (Q6: dedup by email + tour) — inscriptions ET file d'attente
    const alreadyReg = await rtdbRegistrationExists(tourId, email);
    if (alreadyReg) {
      return res.status(400).json({ error: "already registered for this tour" });
    }
    if (await rtdbWaitlistExists(tourId, email)) {
      return res.status(400).json({ error: "already in waitlist for this tour" });
    }

    // ── Section critique ────────────────────────────────────────────────────
    // Compter les places puis écrire, c'est lire-puis-écrire : sans exclusion
    // mutuelle, deux requêtes concurrentes lisent « il reste 1 place » et
    // créent chacune une inscription. Le verrou par visite sérialise la
    // décision. Les envois d'email restent DEHORS : ils prennent des centaines
    // de millisecondes et n'ont aucune raison de retenir le verrou.
    const outcome = await withTourLock(tourId, async () => {
      // Places prises = confirmés + TOUTE la file d'attente, offre envoyée ou
      // pas. Toute personne déjà en attente réserve son rang — sinon un nouvel
      // inscrit avec un groupe plus petit la doublerait simplement parce qu'il
      // rentre dans la capacité brute restante, alors qu'elle est arrivée avant
      // lui (voir doc §6.7).
      const registeredPlaces = await rtdbCountRegisteredByTour(tourId);
      const waitlistedPlaces = await rtdbCountWaitlistedPlaces(tourId);
      const hasSpace = registeredPlaces + waitlistedPlaces + groupSize <= tour.capacity;

      // Inscription manuelle du guide : le passe-droit de capacité est voulu
      // (surbooking décidé sur place), mais il doit être signalé — sans
      // avertissement le guide ne voit ni que la visite était complète, ni
      // qu'il vient de doubler la file d'attente.
      if (isManual || hasSpace) {
        const registration = await rtdbRegistrationCreate({
          tourId,
          email,
          firstName: sanitizedFirstName,
          lastName: sanitizedLastName,
          companions: companionsField,
          status: "confirmé",
        });
        await rtdbRegistrationUpdate(registration.id, { confirmedAt: new Date().toISOString() });
        return { kind: "registered" as const, id: registration.id, overCapacity: isManual && !hasSpace };
      }

      const position = (await rtdbWaitlistCount(tourId)) + 1;
      const waitlist = await rtdbWaitlistAdd({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companions: companionsField,
        position,
      });
      return { kind: "waitlisted" as const, id: waitlist.id, position };
    });
    // ── Fin de section critique ─────────────────────────────────────────────

    if (outcome.kind === "registered") {
      if (isManual) {
        return res.status(201).json({
          status: "confirmé",
          registrationId: outcome.id,
          message: "Inscription manuelle confirmée",
          ...(outcome.overCapacity
            ? {
                warning:
                  "Attention : la visite était complète (ou une file d'attente existe). Cette inscription passe outre la capacité et la file.",
              }
            : {}),
        });
      }

      await sendConfirmedEmail({
        id: outcome.id,
        tourId,
        email,
        firstName: sanitizedFirstName,
      });

      return res.status(201).json({
        status: "confirmé",
        registrationId: outcome.id,
        message: "Inscription confirmée ! Un email récapitulatif vient de vous être envoyé.",
      });
    }

    const { id: waitlistId, position } = outcome;
    try {
      await sendRegistrationEmail("waitlist_confirmation", {
        to: email,
        firstName: sanitizedFirstName,
        tourTitle: tour.title,
        position,
        queueLink: `${SITE_URL}/#/reservations/cancel-waitlist?id=${waitlistId}&email=${encodeURIComponent(email)}`,
        registrationId: waitlistId,
        idempotencyKey: `${waitlistId}_waitlist_confirmation`,
      });
    } catch (e) {
      console.error("[visit-register] Failed to send waitlist email:", e);
    }

    return res.status(201).json({
      status: "waitlist",
      waitlistId,
      position,
      message: `Visite complète — vous êtes #${position} en file d'attente. Vous recevrez un email si une place se libère.`,
    });
  } catch (e) {
    console.error("[visit-register POST]", e);
    return res.status(500).json({ error: "registration failed" });
  }
}

// GET /api/visit-register?action=ics&id=<registrationId> — télécharge le fichier .ics de la visite confirmée.
async function handleIcsDownload(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id: string required" });
  }

  try {
    const registration = await rtdbRegistrationGet(id);
    if (!registration || registration.status !== "confirmé") {
      return res.status(404).json({ error: "registration not found" });
    }

    const tour = await rtdbTourGet(registration.tourId);
    if (!tour) {
      return res.status(404).json({ error: "tour not found" });
    }

    const ics = buildIcs({
      uid: registration.id,
      title: tour.title,
      description: tour.description,
      location: tour.startLocationName
        ? `${tour.startLocationName}, ${MEETING_ADDRESS}`
        : MEETING_ADDRESS,
      startIso: tour.date,
      durationMinutes: tour.durationMinutes,
    });

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="visite-feydeau.ics"`);
    return res.status(200).send(ics);
  } catch (e) {
    console.error("[visit-register ics]", e);
    return res.status(500).json({ error: "ics generation failed" });
  }
}

// POST /api/visit-register/confirm — compatibilité des anciens liens email.
//
// Le double opt-in a été retiré : une inscription est confirmée dès sa
// création, plus rien ne produit d'inscription « en attente de validation ».
// Cet endpoint reste en place uniquement parce que des emails envoyés avant ce
// changement circulent encore, et qu'un clic sur leur lien ne doit pas tomber
// sur une erreur inquiétante alors que l'inscription est parfaitement valide.
async function handleConfirmRegistration(req: VercelRequest, res: VercelResponse) {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token: string required" });
  }

  try {
    const verified = verifyRegistrationToken(token);

    if (!verified.valid) {
      return res.status(400).json({ error: "invalid token" });
    }

    // L'expiration du jeton est sans objet ici : on ne valide plus rien, on se
    // contente de rassurer le porteur du lien sur l'état de son inscription.
    const registration = await rtdbRegistrationGet(verified.registrationId).catch(() => null);

    if (!registration || registration.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }

    if (registration.status === "confirmé" || registration.status === "présent") {
      return res.json({
        ok: true,
        status: registration.status,
        message: "Votre inscription est confirmée, aucune action n'est nécessaire.",
      });
    }

    return res.status(400).json({ error: "registration already processed", status: registration.status });
  } catch (e) {
    console.error("[visit-register confirm]", e);
    return res.status(500).json({ error: "confirmation failed" });
  }
}

// Promeut autant de personnes en file d'attente que de places réellement libres.
// Ignore quiconque a déjà une offre active (invitationSentAt, non expirée, non
// refusée) — sinon on relance la même personne en boucle pendant qu'une place
// libre pour la suivante reste silencieusement inoccupée (bug corrigé : voir
// docs/FONCTIONNEMENT-INSCRIPTIONS-FILE-ATTENTE.md §6.2). Même algorithme que
// le cron `promoteFromWaitlist` (api/visit-emails.ts), scopé à un seul tour
// pour un appel immédiat (annulation, expiration détectée en lazy).
export async function promoteWaitlist(tourId: string): Promise<void> {
  try {
    const tour = await rtdbTourGet(tourId);
    if (!tour) return;

    // Réserver les places sous verrou : sans lui, une inscription concurrente
    // peut prendre la place qu'on est en train d'offrir, et la personne promue
    // reçoit une offre déjà caduque. Les envois d'email se font APRÈS, hors
    // section critique.
    const promoted = await withTourLock(tourId, async () => {
      const now = new Date();
      const confirmedCount = await rtdbCountRegisteredByTour(tourId);
      const waits = await rtdbWaitlistListByTour(tourId); // triés par position, exclut les supprimés

      // Une offre en cours (envoyée, ni acceptée ni expirée/refusée) réserve sa place.
      const pendingPlaces = waits
        .filter((w) => w.invitationSentAt && !w.rejectedAt && w.invitationExpiresAt && new Date(w.invitationExpiresAt) >= now)
        .reduce((sum, w) => sum + placesOf(w), 0);

      let freeSlots = tour.capacity - confirmedCount - pendingPlaces;
      if (freeSlots <= 0) return [];

      // Candidats = ceux sans offre active/refusée, dans l'ordre de position (FIFO).
      const candidates = waits.filter((w) => !w.invitationSentAt && !w.rejectedAt);
      const offers: { entry: (typeof candidates)[number]; token: string }[] = [];

      for (const next of candidates) {
        const need = placesOf(next);
        if (need > freeSlots) break; // groupe ne rentre pas — équité FIFO, on ne saute pas de rang

        const invitationToken = createRegistrationToken(next.id, next.email);
        await rtdbWaitlistUpdate(next.id, {
          invitationToken: invitationToken.token,
          invitationExpiresAt: invitationToken.expiresAt,
          invitationSentAt: new Date().toISOString(),
        });
        freeSlots -= need;
        offers.push({ entry: next, token: invitationToken.token });
      }

      return offers;
    });

    for (const { entry: next, token } of promoted) {
      try {
        await sendRegistrationEmail("waitlist_offer", {
          to: next.email,
          firstName: next.firstName,
          tourTitle: tour.title,
          tourDate: tour.date,
          // accept-waitlist, PAS confirm : le token encode un ID de file d'attente,
          // seule la route accept-waitlist appelle l'endpoint d'activation.
          // Avec /confirm le lien répondait « registration not found » et la
          // personne promue perdait sa place à l'expiration de l'offre.
          acceptLink: `${SITE_URL}/#/reservations/accept-waitlist?token=${token}`,
          deadline: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
          registrationId: next.id,
          idempotencyKey: `${next.id}_waitlist_offer`,
        });
      } catch (e) {
        console.error("[visit-register] Failed to send waitlist offer email:", e);
        await rtdbAuditLog("waitlist_offer_email_failed", {
          waitlistId: next.id,
          tourId,
          email: next.email,
          error: String(e),
        });
      }

      console.log(`[visit-register] Promoted waitlist: ${next.id} for tour ${tourId}`);
    }
  } catch (e) {
    console.error("[visit-register promoteWaitlist]", e);
    await rtdbAuditLog("waitlist_promotion_failed", {
      tourId,
      error: String(e),
    });
  }
}

// Annule une inscription : statut « annulé », email de confirmation, puis
// promotion immédiate de la file d'attente (règle 2 : toute place libérée
// doit être réofferte). Partagé entre l'annulation user et l'annulation guide.
export async function cancelRegistration(registration: {
  id: string;
  tourId: string;
  email: string;
  firstName: string;
}): Promise<void> {
  await rtdbRegistrationUpdate(registration.id, {
    status: "annulé",
    cancelledAt: new Date().toISOString(),
  });

  try {
    const tour = await rtdbTourGet(registration.tourId);
    await sendRegistrationEmail("cancellation", {
      to: registration.email,
      firstName: registration.firstName,
      tourTitle: tour?.title || "",
      tourDate: tour?.date || "",
      registrationId: registration.id,
      idempotencyKey: `${registration.id}_cancellation`,
    });
  } catch (e) {
    console.error("[visit-register] cancellation email failed:", e);
  }

  await promoteWaitlist(registration.tourId);
}

// POST /api/visit-register?action=cancel — user annule son inscription (spec §5)
// Body: { registrationId, email }. Email = clé d'auth faible (visite gratuite).
// Place libérée → immédiat promotion waitlist + email offre
async function handleCancelRegistration(req: VercelRequest, res: VercelResponse) {
  const { registrationId, email } = req.body;

  if (!registrationId || typeof registrationId !== "string") {
    return res.status(400).json({ error: "registrationId: string required" });
  }
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email: string required" });
  }

  try {
    const registration = await rtdbRegistrationGet(registrationId);
    if (!registration || registration.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }
    // Email must match (weak auth)
    if (registration.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: "email does not match registration" });
    }
    if (registration.status === "annulé") {
      return res.json({ ok: true, message: "Already cancelled" });
    }
    if (registration.status === "présent" || registration.status === "absent") {
      return res.status(400).json({ error: "tour already happened, cannot cancel" });
    }

    await cancelRegistration(registration);

    return res.json({ ok: true, message: "Inscription annulée" });
  } catch (e) {
    console.error("[visit-register cancel]", e);
    return res.status(500).json({ error: "cancellation failed" });
  }
}

// POST /api/visit-register?action=gdpr — droit à l'oubli, étape 1 (spec §6 Q6, §7)
// Body: { email }. N'importe qui peut poster n'importe quel email : sans
// vérification, un tiers pouvait supprimer toutes les inscriptions d'autrui.
// On envoie donc un lien de confirmation signé (HMAC, 24h) à l'adresse
// concernée ; la suppression n'a lieu qu'à l'étape 2 (action=gdpr-confirm).
async function handleGdprRequest(req: VercelRequest, res: VercelResponse) {
  // Cet endpoint envoie un email à une adresse que l'appelant choisit
  // librement : sans limite, il sert à inonder un tiers de messages et à vider
  // le quota EmailJS du collectif au passage.
  if (rateLimited("visit-gdpr", clientIp(req), GDPR_RULE)) {
    return res.status(429).json({ error: "Trop de demandes. Réessayez plus tard." });
  }

  const { email } = req.body;
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "email: valid email required" });
  }

  try {
    const token = createRegistrationToken("gdpr", email);
    await sendRegistrationEmail("gdpr_confirm", {
      to: email,
      firstName: "",
      confirmLink: `${SITE_URL}/#/reservations/gdpr-confirm?token=${token.token}`,
      idempotencyKey: `gdpr_${email}_${Date.now()}`,
    });
    // Réponse identique qu'il existe des données ou non (pas d'énumération d'emails).
    return res.json({
      ok: true,
      message: "Un email de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient pour finaliser la suppression.",
    });
  } catch (e) {
    console.error("[visit-register gdpr request]", e);
    return res.status(500).json({ error: "gdpr request failed" });
  }
}

// POST /api/visit-register?action=gdpr-confirm — droit à l'oubli, étape 2
// Body: { token }. Purge les données personnelles (pas un simple deletedAt).
async function handleGdprConfirm(req: VercelRequest, res: VercelResponse) {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token: string required" });
  }
  const verified = verifyRegistrationToken(token);
  if (!verified.valid || verified.registrationId !== "gdpr") {
    return res.status(400).json({ error: "invalid token" });
  }
  if (verified.expired) {
    return res.status(400).json({ error: "token expired" });
  }
  const email = verified.email;

  try {
    // Tours dont une place se libère réellement par cette suppression — à
    // promouvoir ensuite (même règle que partout ailleurs : jamais laisser
    // une place silencieusement libre pendant que la file attend).
    const affectedTourIds = new Set<string>();
    const now = new Date();

    // Scan ALL registrations by email field (robust: catches non-indexed/orphan docs too)
    const allRegs = await rtdbGet<Record<string, any>>("registrations");
    let deletedRegs = 0;
    if (allRegs) {
      for (const [regId, reg] of Object.entries(allRegs)) {
        if (reg && reg.email && reg.email.toLowerCase() === email.toLowerCase() && !reg.deletedAt) {
          if (holdsSeat(reg)) affectedTourIds.add(reg.tourId);
          await rtdbRegistrationErase(regId);
          deletedRegs++;
        }
      }
    }

    // Soft-delete waitlist entries for this email (scan all tours' waitlist)
    let deletedWaitlist = 0;
    const allWaitlist = await rtdbGet<Record<string, any>>("waitlist");
    if (allWaitlist) {
      for (const [wid, w] of Object.entries(allWaitlist)) {
        if (w && w.email && w.email.toLowerCase() === email.toLowerCase() && !w.deletedAt) {
          const heldOffer =
            w.invitationSentAt && !w.rejectedAt && w.invitationExpiresAt && new Date(w.invitationExpiresAt) >= now;
          if (heldOffer) affectedTourIds.add(w.tourId);
          await rtdbWaitlistErase(wid);
          deletedWaitlist++;
        }
      }
    }

    for (const tourId of affectedTourIds) {
      await promoteWaitlist(tourId);
    }

    // Pas d'email dans le log d'audit — le but de l'opération est justement l'oubli.
    await rtdbAuditLog("gdpr_request", {
      deletedRegistrations: deletedRegs,
      deletedWaitlist,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      message: `Données supprimées: ${deletedRegs} inscription(s), ${deletedWaitlist} file(s) d'attente`,
    });
  } catch (e) {
    console.error("[visit-register gdpr]", e);
    return res.status(500).json({ error: "gdpr deletion failed" });
  }
}

// Main router
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET ?action=ics&id=<registrationId> — téléchargement fichier calendrier.
  // Routé ici plutôt que dans un fichier séparé : Vercel Hobby plafonne à
  // 12 fonctions serverless, déjà atteint par les endpoints /api existants.
  if (req.method === "GET" && req.query.action === "ics") {
    return handleIcsDownload(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Route by query param (?action=confirm) or path suffix (/confirm).
  // Query param preferred — robust on Vercel filesystem routing.
  const path = req.url?.split("?")[0];
  const action = req.query.action;
  if (action === "confirm" || path?.endsWith("/confirm")) {
    return handleConfirmRegistration(req, res);
  } else if (action === "cancel") {
    return handleCancelRegistration(req, res);
  } else if (action === "gdpr") {
    return handleGdprRequest(req, res);
  } else if (action === "gdpr-confirm") {
    return handleGdprConfirm(req, res);
  } else if (action) {
    // Une action inconnue (typo) ne doit pas créer silencieusement une inscription.
    return res.status(400).json({ error: `unknown action: ${action}` });
  } else {
    return handleCreateRegistration(req, res);
  }
}
