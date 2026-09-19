// Doodates Attendance API — Appel + marquage présences (guide only)
// POST /api/visit-attendance — marquer présent/absent (guide)
// GET /api/visit-attendance?tourId=... — lister présences (guide)
// DELETE /api/visit-attendance — annuler une inscription (guide)

import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  rtdbAttendanceUpsert,
  rtdbAttendanceListByTour,
  rtdbRegistrationGet,
  rtdbRegistrationUpdate,
  rtdbRegistrationsListByTour,
  rtdbGuideCodeValidate,
  holdsSeat,
  rtdbRegistrationsGroupedByTour,
  rtdbWaitlistGroupedByTour,
  rtdbToursListAll,
  rtdbTourStatsList,
} from "./_visit-db.js";
import { placesOf, Registration } from "../src/types/visitTypes.js";
import { cancelRegistration } from "./visit-register.js";

// Helper: validate guide code
async function validateGuideCode(code: string | undefined): Promise<boolean> {
  if (!code) return false;
  return rtdbGuideCodeValidate(code);
}

// Helper: check guide auth
async function requireGuideCode(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const code = req.headers["x-guide-code"] as string | undefined;
  const valid = await validateGuideCode(code);

  if (!valid) {
    res.status(401).json({ error: "guide code required in x-guide-code header" });
    return false;
  }

  return true;
}

// POST /api/visit-attendance — marquer présent/absent
async function handleMarkAttendance(req: VercelRequest, res: VercelResponse) {
  // Validate guide auth
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  const { registrationId, tourId, present } = req.body;

  if (!registrationId || typeof registrationId !== "string") {
    return res.status(400).json({ error: "registrationId: string required" });
  }

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId: string required" });
  }

  if (typeof present !== "boolean") {
    return res.status(400).json({ error: "present: boolean required" });
  }

  try {
    const reg = await rtdbRegistrationGet(registrationId);

    if (!reg || reg.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }

    if (reg.tourId !== tourId) {
      return res.status(400).json({ error: "registration does not belong to this tour" });
    }

    if (!holdsSeat(reg)) {
      return res.status(409).json({ error: `cannot mark attendance: registration is "${reg.status}"` });
    }

    // Create/update attendance record (un seul par inscription)
    const attendance = await rtdbAttendanceUpsert({
      registrationId,
      tourId,
      present: Boolean(present),
      markedAt: new Date().toISOString(),
      markedByGuide: "all-guides", // Anonymous
    });

    // Update registration status
    const newStatus = present ? "présent" : "absent";
    await rtdbRegistrationUpdate(registrationId, {
      status: newStatus,
      attendedAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      attendance,
      message: `Marked as ${newStatus}`,
    });
  } catch (e) {
    console.error("[visit-attendance POST]", e);
    return res.status(500).json({ error: "attendance marking failed" });
  }
}

// GET /api/visit-attendance?tourId=... — lister présences
async function handleListAttendance(req: VercelRequest, res: VercelResponse) {
  // Validate guide auth
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  const { tourId } = req.query;

  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId: string required" });
  }

  try {
    // Get all registrations for tour
    const registrations = await rtdbRegistrationsListByTour(tourId);

    // Get all attendance records for tour
    const attendance = await rtdbAttendanceListByTour(tourId);

    // Index attendance by registrationId for quick lookup
    const attendanceMap = new Map();
    for (const att of attendance) {
      attendanceMap.set(att.registrationId, att);
    }

    // Enrich registrations with attendance data.
    // Seules les inscriptions occupant une place sont renvoyées : les annulées
    // polluaient la feuille d'appel, le CSV, l'impression et les compteurs.
    const enriched = registrations
      .filter((r) => holdsSeat(r))
      .map((r) => {
        const att = attendanceMap.get(r.id);
        return {
          ...r,
          attendance: att || null,
          markedPresent: att?.present ?? null,
        };
      });

    // Sort by lastName, firstName
    enriched.sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName);
      return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
    });

    // Comptages en PERSONNES (place = titulaire + accompagnants), cohérent avec la capacité.
    const sumPlaces = (arr: typeof enriched) => arr.reduce((s, r) => s + placesOf(r), 0);
    const counts = {
      total: enriched.length, // nb d'inscriptions occupant une place (lignes)
      // Toutes les personnes de la liste renvoyée, quel que soit leur statut :
      // c'est ce que le guide a sous les yeux, et donc ce qu'affichent la carte
      // « Inscrits » et l'onglet du portail.
      seatsTaken: sumPlaces(enriched),
      totalPeople: sumPlaces(enriched.filter((r) => r.status === "confirmé" || r.status === "présent")),
      confirmed: sumPlaces(enriched.filter((r) => r.status === "confirmé")),
      present: sumPlaces(enriched.filter((r) => r.markedPresent === true)),
      absent: sumPlaces(enriched.filter((r) => r.markedPresent === false)),
      unmarked: sumPlaces(
        enriched.filter((r) => r.markedPresent === null && (r.status === "confirmé" || r.status === "présent"))
      ),
    };

    return res.json({
      tourId,
      counts,
      registrations: enriched,
    });
  } catch (e) {
    console.error("[visit-attendance GET]", e);
    return res.status(500).json({ error: "list failed" });
  }
}

