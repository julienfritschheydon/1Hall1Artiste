// Doodates Email Batch Jobs (Cron) — Rappels, validation, suppression RGPD, promo file attente
// POST /api/visit-emails?type=send-7d-reminder — Rappel 7j avant (daily)
// POST /api/visit-emails?type=send-1d-reminder — Rappel la veille, avec lien de désistement (daily)
// POST /api/visit-emails?type=send-3h-reminder — Rappel ~3h avant (horaire, GitHub Actions)
// POST /api/visit-emails?type=batch-delete-post-tour — Purge RGPD des inscriptions passé le délai de conservation (daily)
// POST /api/visit-emails?type=promote-waitlist — Auto-promotion file attente

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbRegistrationsListByDateRange,
  rtdbRegistrationsListByTourDay,
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
  rtdbCountWaitlistedPlaces,
  rtdbTourStatsPut,
  holdsSeat,
  retentionDays,
} from "./_visit-db.js";
import { placesOf, bookableCapacity } from "../src/types/visitTypes.js";
import { buildVisitEmail } from "./_visit-email.js";
import { createRegistrationToken } from "./_token.js";

const SITE_URL = process.env.PUBLIC_SITE_URL || "https://www.1hall1artiste.fr";
const MAX_RETRIES = 3;
const QUOTA_WARNING_THRESHOLD = 50;
// Horizon de rattrapage du rappel « quelques heures avant ». Assez large pour
// absorber plusieurs runs horaires manqués, assez court pour que l'email reste
// un rappel du jour même et non un second J-1.
const REMINDER_3H_HORIZON_MS = 4 * 60 * 60 * 1000;

let quotaWarningAlertSent = false;

/**
 * ID de template EmailJS pour un type d'email, avec repli.
 *
 * Tous les types partagent exactement les mêmes `template_params`
 * (`to_email`, `subject`, `message`, `firstName`) : le sujet et le corps sont
 * construits dans `buildVisitEmail`, le template EmailJS n'affiche que
 * `{{subject}}` / `{{{message}}}`. Les templates sont donc interchangeables, et
 * un type sans entrée dédiée peut réutiliser n'importe quel autre ID configuré
 * plutôt que d'échouer.
 *
 * Sans ce repli, ajouter un type d'email exigeait de créer un template EmailJS
 * ET d'éditer `VISIT_EMAILJS_TEMPLATE_IDS` avant tout envoi : jusque-là le job
 * tournait en passant `template_id: undefined`, et chaque envoi échouait.
 *
 * Retourne `undefined` seulement si AUCUN ID n'est configuré — l'appelant
 * traite alors l'envoi comme un échec, comme avant.
 */
export function resolveTemplateId(type: string): string | undefined {
  let ids: Record<string, unknown>;
  try {
    ids = JSON.parse(process.env.VISIT_EMAILJS_TEMPLATE_IDS || "{}");
  } catch {
    console.error("[visit-emails] VISIT_EMAILJS_TEMPLATE_IDS n'est pas un JSON valide");
    return undefined;
  }
  if (!ids || typeof ids !== "object") return undefined;

  const own = ids[type];
  if (typeof own === "string" && own) return own;

  // Repli : n'importe quel autre ID configuré rend le même email.
  const fallback = Object.entries(ids).find(([, v]) => typeof v === "string" && v);
  if (fallback) {
    console.warn(
      `[visit-emails] Pas de template configuré pour « ${type} » — repli sur « ${fallback[0]} » ` +
        `(les templates sont interchangeables, seuls subject/message varient).`
    );
    return fallback[1] as string;
  }
  return undefined;
}

