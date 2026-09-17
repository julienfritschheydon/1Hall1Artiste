import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TourAttendanceSheet from "./TourAttendanceSheet";
import { Tour, Registration } from "../types/visitTypes";

describe("TourAttendanceSheet", () => {
  const dummyTour: Tour = {
    id: "tour-1",
    guideId: "all-guides",
    title: "Visite test",
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

  const dummyRegistrations: Registration[] = [
    {
      id: "reg-1",
      tourId: "tour-1",
      email: "dupont@example.com",
      firstName: "Jean",
      lastName: "Dupont",
      status: "confirmé",
      createdAt: "",
    },
    {
      id: "reg-2",
      tourId: "tour-1",
      email: "martin@example.com",
      firstName: "Claire",
      lastName: "Martin",
      status: "confirmé",
      createdAt: "",
    },
  ];

  it("affiche le badge multi-visites à côté du nom de l'inscrit concerné", () => {
    render(
      <TourAttendanceSheet
        tour={dummyTour}
        registrations={dummyRegistrations}
        guideCode="1234"
        userTourCounts={{
          "dupont@example.com": 2,
          "martin@example.com": 1,
        }}
      />
    );

    // Dupont est inscrit à 2 visites -> badge présent
    expect(screen.getByText("👥 2 visites")).toBeInTheDocument();

    // Martin est inscrit à 1 seule visite -> pas de badge multi
    expect(screen.queryByText(/1 visites/)).not.toBeInTheDocument();
  });
});
