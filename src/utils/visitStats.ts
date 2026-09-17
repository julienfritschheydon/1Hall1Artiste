import { Registration, Tour, placesOf } from "../types/visitTypes";

export interface MultiVisitAttendee {
  email: string;
  name: string;
  tourIds: string[];
  totalPlaces: number;
}

export interface VisitAggregationStats {
  registrationCounts: Record<string, number>;
  uniqueAttendeesCount: number;
  multiVisitAttendeesCount: number;
  multiVisitAttendees: MultiVisitAttendee[];
  multiVisitTourCounts: Record<string, number>; // tourId -> count of attendees on this tour who attend >= 2 tours
  emptyToursCount: number;
}

export function computeVisitAggregation(
  tours: Tour[],
  registrationsByTour: Record<string, Registration[]>
): VisitAggregationStats {
  const registrationCounts: Record<string, number> = {};
  const userMap = new Map<
    string,
    {
      email: string;
      name: string;
      tourIds: Set<string>;
      totalPlaces: number;
    }
  >();

  // 1. Process active registrations per tour
  for (const tour of tours) {
    const list = registrationsByTour[tour.id] || [];
    const activeList = list.filter(
      (r) => r.status === "confirmé" || r.status === "présent"
    );

    const tourPlaces = activeList.reduce((sum, r) => sum + placesOf(r), 0);
    registrationCounts[tour.id] = tourPlaces;

    for (const r of activeList) {
      const emailKey = (r.email || `${r.firstName}_${r.lastName}`)
        .trim()
        .toLowerCase();
      const cleanEmail = (r.email || "").trim().toLowerCase();
      const fullName = `${(r.firstName || "").trim()} ${(r.lastName || "").trim()}`.trim() || cleanEmail;
      const places = placesOf(r);

      const existing = userMap.get(emailKey);
      if (existing) {
        existing.tourIds.add(tour.id);
        existing.totalPlaces += places;
        if (!existing.name && fullName) {
          existing.name = fullName;
        }
      } else {
        userMap.set(emailKey, {
          email: cleanEmail,
          name: fullName,
          tourIds: new Set([tour.id]),
          totalPlaces: places,
        });
      }
    }
  }

  // 2. Identify attendees registered for > 1 tour
  const multiVisitAttendees: MultiVisitAttendee[] = [];
  const multiVisitEmailSet = new Set<string>();

  for (const [key, val] of userMap.entries()) {
    if (val.tourIds.size > 1) {
      multiVisitEmailSet.add(key);
      multiVisitAttendees.push({
        email: val.email,
        name: val.name,
        tourIds: Array.from(val.tourIds),
        totalPlaces: val.totalPlaces,
      });
    }
  }

  // Sort multi-visit attendees by number of tours descending, then name
  multiVisitAttendees.sort((a, b) => {
    const diff = b.tourIds.length - a.tourIds.length;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  // 3. Map each tour to the number of multi-visit attendees it has
  const multiVisitTourCounts: Record<string, number> = {};
  for (const tour of tours) {
    const list = registrationsByTour[tour.id] || [];
    const activeList = list.filter(
      (r) => r.status === "confirmé" || r.status === "présent"
    );
    let count = 0;
    for (const r of activeList) {
      const emailKey = (r.email || `${r.firstName}_${r.lastName}`)
        .trim()
        .toLowerCase();
      if (multiVisitEmailSet.has(emailKey)) {
        count++;
      }
    }
    multiVisitTourCounts[tour.id] = count;
  }

  // 4. Count empty tours
  const emptyToursCount = tours.filter((t) => (registrationCounts[t.id] || 0) === 0).length;

  return {
    registrationCounts,
    uniqueAttendeesCount: userMap.size,
    multiVisitAttendeesCount: multiVisitAttendees.length,
    multiVisitAttendees,
    multiVisitTourCounts,
    emptyToursCount,
  };
}