// Q1, Q2: Send email with idempotency key + retry
async function sendEmailWithRetry(
  templateId: string | undefined,
  data: Record<string, any>,
  idempotencyKey: string
): Promise<boolean> {
  // Aucun template configuré : on échoue tout de suite avec un message lisible.
  // Avant, un `templateId` absent partait tel quel chez EmailJS, qui répondait
  // une erreur opaque après 3 tentatives.
  if (!templateId) {
    console.error(
      `[visit-emails] Aucun template EmailJS configuré (type « ${data.type} ») — ` +
        `renseigner VISIT_EMAILJS_TEMPLATE_IDS.`
    );
    return false;
  }
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
        },
        body: JSON.stringify(emailjsData),
      });

      // Track quota from response headers
      const remaining = res.headers.get("X-RateLimit-Remaining");
      if (remaining) {
        const quotaInt = parseInt(remaining);
        console.log(`[emailjs-quota] ${quotaInt} requests remaining`);

        // Alert admin if quota low (once per cron run)
        if (quotaInt < QUOTA_WARNING_THRESHOLD && !quotaWarningAlertSent) {
          quotaWarningAlertSent = true;
          await sendAdminAlert(
            "EmailJS Quota Warning",
            `Only ${quotaInt} requests remaining. May be insufficient for next batch.`
          );
        }
      }

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
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
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
async function sendReminderEmails7d(): Promise<{ sent: number; failed: number; examined: number }> {
  quotaWarningAlertSent = false; // Reset for this run
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Toutes les visites du JOUR J+7 (heure de Paris), quelle que soit l'heure de
  // départ. L'ancienne fenêtre de ±1h autour de l'instant J+7 ne pouvait jamais
  // matcher : le cron tourne à 04:00 UTC, elle ne couvrait donc que les visites
  // démarrant entre 03:00 et 05:00 UTC.
  const registrations = await rtdbRegistrationsListByTourDay(sevenDaysLater);

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
      resolveTemplateId("reminder_7d"),
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

  // `examined` distingue « aucune visite ce jour-là » (0 candidat, normal) de
  // « des candidats mais aucun envoi » (anormal) — sans lui, un `sent: 0` dans
  // les logs est ininterprétable.
  return { sent, failed, examined: registrations.length };
}

// ==== JOB 1bis: Send 3h reminder (cron horaire — GitHub Actions) ====
// Complète les rappels J-7/J-1 sans les remplacer : c'est le seul qui atteigne
// les gens inscrits la veille au soir pour le lendemain, que les jobs quotidiens
// ratent (ils ne tournent qu'une fois par jour, hors de leur fenêtre).
//
// Fenêtre de RATTRAPAGE et non de ciblage : on prend tout ce qui part entre
// maintenant et H+4, et `reminder3hSent` fait le tri. L'ancienne fenêtre
// glissante (3h ±30 min) ratait DÉFINITIVEMENT un rappel dès qu'un run sautait :
// GitHub Actions décale les runs planifiés en période de charge, et surtout
// désactive un workflow planifié après 60 jours sans activité sur le dépôt —
// entre deux éditions du festival, c'est la situation normale. Le run suivant
// retrouvait la visite hors fenêtre et n'envoyait plus rien, sans la moindre
// trace. Ici, n'importe quel run dans les 4h précédant la visite rattrape le
// rappel, donc un ou plusieurs runs manqués sont sans conséquence.
async function sendReminderEmails3h(): Promise<{ sent: number; failed: number; examined: number }> {
  quotaWarningAlertSent = false; // Reset for this run
  const now = new Date();
  const catchUpHorizon = new Date(now.getTime() + REMINDER_3H_HORIZON_MS);

  const registrations = await rtdbRegistrationsListByDateRange(now, catchUpHorizon);

  let sent = 0,
    failed = 0;

  for (const reg of registrations) {
    if (reg.status !== "confirmé" || reg.reminder3hSent) {
      continue; // Skip if not confirmed or already sent
    }

    const tour = await rtdbTourGet(reg.tourId);
    if (!tour) continue;

    const idempotencyKey = `${reg.id}_3h_reminder`;
    const success = await sendEmailWithRetry(
      resolveTemplateId("reminder_3h"),
      {
        to: reg.email,
        firstName: reg.firstName,
        tourTitle: tour.title,
        tourDate: tour.date,
        startLocationName: tour.startLocationName,
        type: "reminder_3h",
      },
      idempotencyKey
    );

    if (success) {
      await rtdbRegistrationUpdate(reg.id, { reminder3hSent: true });
      sent++;
    } else {
      console.error(`[visit-emails] Failed to send 3h reminder to ${reg.email}`);
      failed++;
    }
  }

  if (failed > 0) {
    await sendAdminAlert("Doodates 3h Reminder Failures", `${failed} reminders failed to send`);
  }

  return { sent, failed, examined: registrations.length };
}

