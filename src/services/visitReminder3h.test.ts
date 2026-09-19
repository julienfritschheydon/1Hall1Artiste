// Rappel ~3h avant la visite (cron horaire déclenché par GitHub Actions).
// Ce job est le seul qui atteigne les gens inscrits la veille au soir pour le
// lendemain : les jobs quotidiens J-7/J-1 ne tournent qu'une fois par jour et
// ratent cette fenêtre. On verrouille ici les bornes de sélection (±30 min) et
// l'idempotence, plus le rendu de l'email.
// Même harnais que auditRegressions.test.ts : vrais handlers API contre une
// RTDB Firebase simulée en mémoire.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  reminder_3h: "tpl_reminder_3h",
});

// ---- Fake RTDB en mémoire (sémantique Firebase : [] / {} vide ≡ null/absent) ----
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

let registerHandler: any, emailsHandler: any;
let tourCounter = 0;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
  tourCounter++;

  registerHandler = (await import("../../api/visit-register.js")).default;
  emailsHandler = (await import("../../api/visit-emails.js")).default;
});

function makeTour(capacity: number, id: string, date: string) {
  setAtPath(`tours/${id}`, {
    id,
    guideId: "all-guides",
    title: `Visite test ${id}`,
    date,
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

// Inscrit puis confirme : seules les inscriptions « confirmé » sont rappelées.
async function registerConfirmed(tourId: string, email: string) {
  const res = mockRes();
  await registerHandler(mockReq({ body: { tourId, email, firstName: "F", lastName: "L" } }), res);
  const registrationId = jsonOf(res).registrationId;
  const reg = getAtPath(`registrations/${registrationId}`);
  const res2 = mockRes();
  await registerHandler(mockReq({ query: { action: "confirm" }, body: { token: reg.validationToken } }), res2);
  expect(statusOf(res2)).toBe(200);
  return registrationId;
}

async function runCron(type: string) {
  const res = mockRes();
  await emailsHandler(
    mockReq({ method: "GET", query: { type }, headers: { authorization: "Bearer test-cron-secret" } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

describe("rappel 3h avant la visite", () => {
  it("envoie le rappel pour une visite dans la fenêtre 3h ±30 min", async () => {
    const tourId = makeTour(5, `tour_w_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "soon@t.fr");

    // 11:55 → visite dans 3h05, dans la fenêtre.
    vi.setSystemTime(new Date("2026-08-08T11:55:00.000Z"));
    const res = await runCron("send-3h-reminder");

    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(0);
    expect(getAtPath(`registrations/${regId}`).reminder3hSent).toBe(true);
  });

  it("n'envoie rien trop tôt ni trop tard", async () => {
    const tourId = makeTour(5, `tour_b_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(tourId, "edge@t.fr");

    // Visite dans 5h : trop tôt.
    vi.setSystemTime(new Date("2026-08-08T10:00:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(0);

    // Visite dans 1h : la fenêtre est passée.
    vi.setSystemTime(new Date("2026-08-08T14:00:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(0);
  });

  it("ne renvoie pas le rappel au passage suivant (idempotence)", async () => {
    const tourId = makeTour(5, `tour_i_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(tourId, "once@t.fr");

    vi.setSystemTime(new Date("2026-08-08T11:40:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(1);

    // Passage horaire suivant, toujours dans la fenêtre : aucun doublon.
    vi.setSystemTime(new Date("2026-08-08T12:20:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(0);
  });

  it("ignore une inscription annulée", async () => {
    const tourId = makeTour(5, `tour_c_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "gone@t.fr");
    setAtPath(`registrations/${regId}/status`, "annulé");

    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(0);
  });

  it("atteint une inscription prise la veille au soir, que les jobs quotidiens ratent", async () => {
    // Le cas qui motive ce job : inscription à 21h (heure de Paris) la veille
    // pour le lendemain 15h. Le cron quotidien de 04:00 UTC est déjà passé et le
    // suivant verra la visite à J+0, hors de sa fenêtre J+1.
    vi.setSystemTime(new Date("2026-08-07T19:00:00.000Z"));
    const tourId = makeTour(5, `tour_l_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "lastminute@t.fr");

    // Le job quotidien du lendemain matin ne lui envoie rien.
    vi.setSystemTime(new Date("2026-08-08T04:00:00.000Z"));
    expect((await runCron("send-1d-validation")).body.sent).toBe(0);

    // Le cron horaire, lui, le rattrape.
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    expect((await runCron("send-3h-reminder")).body.sent).toBe(1);
    expect(getAtPath(`registrations/${regId}`).reminder3hSent).toBe(true);
  });
});

describe("contenu de l'email de rappel 3h", () => {
  it("mentionne le titre, l'heure en fuseau de Paris et le point de rendez-vous", async () => {
    const { buildVisitEmail } = await import("../../api/_visit-email.js");
    const built = buildVisitEmail("reminder_3h", {
      firstName: "Camille",
      tourTitle: "Les façades du quai Turenne",
      tourDate: "2026-08-08T15:00:00.000Z",
      startLocationName: "17 allée Duguay Trouin",
    });

    expect(built.subject).toContain("Les façades du quai Turenne");
    expect(built.message).toContain("Camille");
    expect(built.message).toContain("17 allée Duguay Trouin");
    // 15:00 UTC = 17:00 à Paris en août — le bug du fuseau déjà corrigé ailleurs.
    expect(built.message).toContain("17:00");
  });

  it("reste lisible sans date ni point de rendez-vous", async () => {
    const { buildVisitEmail } = await import("../../api/_visit-email.js");
    const built = buildVisitEmail("reminder_3h", { firstName: "Camille" });

    expect(built.subject).toContain("votre visite");
    expect(built.message).not.toContain("undefined");
    expect(built.message).not.toContain("Rendez-vous au");
  });
});
