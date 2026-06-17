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
  rtdbAuditLog,
} from "./_visit-db";
import { createRegistrationToken, verifyRegistrationToken } from "./_token";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

// Q13: Sanitize — strip HTML tags from names
function sanitizeText(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").trim();
}

// Helper: send email via EmailJS with retry + idempotency (Q1, Q2)
async function sendRegistrationEmail(
  emailType: "confirmation" | "waitlist_confirmation" | "validation_expired",
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
      deadline: data.deadline,
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
  const sanitizedCompanionFirstName = companionFirstName ? sanitizeText(companionFirstName) : undefined;
  const sanitizedCompanionLastName = companionLastName ? sanitizeText(companionLastName) : undefined;

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

    // Count registered (confirmés only)
    const registeredCount = await rtdbCountRegisteredByTour(tourId);
    const hasSpace = registeredCount < tour.capacity;

    // Q1: Create token for email validation (24H)
    const token = createRegistrationToken(undefined, email);

    if (hasSpace) {
      // Registration: attente_validation
      const registration = await rtdbRegistrationCreate({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companionFirstName: sanitizedCompanionFirstName,
        companionLastName: sanitizedCompanionLastName,
        status: "attente_validation",
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
          validationLink: `${SITE_URL}/reservations/confirm?token=${token.token}`,
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
      // Waitlist
      const position = (await rtdbWaitlistCount(tourId)) + 1;
      const waitlist = await rtdbWaitlistAdd({
        tourId,
        email,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        companionFirstName: sanitizedCompanionFirstName,
        companionLastName: sanitizedCompanionLastName,
        position,
        invitationToken: token.token,
        invitationExpiresAt: token.expiresAt,
      });

      // Send waitlist confirmation email
      try {
        await sendRegistrationEmail("waitlist_confirmation", {
          to: email,
          firstName: sanitizedFirstName,
          tourTitle: tour.title,
          position,
          queueLink: `${SITE_URL}/reservations/queue/${waitlist.id}`,
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

// Main router
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Route by path
  const path = req.url?.split("?")[0];
  if (path?.endsWith("/confirm")) {
    return handleConfirmRegistration(req, res);
  } else {
    return handleCreateRegistration(req, res);
  }
}