// ==== JOB 2: Rappel de la veille (J-1) ====
//
// Ce job exigeait auparavant un clic de re-confirmation et ANNULAIT
// automatiquement, en silence, quiconque n'avait pas cliqué dans les 24h —
// alors même que le formulaire public promet « votre inscription est
// enregistrée immédiatement, aucun lien à valider ». Concrètement, une personne
// qui ne lisait pas ses mails la veille perdait sa place sans aucune
// notification et se présentait devant un guide qui ne l'avait plus sur sa
// liste ; la place libérée partait ensuite en offre de file d'attente avec un
// délai de réponse de 24h… pour une visite qui avait lieu dans moins de 24h.
//
// C'est désormais un simple rappel : la place reste acquise, et le seul bouton
// libère la place volontairement. C'est le levier anti-absentéisme réellement
// documenté (un désistement rendu facile vaut mieux qu'une place perdue), sans
// aucun risque d'annuler quelqu'un qui comptait venir.
async function sendReminderEmails1d(): Promise<{ sent: number; examined: number }> {
  quotaWarningAlertSent = false; // Reset for this run
  const now = new Date();
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Toutes les visites du JOUR J+1 (heure de Paris) — même raison qu'au J-7.
  const registrations = await rtdbRegistrationsListByTourDay(oneDayLater);

  let sent = 0;

  for (const reg of registrations) {
    // `validation1dSent` garde son nom : c'est le drapeau d'idempotence déjà
    // posé sur les inscriptions en base. Le renommer imposerait une migration
    // pour aucun gain fonctionnel.
    if (reg.status !== "confirmé" || reg.validation1dSent) {
      continue;
    }

    const tour = await rtdbTourGet(reg.tourId);
    if (!tour) continue;

    // Nombre de personnes en attente : c'est ce qui donne du sens au bouton de
    // désistement. « Libérez votre place, 6 personnes attendent » agit, « vous
    // pouvez annuler » n'agit pas.
    const waitlistPlaces = await rtdbCountWaitlistedPlaces(reg.tourId);

    const idempotencyKey = `${reg.id}_1d_reminder`;
    const success = await sendEmailWithRetry(
      resolveTemplateId("reminder_1d"),
      {
        to: reg.email,
        firstName: reg.firstName,
        tourTitle: tour.title,
        tourDate: tour.date,
        location: tour.startLocationName,
        cancelLink: `${SITE_URL}/#/reservations/cancel?id=${reg.id}`,
        waitlistCount: waitlistPlaces,
        type: "reminder_1d",
      },
      idempotencyKey
    );

    if (success) {
      await rtdbRegistrationUpdate(reg.id, { validation1dSent: true });
      sent++;
    } else {
      console.error(`[visit-emails] Failed to send 1d reminder to ${reg.email}`);
    }
  }

  return { sent, examined: registrations.length };
}

