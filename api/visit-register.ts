// Doodates Registration API — Inscription visites + validation email
// POST /api/visit-register — créer inscription (public)
// POST /api/visit-register/confirm — valider lien email (public)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbTourGet,
  rtdbRegistrationCreate,
  rtdbRegistrationGet,
  rtdbRegistrationUpdate,
  rtdbRegistrationExists,
  rtdbCountUserTours,
  rtdbCountRegisteredByTour,
  rtdbCountPendingWaitlistOffers,
  rtdbRegistrationsListByTour,
  rtdbWaitlistAdd,
  rtdbWaitlistCount,
  rtdbWaitlistSoftDelete,
  rtdbRegistrationSoftDelete,
  rtdbAuditLog,
  rtdbGuideCodeValidate,
  rtdbWaitlistGetNext,
  rtdbWaitlistUpdate,
} from "./_visit-db.js";
import { rtdbGet } from "./_firebase.js";
import { buildVisitEmail } from "./_visit-email.js";
import { createRegistrationToken, verifyRegistrationToken } from "./_token.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Public site URL for email links. HashRouter → links use /#/ prefix.
const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";

// Q13: Sanitize — strip HTML tags from names
function sanitizeText(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").trim();
}

// Helper: send email via EmailJS with retry + idempotency (Q1, Q2)
export async function sendRegistrationEmail(
  emailType: "confirmation" | "waitlist_confirmation" | "validation_expired" | "cancellation",
  data: Record<string, any>
): Promise<void> {
  const templateIdJson = process.env.VISIT_EMAILJS_TEMPLATE_IDS;
  if (!templateIdJson) throw new Error("VISIT_EMAILJS_TEMPLATE_IDS missing");

  const templateIds = JSON.parse(templateIdJson);
  const templateId = templateIds[emailType];
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

// POST /api/visit-register — créer inscription
async function handleCreateRegistration(req: VercelRequest, res: VercelResponse) {
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
    if (!tour) {
      return res.status(404).json({ error: "tour not found" });
    }

    // Check already registered (Q6: dedup by email + tour)
    const alreadyReg = await rtdbRegistrationExists(tourId, email);
    if (alreadyReg) {
      return res.status(400).json({ error: "already registered for this tour" });
    }

    // Lazy expiry: annule les inscriptions "attente_validation" dont le délai de confirmation
    // email est dépassé, et promeut immédiatement la file d'attente sur chaque place libérée —
    // sinon la personne qui tente de s'inscrire maintenant pourrait doubler celle qui attend déjà.
    const tourRegs = await rtdbRegistrationsListByTour(tourId);
    const now = new Date();
    for (const reg of tourRegs) {
      if (reg.status === "attente_validation" && reg.validationExpiresAt && new Date(reg.validationExpiresAt) < now) {
        await rtdbRegistrationUpdate(reg.id, { status: "annulé", cancelledAt: now.toISOString() });
        await promoteWaitlist(tourId);
      }
    }

    // Count places taken (confirmés + offres waitlist en cours). Whole group must fit, else waitlist.
    // Une offre waitlist en cours réserve la place tant qu'elle n'a pas expiré/été refusée,
    // sinon un nouvel inscrit peut doubler la personne qui attend déjà une réponse.
    const registeredPlaces = await rtdbCountRegisteredByTour(tourId);
    const pendingWaitlistPlaces = await rtdbCountPendingWaitlistOffers(tourId);
    const hasSpace = registeredPlaces + pendingWaitlistPlaces + groupSize <= tour.capacity;

    // Guide manual on-site registration (spec §2): create directly as confirmé, no email.
    const guideCode = req.headers["x-guide-code"] as string | undefined;
    const isManual = req.body.manual === true && guideCode && (await rtdbGuideCodeValidate(guideCode));
    if (isManual) {
      const registration = await rtdbRegistrationCreate({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companions: companionsField,
        status: "confirmé",
      });
      await rtdbRegistrationUpdate(registration.id, { confirmedAt: new Date().toISOString() });
      return res.status(201).json({
        status: "confirmé",
        registrationId: registration.id,
        message: "Inscription manuelle confirmée",
      });
    }

    if (hasSpace) {
      // Registration: attente_validation — create first to get ID, then generate token with real ID
      const registration = await rtdbRegistrationCreate({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companions: companionsField,
        status: "attente_validation",
      });

      const token = createRegistrationToken(registration.id, email);
      await rtdbRegistrationUpdate(registration.id, {
        validationToken: token.token,
        validationExpiresAt: token.expiresAt,
      });

      // Send confirmation email
      try {
        await sendRegistrationEmail("confirmation", {
          to: email,
          firstName: sanitizedFirstName,
          tourTitle: tour.title,
          tourDate: tour.date,
          validationLink: `${SITE_URL}/#/reservations/confirm?token=${token.token}`,
          cancelLink: `${SITE_URL}/#/reservations/cancel?id=${registration.id}`,
          registrationId: registration.id,
          idempotencyKey: `${registration.id}_confirmation`,
        });
      } catch (e) {
        console.error("[visit-register] Failed to send confirmation email:", e);
        // Continue anyway, user can check their email
      }

      return res.status(201).json({
        status: "attente_validation",
        registrationId: registration.id,
        message: "Vérifiez votre email pour valider votre inscription.",
      });
    } else {
      // Waitlist — token not needed for waitlist (no email validation step)
      const position = (await rtdbWaitlistCount(tourId)) + 1;
      const waitlist = await rtdbWaitlistAdd({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companions: companionsField,
        position,
      });

      // Send waitlist confirmation email
      try {
        await sendRegistrationEmail("waitlist_confirmation", {
          to: email,
          firstName: sanitizedFirstName,
          tourTitle: tour.title,
          position,
          queueLink: `${SITE_URL}/#/reservations/cancel-waitlist?id=${waitlist.id}`,
          registrationId: waitlist.id,
          idempotencyKey: `${waitlist.id}_waitlist_confirmation`,
        });
      } catch (e) {
        console.error("[visit-register] Failed to send waitlist email:", e);
      }

      return res.status(201).json({
        status: "waitlist",
        waitlistId: waitlist.id,
        position,
        message: `Visite complète — vous êtes #${position} en file d'attente. Vous recevrez un email si une place se libère.`,
      });
    }
  } catch (e) {
    console.error("[visit-register POST]", e);
    return res.status(500).json({ error: "registration failed" });
  }
}