// DELETE /api/visit-attendance — le guide annule une inscription (ex : la
// personne a prévenu par email). Même effet que l'annulation user : email
// d'annulation + promotion immédiate de la file d'attente.
async function handleCancelByGuide(req: VercelRequest, res: VercelResponse) {
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  const { registrationId, tourId } = req.body || {};
  if (!registrationId || typeof registrationId !== "string") {
    return res.status(400).json({ error: "registrationId: string required" });
  }
  if (!tourId || typeof tourId !== "string") {
    return res.status(400).json({ error: "tourId: string required" });
  }

  try {
    const reg = await rtdbRegistrationGet(registrationId);
    if (!reg || reg.deletedAt) {
      return res.status(404).json({ error: "registration not found" });
    }
    if (reg.tourId !== tourId) {
      return res.status(400).json({ error: "registration does not belong to this tour" });
    }
    if (reg.status === "annulé") {
      return res.json({ ok: true, message: "Already cancelled" });
    }
    await cancelRegistration(reg);
    return res.json({ ok: true, message: "Inscription annulée" });
  } catch (e) {
    console.error("[visit-attendance cancel]", e);
    return res.status(500).json({ error: "cancellation failed" });
  }
}

// GET /api/visit-attendance?action=overview — chiffres de TOUTES les visites,
// en une seule requête (guide).
//
// Le portail guide lançait deux requêtes par visite au chargement — une pour la
// feuille d'appel, une pour la file d'attente — et chacune relisait les
// inscriptions document par document. Sur un programme d'une trentaine de
// visites, ça faisait une soixantaine d'appels HTTP et plusieurs centaines de
// lectures en base, à chaque ouverture et à chaque rafraîchissement. Tout est
// désormais calculé ici à partir de deux lectures groupées.
async function handleOverview(req: VercelRequest, res: VercelResponse) {
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  try {
    const [tours, regsByTour, waitsByTour] = await Promise.all([
      rtdbToursListAll(),
      rtdbRegistrationsGroupedByTour(),
      rtdbWaitlistGroupedByTour(),
    ]);

    const tourIds = tours.map((t) => t.id);
    const registrations: Record<string, unknown[]> = {};
    const waitlistPlaces: Record<string, number> = {};

    for (const tourId of tourIds) {
      const seated = (regsByTour.get(tourId) || []).filter((r) => holdsSeat(r));
      // Mêmes champs que la réponse détaillée : le portail calcule ses
      // statistiques sur cette liste, elle doit avoir exactement la même forme.
      registrations[tourId] = seated;

      waitlistPlaces[tourId] = (waitsByTour.get(tourId) || [])
        .filter((w) => !w.rejectedAt)
        .reduce((sum, w) => sum + placesOf(w), 0);
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ registrations, waitlistPlaces });
  } catch (e) {
    console.error("[visit-attendance overview]", e);
    return res.status(500).json({ error: "overview failed" });
  }
}

// GET /api/visit-attendance?action=stats — bilan des visites passées (guide).
// Données strictement anonymes, conservées après la purge RGPD.
async function handleStats(req: VercelRequest, res: VercelResponse) {
  if (!(await requireGuideCode(req, res))) {
    return;
  }

  try {
    const stats = await rtdbTourStatsList();

    // Taux d'absentéisme global : c'est LE chiffre qui permet de régler le
    // surbooking. On ne le calcule que sur les visites réellement pointées —
    // inclure les visites où personne n'a fait l'appel le ferait tendre vers
    // zéro et donnerait une fausse impression d'assiduité.
    const pointees = stats.filter((s) => s.present + s.absent > 0);
    const attendus = pointees.reduce((sum, s) => sum + s.present + s.absent, 0);
    const absents = pointees.reduce((sum, s) => sum + s.absent, 0);

    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      tours: stats,
      global: {
        toursRecorded: stats.length,
        toursWithAttendance: pointees.length,
        expected: attendus,
        absent: absents,
        noShowRate: attendus > 0 ? Math.round((absents / attendus) * 100) : null,
      },
    });
  } catch (e) {
    console.error("[visit-attendance stats]", e);
    return res.status(500).json({ error: "stats failed" });
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && req.query.action === "stats") {
    return handleStats(req, res);
  }
  if (req.method === "GET" && req.query.action === "overview") {
    return handleOverview(req, res);
  }
  if (req.method === "POST") {
    return handleMarkAttendance(req, res);
  } else if (req.method === "GET") {
    return handleListAttendance(req, res);
  } else if (req.method === "DELETE") {
    return handleCancelByGuide(req, res);
  } else {
    return res.status(405).json({ error: "method not allowed" });
  }
}
