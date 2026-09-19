import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GuideToursList from "./GuideToursList";
import { Tour } from "../types/visitTypes";

describe("GuideToursList", () => {
  // Dates relatives : avec des dates fixes, ces visites devenaient
  // « en cours » puis « passées » selon le jour du run.
  const HOUR = 60 * 60 * 1000;
  const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

  const dummyTours: Tour[] = [
    {
      id: "tour-empty",
      guideId: "all-guides",
      title: "Visite sans inscrits",
      date: inHours(24),
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
      date: inHours(26),
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

  it("range les visites en sections et replie les passées", async () => {
    const user = userEvent.setup();
    const tours: Tour[] = [
      { ...dummyTours[0], id: "a-venir", title: "Visite à venir", date: inHours(24) },
      { ...dummyTours[0], id: "en-cours", title: "Visite en cours", date: inHours(-0.5) },
      { ...dummyTours[0], id: "passee", title: "Visite passée", date: inHours(-24) },
    ];

    render(<GuideToursList tours={tours} onSelectTour={vi.fn()} />);

    expect(screen.getByText("En cours (1)")).toBeInTheDocument();
    expect(screen.getByText("À venir (1)")).toBeInTheDocument();
    expect(screen.getByText("Passées (1)")).toBeInTheDocument();

    // Repliée par défaut : la carte de la visite passée n'est pas rendue.
    expect(screen.queryByText("Visite passée")).not.toBeInTheDocument();
    expect(screen.getByText("Visite en cours")).toBeInTheDocument();

    await user.click(screen.getByText("Afficher"));
    expect(screen.getByText("Visite passée")).toBeInTheDocument();
  });

  it("n'annonce pas de places libres sur une visite déjà commencée", () => {
    const tours: Tour[] = [
      { ...dummyTours[0], id: "en-cours", title: "Visite en cours", date: inHours(-0.5), placesLeft: 11 },
    ];

    render(<GuideToursList tours={tours} registrationCounts={{ "en-cours": 4 }} onSelectTour={vi.fn()} />);

    expect(screen.queryByText(/Places libres/)).not.toBeInTheDocument();
    expect(screen.getByText(/Inscrits : 4\/15/)).toBeInTheDocument();
  });

  it("affiche le badge 'Aucun inscrit' sur la vue liste quand une visite est vide", () => {
    render(
      <GuideToursList
        tours={dummyTours}
        registrationCounts={{ "tour-empty": 0, "tour-full": 15 }}
        onSelectTour={vi.fn()}
      />
    );

    expect(screen.getByText("Aucun inscrit")).toBeInTheDocument();
    expect(screen.getByText(/Places libres : 15\/15/)).toBeInTheDocument();
    expect(screen.getByText(/\(aucun inscrit\)/)).toBeInTheDocument();
  });
});