// POST /api/visit-register/confirm — valider lien email
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

    if (verified.expired) {
      // Token expired: send expiration email
      try {
        await sendRegistrationEmail("validation_expired", {
          to: verified.email,
          firstName: verified.registrationId || "Participant",
          registrationId: verified.registrationId,
          idempotencyKey: `${verified.registrationId}_validation_expired`,
        });
      } catch (e) {
        console.error("[visit-register] Failed to send expiration email:", e);
      }

      return res.status(400).json({ error: "token expired" });
    }

    const registrationId = verified.registrationId;
    const registration = await rtdbRegistrationGet(registrationId);

    if (!registration) {
      return res.status(404).json({ error: "registration not found" });
    }

    // Idempotency: if already confirmed, return success
    if (registration.status === "confirmé") {
      return res.json({ ok: true, status: "confirmé", message: "Inscription déjà confirmée" });
    }

    if (registration.status !== "attente_validation") {
      return res.status(400).json({ error: "registration already processed" });
    }

    // Mark confirmed
    await rtdbRegistrationUpdate(registrationId, {
      status: "confirmé",
      confirmedAt: new Date().toISOString(),
    });

    return res.json({ ok: true, status: "confirmé", message: "Inscription confirmée" });
  } catch (e) {
    console.error("[visit-register confirm]", e);
    return res.status(500).json({ error: "confirmation failed" });
  }
}

