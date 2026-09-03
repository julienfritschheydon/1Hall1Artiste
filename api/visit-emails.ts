// Doodates Email Batch Jobs (Cron) — Rappels, validation, suppression RGPD, promo file attente
// POST /api/visit-emails?type=send-7d-reminder — Rappel 7j avant (daily)
// POST /api/visit-emails?type=send-1d-validation — Validation 1j avant (daily)
// POST /api/visit-emails?type=batch-delete-post-tour — Suppression RGPD 24H après (daily)
// POST /api/visit-emails?type=promote-waitlist — Auto-promotion file attente (annule aussi les inscriptions non confirmées après 24H)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbRegistrationsListByDateRange,
  rtdbRegistrationUpdate,
  rtdbToursCompleted,
  rtdbTourUpdate,
  rtdbRegistrationsListByTour,
  rtdbRegistrationErase,
  rtdbWaitlistListByTour,
  rtdbWaitlistErase,
  rtdbAuditLog,
  rtdbWaitlistUpdate,
  rtdbTourGet,
  rtdbToursListAll,
  rtdbToursListFuture,
  rtdbCountRegisteredByTour,
} from "./_visit-db.js";
import { placesOf } from "../src/types/visitTypes.js";
import { buildVisitEmail } from "./_visit-email.js";
import { createRegistrationToken } from "./_token.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MAX_RETRIES = 3;

// Q1, Q2: Send email with idempotency key + retry
async function sendEmailWithRetry(
  templateId: string,
  data: Record<string, any>,
  idempotencyKey: string
): Promise<boolean> {
  // Build subject + body in code (EmailJS can't compare {{#if type}}). Template = {{subject}}/{{message}}.
  const built = buildVisitEmail(data.type, data);
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
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
        return true; // Success
      }

      if (res.status === 409) {
        // Already sent (idempotency), treat as success
        return true;
      }

      const errText = await res.text();
      console.warn(`[visit-emails] EmailJS attempt ${attempt + 1} failed: ${res.status} ${errText}`);

      if (attempt < MAX_RETRIES - 1) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (e) {
      console.warn(`[visit-emails] EmailJS attempt ${attempt + 1} error:`, e);
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return false; // All retries failed
}

// Q2: Send alert to admin
async function sendAdminAlert(subject: string, message: string): Promise<void> {
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Private-Key": process.env.EMAILJS_PRIVATE_KEY || "",
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID, // Use generic template
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: process.env.VISIT_ALERT_EMAIL,
          subject,
          message,
        },
      }),
    });
  } catch (e) {
    console.error("[visit-emails] Failed to send admin alert:", e);
  }
}

