// Recherche d'un inscrit par nom ou email depuis le portail guide.
//
// Le portail n'offrait qu'une entrée PAR VISITE : pour retrouver quelqu'un il
// fallait exporter le CSV et le fouiller, et ce CSV omet les inscriptions
// annulées — justement le cas où l'on cherche.
//
// Vrais handlers API contre une RTDB Firebase simulée en mémoire, même harnais
// que visitRegistrationFlow.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.GUIDE_ACCESS_SECRET = "test-guide-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  cancellation: "tpl_cancellation",
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
  // Écriture conditionnelle : l'ETag est la valeur sérialisée du nœud, ce qui
  // reproduit le compare-and-set dont dépend le verrou par visite
  // (api/_tour-lock.ts).
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
const jsonOf = (res: any) => res.json.mock.calls[res.json.mock.calls.length - 1]?.[0];
const statusOf = (res: any) => res.status.mock.calls[res.status.mock.calls.length - 1]?.[0] ?? 200;

const GUIDE = "code-guide-test";
let registerHandler: any, attendanceHandler: any, waitlistHandler: any;
let counter = 0;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
  counter++;

  setAtPath("guide_access_codes/gac1", { id: "gac1", code: GUIDE, active: true });

  registerHandler = (await import("../../api/visit-register.js")).default;
  attendanceHandler = (await import("../../api/visit-attendance.js")).default;
  waitlistHandler = (await import("../../api/visit-waitlist.js")).default;
});

