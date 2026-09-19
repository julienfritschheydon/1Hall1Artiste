import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DailyAttendanceModal, { localDayKey, toursOnDay } from "./DailyAttendanceModal";
import { Tour } from "../types/visitTypes";

const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

const tour = (over: Partial<Tour> = {}): Tour => ({
  id: "t1",
  guideId: "all-guides",
  title: "Visite du port",
  date: at(2),
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

function mockFetchOk() {
  return vi.fn(async (url: string) => {
    if (String(url).includes("visit-attendance")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          registrations: [
            { firstName: "Marie", lastName: "Durand", email: "m@x.fr", status: "confirmé" },
          ],
          counts: { seatsTaken: 1 },
        }),
      } as any;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ waitlist: [] }),
    } as any;
  });
}

describe("toursOnDay", () => {
  it("ne garde que les visites du jour demandé, triées par heure", () => {
    const today = localDayKey(new Date());
    const late = tour({ id: "late", date: new Date(`${today}T18:00:00`).toISOString() });
    const early = tour({ id: "early", date: new Date(`${today}T09:00:00`).toISOString() });
    const other = tour({ id: "other", date: at(72) });

    expect(toursOnDay([late, early, other], today).map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("exclut les visites supprimées", () => {
    const today = localDayKey(new Date());
    const deleted = tour({ id: "d", date: new Date(`${today}T09:00:00`).toISOString(), deletedAt: "2026-01-01" });
    expect(toursOnDay([deleted], today)).toEqual([]);
  });
});

describe("DailyAttendanceModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchOk());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const today = localDayKey(new Date());
  const todayTour = tour({ id: "today", title: "Visite d'aujourd'hui", date: new Date(`${today}T10:00:00`).toISOString() });
  const otherDayTour = tour({ id: "later", title: "Visite de la semaine prochaine", date: at(24 * 7) });

  it("n'affiche que les visites du jour et charge leurs données", async () => {
    render(
      <DailyAttendanceModal
        open
        onOpenChange={vi.fn()}
        tours={[todayTour, otherDayTour]}
        guideCode="CODE"
      />
    );

    expect(await screen.findByText("Visite d'aujourd'hui")).toBeInTheDocument();
    expect(screen.queryByText("Visite de la semaine prochaine")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/1 personne/)).toBeInTheDocument());
  });

  it("affiche un état vide et désactive l'impression sans visite ce jour", async () => {
    render(
      <DailyAttendanceModal open onOpenChange={vi.fn()} tours={[otherDayTour]} guideCode="CODE" />
    );

    expect(await screen.findByText(/Aucune visite prévue/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tout imprimer/ })).toBeDisabled();
  });

  it("imprime les feuilles du jour", async () => {
    const print = vi.fn();
    const write = vi.fn();
    vi.stubGlobal(
      "open",
      vi.fn(() => ({ document: { write, close: vi.fn() }, focus: vi.fn(), print }))
    );

    render(<DailyAttendanceModal open onOpenChange={vi.fn()} tours={[todayTour]} guideCode="CODE" />);
    await screen.findByText("Visite d'aujourd'hui");
    await waitFor(() => expect(screen.getByRole("button", { name: /Tout imprimer/ })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: /Tout imprimer/ }));

    expect(print).toHaveBeenCalled();
    // Seul le titre de la visite est échappé ; le libellé fixe ne l'est pas.
    expect(write.mock.calls[0][0]).toContain("Feuille d'appel — Visite d&#39;aujourd&#39;hui");
    expect(write.mock.calls[0][0]).toContain("Places libres : 19/20");
  });

  it("remonte une expiration de code guide plutôt qu'une erreur opaque", async () => {
    const onAuthError = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as any)
    );

    render(
      <DailyAttendanceModal
        open
        onOpenChange={vi.fn()}
        tours={[todayTour]}
        guideCode="CODE"
        onAuthError={onAuthError}
      />
    );

    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
  });

  it("produit quand même la feuille quand la file d'attente échoue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("visit-waitlist")
          ? ({ ok: false, status: 500, json: async () => ({}) } as any)
          : ({
              ok: true,
              status: 200,
              json: async () => ({ registrations: [], counts: { seatsTaken: 0 } }),
            } as any)
      )
    );

    render(<DailyAttendanceModal open onOpenChange={vi.fn()} tours={[todayTour]} guideCode="CODE" />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Tout imprimer/ })).toBeEnabled());
  });
});
