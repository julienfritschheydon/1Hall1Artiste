// Édition d'une visite par son guide.
//
// Deux règles :
// - le créneau (jour + heure de départ) est figé dès la création — c'est le
//   seul engagement pris auprès des inscrits, qui l'ont mis dans leur agenda ;
// - tout le reste (intitulé, descriptif, durée, places, surbooking) se modifie
//   librement tant que la visite n'a pas démarré, le jour même compris.
//
// Un gel « J-1 » interdisait auparavant tout changement dans les 24 h précédant
// le départ. Il bloquait même les corrections de texte : le formulaire renvoie
// tous les champs et la comparaison brute voyait des changements fantômes
// (surbooking absent vs « 0 » du formulaire, descriptif vide vs absent).
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  waitlist_confirmation: "tpl_waitlist_confirmation",
  reminder_1d: "tpl_reminder_1d",
});

const store: Record<string, any> = {};

function getAtPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  let cur: any = store;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  if (cur == null) return null;
  if (Array.isArray(cur) && cur.length === 0) return null;
  if (typeof cur === "object" && Object.keys(cur).length === 0) return null;
  return cur;
}

function setAtPath(path: string, value: any) {
  const parts = path.split("/").filter(Boolean);
  let cur: any = store;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete cur[last];
  else cur[last] = value;
}

vi.mock("../../api/_firebase.js", () => ({
  rtdbGet: vi.fn(async (path: string) => getAtPath(path)),
  rtdbPut: vi.fn(async (path: string, value: any) => setAtPath(path, JSON.parse(JSON.stringify(value)))),
  rtdbPatch: vi.fn(async (path: string, value: any) => {
    const existing = getAtPath(path) || {};
    setAtPath(path, { ...existing, ...JSON.parse(JSON.stringify(value)) });
  }),
  rtdbDelete: vi.fn(async (path: string) => setAtPath(path, null)),
  rtdbGetWithEtag: vi.fn(async (path: string) => {
    const value = getAtPath(path);
    return { value, etag: JSON.stringify(value ?? null) };
  }),
  rtdbPutIfMatch: vi.fn(async (path: string, value: any, etag: string) => {
    if (JSON.stringify(getAtPath(path) ?? null) !== etag) return false;
    setAtPath(path, value === null ? null : JSON.parse(JSON.stringify(value)));
    return true;
  }),
}));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

function mockReq(overrides: Record<string, unknown> = {}) {
  return { method: "POST", query: {}, body: {}, headers: {}, url: "/api/x", ...overrides } as any;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.end = vi.fn();
  return res;
}
function jsonOf(res: any) {
  return res.json.mock.calls[res.json.mock.calls.length - 1]?.[0];
}
function statusOf(res: any) {
  return res.status.mock.calls[res.status.mock.calls.length - 1]?.[0] ?? 200;
}

const GUIDE = "GUIDE-OK";
let toursHandler: any;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  // Jour du festival : la visite de 14 h démarre dans moins de 24 h.
  vi.setSystemTime(new Date("2026-09-19T08:00:00.000Z"));

  setAtPath("guide_access_codes/g1", {
    id: "g1",
    code: GUIDE,
    createdAt: new Date().toISOString(),
    renewalDate: "2030-01-01T00:00:00.000Z",
    active: true,
  });

  toursHandler = (await import("../../api/visit-tours.js")).default;
});

const TOUR_DATE = "2026-09-19T12:00:00.000Z";

/** Visite « héritée » : ni descriptif, ni surbooking enregistrés. */
function makeTour(id = "tour_edit", extra: Record<string, unknown> = {}) {
  setAtPath(`tours/${id}`, {
    id,
    guideId: "all-guides",
    title: "Visite de 14h",
    date: TOUR_DATE,
    durationMinutes: 60,
    startLocationId: "allee-duguay-trouin-17",
    startLocationName: "17 allée Duguay Trouin",
    startLocationX: 105,
    startLocationY: 493,
    capacity: 15,
    labels: [],
    status: "upcoming",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...extra,
  });
  return id;
}

/** Corps envoyé par le formulaire : tous les champs, touchés ou non. */
function formBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Visite de 14h",
    description: "",
    date: TOUR_DATE,
    durationMinutes: 60,
    capacity: 15,
    overbookingSeats: 0,
    labels: [],
    guides: [],
    ...overrides,
  };
}

