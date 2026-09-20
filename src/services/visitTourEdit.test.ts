// Édition d'une visite à moins de 24 h du départ.
//
// Le gel J-1 protège les inscrits : horaire, durée et nombre de places ne
// doivent plus bouger. Mais il bloquait aussi les corrections de texte, et même
// un simple changement d'intitulé, parce que le formulaire renvoie tous les
// champs et que la comparaison brute voyait des changements fantômes
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

describe("édition d'une visite à moins de 24 h", () => {
  it("accepte un changement d'intitulé seul", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ title: "Visite du Temple du Goût" }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).title).toBe("Visite du Temple du Goût");
  });

  it("accepte l'ajout d'un descriptif", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ description: "Départ devant le Temple du Goût." }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).description).toBe("Départ devant le Temple du Goût.");
  });

  it("accepte une modification de texte sur une visite sans descriptif ni surbooking enregistrés", async () => {
    // Le formulaire renvoie description:"" et overbookingSeats:0 là où la base
    // n'a rien : ces champs ne doivent pas compter comme des changements.
    const id = makeTour();
    const { status } = await put(id, formBody({ title: "Nouvel intitulé" }));
    expect(status).toBe(200);
  });

  it("accepte un renvoi de la même date à la seconde près", async () => {
    const id = makeTour("tour_secondes", { date: "2026-09-19T12:00:00.000Z" });
    // Le formulaire ne garde que les minutes : la date repart sans les secondes.
    const { status } = await put(id, formBody({ title: "Autre titre", date: "2026-09-19T12:00:00Z" }));
    expect(status).toBe(200);
  });

  it("refuse toujours un changement d'horaire", async () => {
    const id = makeTour();
    const { status, body } = await put(id, formBody({ date: "2026-09-19T15:00:00.000Z" }));
    expect(status).toBe(400);
    expect(body.error).toBe("cannot modify within 24h of start");
    expect(getAtPath(`tours/${id}`).date).toBe(TOUR_DATE);
  });

  it("refuse toujours un changement de capacité", async () => {
    const id = makeTour();
    const { status } = await put(id, formBody({ capacity: 30 }));
    expect(status).toBe(400);
    expect(getAtPath(`tours/${id}`).capacity).toBe(15);
  });

  it("laisse passer les mêmes champs largement avant la visite", async () => {
    vi.setSystemTime(new Date("2026-09-01T08:00:00.000Z"));
    const id = makeTour();
    const { status } = await put(id, formBody({ capacity: 30, description: "Nouveau texte" }));
    expect(status).toBe(200);
    expect(getAtPath(`tours/${id}`).capacity).toBe(30);
  });
});
