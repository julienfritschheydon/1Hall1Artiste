// Tests de composant du portail artiste (React Testing Library).
//
// Ils couvrent ce que les tests d'API ne peuvent pas voir : le rendu des onglets et,
// surtout, le fait que l'enregistrement vise bien la fiche de l'onglet actif. Ce câblage
// n'avait été que relu jusqu'ici — les tests serveur vérifient qu'un artistId non couvert
// par le token est refusé, pas que le client envoie le bon.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Artist } from "@/data/artists";

const MIXTE: Artist = {
  id: "chorale-label-diva-choeur-mixte",
  name: "Chorale Label Diva (Choeur mixte)",
  type: "concert",
  title: "Chorale Label Diva (Choeur mixte)",
  website: "https://padlet.com/mixte",
} as Artist;

const FEMMES: Artist = {
  id: "chorale-label-diva-choeur-de-femmes",
  name: "Chorale Label Diva (Choeur de femmes)",
  type: "concert",
  title: "Chorale Label Diva (Choeur de femmes)",
  presentation: "Présentation du chœur de femmes",
} as Artist;

const SOLO: Artist = {
  id: "malou-tual",
  name: "Malou Tual",
  type: "exposition",
  title: "Malou Tual",
  presentation: "Peintre et sculptrice",
} as Artist;

const { dataService, saveArtistFields, requestMagicLink } = vi.hoisted(() => ({
  dataService: {
    getArtistById: vi.fn(),
    getEvents: vi.fn(() => []),
    getLocationById: vi.fn(() => undefined),
    subscribe: vi.fn(() => () => undefined),
    refreshProgram: vi.fn(),
  },
  saveArtistFields: vi.fn(),
  requestMagicLink: vi.fn(),
}));

vi.mock("@/services/dataService", () => ({ dataService }));

// decodeToken reste le vrai code : c'est du décodage pur, sans vérification de signature.
vi.mock("@/services/artistPortal", async () => {
  const actual = await vi.importActual<typeof import("@/services/artistPortal")>(
    "@/services/artistPortal"
  );
  return { ...actual, saveArtistFields, requestMagicLink, uploadThumbnail: vi.fn() };
});

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ArtistEdit from "./ArtistEdit";

// Fabrique un token au format attendu. La signature n'est pas vérifiée côté client.
function makeToken(artistIds: string[], email: string, expOffsetMs = 3_600_000) {
  const payload = `${artistIds.join(",")}|${email}|${Date.now() + expOffsetMs}`;
  const b64 = btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${b64}.signature-non-verifiee-cote-client`;
}

function renderPortal(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/artiste/edit?token=${encodeURIComponent(token)}`]}>
      <ArtistEdit />
    </MemoryRouter>
  );
}

const BOTH = [MIXTE.id, FEMMES.id];
const byId: Record<string, Artist> = { [MIXTE.id]: MIXTE, [FEMMES.id]: FEMMES, [SOLO.id]: SOLO };

beforeEach(() => {
  vi.clearAllMocks();
  dataService.getArtistById.mockImplementation((id: string) => byId[id]);
  dataService.getEvents.mockReturnValue([]);
  dataService.subscribe.mockReturnValue(() => undefined);
});

describe("ArtistEdit — lien couvrant une seule fiche", () => {
  it("n'affiche aucun onglet et montre le nom de l'artiste", async () => {
    renderPortal(makeToken([SOLO.id], "tual.malou@gmail.com"));

    expect(await screen.findByText("Malou Tual")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Modifier ma fiche" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("pré-remplit le formulaire depuis le programme", async () => {
    renderPortal(makeToken([SOLO.id], "tual.malou@gmail.com"));

    await waitFor(() =>
      expect(screen.getByLabelText("Présentation")).toHaveValue("Peintre et sculptrice")
    );
  });
});

describe("ArtistEdit — lien couvrant plusieurs fiches", () => {
  const token = () => makeToken(BOTH, "labeldivachorale@gmail.com");

  it("affiche un onglet par fiche et annonce leur nombre", async () => {
    renderPortal(token());

    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("Chorale Label Diva (Choeur mixte)");
    expect(tabs[1]).toHaveTextContent("Chorale Label Diva (Choeur de femmes)");
    expect(screen.getByText(/inscrite sur 2 fiches/i)).toBeInTheDocument();
  });

  it("sélectionne la première fiche par défaut", async () => {
    renderPortal(token());

    const tabs = within(await screen.findByRole("tablist")).getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("chaque onglet montre les données de SA fiche", async () => {
    const user = userEvent.setup();
    renderPortal(token());

    // Le chœur mixte n'a pas de présentation dans le programme.
    await waitFor(() => expect(screen.getByLabelText("Présentation")).toHaveValue(""));

    await user.click(screen.getByRole("tab", { name: /Choeur de femmes/ }));
    expect(screen.getByLabelText("Présentation")).toHaveValue("Présentation du chœur de femmes");
  });

  it("conserve la saisie en cours quand on change d'onglet et qu'on revient", async () => {
    const user = userEvent.setup();
    renderPortal(token());

    const presentation = () => screen.getByLabelText("Présentation");
    await waitFor(() => expect(presentation()).toHaveValue(""));

    await user.type(presentation(), "Brouillon du chœur mixte");
    await user.click(screen.getByRole("tab", { name: /Choeur de femmes/ }));
    // L'autre onglet garde bien SA valeur, pas celle qu'on vient de taper.
    expect(presentation()).toHaveValue("Présentation du chœur de femmes");

    await user.click(screen.getByRole("tab", { name: /Choeur mixte/ }));
    expect(presentation()).toHaveValue("Brouillon du chœur mixte");
  });

  it("enregistre la fiche de l'onglet ACTIF, pas la première", async () => {
    const user = userEvent.setup();
    saveArtistFields.mockResolvedValue(undefined);
    const tok = token();
    renderPortal(tok);

    await screen.findByRole("tablist");
    await user.click(screen.getByRole("tab", { name: /Choeur de femmes/ }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(saveArtistFields).toHaveBeenCalledTimes(1));
    const [tokenArg, artistIdArg] = saveArtistFields.mock.calls[0];
    expect(tokenArg).toBe(tok);
    expect(artistIdArg).toBe(FEMMES.id);
  });

  it("envoie la saisie de l'onglet actif, pas celle de l'autre", async () => {
    const user = userEvent.setup();
    saveArtistFields.mockResolvedValue(undefined);
    renderPortal(token());

    await waitFor(() => expect(screen.getByLabelText("Présentation")).toHaveValue(""));
    await user.type(screen.getByLabelText("Présentation"), "Texte du mixte");

    await user.click(screen.getByRole("tab", { name: /Choeur de femmes/ }));
    await user.clear(screen.getByLabelText("Présentation"));
    await user.type(screen.getByLabelText("Présentation"), "Texte des femmes");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(saveArtistFields).toHaveBeenCalledTimes(1));
    const [, artistId, fields] = saveArtistFields.mock.calls[0];
    expect(artistId).toBe(FEMMES.id);
    expect(fields.presentation).toBe("Texte des femmes");
  });
});

describe("ArtistEdit — lien inutilisable", () => {
  it("un lien expiré propose d'en redemander un", async () => {
    renderPortal(makeToken(BOTH, "labeldivachorale@gmail.com", -1000));

    expect(await screen.findByText("Ce lien a expiré")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("un token illisible mène au même écran de renvoi", async () => {
    renderPortal("nimporte-quoi");

    expect(await screen.findByText("Ce lien a expiré")).toBeInTheDocument();
  });
});