// Validate cron auth
function validateCronAuth(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Refus explicite si non configuré — sinon l'en-tête littéral
  // « Bearer undefined » aurait authentifié n'importe qui.
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

// ==== JOB 1: Send 7d reminder ====
async function sendReminderEmails7d(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Query registrations with visite 7d from now (±1h window)
  const startDate = new Date(sevenDaysLater.getTime() - 60 * 60 * 1000);
  const endDate = new Date(sevenDaysLater.getTime() + 60 * 60 * 1000);

  const registrations = await rtdbRegistrationsListByDateRange(startDate, endDate);

  let sent = 0,
    failed = 0;

  for (const reg of registrations) {
    if (reg.status !== "confirmé" || reg.reminder7dSent) {
      continue; // Skip if not confirmed or already sent
    }

    const tour = await rtdbTourGet(reg.tourId);
    if (!tour) continue;

    const idempotencyKey = `${reg.id}_7d_reminder`;
    const success = await sendEmailWithRetry(
      JSON.parse(process.env.VISIT_EMAILJS_TEMPLATE_IDS || "{}").reminder_7d,
      {
        to: reg.email,
        firstName: reg.firstName,
        tourTitle: tour.title,
        tourDate: tour.date,
        type: "reminder_7d",
      },
      idempotencyKey
    );

    if (success) {
      // Mark as sent
      await rtdbRegistrationUpdate(reg.id, { reminder7dSent: true });
      sent++;
    } else {
      console.error(`[visit-emails] Failed to send 7d reminder to ${reg.email}`);
      failed++;
    }
  }

  if (failed > 0) {
    await sendAdminAlert("Doodates 7d Reminder Failures", `${failed} reminders failed to send`);
  }

  return { sent, failed };
}

// ==== JOB 2: Send 1d validation (Q15: auto-cancel if not confirmed) ====
async function sendValidationEmails1d(): Promise<{ sent: number; autocancelled: number }> {
  const now = new Date();
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Query registrations with visite 1d from now (±1h window)
  const startDate = new Date(oneDayLater.getTime() - 60 * 60 * 1000);
  const endDate = new Date(oneDayLater.getTime() + 60 * 60 * 1000);

  const registrations = await rtdbRegistrationsListByDateRange(startDate, endDate);

  let sent = 0,
    autocancelled = 0;

  for (const reg of registrations) {
    if (reg.status !== "confirmé" || reg.validation1dSent) {
      continue;
    }

    const tour = await rtdbTourGet(reg.tourId);
    if (!tour) continue;

    // Q15: Create validation token + deadline
    const token = createRegistrationToken(reg.id, reg.email);
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const idempotencyKey = `${reg.id}_1d_validation`;
    const success = await sendEmailWithRetry(
      JSON.parse(process.env.VISIT_EMAILJS_TEMPLATE_IDS || "{}").reminder_1d_validate,
      {
        to: reg.email,
        firstName: reg.firstName,
        tourTitle: tour.title,
        validationLink: `${SITE_URL}/#/reservations/confirm?token=${token.token}`,
        deadline: deadline.toISOString(),
        type: "reminder_1d_validate",
      },
      idempotencyKey
    );

    if (success) {
      // Mark as sent + store deadline
      await rtdbRegistrationUpdate(reg.id, {
        validation1dSent: true,
        validationDeadline: token.expiresAt,
      });
      sent++;
    } else {
      console.error(`[visit-emails] Failed to send 1d validation to ${reg.email}`);
    }
  }

  // Q15: Auto-cancel registrations past validation deadline.
  // Uniquement pour des visites PAS ENCORE commencées : l'ancien scan (epoch →
  // maintenant) ne touchait que des visites passées, annulant après coup des
  // gens venus à la visite. La deadline est effacée par l'endpoint confirm au
  // clic (revalidation), donc on n'annule ici que ceux qui n'ont PAS cliqué.
  const upcomingRegs = await rtdbRegistrationsListByDateRange(now, new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000));
  for (const reg of upcomingRegs) {
    if (
      reg.status === "confirmé" &&
      reg.validation1dSent &&
      reg.validationDeadline &&
      new Date(reg.validationDeadline) < now
    ) {
      await rtdbRegistrationUpdate(reg.id, { status: "annulé", cancelledAt: now.toISOString() });
      autocancelled++;
    }
  }

  if (autocancelled > 0) {
    await rtdbAuditLog("auto_cancel_validation_expired", {
      count: autocancelled,
      timestamp: now.toISOString(),
    });
  }

  return { sent, autocancelled };
}

