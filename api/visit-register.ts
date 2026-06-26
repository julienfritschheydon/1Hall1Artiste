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
  rtdbWaitlistAdd,
  rtdbWaitlistCount,
  rtdbWaitlistSoftDelete,
  rtdbRegistrationSoftDelete,
  rtdbAuditLog,
  rtdbGuideCodeValidate,
} from "./_visit-db.js";
import { rtdbGet } from "./_firebase.js";
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
async function sendRegistrationEmail(
  emailType: "confirmation" | "waitlist_confirmation" | "validation_expired" | "cancellation",
  data: Record<string, any>
): Promise<void> {
  const templateIdJson = process.env.VISIT_EMAILJS_TEMPLATE_IDS;
  if (!templateIdJson) throw new Error("VISIT_EMAILJS_TEMPLATE_IDS missing");

  const templateIds = JSON.parse(templateIdJson);
  const templateId = templateIds[emailType];
  if (!templateId) throw new Error(`Template ${emailType} not configured`);

  const idempotencyKey = data.idempotencyKey || `${data.to}_${emailType}_${Date.now()}`;

  // Q1: Idempotency key in EmailJS request
  const emailjsData = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: templateId,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: data.to,
      firstName: data.firstName,
      tourTitle: data.tourTitle,
      tourDate: data.tourDate,
      validationLink: data.validationLink,
      position: data.position,
      queueLink: data.queueLink,
      cancelLink: data.cancelLink,
      deadline: data.deadline,
      type: emailType,
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
          "X-Private-Key": process.env.EMAILJS_PRIVATE_KEY || "",
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
        "X-Private-Key": process.env.EMAILJS_PRIVATE_KEY || "",
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID, // Use generic template for alert
        user_id: process.env.EMAILJS_PUBLIC_KEY,
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

    // Count places taken (confirmés). Whole group must fit, else waitlist.
    const registeredPlaces = await rtdbCountRegisteredByTour(tourId);
    const hasSpace = registeredPlaces + groupSize <= tour.capacity;

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
        message: "Check your email to validate",
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
        message: `You are #${position} on waitlist`,
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
      return res.json({ ok: true, status: "confirmé", message: "Already confirmed" });
    }

    if (registration.status !== "attente_validation") {
      return res.status(400).json({ error: "registration already processed" });
    }

    // Mark confirmed
    await rtdbRegistrationUpdate(registrationId, {
      status: "confirmé",
      confirmedAt: new Date().toISOString(),
    });

    return res.json({ ok: true, status: "confirmé", message: "Inscription confirmed" });
  } catch (e) {
    console.error("[visit-register confirm]", e);
    return res.status(500).json({ error: "confirmation failed" });
  }
}

// POST /api/visit-register?action=cancel — user annule son inscription (spec §5)
// Body: { registrationId, email }. Email = clé d'auth faible (visite gratuite).
// Place libérée → cron promote-waitlist prévient le premier en file.
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
      return res.json({ ok: true, message: "Already confirmed — no email needed" });
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

    return res.json({ ok: true, message: `Validation email resent to ${registration.email}` });
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
