// Garde-fou de débit sur les endpoints publics d'inscription.
//
// Deux risques distincts, donc deux seaux distincts :
//  - l'inscription, qu'un script peut marteler pour remplir toutes les visites ;
//  - la demande RGPD, qui envoie un email à une adresse choisie par l'appelant
//    et non par lui-même — sans limite, c'est un outil de harcèlement par email
//    financé par le quota EmailJS du collectif.
// Même harnais que auditRegressions.test.ts : vrais handlers API contre une
// RTDB Firebase simulée en mémoire.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  gdpr_confirm: "tpl_gdpr_confirm",
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

let registerHandler: any;
let tourCounter = 0;

beforeEach(async () => {
  vi.resetModules(); // remet aussi les compteurs du limiteur à zéro
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
  tourCounter++;

  registerHandler = (await import("../../api/visit-register.js")).default;
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

async function register(tourId: string, email: string, ip: string, extra: Record<string, unknown> = {}) {
  const res = mockRes();
  await registerHandler(
    mockReq({
      headers: { "x-forwarded-for": ip },
      body: { tourId, email, firstName: "F", lastName: "L", ...extra },
    }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

async function gdprRequest(email: string, ip: string) {
  const res = mockRes();
  await registerHandler(
    mockReq({ query: { action: "gdpr" }, headers: { "x-forwarded-for": ip }, body: { email } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

describe("limite de débit — inscription", () => {
  it("laisse passer un usage humain puis coupe le martèlement", async () => {
    const tourId = makeTour(100, `tour_rl_${tourCounter}`);

    // 20 inscriptions successives depuis la même IP : plausible pour un poste
    // partagé, donc toutes doivent aboutir.
    for (let i = 0; i < 20; i++) {
      const res = await register(tourId, `ok${i}@t.fr`, "10.0.0.1");
      expect(res.status).toBe(201);
    }

    const blocked = await register(tourId, "toomuch@t.fr", "10.0.0.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Trop de tentatives/);
  });

  it("ne pénalise pas les autres visiteurs", async () => {
    const tourId = makeTour(100, `tour_rl2_${tourCounter}`);

    for (let i = 0; i < 21; i++) {
      await register(tourId, `flood${i}@t.fr`, "10.0.0.2");
    }

    // Une autre IP garde son quota intact.
    const other = await register(tourId, "voisin@t.fr", "10.0.0.3");
    expect(other.status).toBe(201);
  });

  it("rouvre après la fenêtre", async () => {
    const tourId = makeTour(100, `tour_rl3_${tourCounter}`);

    for (let i = 0; i < 21; i++) {
      await register(tourId, `burst${i}@t.fr`, "10.0.0.4");
    }
    expect((await register(tourId, "encore@t.fr", "10.0.0.4")).status).toBe(429);

    vi.setSystemTime(new Date("2026-08-01T10:02:00.000Z"));
    expect((await register(tourId, "apres@t.fr", "10.0.0.4")).status).toBe(201);
  });

  it("n'entrave pas l'inscription manuelle du guide", async () => {
    // Le guide est authentifié par son code et inscrit légitimement un groupe
    // entier depuis un seul appareil, sur place.
    const tourId = makeTour(100, `tour_rl4_${tourCounter}`);
    setAtPath("guide_access_codes/g1", {
      id: "g1",
      code: "GUIDE-OK",
      createdAt: new Date().toISOString(),
      renewalDate: "2030-01-01T00:00:00.000Z",
      active: true,
    });

    for (let i = 0; i < 25; i++) {
      const res = mockRes();
      await registerHandler(
        mockReq({
          headers: { "x-forwarded-for": "10.0.0.5", "x-guide-code": "GUIDE-OK" },
          body: { tourId, email: `sur-place${i}@t.fr`, firstName: "F", lastName: "L", manual: true },
        }),
        res
      );
      expect(statusOf(res)).toBe(201);
    }
  });
});

describe("limite de débit — demande RGPD", () => {
  it("coupe court au harcèlement par email", async () => {
    // Chaque appel expédie un message à une adresse que l'appelant choisit.
    for (let i = 0; i < 3; i++) {
      expect((await gdprRequest("victime@t.fr", "10.0.1.1")).status).toBe(200);
    }

    const blocked = await gdprRequest("victime@t.fr", "10.0.1.1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Trop de demandes/);
  });

  it("a son propre quota, indépendant de celui de l'inscription", async () => {
    const tourId = makeTour(100, `tour_rl5_${tourCounter}`);

    // Épuiser le quota d'inscription ne doit pas fermer la porte du RGPD :
    // c'est un droit, il ne se perd pas parce qu'on a rempli un formulaire.
    for (let i = 0; i < 21; i++) {
      await register(tourId, `noise${i}@t.fr`, "10.0.1.2");
    }
    expect((await register(tourId, "bloque@t.fr", "10.0.1.2")).status).toBe(429);

    expect((await gdprRequest("moi@t.fr", "10.0.1.2")).status).toBe(200);
  });
});