// ==== JOB 3: Batch delete 24H after tour (Q3: 01:00 daily) ====
async function batchDeletePostTour(): Promise<{ deletedRegs: number; deletedWaitlist: number }> {
  const completedTours = await rtdbToursCompleted();

  let deletedRegs = 0,
    deletedWaitlist = 0;

  for (const tour of completedTours) {
    if (tour.batchDeleteExecuted) {
      continue; // Skip if already executed (idempotency)
    }
    let tourRegs = 0,
      tourWaits = 0;

    // Purge RGPD réelle (PII effacées) — un simple deletedAt gardait emails et
    // noms en base indéfiniment, à rebours de l'objet du job.
    const regs = await rtdbRegistrationsListByTour(tour.id);
    for (const reg of regs) {
      await rtdbRegistrationErase(reg.id);
      deletedRegs++;
      tourRegs++;
    }

    const waits = await rtdbWaitlistListByTour(tour.id);
    for (const wait of waits) {
      await rtdbWaitlistErase(wait.id);
      deletedWaitlist++;
      tourWaits++;
    }

    // Audit log (compteurs de CE tour, pas le cumul du batch)
    await rtdbAuditLog("batch_delete_post_tour", {
      tourId: tour.id,
      tourTitle: tour.title,
      deletedRegistrations: tourRegs,
      deletedWaitlist: tourWaits,
      reason: "RGPD 24h after tour completion",
      timestamp: new Date().toISOString(),
    });

    // Mark executed for idempotency
    await rtdbTourUpdate(tour.id, { batchDeleteExecuted: true });
  }

  return { deletedRegs, deletedWaitlist };
}

// ==== JOB: Expire pending validations (spot held during confirmation window) ====
// Registration "attente_validation" reserves a seat (rtdbCountRegisteredByTour) until
// the 24h email-confirmation link expires. This job auto-cancels those past deadline
// so the seat frees up (waitlist promotion picks it up on its own run).
async function expirePendingRegistrations(): Promise<{ autocancelled: number }> {
  const now = new Date();
  let autocancelled = 0;

  for (const tour of await rtdbToursListAll()) {
    const regs = await rtdbRegistrationsListByTour(tour.id);
    for (const reg of regs) {
      if (
        reg.status === "attente_validation" &&
        reg.validationExpiresAt &&
        new Date(reg.validationExpiresAt) < now
      ) {
        await rtdbRegistrationUpdate(reg.id, { status: "annulé", cancelledAt: now.toISOString() });
        autocancelled++;
      }
    }
  }

  if (autocancelled > 0) {
    await rtdbAuditLog("auto_cancel_pending_validation_expired", {
      count: autocancelled,
      timestamp: now.toISOString(),
    });
  }

  return { autocancelled };
}