function makeTour(id: string, date = "2026-08-20T13:00:00.000Z", capacity = 10) {
  setAtPath(`tours/${id}`, {
    id,
    guideId: "all-guides",
    title: `Visite ${id}`,
    date,
    durationMinutes: 30,
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

async function register(tourId: string, email: string, firstName: string, lastName: string) {
  const res = mockRes();
  await registerHandler(
    mockReq({ body: { tourId, email, firstName, lastName } }),
    res
  );
  return jsonOf(res);
}

// `code: null` = aucun en-tête. Un `undefined` explicite déclencherait la
// valeur par défaut du paramètre (sémantique JS), et le test passerait à côté.
async function search(q: string, code: string | null = GUIDE) {
  const res = mockRes();
  await registerHandler(
    mockReq({
      method: "GET",
      query: { action: "search", q },
      headers: code ? { "x-guide-code": code } : {},
    }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

describe("recherche d'inscrit — correspondance", () => {
  it("trouve par nom, par prénom, et par « prénom nom »", async () => {
    const tour = makeTour(`t_a_${counter}`);
    await register(tour, "marie.dupont@test.fr", "Marie", "Dupont");

    for (const q of ["dupont", "marie", "marie dupont", "Dupont Marie"]) {
      const res = await search(q);
      expect(res.body.results, `requête « ${q} »`).toHaveLength(1);
      expect(res.body.results[0].email).toBe("marie.dupont@test.fr");
    }
  });

  it("ignore les accents et la casse", async () => {
    // Le cas qui motive la normalisation : un guide tape « lea », la personne
    // s'est inscrite « Léa ». Sans retrait des accents, zéro résultat, et le
    // guide conclut à tort que l'inscription n'existe pas.
    const tour = makeTour(`t_b_${counter}`);
    await register(tour, "lea@test.fr", "Léa", "Hénaff");

    expect((await search("lea")).body.results).toHaveLength(1);
    expect((await search("LEA")).body.results).toHaveLength(1);
    expect((await search("henaff")).body.results).toHaveLength(1);
    expect((await search("Héna")).body.results).toHaveLength(1);
  });

  it("trouve par fragment d'email", async () => {
    const tour = makeTour(`t_c_${counter}`);
    await register(tour, "jean.martin@exemple.org", "Jean", "Martin");
    expect((await search("exemple.org")).body.results).toHaveLength(1);
  });

  it("refuse une requête trop courte", async () => {
    const res = await search("a");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("query_too_short");
  });

  it("ne renvoie personne quand rien ne correspond", async () => {
    const tour = makeTour(`t_d_${counter}`);
    await register(tour, "marie@test.fr", "Marie", "Dupont");
    expect((await search("zzzz")).body.results).toEqual([]);
  });
});

describe("recherche d'inscrit — contenu du résultat", () => {
  it("regroupe toutes les visites d'une même personne", async () => {
    const t1 = makeTour(`t_e1_${counter}`, "2026-08-20T13:00:00.000Z");
    const t2 = makeTour(`t_e2_${counter}`, "2026-08-21T13:00:00.000Z");
    await register(t1, "multi@test.fr", "Paul", "Durand");
    await register(t2, "multi@test.fr", "Paul", "Durand");

    const res = await search("durand");
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].registrations).toHaveLength(2);
    // Le détail de la visite accompagne chaque inscription.
    const titles = res.body.results[0].registrations.map((r: any) => r.tour.title).sort();
    expect(titles).toEqual([`Visite ${t1}`, `Visite ${t2}`]);
  });

  it("inclut les inscriptions annulées, que l'export CSV omet", async () => {
    const tour = makeTour(`t_f_${counter}`);
    const reg = await register(tour, "annule@test.fr", "Sophie", "Bernard");

    const cancel = mockRes();
    await registerHandler(
      mockReq({ query: { action: "cancel" }, body: { registrationId: reg.registrationId, email: "annule@test.fr" } }),
      cancel
    );
    expect(statusOf(cancel)).toBe(200);

    const res = await search("bernard");
    expect(res.body.results[0].registrations).toHaveLength(1);
    expect(res.body.results[0].registrations[0].status).toBe("annulé");
    expect(res.body.results[0].registrations[0].cancelledAt).toBeTruthy();
  });

  it("remonte aussi les entrées de file d'attente, avec leur position", async () => {
    const tour = makeTour(`t_g_${counter}`, "2026-08-20T13:00:00.000Z", 1);
    await register(tour, "premier@test.fr", "Anne", "Premier");
    await register(tour, "second@test.fr", "Bruno", "Second");

    const res = await search("second");
    expect(res.body.results[0].registrations).toHaveLength(0);
    expect(res.body.results[0].waitlist).toHaveLength(1);
    expect(res.body.results[0].waitlist[0].position).toBe(1);
    expect(res.body.results[0].waitlist[0].tour.title).toBe(`Visite ${tour}`);
  });

  it("n'expose aucun jeton", async () => {
    // Un spread de l'objet brut ferait fuiter validationToken / invitationToken
    // jusque dans le navigateur. Les champs sont listés un à un côté serveur.
    const tour = makeTour(`t_h_${counter}`, "2026-08-20T13:00:00.000Z", 1);
    await register(tour, "a@test.fr", "Alice", "Token");
    await register(tour, "b@test.fr", "Bob", "Token");

    const serialized = JSON.stringify((await search("token")).body);
    expect(serialized).not.toMatch(/token["']?\s*:/i);
    expect(serialized).not.toContain("validationToken");
    expect(serialized).not.toContain("invitationToken");
  });
});

describe("recherche d'inscrit — accès", () => {
  it("refuse sans code guide", async () => {
    const res = await search("dupont", null);
    expect(res.status).toBe(401);
  });

  it("refuse avec un code guide invalide", async () => {
    const res = await search("dupont", "mauvais-code");
    expect(res.status).toBe(401);
  });
});

describe("actions depuis le résultat de recherche", () => {
  it("les identifiants renvoyés permettent d'annuler l'inscription", async () => {
    const tour = makeTour(`t_i_${counter}`);
    await register(tour, "cible@test.fr", "Claire", "Action");

    const found = (await search("action")).body.results[0];
    const reg = found.registrations[0];

    const res = mockRes();
    await registerHandler(
      mockReq({ query: { action: "cancel" }, body: { registrationId: reg.id, email: found.email } }),
      res
    );
    expect(statusOf(res)).toBe(200);

    const after = (await search("action")).body.results[0];
    expect(after.registrations[0].status).toBe("annulé");
  });

  it("les identifiants renvoyés permettent de pointer présent", async () => {
    const tour = makeTour(`t_j_${counter}`);
    await register(tour, "presence@test.fr", "David", "Pointage");

    const found = (await search("pointage")).body.results[0];
    const reg = found.registrations[0];

    const res = mockRes();
    await attendanceHandler(
      mockReq({
        body: { registrationId: reg.id, tourId: reg.tourId, present: true },
        headers: { "x-guide-code": GUIDE },
      }),
      res
    );
    expect(statusOf(res)).toBe(200);

    const after = (await search("pointage")).body.results[0];
    expect(after.registrations[0].status).toBe("présent");
  });

  it("les identifiants renvoyés permettent de retirer de la file d'attente", async () => {
    const tour = makeTour(`t_k_${counter}`, "2026-08-20T13:00:00.000Z", 1);
    await register(tour, "occupe@test.fr", "Emma", "Occupe");
    await register(tour, "attente@test.fr", "Franck", "Attente");

    const found = (await search("attente@test.fr")).body.results[0];
    const entry = found.waitlist[0];

    const res = mockRes();
    await waitlistHandler(
      mockReq({
        method: "DELETE",
        query: { id: entry.id, email: found.email },
        headers: { "x-guide-code": GUIDE },
      }),
      res
    );
    expect(statusOf(res)).toBe(200);

    const after = (await search("attente@test.fr")).body.results;
    expect(after[0]?.waitlist ?? []).toHaveLength(0);
  });
});
