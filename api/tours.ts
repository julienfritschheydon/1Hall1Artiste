// Fetch user's tours (registrations + waitlist) by email
// GET /api/tours?email=user@example.com

import { VercelRequest, VercelResponse } from "@vercel/node";
import { rtdbRegistrationsListByEmail, rtdbWaitlistListByEmail, rtdbTourGet } from "./_visit-db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const { email } = req.query;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email required" });
  }

  try {
    // Fetch registrations + waitlist for email
    const [registrations, waitlist] = await Promise.all([
      rtdbRegistrationsListByEmail(email),
      rtdbWaitlistListByEmail(email),
    ]);

    // Collect unique tour IDs
    const tourIds = new Set<string>();
    registrations.forEach((r) => tourIds.add(r.tourId));
    waitlist.forEach((w) => tourIds.add(w.tourId));

    // Fetch all related tours
    const tours: Record<string, any> = {};
    for (const tourId of tourIds) {
      const tour = await rtdbTourGet(tourId);
      if (tour) {
        tours[tourId] = tour;
      }
    }

    // If no registrations/waitlist found, return 404
    if (registrations.length === 0 && waitlist.length === 0) {
      return res.status(404).json({ error: "no bookings found" });
    }

    return res.status(200).json({
      tours,
      registrations,
      waitlist,
    });
  } catch (e) {
    console.error("[tours GET]", e);
    return res.status(500).json({ error: "fetch failed" });
  }
}
