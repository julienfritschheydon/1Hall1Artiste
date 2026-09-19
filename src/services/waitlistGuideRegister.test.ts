// Bouton « Inscrire » du portail guide : POST /api/visit-waitlist?action=register.
//
// Ce qu'on protège ici, ce sont les pièges qui ont motivé l'endpoint dédié :
// une entrée de file doit devenir une inscription SANS laisser l'entrée
// derrière elle (sinon la personne compte deux fois, une fois en file une fois
// en inscription), et un double clic ne doit pas créer deux inscriptions.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  waitlist_confirmation: "tpl_waitlist_confirmation",
  waitlist_offer: "tpl_waitlist_offer",
  waitlist_accepted: "tpl_waitlist_accepted",
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
  rtdbPut: vi.fn(async (path: string, value: any) => {
    setAtPath(path, value === null ? null : JSON.parse(JSON.stringify(value)));
  }),
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
  return { method: "POST", query: {}, body: {}, headers: {}, url: "/api/visit-waitlist", ...overrides } as any;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.end = vi.fn();
  return res;
}
const jsonOf = (res: any) => res.json.mock.calls[res.json.mock.calls.length - 1]?.[0];
const statusOf = (res: any) => res.status.mock.calls[res.status.mock.calls.length - 1]?.[0] ?? 200;

const GUIDE_CODE = "CODE-GUIDE-2026";
const FUTURE = "2099-08-08T14:00:00.000Z";

let registerHandler: any;
let waitlistHandler: any;
let counter = 0;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  counter++;
  setAtPath("guide_access_codes/gac_1", { id: "gac_1", code: GUIDE_CODE, active: true });
  registerHandler = (await import("../../api/visit-register.js")).default;
  waitlistHandler = (await import("../../api/visit-waitlist.js")).default;
});

function makeTour(capacity: number, id: string) {
  setAtPath(`tours/${id}`, {
    id,
    guideId: "all-guides",
    title: `Visite test ${id}`,
    date: FUTURE,
    durationMinutes: 60,
    startLocationId: "allee-duguay-trouin-17",
    startLocationName: "17 allée Duguay Trouin",
    startLocationX: 105,
    startLocationY: 493,
    capacity,
    labels: [],
    status: "upcoming",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

async function register(tourId: string, email: string) {
  const res = mockRes();
  await registerHandler(
    mockReq({
      headers: { "x-forwarded-for": `10.8.${counter}.${email.length}` },
      body: { tourId, email, firstName: "F", lastName: "L" },
    }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

async function registerFromWaitlist(waitlistId: string, code: string = GUIDE_CODE) {
  const res = mockRes();
  await waitlistHandler(
    mockReq({ query: { action: "register" }, headers: { "x-guide-code": code }, body: { waitlistId } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

const registrationsOf = (tourId: string) =>
  Object.values((getAtPath("registrations") || {}) as Record<string, any>).filter(
    (r: any) => r.tourId === tourId && !r.deletedAt
  );

describe("inscription d'une personne en file d'attente par le guide", () => {
  it("crée l'inscription et retire la personne de la file", async () => {
    const tourId = makeTour(1, `tour_reg_${counter}`);
    await register(tourId, "premier@t.fr");
    const waited = await register(tourId, "attente@t.fr");
    expect(waited.body.status).toBe("waitlist");

    const out = await registerFromWaitlist(waited.body.waitlistId);

    expect(out.status).toBe(201);
    expect(out.body.ok).toBe(true);
    // L'entrée de file est consommée : plus de double comptage.
    expect(getAtPath(`waitlist/${waited.body.waitlistId}`).deletedAt).toBeTruthy();
    const reg = registrationsOf(tourId).find((r: any) => r.email === "attente@t.fr") as any;
    expect(reg.status).toBe("confirmé");
    expect(reg.confirmedAt).toBeTruthy();
  });

  it("réordonne les positions des suivants", async () => {
    const tourId = makeTour(1, `tour_order_${counter}`);
    await register(tourId, "premier@t.fr");
    const a = await register(tourId, "a@t.fr");
    const b = await register(tourId, "b@t.fr");
    expect(b.body.position).toBe(2);

    await registerFromWaitlist(a.body.waitlistId);

    expect(getAtPath(`waitlist/${b.body.waitlistId}`).position).toBe(1);
  });

  it("signale le dépassement de capacité sans le bloquer", async () => {
    const tourId = makeTour(1, `tour_over_${counter}`);
    await register(tourId, "premier@t.fr");
    const waited = await register(tourId, "attente@t.fr");

    const out = await registerFromWaitlist(waited.body.waitlistId);

    expect(out.status).toBe(201);
    expect(out.body.overCapacity).toBe(true);
    expect(registrationsOf(tourId)).toHaveLength(2);
  });

  it("ne crée pas de doublon si l'inscription a déjà eu lieu (double clic)", async () => {
    const tourId = makeTour(1, `tour_dup_${counter}`);
    await register(tourId, "premier@t.fr");
    const waited = await register(tourId, "attente@t.fr");

    const first = await registerFromWaitlist(waited.body.waitlistId);
    const second = await registerFromWaitlist(waited.body.waitlistId);

    expect(second.body.registrationId).toBe(first.body.registrationId);
    expect(registrationsOf(tourId).filter((r: any) => r.email === "attente@t.fr")).toHaveLength(1);
  });

  it("refuse un code guide invalide", async () => {
    const tourId = makeTour(1, `tour_auth_${counter}`);
    await register(tourId, "premier@t.fr");
    const waited = await register(tourId, "attente@t.fr");

    const out = await registerFromWaitlist(waited.body.waitlistId, "MAUVAIS-CODE");

    expect(out.status).toBe(401);
    expect(getAtPath(`waitlist/${waited.body.waitlistId}`).deletedAt).toBeFalsy();
  });

  it("refuse une entrée de file inconnue", async () => {
    const out = await registerFromWaitlist("wait_inexistant");
    expect(out.status).toBe(404);
  });
});
