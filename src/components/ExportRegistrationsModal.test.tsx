import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportRegistrationsModal, { exportFileName, selectTours } from "./ExportRegistrationsModal";
import { Tour } from "../types/visitTypes";

const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const tour = (over: Partial<Tour> = {}): Tour => ({
  id: "t1",
  guideId: "all-guides",
  title: "Visite du port",
  date: at(48),
  durationMinutes: 90,
  startLocationX: 0,
  startLocationY: 0,
  capacity: 20,
  labels: [],
  status: "upcoming",
  createdAt: "",
  updatedAt: "",
  ...over,
});

const past = tour({ id: "past", title: "Passée", date: at(-48) });
const soon = tour({ id: "soon", title: "Bientôt", date: at(24) });
const later = tour({ id: "later", title: "Plus tard", date: at(72) });

describe("selectTours", () => {
  it("ne garde que les visites à venir, triées par date", () => {
    expect(selectTours([later, past, soon], "upcoming", "").map((t) => t.id)).toEqual(["soon", "later"]);
  });

  it("garde tout, passé inclus, sur « toutes »", () => {
    expect(selectTours([later, past, soon], "all", "").map((t) => t.id)).toEqual(["past", "soon", "later"]);
  });

  it("ne garde que la visite choisie", () => {
    expect(selectTours([later, past, soon], "one", "past").map((t) => t.id)).toEqual(["past"]);
  });

  it("exclut les visites supprimées", () => {
    const deleted = tour({ id: "d", date: at(10), deletedAt: "2026-01-01" });
    expect(selectTours([deleted], "all", "")).toEqual([]);
  });
});

describe("exportFileName", () => {
  const day = new Date("2026-09-19T08:00:00Z");

  it("nomme selon le périmètre", () => {
    expect(exportFileName("upcoming", undefined, day)).toBe("inscriptions-a-venir-2026-09-19.csv");
    expect(exportFileName("all", undefined, day)).toBe("inscriptions-toutes-2026-09-19.csv");
    // Le slug ne garde ni tirets de bord ni doublons.
    expect(exportFileName("one", tour({ title: "Île Feydeau !" }), day)).toBe(
      "inscriptions-le-Feydeau-2026-09-19.csv"
    );
  });
});

describe("ExportRegistrationsModal", () => {
  let clicked: { href: string; download: string } | null;

  beforeEach(() => {
    clicked = null;
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    // On intercepte le <a> de téléchargement pour lire le nom de fichier.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        el.click = () => {
          clicked = { href: (el as HTMLAnchorElement).href, download: (el as HTMLAnchorElement).download };
        };
      }
      return el;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("visit-attendance")
          ? ({
              ok: true,
              status: 200,
              json: async () => ({
                registrations: [
                  { firstName: "Marie", lastName: "Durand", email: "m@x.fr", status: "confirmé", createdAt: "2026-05-01" },
                ],
              }),
            } as any)
          : ({ ok: true, status: 200, json: async () => ({ waitlist: [] }) } as any)
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("propose les visites à venir par défaut et télécharge le fichier", async () => {
    render(
      <ExportRegistrationsModal open onOpenChange={vi.fn()} tours={[past, soon, later]} guideCode="CODE" />
    );

    const btn = screen.getByRole("button", { name: /Télécharger le CSV/ });
    expect(btn).toHaveTextContent("2 visites");

    await userEvent.click(btn);

    await waitFor(() => expect(clicked).not.toBeNull());
    expect(clicked!.download).toMatch(/^inscriptions-a-venir-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("n'appelle la file d'attente que si la case est cochée", async () => {
    render(<ExportRegistrationsModal open onOpenChange={vi.fn()} tours={[soon]} guideCode="CODE" />);

    await userEvent.click(screen.getByRole("button", { name: /Télécharger le CSV/ }));
    await waitFor(() => expect(clicked).not.toBeNull());

    const calls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes("visit-waitlist"))).toBe(false);

    clicked = null;
    await userEvent.click(screen.getByLabelText("Inclure la file d'attente"));
    await userEvent.click(screen.getByRole("button", { name: /Télécharger le CSV/ }));
    await waitFor(() => expect(clicked).not.toBeNull());

    const after = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(after.some((u: string) => u.includes("visit-waitlist"))).toBe(true);
  });

  it("désactive le bouton tant qu'aucune visite n'est choisie en mode « une visite »", async () => {
    render(<ExportRegistrationsModal open onOpenChange={vi.fn()} tours={[soon]} guideCode="CODE" />);

    await userEvent.click(screen.getByLabelText("Une visite"));
    expect(screen.getByRole("button", { name: /Télécharger le CSV/ })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Visite à exporter"), "soon");
    expect(screen.getByRole("button", { name: /Télécharger le CSV/ })).toBeEnabled();
  });

  it("produit quand même le fichier quand une visite échoue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("tourId=soon")
          ? ({ ok: false, status: 500, json: async () => ({}) } as any)
          : ({
              ok: true,
              status: 200,
              json: async () => ({ registrations: [] }),
            } as any)
      )
    );

    render(<ExportRegistrationsModal open onOpenChange={vi.fn()} tours={[soon, later]} guideCode="CODE" />);
    await userEvent.click(screen.getByRole("button", { name: /Télécharger le CSV/ }));

    await waitFor(() => expect(clicked).not.toBeNull());
  });

  it("signale l'échec total plutôt que de télécharger un fichier vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as any)
    );

    render(<ExportRegistrationsModal open onOpenChange={vi.fn()} tours={[soon]} guideCode="CODE" />);
    await userEvent.click(screen.getByRole("button", { name: /Télécharger le CSV/ }));

    expect(await screen.findByText(/Aucune visite n'a pu être chargée/)).toBeInTheDocument();
    expect(clicked).toBeNull();
  });

  it("remonte un code guide expiré", async () => {
    const onAuthError = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as any)
    );

    render(
      <ExportRegistrationsModal
        open
        onOpenChange={vi.fn()}
        tours={[soon]}
        guideCode="CODE"
        onAuthError={onAuthError}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Télécharger le CSV/ }));

    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
  });
});
