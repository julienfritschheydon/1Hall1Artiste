// Accessibilité du parcours public d'inscription (RGAA).
//
// Trois manquements bloquaient réellement l'usage au lecteur d'écran ou au
// clavier, et ce sont eux que ce fichier verrouille :
//  - les champs n'avaient qu'un placeholder, qui disparaît à la saisie et n'est
//    pas un libellé pour les technologies d'assistance ;
//  - les erreurs apparaissaient dans un cadre rouge, muet à l'oreille ;
//  - la carte d'une visite était un <div> cliquable, hors de portée du clavier.
//
// Les requêtes utilisées ici (getByLabelText, getByRole) échouent exactement
// dans les cas où un utilisateur de lecteur d'écran serait bloqué : c'est la
// raison de ce choix plutôt qu'une inspection des attributs.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TourRegistrationForm } from "./TourRegistrationForm";
import { Tour } from "../types/visitTypes";

const tour: Tour = {
  id: "tour-a11y",
  guideId: "all-guides",
  title: "Visite accessible",
  date: new Date(Date.now() + 86_400_000).toISOString(),
  durationMinutes: 90,
  startLocationX: 0,
  startLocationY: 0,
  capacity: 15,
  labels: [],
  status: "upcoming",
  createdAt: "",
  updatedAt: "",
};

function renderForm(placesLeft = 10) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TourRegistrationForm tour={tour} placesLeft={placesLeft} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("formulaire d'inscription — accessibilité", () => {
  it("expose chaque champ obligatoire par son libellé", () => {
    renderForm();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nom/i)).toBeInTheDocument();
  });

  it("signale les champs obligatoires aux technologies d'assistance", () => {
    renderForm();

    for (const champ of [/email/i, /prénom/i, /^nom/i]) {
      expect(screen.getByLabelText(champ)).toHaveAttribute("aria-required", "true");
    }
  });

  it("libelle aussi les champs d'accompagnants, ajoutés dynamiquement", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: /ajouter un accompagnant/i }));

    expect(screen.getByLabelText(/prénom accompagnant 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nom accompagnant 1/i)).toBeInTheDocument();
  });

  it("distingue les boutons « Retirer » les uns des autres", async () => {
    // Une liste de boutons au libellé identique est inexploitable à l'oreille.
    const user = userEvent.setup();
    renderForm();

    const ajouter = screen.getByRole("button", { name: /ajouter un accompagnant/i });
    await user.click(ajouter);
    await user.click(ajouter);

    expect(screen.getByRole("button", { name: /retirer l'accompagnant 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retirer l'accompagnant 2/i })).toBeInTheDocument();
  });

  it("annonce l'erreur du serveur au lieu de la montrer seulement", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "max 3 visites per person" }), { status: 400 })
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), "a@b.fr");
    await user.type(screen.getByLabelText(/prénom/i), "A");
    await user.type(screen.getByLabelText(/^nom/i), "B");
    await user.click(screen.getByRole("button", { name: /s'inscrire/i }));

    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent(/max 3 visites/i);
    // Le champ pointe vers l'erreur : elle est relue dans le contexte du champ.
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("aria-describedby", alerte.id);
  });

  it("annonce la confirmation d'inscription", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "confirmé", message: "Inscription confirmée !" }), { status: 201 })
    );

    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), "a@b.fr");
    await user.type(screen.getByLabelText(/prénom/i), "A");
    await user.type(screen.getByLabelText(/^nom/i), "B");
    await user.click(screen.getByRole("button", { name: /s'inscrire/i }));

    const statut = await screen.findByRole("status");
    expect(statut).toHaveTextContent(/inscription confirmée/i);
  });

  it("regroupe les accompagnants sous un intitulé de groupe", () => {
    renderForm();
    expect(screen.getByRole("group", { name: /accompagnants/i })).toBeInTheDocument();
  });
});
