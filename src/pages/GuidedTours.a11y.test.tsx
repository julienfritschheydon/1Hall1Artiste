// Accessibilité de la liste publique des visites.
//
// Chaque carte était un <div> porteur d'un onClick : invisible pour un lecteur
// d'écran, et impossible à activer au clavier. C'est le seul chemin vers
// l'inscription, donc le défaut rendait la fonctionnalité inatteignable pour
// une partie du public.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Tour } from "../types/visitTypes";

// VisitLayout tire l'en-tête, la navigation et le partage : hors sujet ici, et
// il exigerait la moitié du contexte applicatif.
vi.mock("@/components/VisitLayout", () => ({
  VisitLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const tours: Tour[] = [
  {
    id: "tour-libre",
    guideId: "all-guides",
    title: "Visite avec places",
    date: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 90,
    startLocationX: 0,
    startLocationY: 0,
    startLocationName: "17 allée Duguay Trouin",
    capacity: 15,
    labels: [],
    status: "upcoming",
    createdAt: "",
    updatedAt: "",
    placesLeft: 8,
    waitlistCount: 0,
  },
  {
    id: "tour-complet",
    guideId: "all-guides",
    title: "Visite complète",
    date: new Date(Date.now() + 90_000_000).toISOString(),
    durationMinutes: 90,
    startLocationX: 0,
    startLocationY: 0,
    startLocationName: "17 allée Duguay Trouin",
    capacity: 15,
    labels: [],
    status: "upcoming",
    createdAt: "",
    updatedAt: "",
    placesLeft: 0,
    waitlistCount: 4,
  },
];

vi.mock("@/hooks/useTours", () => ({
  useTours: () => mockUseTours(),
}));

let mockUseTours: () => { tours: Tour[]; isLoading: boolean; error: unknown };

const { default: GuidedTours } = await import("./GuidedTours");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GuidedTours />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseTours = () => ({ tours, isLoading: false, error: null });
});

describe("liste publique des visites — accessibilité", () => {
  it("expose chaque visite comme un bouton activable", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /visite avec places/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /visite complète/i })).toBeInTheDocument();
  });

  it("résume l'essentiel dans le nom accessible : date, heure et disponibilité", () => {
    renderPage();

    const bouton = screen.getByRole("button", { name: /visite avec places/i });
    expect(bouton).toHaveAccessibleName(/8 places restantes/i);

    const complet = screen.getByRole("button", { name: /visite complète/i });
    expect(complet).toHaveAccessibleName(/liste d'attente/i);
  });

  it("s'ouvre au clavier, sans souris", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.tab();
    await user.keyboard("{Enter}");

    // Le détail de la visite est affiché : son formulaire d'inscription est là.
    expect(await screen.findByRole("button", { name: /^s'inscrire$/i })).toBeInTheDocument();
  });

  it("annonce le chargement", () => {
    mockUseTours = () => ({ tours: [], isLoading: true, error: null });
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(/chargement/i);
  });

  it("annonce l'échec de chargement comme une alerte", () => {
    mockUseTours = () => ({ tours: [], isLoading: false, error: new Error("boom") });
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/impossible de charger/i);
  });

  it("dit publiquement combien de personnes attendent, sans nommer personne", () => {
    renderPage();

    expect(screen.getByText(/4 personnes en liste d'attente/i)).toBeInTheDocument();
  });
});