// ==== JOB 3: Purge RGPD des visites passées (quotidien) ====
// Le délai est porté par retentionDays() (api/_visit-db.ts), pas codé ici.
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

    const regs = await rtdbRegistrationsListByTour(tour.id);
    const waits = await rtdbWaitlistListByTour(tour.id);

    // Bilan chiffré AVANT la purge : c'est le dernier instant où ces données
    // existent. Sans cette écriture, le collectif perd le taux d'absentéisme de
    // chaque visite à l'expiration du délai — et ne peut donc jamais régler son
    // surbooking sur ses propres chiffres.
    const seated = regs.filter((r) => holdsSeat(r));
    const sumPlaces = (list: typeof seated) => list.reduce((sum, r) => sum + placesOf(r), 0);
    await rtdbTourStatsPut({
      tourId: tour.id,
      title: tour.title,
      date: tour.date,
      capacity: tour.capacity,
      overbookingSeats: tour.overbookingSeats ?? 0,
      seatsTaken: sumPlaces(seated),
      present: sumPlaces(seated.filter((r) => r.status === "présent")),
      absent: sumPlaces(seated.filter((r) => r.status === "absent")),
      unmarked: sumPlaces(seated.filter((r) => r.status === "confirmé")),
      waitlistPlaces: waits.filter((w) => !w.rejectedAt).reduce((sum, w) => sum + placesOf(w), 0),
      recordedAt: new Date().toISOString(),
    });

    // Purge RGPD réelle (PII effacées) — un simple deletedAt gardait emails et
    // noms en base indéfiniment, à rebours de l'objet du job.
    for (const reg of regs) {
      await rtdbRegistrationErase(reg.id);
      deletedRegs++;
      tourRegs++;
    }

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
      reason: `RGPD: délai de conservation de ${retentionDays()} jours dépassé`,
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
  quotaWarningAlertSent = false; // Reset for this run

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
          resolveTemplateId("waitlist_offer_expired"),
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
  // freeSlots = places ouvertes (capacité + surbooking) - confirmés - offres en cours
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

    let freeSlots = bookableCapacity(tour) - confirmedCount - pendingPlaces;
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
        resolveTemplateId("waitlist_offer"),
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

  return { promoted, rejected };
}

// Main handler.
// GET est accepté : les crons Vercel invoquent le path en GET — n'accepter que
// POST faisait échouer les 4 jobs quotidiens en 405 depuis toujours (aucun
// rappel, aucune purge, aucune promotion automatique).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // Validate cron auth
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: "Autorisation invalide" });
  }

  const { type } = req.query;

  try {
    let result: any;

    if (type === "daily") {
      // Job consolidé (plan Hobby : 2 crons max — un seul suffit désormais).
      // Ordre : rappels → rappel J-1 → promotion (inclut les offres expirées) → purge.
      const reminder7d = await sendReminderEmails7d();
      const reminder1d = await sendReminderEmails1d();
      const promotion = await promoteFromWaitlist();
      const cleanup = await batchDeletePostTour();
      result = { reminder7d, reminder1d, promotion, cleanup };
    } else if (type === "send-7d-reminder") {
      result = await sendReminderEmails7d();
    } else if (type === "send-3h-reminder") {
      result = await sendReminderEmails3h();
    } else if (type === "send-1d-reminder" || type === "send-1d-validation") {
      // `send-1d-validation` : ancien nom, conservé pour ne pas casser un
      // déclenchement manuel ou une doc qui traînerait.
      result = await sendReminderEmails1d();
    } else if (type === "batch-delete-post-tour") {
      result = await batchDeletePostTour();
    } else if (type === "promote-waitlist") {
      result = await promoteFromWaitlist();
    } else {
      return res.status(400).json({ error: "Type de tâche inconnu" });
    }

    // Trace unique et lisible dans les logs Vercel : le corps de la réponse
    // part chez l'invocateur du cron et n'est archivé nulle part, donc sans
    // cette ligne un run ne laisse qu'un « 200 » — impossible de vérifier après
    // coup si des rappels sont réellement partis.
    console.log(`[visit-emails] Job « ${type} » terminé : ${JSON.stringify(result)}`);

    return res.json({ ok: true, type, ...result });
  } catch (e) {
    console.error(`[visit-emails] Job ${type} failed:`, e);
    return res.status(500).json({ error: "Échec de la tâche", type });
  }
}
