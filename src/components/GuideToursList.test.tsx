import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GuideToursList from "./GuideToursList";
import { Tour } from "../types/visitTypes";

describe("GuideToursList", () => {
  const dummyTours: Tour[] = [
    {
      id: "tour-empty",
      guideId: "all-guides",
      title: "Visite sans inscrits",
      date: "2026-09-19T14:00:00Z",
      durationMinutes: 90,
      startLocationX: 0,
      startLocationY: 0,
      capacity: 15,
      labels: [],
      status: "upcoming",
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "tour-full",
      guideId: "all-guides",
      title: "Visite complète",
      date: "2026-09-19T16:00:00Z",
      durationMinutes: 90,
      startLocationX: 0,
      startLocationY: 0,
      capacity: 15,
      placesLeft: 0,
      labels: [],
      status: "upcoming",
      createdAt: "",
      updatedAt: "",
    },
  ];

  it("affiche le badge 'Aucun inscrit' sur la vue liste quand une visite est vide", () => {
    render(
      <GuideToursList
        tours={dummyTours}
        registrationCounts={{ "tour-empty": 0, "tour-full": 15 }}
        onSelectTour={vi.fn()}
      />
    );

    expect(screen.getByText("Aucun inscrit")).toBeInTheDocument();
    expect(screen.getByText(/Places : 15\/15/)).toBeInTheDocument();
    expect(screen.getByText(/\(aucun inscrit\)/)).toBeInTheDocument();
  });
});
