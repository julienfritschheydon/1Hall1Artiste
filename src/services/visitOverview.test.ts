// Endpoint agrégé du portail guide, et nettoyage du double opt-in.
//
// L'endpoint remplace deux appels PAR VISITE (feuille d'appel + file d'attente)
// par un seul pour tout le programme. Il doit donc renvoyer EXACTEMENT les
// mêmes chiffres que les appels détaillés qu'il remplace — sinon le portail
// affiche des compteurs différents selon l'écran d'où on les regarde.
//
// Même harnais que auditRegressions.test.ts : vrais handlers API contre une
// RTDB Firebase simulée en mémoire.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  waitlist_confirmation: "tpl_waitlist_confirmation",
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
let registerHandler: any, attendanceHandler: any;
let tourCounter = 0;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
  tourCounter++;

  setAtPath("guide_access_codes/g1", {
    id: "g1",
    code: GUIDE,
    createdAt: new Date().toISOString(),
    renewalDate: "2030-01-01T00:00:00.000Z",
    active: true,
  });

  registerHandler = (await import("../../api/visit-register.js")).default;
  attendanceHandler = (await import("../../api/visit-attendance.js")).default;
});

function makeTour(capacity: number, id: string) {
  setAtPath(`tours/${id}`, {
    id,
    guideId: "all-guides",
    title: `Visite test ${id}`,
    date: "2026-08-08T14:00:00.000Z",
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

async function register(tourId: string, email: string, companions = 0) {
  const res = mockRes();
  await registerHandler(
    mockReq({
      headers: { "x-forwarded-for": `10.5.${tourCounter}.${email.length}` },
      body: {
        tourId,
        email,
        firstName: "F",
        lastName: "L",
        companions: Array.from({ length: companions }, (_, i) => ({ firstName: `A${i}` })),
      },
    }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

async function overview() {
  const res = mockRes();
  await attendanceHandler(
    mockReq({ method: "GET", query: { action: "overview" }, headers: { "x-guide-code": GUIDE } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

async function detail(tourId: string) {
  const res = mockRes();
  await attendanceHandler(
    mockReq({ method: "GET", query: { tourId }, headers: { "x-guide-code": GUIDE } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

describe("vue d'ensemble du portail guide", () => {
  it("donne les mêmes chiffres que les appels détaillés qu'elle remplace", async () => {
    const t1 = makeTour(5, `tour_ov1_${tourCounter}`);
    const t2 = makeTour(2, `tour_ov2_${tourCounter}`);

    await register(t1, "a@t.fr");
    await register(t1, "b@t.fr", 1); // groupe de 2
    await register(t2, "c@t.fr", 1); // remplit t2
    await register(t2, "d@t.fr"); // → file d'attente

    const vue = await overview();
    expect(vue.status).toBe(200);

    for (const tourId of [t1, t2]) {
      const det = await detail(tourId);
      expect(vue.body.registrations[tourId]).toHaveLength(det.body.registrations.length);
      // Le portail recalcule ses statistiques sur cette liste : les places
      // doivent concorder, pas seulement le nombre de lignes.
      const placesVue = vue.body.registrations[tourId].reduce(
        (s: number, r: any) => s + 1 + (r.companions?.length ?? 0),
        0
      );
      expect(placesVue).toBe(det.body.counts.seatsTaken);
    }
  });

  it("compte les places de la file d'attente, accompagnants inclus", async () => {
    const tourId = makeTour(1, `tour_ovw_${tourCounter}`);
    await register(tourId, "assis@t.fr");
    await register(tourId, "attente@t.fr", 2); // groupe de 3 en file

    const vue = await overview();
    expect(vue.body.waitlistPlaces[tourId]).toBe(3);
  });

  it("couvre toutes les visites, y compris celles sans aucun inscrit", async () => {
    const plein = makeTour(5, `tour_plein_${tourCounter}`);
    const vide = makeTour(5, `tour_vide_${tourCounter}`);
    await register(plein, "seul@t.fr");

    const vue = await overview();

    expect(vue.body.registrations[plein]).toHaveLength(1);
    expect(vue.body.registrations[vide]).toEqual([]);
    expect(vue.body.waitlistPlaces[vide]).toBe(0);
  });

  it("exclut les inscriptions annulées, comme la feuille d'appel", async () => {
    const tourId = makeTour(5, `tour_ovc_${tourCounter}`);
    const reg = await register(tourId, "parti@t.fr");
    await register(tourId, "reste@t.fr");

    setAtPath(`registrations/${reg.body.registrationId}/status`, "annulé");

    const vue = await overview();
    expect(vue.body.registrations[tourId]).toHaveLength(1);
  });

  it("exige un code guide valide", async () => {
    const res = mockRes();
    await attendanceHandler(
      mockReq({ method: "GET", query: { action: "overview" }, headers: { "x-guide-code": "FAUX" } }),
      res
    );
    expect(statusOf(res)).toBe(401);
  });
});

describe("nettoyage du double opt-in", () => {
  it("une inscription résiduelle « en attente de validation » n'occupe plus de place", async () => {
    // Statut hérité, plus rien ne le produit : son jeton a expiré depuis
    // longtemps, il ne doit ni retenir un siège ni apparaître à l'appel.
    const tourId = makeTour(1, `tour_legacy_${tourCounter}`);
    setAtPath(`registrations/legacy_${tourCounter}`, {
      id: `legacy_${tourCounter}`,
      tourId,
      email: "fantome@t.fr",
      firstName: "Fan",
      lastName: "Tome",
      status: "attente_validation",
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    setAtPath(`registrations_by_tour/${tourId}/legacy_${tourCounter}`, true);

    // La place est bien considérée comme libre.
    const res = await register(tourId, "vivant@t.fr");
    expect(res.body.status).toBe("confirmé");

    // Et le fantôme n'apparaît pas sur la feuille d'appel.
    const det = await detail(tourId);
    expect(det.body.registrations.map((r: any) => r.email)).toEqual(["vivant@t.fr"]);
  });

  it("ne bloque plus une réinscription à cause d'un statut hérité", async () => {
    const tourId = makeTour(5, `tour_legacy2_${tourCounter}`);
    setAtPath(`registrations/old_${tourCounter}`, {
      id: `old_${tourCounter}`,
      tourId,
      email: "revenant@t.fr",
      firstName: "Re",
      lastName: "Venant",
      status: "attente_validation",
      createdAt: "2026-07-01T10:00:00.000Z",
    });
    setAtPath(`registrations_by_tour/${tourId}/old_${tourCounter}`, true);
    setAtPath(`registrations_by_email/revenant@t,fr/old_${tourCounter}`, true);

    const res = await register(tourId, "revenant@t.fr");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmé");
  });

  it("l'ancien lien de validation rassure au lieu d'inquiéter", async () => {
    // Des emails d'avant le changement circulent encore. Un clic ne doit pas
    // afficher une erreur alors que l'inscription est parfaitement valide.
    const tourId = makeTour(5, `tour_oldlink_${tourCounter}`);
    const reg = await register(tourId, "ancien@t.fr");

    const { createRegistrationToken } = await import("../../api/_token.js");
    const token = createRegistrationToken(reg.body.registrationId, "ancien@t.fr").token;

    const res = mockRes();
    await registerHandler(mockReq({ query: { action: "confirm" }, body: { token } }), res);

    expect(statusOf(res)).toBe(200);
    expect(jsonOf(res).ok).toBe(true);
    expect(jsonOf(res).status).toBe("confirmé");
  });

  it("l'action de renvoi de validation n'existe plus", async () => {
    const res = mockRes();
    await registerHandler(
      mockReq({ query: { action: "resend" }, headers: { "x-guide-code": GUIDE }, body: { registrationId: "x" } }),
      res
    );
    // Une action inconnue ne doit surtout pas créer une inscription en douce.
    expect(statusOf(res)).toBe(400);
    expect(jsonOf(res).error).toMatch(/Action inconnue/);
  });
});