// ==== JOB 4: Promote from waitlist (Q4, Q5) ====
// Fills ANY free slot — handles cancellations AND capacity increase (spec §9).
// Runs expirePendingRegistrations() first (Hobby plan caps cron at 1/day, so this
// piggybacks on the existing daily slot instead of a dedicated cron entry).
async function promoteFromWaitlist(): Promise<{ promoted: number; rejected: number; autocancelled: number }> {
  const { autocancelled } = await expirePendingRegistrations();

  const now = new Date();
  let promoted = 0,
    rejected = 0;

  // Step 1: Auto-reject expired offers (> 24H) first, so their slot reopens this run (Q5)
  for (const tour of await rtdbToursListAll()) {
    const waits = await rtdbWaitlistListByTour(tour.id);
    for (const wait of waits) {
      if (
        wait.invitationSentAt &&
        !wait.rejectedAt &&
        wait.invitationExpiresAt &&
        new Date(wait.invitationExpiresAt) < now
      ) {
        await rtdbWaitlistUpdate(wait.id, { rejectedAt: now.toISOString() });
        rejected++;

        const success = await sendEmailWithRetry(
          JSON.parse(process.env.VISIT_EMAILJS_TEMPLATE_IDS || "{}").waitlist_offer_expired,
          {
            to: wait.email,
            firstName: wait.firstName,
            tourTitle: tour.title,
            type: "waitlist_offer_expired",
          },
          `${wait.id}_waitlist_offer_expired`
        );

        if (!success) {
          console.error(`[visit-emails] Failed to send waitlist offer expired email to ${wait.email}`);
          await rtdbAuditLog("waitlist_offer_expired_email_failed", {
            waitlistId: wait.id,
            tourId: tour.id,
            email: wait.email,
          });
        }
      }
    }
  }

  // Step 2: For each upcoming tour, fill free slots from the waitlist.
  // freeSlots = capacity - confirmed - pendingOffers(non-expired, non-rejected)
  for (const tour of await rtdbToursListFuture()) {
    const confirmedCount = await rtdbCountRegisteredByTour(tour.id);
    const waits = await rtdbWaitlistListByTour(tour.id); // sorted by position, excludes deleted

    // Pending offers reserve places (group size) until accepted/expired.
    const pendingPlaces = waits
      .filter(
        (w) =>
          w.invitationSentAt &&
          !w.rejectedAt &&
          w.invitationExpiresAt &&
          new Date(w.invitationExpiresAt) >= now
      )
      .reduce((sum, w) => sum + placesOf(w), 0);

    let freeSlots = tour.capacity - confirmedCount - pendingPlaces;
    if (freeSlots <= 0) continue;

    // Candidates = waitlist entries with no active/rejected offer, in position order.
    // Offer only if the whole group fits; stop at first that doesn't (FIFO fairness).
    const candidates = waits.filter((w) => !w.invitationSentAt && !w.rejectedAt);

    for (const next of candidates) {
      const need = placesOf(next);
      if (need > freeSlots) break;

      const token = createRegistrationToken(next.id, next.email);
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const idempotencyKey = `${next.id}_waitlist_offer`;

      // Réserver la place AVANT l'envoi email : un échec d'envoi ne doit pas laisser
      // la place "libre" indéfiniment ni bloquer la personne en position 1 pour toujours.
      await rtdbWaitlistUpdate(next.id, {
        invitationToken: token.token,
        invitationExpiresAt: token.expiresAt,
        invitationSentAt: new Date().toISOString(),
      });
      promoted++;
      freeSlots -= need;

      const success = await sendEmailWithRetry(
        JSON.parse(process.env.VISIT_EMAILJS_TEMPLATE_IDS || "{}").waitlist_offer,
        {
          to: next.email,
          firstName: next.firstName,
          tourTitle: tour.title,
          acceptLink: `${SITE_URL}/#/reservations/accept-waitlist?token=${token.token}`,
          deadline: deadline.toISOString(),
          type: "waitlist_offer",
        },
        idempotencyKey
      );

      if (!success) {
        console.error(`[visit-emails] Failed to send waitlist offer to ${next.email}`);
        await rtdbAuditLog("waitlist_offer_email_failed", {
          waitlistId: next.id,
          tourId: tour.id,
          email: next.email,
        });
      }
    }
  }

  return { promoted, rejected, autocancelled };
}

// Main handler.
// GET est accepté : les crons Vercel invoquent le path en GET — n'accepter que
// POST faisait échouer les 4 jobs quotidiens en 405 depuis toujours (aucun
// rappel, aucune purge, aucune promotion automatique).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Validate cron auth
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: "invalid authorization" });
  }

  const { type } = req.query;

  try {
    let result: any;

    if (type === "daily") {
      // Job consolidé (plan Hobby : 2 crons max — un seul suffit désormais).
      // Ordre : rappels → validation J-1 → promotion (inclut expirations/rejets) → purge.
      const reminder7d = await sendReminderEmails7d();
      const validation1d = await sendValidationEmails1d();
      const promotion = await promoteFromWaitlist();
      const cleanup = await batchDeletePostTour();
      result = { reminder7d, validation1d, promotion, cleanup };
    } else if (type === "send-7d-reminder") {
      result = await sendReminderEmails7d();
    } else if (type === "send-1d-validation") {
      result = await sendValidationEmails1d();
    } else if (type === "batch-delete-post-tour") {
      result = await batchDeletePostTour();
    } else if (type === "promote-waitlist") {
      result = await promoteFromWaitlist();
    } else {
      return res.status(400).json({ error: "unknown job type" });
    }

    return res.json({ ok: true, type, ...result });
  } catch (e) {
    console.error(`[visit-emails] Job ${type} failed:`, e);
    return res.status(500).json({ error: "job failed", type });
  }
}