async function put(id: string, body: Record<string, unknown>) {
  const res = mockRes();
  await toursHandler(
    mockReq({ method: "PUT", query: { id }, headers: { "x-guide-code": GUIDE }, body }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

describe("édition d'une visite avant son départ", () => {
  it("accepte un changement d'intitulé le jour même", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ title: "Le Temple du Goût" }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).title).toBe("Le Temple du Goût");
  });

  it("accepte l'ajout d'un descriptif le jour même", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ description: "Départ devant le Temple du Goût." }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).description).toBe("Départ devant le Temple du Goût.");
  });

  it("accepte un changement de capacité et de surbooking le jour même", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ capacity: 30, overbookingSeats: 5 }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).capacity).toBe(30);
    expect(getAtPath(`tours/${id}`).overbookingSeats).toBe(5);
  });

  it("accepte un changement de durée le jour même", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ durationMinutes: 90 }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).durationMinutes).toBe(90);
  });
});

describe("créneau d'une visite", () => {
  it("refuse un changement d'horaire", async () => {
    const id = makeTour();
    const { status, body } = await put(id, formBody({ date: "2026-09-19T15:00:00.000Z" }));
    expect(status).toBe(400);
    expect(body.error).toBe("date: not editable");
    expect(getAtPath(`tours/${id}`).date).toBe(TOUR_DATE);
  });

  it("refuse un changement de jour, même accompagné d'une modification légitime", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ title: "Nouveau titre", date: "2026-09-20T12:00:00.000Z" }));
    expect(status).toBe(400);
    // Rien n'est enregistré : la requête est rejetée en bloc.
    expect(getAtPath(`tours/${id}`).title).toBe("Visite de 14h");
  });

  it("laisse passer le renvoi du même créneau par le formulaire", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ title: "Nouveau titre", date: "2026-09-19T12:00:00Z" }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).title).toBe("Nouveau titre");
  });
});

describe("édition d'une visite déjà commencée", () => {
  it("refuse toute modification", async () => {
    const id = makeTour();
    vi.setSystemTime(new Date("2026-09-19T12:30:00.000Z")); // visite en cours
    const { status, body } = await put(id, formBody({ title: "Trop tard" }));
    expect(status).toBe(400);
    expect(body.error).toBe("tour already started");
    expect(getAtPath(`tours/${id}`).title).toBe("Visite de 14h");
  });

  it("n'échoue pas sur un renvoi du formulaire sans aucun changement", async () => {
    // Visite sans descriptif ni surbooking enregistrés : le formulaire renvoie
    // description:"" et overbookingSeats:0, qui ne sont pas des modifications.
    const id = makeTour();
    vi.setSystemTime(new Date("2026-09-19T12:30:00.000Z"));
    const { status } = await put(id, formBody());
    expect(status).toBe(200);
  });
});

describe("avertissements quand des visiteurs sont déjà inscrits", () => {
  /** Inscrit `n` personnes confirmées sur la visite. */
  function inscrire(tourId: string, n: number) {
    for (let i = 0; i < n; i++) {
      const regId = `reg_${tourId}_${i}`;
      setAtPath(`registrations/${regId}`, {
        id: regId,
        tourId,
        email: `visiteur${i}@example.com`,
        firstName: "V",
        lastName: String(i),
        status: "confirmé",
        companions: 0,
        createdAt: "2026-09-10T10:00:00.000Z",
      });
      setAtPath(`registrations_by_tour/${tourId}/${regId}`, true);
    }
  }

  it("invite à prévenir les inscrits quand la durée change", async () => {
    const id = makeTour();
    inscrire(id, 3);
    const { status, body } = await put(id, formBody({ durationMinutes: 120 }));
    expect(status).toBe(200);
    expect(body.warning).toContain("durée");
    expect(body.warning).toContain("email");
  });

  it("invite à prévenir les inscrits quand le texte change", async () => {
    const id = makeTour();
    inscrire(id, 2);
    const { status, body } = await put(id, formBody({ description: "Nouveau point de rendez-vous." }));
    expect(status).toBe(200);
    expect(body.warning).toContain("rendez-vous");
  });

  it("n'avertit pas quand personne n'est inscrit", async () => {
    const id = makeTour();
    const { status, body } = await put(id, formBody({ durationMinutes: 120, title: "Autre" }));
    expect(status).toBe(200);
    expect(body.warning).toBeUndefined();
  });

  it("cumule les avertissements quand plusieurs changements concernent les inscrits", async () => {
    const id = makeTour();
    inscrire(id, 3);
    const { status, body } = await put(id, formBody({ durationMinutes: 120, description: "Autre texte" }));
    expect(status).toBe(200);
    expect(body.warning).toContain("durée");
    expect(body.warning).toContain("rendez-vous");
  });

  it("signale toujours le surnombre quand les places passent sous les inscrits", async () => {
    const id = makeTour();
    inscrire(id, 5);
    const { status, body } = await put(id, formBody({ capacity: 2 }));
    expect(status).toBe(200);
    expect(body.warning).toContain("surnombre");
  });
});
