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
  rtdbTourGet,
} from "./_visit-db.js";
import { verifyRegistrationToken } from "./_token.js";

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

    // Create registration from waitlist
    const registration = await rtdbRegistrationCreate({
      tourId: waitlist.tourId,
      email: waitlist.email,
      firstName: waitlist.firstName,
      lastName: waitlist.lastName,
      companionFirstName: waitlist.companionFirstName,
      companionLastName: waitlist.companionLastName,
      status: "confirmé",
    });

    // Soft delete waitlist entry
    await rtdbWaitlistSoftDelete(waitlistId);

    // Log: Offer accepted
    console.log(`[waitlist] Offer accepted: waitlist_${waitlistId} → registration_${registration.id}`);

    return res.json({
      ok: true,
      registrationId: registration.id,
      message: "Inscription confirmed",
    });
  } catch (e) {
    console.error("[visit-waitlist activate]", e);
    return res.status(500).json({ error: "activation failed" });
  }
}

// DELETE /api/visit-waitlist/{id} — annuler (reorder Q4)
async function handleDeleteWaitlist(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "waitlist id required" });
  }

  try {
    const waitlist = await rtdbWaitlistGet(id);

    if (!waitlist) {
      return res.status(404).json({ error: "waitlist entry not found" });
    }

    if (waitlist.deletedAt) {
      return res.status(410).json({ error: "already cancelled" });
    }

    // Soft delete
    await rtdbWaitlistSoftDelete(id);

    // Q4: Reorder positions after this one (position -= 1 for all after)
    await rtdbWaitlistReorderAfter(waitlist.tourId, waitlist.position);

    console.log(`[waitlist] Cancelled: position_${waitlist.position} for tour_${waitlist.tourId}`);

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

    // Return only position + email (anonymized, no details)
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
    if (path?.endsWith("/activate")) {
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
