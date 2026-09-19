import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GuideDashboard from "./GuideDashboard";
import { Tour } from "../types/visitTypes";
import { VisitAggregationStats } from "../utils/visitStats";

describe("GuideDashboard", () => {
  // Dates relatives : des dates fixes rendaient les badges « Terminée »
  // dépendants du jour où la suite tourne.
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
      id: "tour-with-multi",
      guideId: "all-guides",
      title: "Visite avec multi-inscrits",
      date: inHours(26),
      durationMinutes: 90,
      startLocationX: 0,
      startLocationY: 0,
      capacity: 15,
      labels: [],
      status: "upcoming",
      createdAt: "",
      updatedAt: "",
    },
  ];

  const registrationCounts = {
    "tour-empty": 0,
    "tour-with-multi": 5,
  };

  const waitlistCounts = {
    "tour-empty": 0,
    "tour-with-multi": 2,
  };

  const aggregationStats: VisitAggregationStats = {
    registrationCounts,
    uniqueAttendeesCount: 4,
    multiVisitAttendeesCount: 1,
    multiVisitAttendees: [
      {
        email: "alice@example.com",
        name: "Alice Dupont",
        tourIds: ["tour-with-multi", "tour-empty"],
      },
    ],
    multiVisitTourCounts: {
      "tour-empty": 0,
      "tour-with-multi": 1,
    },
    userTourCounts: {
      "alice@example.com": 2,
    },
    emptyToursCount: 1,
  };

  it("badge « En cours » une visite commencée, sans annoncer de places", async () => {
    const ongoing = dummyTours.map((t) => ({ ...t, date: inHours(-0.5), placesLeft: 11 }));
    render(
      <GuideDashboard
        tours={ongoing}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    expect(screen.getByText("En cours (2)")).toBeInTheDocument();
    expect(screen.getAllByText("En cours")).toHaveLength(2);
    expect(screen.queryByText("11 places")).not.toBeInTheDocument();
  });

  it("n'additionne que les visites affichées quand le filtre « Animé par » est actif", () => {
    // Les compteurs couvrent tout le programme ; seule la première visite est
    // affichée. Sommer toutes les valeurs donnait un remplissage > 100 %.
    render(
      <GuideDashboard
        tours={[dummyTours[0]]}
        registrationCounts={{ "tour-empty": 3, "tour-hors-filtre": 176 }}
        waitlistCounts={{ "tour-empty": 1, "tour-hors-filtre": 11 }}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    // 3 inscrits sur 15 places = 20 %, et non (3 + 176) / 15.
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("15 places à pourvoir")).toBeInTheDocument();
    // Ni les inscrits ni la file d'attente des autres visites n'apparaissent.
    expect(screen.queryByText("179")).not.toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("marque les visites passées « Terminée » et les sort des indicateurs", async () => {
    // Mêmes visites, mais déjà passées.
    const pastTours = dummyTours.map((t) => ({ ...t, date: inHours(-24) }));

    render(
      <GuideDashboard
        tours={pastTours}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    // Les deux visites sont passées : elles tiennent dans une section repliée.
    const user = userEvent.setup();
    expect(screen.getByText("Passées (2)")).toBeInTheDocument();
    expect(screen.queryByText("Terminée")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun inscrit")).not.toBeInTheDocument();

    await user.click(screen.getByText("Afficher"));
    expect(screen.getAllByText("Terminée")).toHaveLength(2);

    // Plus rien à remplir : le taux de remplissage ne parle plus du passé.
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 places à pourvoir")).toBeInTheDocument();
    expect(screen.getByText("2 terminées")).toBeInTheDocument();
  });

  it("affiche le badge 'Aucun inscrit' pour la visite sans participants", () => {
    render(
      <GuideDashboard
        tours={dummyTours}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    // Vérifier l'indicateur dans la colonne statut
    expect(screen.getByText("Aucun inscrit")).toBeInTheDocument();
    expect(screen.getByText("0/15")).toBeInTheDocument();

    // Vérifier le sous-titre de la carte Visites
    expect(screen.getByText("1 sans inscrit")).toBeInTheDocument();
  });

  it("affiche l'indicateur multi-visites sur la carte et dans le tableau", () => {
    render(
      <GuideDashboard
        tours={dummyTours}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    // Carte Inscrits : sous-titre multi-visites
    expect(screen.getByText("dont 1 à 2+ visites")).toBeInTheDocument();

    // Tableau : badge multi-visites
    expect(screen.getByText("👥 1 multi")).toBeInTheDocument();

    // Action rapide
    expect(screen.getByRole("button", { name: /Inscrits multi-visites/ })).toBeInTheDocument();
  });

  it("ouvre la boîte de dialogue listant les inscrits multi-visites au clic", async () => {
    const user = userEvent.setup();
    render(
      <GuideDashboard
        tours={dummyTours}
        registrationCounts={registrationCounts}
        waitlistCounts={waitlistCounts}
        aggregationStats={aggregationStats}
        onSelectTour={vi.fn()}
        onCreateTour={vi.fn()}
      />
    );

    const actionBtn = screen.getByRole("button", { name: /Inscrits multi-visites/ });
    await user.click(actionBtn);

    // Le modal s'affiche avec le titre et le nom du participant
    expect(await screen.findByText("Inscrits à plusieurs visites")).toBeInTheDocument();
    expect(screen.getByText("Alice Dupont")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("2 visites")).toBeInTheDocument();
  });
});
