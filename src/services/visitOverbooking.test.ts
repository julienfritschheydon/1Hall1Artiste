// Surbooking, file d'attente visible et bilan conservé.
//
// Sur une visite gratuite, l'absentéisme est structurellement de 30 à 50 % :
// plafonner à la capacité de terrain, c'est partir à 9 avec 15 places et 6
// personnes en file d'attente. Le surbooking corrige ça, mais il ne doit
// surtout pas s'activer tout seul : la valeur par défaut reproduit exactement
// le comportement d'avant.
//
// Même harnais que auditRegressions.test.ts : vrais handlers API contre une
// RTDB Firebase simulée en mémoire.
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
let registerHandler: any, toursHandler: any, attendanceHandler: any, emailsHandler: any;
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
  toursHandler = (await import("../../api/visit-tours.js")).default;
  attendanceHandler = (await import("../../api/visit-attendance.js")).default;
  emailsHandler = (await import("../../api/visit-emails.js")).default;
});

function makeTour(capacity: number, id: string, overbookingSeats?: number) {
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
    ...(overbookingSeats ? { overbookingSeats } : {}),
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
      headers: { "x-forwarded-for": `10.7.${tourCounter}.${email.length}` },
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

async function publicTours() {
  const res = mockRes();
  await toursHandler(mockReq({ method: "GET", query: {} }), res);
  return jsonOf(res);
}

describe("surbooking", () => {
  it("est désactivé par défaut — aucun changement de comportement", async () => {
    // Non-régression : sans réglage, une visite de 2 places en accepte 2.
    const tourId = makeTour(2, `tour_ob_off_${tourCounter}`);

    expect((await register(tourId, "a@t.fr")).body.status).toBe("confirmé");
    expect((await register(tourId, "b@t.fr")).body.status).toBe("confirmé");
    expect((await register(tourId, "c@t.fr")).body.status).toBe("waitlist");
  });

  it("ouvre des places supplémentaires quand le guide en règle", async () => {
    const tourId = makeTour(2, `tour_ob_on_${tourCounter}`, 2);

    for (const email of ["a@t.fr", "b@t.fr", "c@t.fr", "d@t.fr"]) {
      expect((await register(tourId, email)).body.status).toBe("confirmé");
    }
    // La 5e dépasse capacité + surbooking.
    expect((await register(tourId, "e@t.fr")).body.status).toBe("waitlist");
  });

  it("annonce au public le nombre de places réellement ouvertes", async () => {
    const tourId = makeTour(10, `tour_ob_pub_${tourCounter}`, 3);
    await register(tourId, "un@t.fr");

    const [tour] = (await publicTours()).filter((t: any) => t.id === tourId);
    // 13 ouvertes, 1 prise.
    expect(tour.placesLeft).toBe(12);
  });

  it("refuse un réglage absurde", async () => {
    const tourId = makeTour(10, `tour_ob_bad_${tourCounter}`);

    for (const bad of [-1, 3.5, 999, "beaucoup"]) {
      const res = mockRes();
      await toursHandler(
        mockReq({
          method: "PUT",
          query: { id: tourId },
          headers: { "x-guide-code": GUIDE },
          body: { overbookingSeats: bad },
        }),
        res
      );
      expect(statusOf(res)).toBe(400);
    }
  });

  it("propose les nouvelles places à la file d'attente dès qu'on l'active", async () => {
    const tourId = makeTour(1, `tour_ob_promo_${tourCounter}`);
    await register(tourId, "assis@t.fr");
    const attente = await register(tourId, "attente@t.fr");
    expect(attente.body.status).toBe("waitlist");

    const res = mockRes();
    await toursHandler(
      mockReq({
        method: "PUT",
        query: { id: tourId },
        headers: { "x-guide-code": GUIDE },
        body: { overbookingSeats: 2 },
      }),
      res
    );
    expect(statusOf(res)).toBe(200);

    // La personne en attente a reçu une offre sans attendre le cron quotidien.
    const waits = Object.values(getAtPath("waitlist") || {}) as any[];
    expect(waits.find((w) => w.email === "attente@t.fr")?.invitationSentAt).toBeTruthy();
  });

  it("avertit le guide si le réglage passe sous le nombre d'inscrits", async () => {
    const tourId = makeTour(2, `tour_ob_warn_${tourCounter}`, 2);
    for (const email of ["a@t.fr", "b@t.fr", "c@t.fr", "d@t.fr"]) {
      await register(tourId, email);
    }

    const res = mockRes();
    await toursHandler(
      mockReq({
        method: "PUT",
        query: { id: tourId },
        headers: { "x-guide-code": GUIDE },
        body: { overbookingSeats: 0 },
      }),
      res
    );

    expect(jsonOf(res).warning).toMatch(/surnombre/);
  });
});

describe("file d'attente visible du public", () => {
  it("annonce combien de personnes attendent, sans rien dire de qui elles sont", async () => {
    const tourId = makeTour(1, `tour_wc_${tourCounter}`);
    await register(tourId, "assis@t.fr");
    await register(tourId, "attente1@t.fr");
    await register(tourId, "attente2@t.fr", 1); // groupe de 2

    const [tour] = (await publicTours()).filter((t: any) => t.id === tourId);

    expect(tour.waitlistCount).toBe(3);
    // Aucune trace nominative dans la réponse publique.
    expect(JSON.stringify(tour)).not.toContain("attente1@t.fr");
  });

  it("vaut zéro quand personne n'attend", async () => {
    const tourId = makeTour(5, `tour_wc0_${tourCounter}`);
    await register(tourId, "seul@t.fr");

    const [tour] = (await publicTours()).filter((t: any) => t.id === tourId);
    expect(tour.waitlistCount).toBe(0);
  });

  it("le rappel de la veille dit combien de personnes attendent la place", async () => {
    // C'est ce qui donne du poids au bouton de désistement.
    const tourId = makeTour(1, `tour_wcmail_${tourCounter}`);
    await register(tourId, "inscrit@t.fr");
    await register(tourId, "attend@t.fr");

    fetchMock.mockClear();
    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    const res = mockRes();
    await emailsHandler(
      mockReq({
        method: "GET",
        query: { type: "send-1d-reminder" },
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      res
    );

    const bodies = fetchMock.mock.calls
      .filter((c: any[]) => String(c[0]).includes("emailjs"))
      .map((c: any[]) => String((c[1] as any)?.body ?? ""));
    const rappel = bodies.find((b) => b.includes("reservations/cancel"));
    expect(rappel).toContain("1");
    expect(rappel).toMatch(/attendent/);
  });
});

describe("bilan conservé au-delà de la purge RGPD", () => {
  it("écrit les chiffres avant d'effacer les inscriptions", async () => {
    const tourId = makeTour(3, `tour_stats_${tourCounter}`, 1);
    const present = await register(tourId, "venu@t.fr");
    const absent = await register(tourId, "pas-venu@t.fr");
    await register(tourId, "non-pointe@t.fr");
    await register(tourId, "attente@t.fr", 1); // 2 places en file

    setAtPath(`registrations/${present.body.registrationId}/status`, "présent");
    setAtPath(`registrations/${absent.body.registrationId}/status`, "absent");

    // Plus de 24h après la fin de la visite : la purge s'applique.
    vi.setSystemTime(new Date("2026-08-10T04:00:00.000Z"));
    const res = mockRes();
    await emailsHandler(
      mockReq({
        method: "GET",
        query: { type: "batch-delete-post-tour" },
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      res
    );

    // Les inscriptions sont bien purgées…
    const regs = Object.values(getAtPath("registrations") || {}) as any[];
    expect(regs.every((r) => r.email === "rgpd@supprimé")).toBe(true);

    // …mais le bilan chiffré survit.
    const stats = getAtPath(`visit_stats/${tourId}`);
    expect(stats).toBeTruthy();
    expect(stats.present).toBe(1);
    expect(stats.absent).toBe(1);
    expect(stats.unmarked).toBe(1);
    expect(stats.seatsTaken).toBe(3);
    expect(stats.waitlistPlaces).toBe(2);
    expect(stats.capacity).toBe(3);
    expect(stats.overbookingSeats).toBe(1);
  });

  it("ne conserve aucune donnée personnelle", async () => {
    const tourId = makeTour(3, `tour_stats_rgpd_${tourCounter}`);
    await register(tourId, "prive@t.fr");

    vi.setSystemTime(new Date("2026-08-10T04:00:00.000Z"));
    const res = mockRes();
    await emailsHandler(
      mockReq({
        method: "GET",
        query: { type: "batch-delete-post-tour" },
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      res
    );

    expect(JSON.stringify(getAtPath("visit_stats"))).not.toContain("prive@t.fr");
  });

  it("calcule le taux d'absentéisme sur les seules visites pointées", async () => {
    // Inclure les visites où personne n'a fait l'appel ferait tendre le taux
    // vers zéro et donnerait une fausse impression d'assiduité.
    setAtPath(`visit_stats/t1`, {
      tourId: "t1",
      title: "Pointée",
      date: "2026-08-08T14:00:00.000Z",
      capacity: 10,
      overbookingSeats: 0,
      seatsTaken: 10,
      present: 6,
      absent: 4,
      unmarked: 0,
      waitlistPlaces: 0,
      recordedAt: "2026-08-09T04:00:00.000Z",
    });
    setAtPath(`visit_stats/t2`, {
      tourId: "t2",
      title: "Jamais pointée",
      date: "2026-08-09T14:00:00.000Z",
      capacity: 10,
      overbookingSeats: 0,
      seatsTaken: 10,
      present: 0,
      absent: 0,
      unmarked: 10,
      waitlistPlaces: 0,
      recordedAt: "2026-08-10T04:00:00.000Z",
    });

    const res = mockRes();
    await attendanceHandler(
      mockReq({ method: "GET", query: { action: "stats" }, headers: { "x-guide-code": GUIDE } }),
      res
    );

    expect(jsonOf(res).global.noShowRate).toBe(40);
    expect(jsonOf(res).global.toursWithAttendance).toBe(1);
    expect(jsonOf(res).global.toursRecorded).toBe(2);
  });

  it("ne prétend pas connaître un taux quand rien n'a été pointé", async () => {
    const res = mockRes();
    await attendanceHandler(
      mockReq({ method: "GET", query: { action: "stats" }, headers: { "x-guide-code": GUIDE } }),
      res
    );
    expect(jsonOf(res).global.noShowRate).toBeNull();
  });

  it("réserve le bilan aux guides", async () => {
    const res = mockRes();
    await attendanceHandler(mockReq({ method: "GET", query: { action: "stats" } }), res);
    expect(statusOf(res)).toBe(401);
  });
});
