import { describe, it, expect } from "vitest";
import { computeVisitAggregation } from "./visitStats";
import { Tour, Registration } from "../types/visitTypes";

describe("visitStats - computeVisitAggregation", () => {
  const dummyTour1: Tour = {
    id: "tour-1",
    guideId: "all-guides",
    title: "Visite 1",
    date: "2026-09-19T14:00:00Z",
    durationMinutes: 90,
    startLocationX: 0,
    startLocationY: 0,
    capacity: 15,
    labels: [],
    status: "upcoming",
    createdAt: "",
    updatedAt: "",
  };

  const dummyTour2: Tour = {
    ...dummyTour1,
    id: "tour-2",
    title: "Visite 2",
    date: "2026-09-19T16:00:00Z",
  };

  const dummyTour3: Tour = {
    ...dummyTour1,
    id: "tour-3",
    title: "Visite 3",
    date: "2026-09-20T10:00:00Z",
  };

  it("gère des visites sans inscrits", () => {
    const res = computeVisitAggregation([dummyTour1, dummyTour2], {});
    expect(res.registrationCounts["tour-1"]).toBe(0);
    expect(res.registrationCounts["tour-2"]).toBe(0);
    expect(res.emptyToursCount).toBe(2);
    expect(res.uniqueAttendeesCount).toBe(0);
    expect(res.multiVisitAttendeesCount).toBe(0);
    expect(res.multiVisitAttendees).toEqual([]);
  });

  it("compte les inscrits attendus : confirmés et présents, sans les absents ni les annulés", () => {
    const base = { tourId: "tour-1", createdAt: "" };
    const registrations: Registration[] = [
      { ...base, id: "r1", email: "a@x.fr", firstName: "A", lastName: "A", status: "confirmé" },
      { ...base, id: "r2", email: "b@x.fr", firstName: "B", lastName: "B", status: "présent" },
      // Inscrit mais non venu : il ne compte pas dans les inscrits attendus.
      { ...base, id: "r3", email: "c@x.fr", firstName: "C", lastName: "C", status: "absent" },
      { ...base, id: "r4", email: "d@x.fr", firstName: "D", lastName: "D", status: "annulé" },
    ];

    const res = computeVisitAggregation([dummyTour1], { "tour-1": registrations });

    expect(res.registrationCounts["tour-1"]).toBe(2);
    expect(res.uniqueAttendeesCount).toBe(2);
    expect(res.emptyToursCount).toBe(0);
  });

  it("identifie les inscrits multi-visites et les places", () => {
    const reg1: Registration = {
      id: "reg-1",
      tourId: "tour-1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Dupont",
      status: "confirmé",
      createdAt: "",
    };

    const reg2: Registration = {
      id: "reg-2",
      tourId: "tour-2",
      email: "Alice@example.com ", // Test casse et espaces
      firstName: "Alice",
      lastName: "Dupont",
      companions: [{ firstName: "Bob" }],
      status: "présent",
      createdAt: "",
    };

    const reg3: Registration = {
      id: "reg-3",
      tourId: "tour-1",
      email: "charlie@example.com",
      firstName: "Charlie",
      lastName: "Martin",
      status: "confirmé",
      createdAt: "",
    };

    // tour-3 has 0 registrations
    const res = computeVisitAggregation(
      [dummyTour1, dummyTour2, dummyTour3],
      {
        "tour-1": [reg1, reg3],
        "tour-2": [reg2],
        "tour-3": [],
      }
    );

    // Tour 1: Alice (1) + Charlie (1) = 2 places
    expect(res.registrationCounts["tour-1"]).toBe(2);
    // Tour 2: Alice + companion (2) = 2 places
    expect(res.registrationCounts["tour-2"]).toBe(2);
    // Tour 3: 0 places
    expect(res.registrationCounts["tour-3"]).toBe(0);

    // Empty tours count: tour-3 is empty
    expect(res.emptyToursCount).toBe(1);

    // Unique attendees: Alice and Charlie
    expect(res.uniqueAttendeesCount).toBe(2);

    // Multi-visit attendees: only Alice (registered on tour-1 and tour-2)
    expect(res.multiVisitAttendeesCount).toBe(1);
    expect(res.multiVisitAttendees).toHaveLength(1);
    expect(res.multiVisitAttendees[0].email).toBe("alice@example.com");
    expect(res.multiVisitAttendees[0].name).toBe("Alice Dupont");
    expect(res.multiVisitAttendees[0].tourIds).toContain("tour-1");
    expect(res.multiVisitAttendees[0].tourIds).toContain("tour-2");

    // Per-tour multi-visit counts
    expect(res.multiVisitTourCounts["tour-1"]).toBe(1); // Alice
    expect(res.multiVisitTourCounts["tour-2"]).toBe(1); // Alice
    expect(res.multiVisitTourCounts["tour-3"]).toBe(0);

    // Per-user tour counts
    expect(res.userTourCounts["alice@example.com"]).toBe(2);
    expect(res.userTourCounts["charlie@example.com"]).toBe(1);
  });

  it("ignore les inscriptions annulées ou autres statuts non confirmés/présents", () => {
    const regCancelled: Registration = {
      id: "reg-c",
      tourId: "tour-1",
      email: "annule@example.com",
      firstName: "Annule",
      lastName: "Test",
      status: "annulé",
      createdAt: "",
    };

    const res = computeVisitAggregation([dummyTour1], {
      "tour-1": [regCancelled],
    });

    expect(res.registrationCounts["tour-1"]).toBe(0);
    expect(res.emptyToursCount).toBe(1);
    expect(res.uniqueAttendeesCount).toBe(0);
    expect(res.multiVisitAttendeesCount).toBe(0);
  });
});