// Promote next waitlist entry when place becomes available
export async function promoteWaitlist(tourId: string): Promise<void> {
  try {
    const nextWaitlist = await rtdbWaitlistGetNext(tourId);
    if (!nextWaitlist) return; // No one waiting

    const tour = await rtdbTourGet(tourId);
    if (!tour) return;

    // Create invitation token (24H)
    const invitationToken = createRegistrationToken(nextWaitlist.id, nextWaitlist.email);

    // Update waitlist entry with token
    await rtdbWaitlistUpdate(nextWaitlist.id, {
      invitationToken: invitationToken.token,
      invitationExpiresAt: invitationToken.expiresAt,
      invitationSentAt: new Date().toISOString(),
    });

    // Send offer email (immédiat)
    try {
      await sendRegistrationEmail("waitlist_offer", {
        to: nextWaitlist.email,
        firstName: nextWaitlist.firstName,
        tourTitle: tour.title,
        tourDate: tour.date,
        acceptLink: `${SITE_URL}/#/reservations/confirm?token=${invitationToken.token}`,
        deadline: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        registrationId: nextWaitlist.id,
        idempotencyKey: `${nextWaitlist.id}_waitlist_offer`,
      });
    } catch (e) {
      console.error("[visit-register] Failed to send waitlist offer email:", e);
      // Log failure but don't throw — token is set, person can check their email
      await rtdbAuditLog("waitlist_offer_email_failed", {
        waitlistId: nextWaitlist.id,
        tourId,
        email: nextWaitlist.email,
        error: String(e),
      });
    }

    console.log(`[visit-register] Promoted waitlist: ${nextWaitlist.id} for tour ${tourId}`);
  } catch (e) {
    console.error("[visit-register promoteWaitlist]", e);
    await rtdbAuditLog("waitlist_promotion_failed", {
      tourId,
      error: String(e),
    });
  }
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

    await rtdbRegistrationUpdate(registrationId, {
      status: "annulé",
      cancelledAt: new Date().toISOString(),
    });

    // Send cancellation confirmation email
    try {
      const tour = await rtdbTourGet(registration.tourId);
      await sendRegistrationEmail("cancellation", {
        to: registration.email,
        firstName: registration.firstName,
        tourTitle: tour?.title || "",
        tourDate: tour?.date || "",
        registrationId,
        idempotencyKey: `${registrationId}_cancellation`,
      });
    } catch (e) {
      console.error("[visit-register] cancellation email failed:", e);
    }

    // Promote waitlist: send offer to next person immediately
    await promoteWaitlist(registration.tourId);

    return res.json({ ok: true, message: "Inscription annulée" });
  } catch (e) {
    console.error("[visit-register cancel]", e);
    return res.status(500).json({ error: "cancellation failed" });
  }
}

// POST /api/visit-register?action=gdpr — droit à l'oubli (spec §6 Q6, §7)
// Body: { email }. Soft-delete toutes inscriptions + file d'attente de cet email.
async function handleGdprDelete(req: VercelRequest, res: VercelResponse) {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: "email: valid email required" });
  }

  try {
    // Scan ALL registrations by email field (robust: catches non-indexed/orphan docs too)
    const allRegs = await rtdbGet<Record<string, any>>("registrations");
    let deletedRegs = 0;
    if (allRegs) {
      for (const [regId, reg] of Object.entries(allRegs)) {
        if (reg && reg.email && reg.email.toLowerCase() === email.toLowerCase() && !reg.deletedAt) {
          await rtdbRegistrationSoftDelete(regId);
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
          await rtdbWaitlistSoftDelete(wid);
          deletedWaitlist++;
        }
      }
    }

    await rtdbAuditLog("gdpr_request", {
      email,
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

// POST /api/visit-register?action=resend — renvoyer email de validation (admin only)
// Body: { registrationId }. Requires X-Guide-Code header.
async function handleResendValidation(req: VercelRequest, res: VercelResponse) {
  const guideCode = req.headers["x-guide-code"] as string | undefined;
  if (!guideCode || !(await rtdbGuideCodeValidate(guideCode))) {
    return res.status(403).json({ error: "guide code required" });
  }

  const { registrationId } = req.body;
  if (!registrationId || typeof registrationId !== "string") {
    return res.status(400).json({ error: "registrationId: string required" });
  }

  try {
    const registration = await rtdbRegistrationGet(registrationId);
    if (!registration || registration.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }
    if (registration.status === "confirmé") {
      return res.json({ ok: true, message: "Déjà confirmée — aucun email nécessaire" });
    }
    if (registration.status !== "attente_validation") {
      return res.status(400).json({ error: `cannot resend for status: ${registration.status}` });
    }

    const tour = await rtdbTourGet(registration.tourId);

    // Always regenerate token with real registrationId
    const newToken = createRegistrationToken(registrationId, registration.email);
    const token = newToken.token;
    await rtdbRegistrationUpdate(registrationId, {
      validationToken: token,
      validationExpiresAt: newToken.expiresAt,
    });

    await sendRegistrationEmail("confirmation", {
      to: registration.email,
      firstName: registration.firstName,
      tourTitle: tour?.title || "",
      tourDate: tour?.date || "",
      validationLink: `${SITE_URL}/#/reservations/confirm?token=${token}`,
      cancelLink: `${SITE_URL}/#/reservations/cancel?id=${registrationId}`,
      registrationId,
      idempotencyKey: `${registrationId}_confirmation_resend_${Date.now()}`,
    });

    return res.json({ ok: true, message: `Email de validation renvoyé à ${registration.email}` });
  } catch (e) {
    console.error("[visit-register resend]", e);
    return res.status(500).json({ error: "resend failed" });
  }
}

// Main router
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    return handleGdprDelete(req, res);
  } else if (action === "resend") {
    return handleResendValidation(req, res);
  } else {
    return handleCreateRegistration(req, res);
  }
}
