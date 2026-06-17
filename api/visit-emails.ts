// Doodates Email Batch Jobs (Cron) — Rappels, validation, suppression RGPD, promo file attente
// POST /api/visit-emails?type=send-7d-reminder — Rappel 7j avant (daily)
// POST /api/visit-emails?type=send-1d-validation — Validation 1j avant (daily)
// POST /api/visit-emails?type=batch-delete-post-tour — Suppression RGPD 24H après (daily)
// POST /api/visit-emails?type=promote-waitlist — Auto-promotion file attente

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbRegistrationsListByDateRange,
  rtdbRegistrationUpdate,
  rtdbToursCompleted,
  rtdbTourUpdate,
  rtdbRegistrationsListByTour,
  rtdbRegistrationSoftDelete,
  rtdbWaitlistListByTour,
  rtdbWaitlistSoftDelete,
  rtdbAuditLog,
  rtdbWaitlistUpdate,
  rtdbTourGet,
  rtdbToursListAll,
  rtdbToursListFuture,
  rtdbCountRegisteredByTour,
} from "./_visit-db.js";
import { createRegistrationToken } from "./_token.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MAX_RETRIES = 3;

// Q1, Q2: Send email with idempotency key + retry
async function sendEmailWithRetry(
  templateId: string,
  data: Record<string, any>,
  idempotencyKey: string
): Promise<boolean> {
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
      acceptLink: data.acceptLink,
      deadline: data.deadline,
      type: data.type,
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
  const auth = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return auth === expected;
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

  // Q15: Auto-cancel registrations past validation deadline
  const allRegs = await rtdbRegistrationsListByDateRange(new Date(0), now);
  for (const reg of allRegs) {
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

    // Soft delete all registrations
    const regs = await rtdbRegistrationsListByTour(tour.id);
    for (const reg of regs) {
      if (!reg.deletedAt) {
        // Only delete if not already soft-deleted
        await rtdbRegistrationSoftDelete(reg.id);
        deletedRegs++;
      }
    }

    // Soft delete all waitlist entries
    const waits = await rtdbWaitlistListByTour(tour.id);
    for (const wait of waits) {
      if (!wait.deletedAt) {
        await rtdbWaitlistSoftDelete(wait.id);
        deletedWaitlist++;
      }
    }

    // Audit log
    await rtdbAuditLog("batch_delete_post_tour", {
      tourId: tour.id,
      tourTitle: tour.title,
      deletedRegistrations: deletedRegs,
      deletedWaitlist: deletedWaitlist,
      reason: "RGPD 24h after tour completion",
      timestamp: new Date().toISOString(),
    });

    // Mark executed for idempotency
    await rtdbTourUpdate(tour.id, { batchDeleteExecuted: true });
  }

  return { deletedRegs, deletedWaitlist };
}

// ==== JOB 4: Promote from waitlist (Q4, Q5) ====
// Fills ANY free slot — handles cancellations AND capacity increase (spec §9).
async function promoteFromWaitlist(): Promise<{ promoted: number; rejected: number }> {
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
      }
    }
  }

  // Step 2: For each upcoming tour, fill free slots from the waitlist.
  // freeSlots = capacity - confirmed - pendingOffers(non-expired, non-rejected)
  for (const tour of await rtdbToursListFuture()) {
    const confirmedCount = await rtdbCountRegisteredByTour(tour.id);
    const waits = await rtdbWaitlistListByTour(tour.id); // sorted by position, excludes deleted

    const pendingOffers = waits.filter(
      (w) =>
        w.invitationSentAt &&
        !w.rejectedAt &&
        w.invitationExpiresAt &&
        new Date(w.invitationExpiresAt) >= now
    ).length;

    let freeSlots = tour.capacity - confirmedCount - pendingOffers;
    if (freeSlots <= 0) continue;

    // Candidates = waitlist entries with no active/rejected offer, in position order
    const candidates = waits.filter((w) => !w.invitationSentAt && !w.rejectedAt);

    for (const next of candidates) {
      if (freeSlots <= 0) break;

      const token = createRegistrationToken(next.id, next.email);
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const idempotencyKey = `${next.id}_waitlist_offer`;

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

      if (success) {
        await rtdbWaitlistUpdate(next.id, {
          invitationToken: token.token,
          invitationExpiresAt: token.expiresAt,
          invitationSentAt: new Date().toISOString(),
        });
        promoted++;
        freeSlots--;
      } else {
        console.error(`[visit-emails] Failed to send waitlist offer to ${next.email}`);
      }
    }
  }

  return { promoted, rejected };
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Validate cron auth
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: "invalid authorization" });
  }

  const { type } = req.query;

  try {
    let result: any;

    if (type === "send-7d-reminder") {
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
