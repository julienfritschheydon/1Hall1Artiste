// Tests de régression — audit visites guidées (août 2026).
// Chaque bloc verrouille la correction d'un bug identifié par l'audit :
// liens d'offre, intégrité de l'index de file d'attente, activation idempotente,
// réinscription après annulation, re-validation J-1, dédoublonnage file,
// inscription sur visite passée, placesLeft, fuseau des emails, CSV, statuts.
// Même harnais que visitRegistrationFlow.test.ts : vrais handlers API contre
// une RTDB simulée en mémoire.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  waitlist_confirmation: "tpl_waitlist_confirmation",
  waitlist_offer: "tpl_waitlist_offer",
  validation_expired: "tpl_validation_expired",
  cancellation: "tpl_cancellation",
  reminder_7d: "tpl_reminder_7d",
  reminder_1d_validate: "tpl_reminder_1d_validate",
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
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
  if (isEmpty) delete cur[last];
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

let registerHandler: any, emailsHandler: any, waitlistHandler: any, toursHandler: any;
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
  waitlistHandler = (await import("../../api/visit-waitlist.js")).default;
  toursHandler = (await import("../../api/visit-tours.js")).default;
});

function makeTour(capacity: number, id = `tour_${tourCounter}`, date = "2026-08-08T14:00:00.000Z") {
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

async function register(tourId: string, email: string, opts: Record<string, unknown> = {}) {
  const res = mockRes();
  await registerHandler(mockReq({ body: { tourId, email, firstName: "F", lastName: "L", ...opts } }), res);
  return { status: statusOf(res), body: jsonOf(res) };
}

async function cancelRegistration(registrationId: string, email: string) {
  const res = mockRes();
  await registerHandler(mockReq({ query: { action: "cancel" }, body: { registrationId, email } }), res);
  return { status: statusOf(res), body: jsonOf(res) };
}

async function deleteWaitlist(waitlistId: string) {
  const res = mockRes();
  await waitlistHandler(mockReq({ method: "DELETE", query: { id: waitlistId } }), res);
  return { status: statusOf(res), body: jsonOf(res) };
}

async function activateWaitlist(token: string) {
  const res = mockRes();
  await waitlistHandler(mockReq({ query: { action: "activate" }, body: { token } }), res);
  return { status: statusOf(res), body: jsonOf(res) };
}

async function getPublicWaitlist(tourId: string) {
  const res = mockRes();
  await waitlistHandler(mockReq({ method: "GET", query: { tourId } }), res);
  return { status: statusOf(res), body: jsonOf(res) };
}

async function runCron(type: string) {
  const res = mockRes();
  await emailsHandler(
    mockReq({ method: "GET", query: { type }, headers: { authorization: "Bearer test-cron-secret" } }),
    res
  );
  return { status: statusOf(res), body: jsonOf(res) };
}

function rawWaitlistFor(tourId: string) {
  const all = getAtPath("waitlist") || {};
  return Object.values(all).filter((w: any) => w.tourId === tourId && !w.deletedAt) as any[];
}
function rawRegsFor(tourId: string) {
  const all = getAtPath("registrations") || {};
  return Object.values(all).filter((r: any) => r.tourId === tourId && !r.deletedAt) as any[];
}
// Corps des emails envoyés (payload EmailJS) — pour vérifier les liens.
function sentEmailBodies(): string[] {
  return fetchMock.mock.calls
    .filter((c: any[]) => String(c[0]).includes("emailjs"))
    .map((c: any[]) => String(c[1]?.body ?? ""));
}

describe("C1 — le lien d'offre immédiate pointe vers accept-waitlist", () => {
  it("après une annulation, l'email d'offre contient /reservations/accept-waitlist, pas /confirm", async () => {
    const tourId = makeTour(1);
    const a = await register(tourId, "a@t.fr");
    const b = await register(tourId, "b@t.fr");
    expect(b.body.status).toBe("waitlist");

    fetchMock.mockClear();
    // A annule → promotion immédiate de B avec email d'offre.
    await cancelRegistration(a.body.registrationId, "a@t.fr");

    const bWait = rawWaitlistFor(tourId).find((w) => w.email === "b@t.fr");
    expect(bWait?.invitationSentAt).toBeTruthy();

    const offerBodies = sentEmailBodies().filter((body) => body.includes("libérée") || body.includes("accept"));
    expect(offerBodies.length).toBeGreaterThan(0);
    for (const body of offerBodies) {
      expect(body).toContain("/reservations/accept-waitlist?token=");
      expect(body).not.toContain("/reservations/confirm?token=");
    }
  });
});

describe("C2 — intégrité de l'index de file d'attente", () => {
  it("annulation en tête de file + nouvel arrivant : personne ne disparaît de la file", async () => {
    const tourId = makeTour(1);
    await register(tourId, "hold@t.fr"); // occupe la place
    await register(tourId, "w1@t.fr"); // file pos 1
    const w2 = await register(tourId, "w2@t.fr"); // file pos 2
    const w3 = await register(tourId, "w3@t.fr"); // file pos 3
    expect(w2.body.position).toBe(2);
    expect(w3.body.position).toBe(3);

    // w1 quitte la file (positions décalées), puis w4 arrive.
    const w1Wait = rawWaitlistFor(tourId).find((w) => w.email === "w1@t.fr");
    await deleteWaitlist(w1Wait.id);
    await register(tourId, "w4@t.fr");

    // La liste INDEXÉE (celle utilisée par promotions, capacité, guide) doit
    // contenir w2, w3 ET w4 — l'ancien index par position écrasait w3.
    const listed = await getPublicWaitlist(tourId);
    expect(listed.body.totalInWaitlist).toBe(3);

    const emails = rawWaitlistFor(tourId).map((w) => w.email).sort();
    expect(emails).toEqual(["w2@t.fr", "w3@t.fr", "w4@t.fr"]);
  });

  it("offre acceptée + nouvel arrivant : l'entrée suivante reste dans la file", async () => {
    const tourId = makeTour(1);
    const a = await register(tourId, "a@t.fr");
    await register(tourId, "b@t.fr"); // file pos 1
    await register(tourId, "c@t.fr"); // file pos 2

    // A annule → offre envoyée à B → B accepte (entrée B soft-deleted).
    await cancelRegistration(a.body.registrationId, "a@t.fr");
    const bWait = rawWaitlistFor(tourId).find((w) => w.email === "b@t.fr");
    const activated = await activateWaitlist(bWait.invitationToken);
    expect(activated.body.ok).toBe(true);

    // D rejoint la file : C doit toujours être listé (l'index par position
    // aurait fait pointer la clé de C vers D).
    await register(tourId, "d@t.fr");
    const listed = await getPublicWaitlist(tourId);
    expect(listed.body.totalInWaitlist).toBe(2);
    const emails = rawWaitlistFor(tourId).map((w) => w.email).sort();
    expect(emails).toEqual(["c@t.fr", "d@t.fr"]);
  });
});

describe("C4 — activation d'offre idempotente", () => {
  it("rejouer le lien d'acceptation ne crée pas de deuxième inscription confirmée", async () => {
    const tourId = makeTour(1);
    const a = await register(tourId, "a@t.fr");
    await register(tourId, "b@t.fr");

    await cancelRegistration(a.body.registrationId, "a@t.fr");
    const bWait = rawWaitlistFor(tourId).find((w) => w.email === "b@t.fr");

    const first = await activateWaitlist(bWait.invitationToken);
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    // Rechargement de la page / deuxième clic sur le lien.
    const second = await activateWaitlist(bWait.invitationToken);
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.registrationId).toBe(first.body.registrationId);

    const bRegs = rawRegsFor(tourId).filter((r) => r.email === "b@t.fr" && r.status === "confirmé");
    expect(bRegs.length).toBe(1);
  });
});

describe("C5 — réinscription possible après annulation", () => {
  it("annuler son inscription puis se réinscrire fonctionne (comme le promettent les emails)", async () => {
    const tourId = makeTour(5);
    const first = await register(tourId, "again@t.fr");
    expect(first.status).toBe(201);
    await cancelRegistration(first.body.registrationId, "again@t.fr");

    const second = await register(tourId, "again@t.fr");
    expect(second.status).toBe(201);
    expect(second.body.status).toBe("attente_validation");
  });
});

describe("H1 — re-validation J-1", () => {
  it("cliquer le lien de re-validation efface la deadline ; seul le non-cliqueur est auto-annulé", async () => {
    // Visite le 8 août à 15:00Z. Les deux inscrits confirment leur inscription initiale.
    const tourId = makeTour(5, `tour_h1_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const { createRegistrationToken } = await import("../../api/_token.js");

    const clicker = await register(tourId, "clicker@t.fr");
    const ghost = await register(tourId, "ghost@t.fr");
    for (const r of [clicker, ghost]) {
      const reg = getAtPath(`registrations/${r.body.registrationId}`);
      const res = mockRes();
      await registerHandler(mockReq({ query: { action: "confirm" }, body: { token: reg.validationToken } }), res);
      expect(jsonOf(res).ok).toBe(true);
    }

    // J-1 : le cron envoie les demandes de re-validation (fenêtre +24h ±1h).
    vi.setSystemTime(new Date("2026-08-07T14:30:00.000Z"));
    const sent = await runCron("send-1d-validation");
    expect(sent.body.sent).toBe(2);

    // clicker re-valide via le lien (deadline effacée).
    const clickToken = createRegistrationToken(clicker.body.registrationId, "clicker@t.fr").token;
    const res = mockRes();
    await registerHandler(mockReq({ query: { action: "confirm" }, body: { token: clickToken } }), res);
    expect(jsonOf(res).ok).toBe(true);
    expect(getAtPath(`registrations/${clicker.body.registrationId}`).validationDeadline).toBeFalsy();

    // Deadline (J-1 + 24h = 08/08 14:30) dépassée, visite pas encore commencée.
    vi.setSystemTime(new Date("2026-08-08T14:45:00.000Z"));
    const swept = await runCron("send-1d-validation");
    expect(swept.body.autocancelled).toBe(1);

    expect(getAtPath(`registrations/${clicker.body.registrationId}`).status).toBe("confirmé");
    expect(getAtPath(`registrations/${ghost.body.registrationId}`).status).toBe("annulé");
  });
});

describe("M6 — dédoublonnage de la file d'attente", () => {
  it("le même email ne peut pas s'ajouter deux fois à la même file", async () => {
    const tourId = makeTour(1);
    await register(tourId, "hold@t.fr");
    const first = await register(tourId, "dup@t.fr");
    expect(first.body.status).toBe("waitlist");

    const second = await register(tourId, "dup@t.fr");
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already in waitlist/);
  });
});

describe("M4 — visite déjà commencée", () => {
  it("refuse une inscription publique sur une visite passée", async () => {
    const tourId = makeTour(5, `tour_past_${tourCounter}`, "2026-07-30T14:00:00.000Z");
    const res = await register(tourId, "late@t.fr");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already started/);
  });
});

describe("M1 — placesLeft cohérent avec la règle d'inscription", () => {
  it("les places réservées par la file d'attente ne sont pas affichées comme libres", async () => {
    const tourId = makeTour(2);
    await register(tourId, "solo@t.fr"); // 1/2 pris (attente_validation active)
    const group = await register(tourId, "group@t.fr", { companions: [{ firstName: "C1" }] }); // groupe 2 → file
    expect(group.body.status).toBe("waitlist");

    const res = mockRes();
    await toursHandler(mockReq({ method: "GET", query: {} }), res);
    const tours = jsonOf(res);
    const tour = tours.find((t: any) => t.id === tourId);
    // 2 - 1 (occupée) - 2 (file) → 0. L'ancien calcul affichait 1 alors que
    // toute inscription partait en file d'attente.
    expect(tour.placesLeft).toBe(0);
  });
});

describe("H2 — fuseau horaire des emails", () => {
  it("les heures sont rendues en heure de Paris, pas en UTC", async () => {
    const { buildVisitEmail } = await import("../../api/_visit-email.js");
    const built = buildVisitEmail("confirmation", {
      firstName: "Ana",
      tourTitle: "Visite",
      tourDate: "2026-08-08T12:00:00.000Z", // 14:00 à Paris (UTC+2 en août)
      validationLink: "https://x/confirm",
    });
    expect(built.message).toContain("14:00");
    expect(built.message).not.toContain("12:00");
  });
});

describe("M10 — anti-injection de formules dans le CSV", () => {
  it("neutralise les cellules commençant par = + - @", async () => {
    const { escapeCsvCell } = await import("../utils/csv.js");
    expect(escapeCsvCell('=HYPERLINK("http://evil";"x")')).toBe('\'=HYPERLINK("http://evil";"x")');
    expect(escapeCsvCell("+33612345678")).toBe("'+33612345678");
    expect(escapeCsvCell("-2")).toBe("'-2");
    expect(escapeCsvCell("@evil")).toBe("'@evil");
    expect(escapeCsvCell("Dupont")).toBe("Dupont");
  });
});

describe("L6 — statut des visites côté guide", () => {
  it("une visite entre départ et fin est « ongoing », pas « completed »", async () => {
    const { tourStatus } = await import("../components/GuideToursList.js");
    const tour = { date: "2026-08-08T14:00:00.000Z", durationMinutes: 90 } as any;
    expect(tourStatus(tour, new Date("2026-08-08T13:00:00.000Z").getTime())).toBe("upcoming");
    expect(tourStatus(tour, new Date("2026-08-08T14:30:00.000Z").getTime())).toBe("ongoing");
    expect(tourStatus(tour, new Date("2026-08-08T16:00:00.000Z").getTime())).toBe("completed");
  });
});

describe("C3 — les crons Vercel (GET) sont acceptés", () => {
  it("une invocation GET authentifiée exécute le job au lieu de répondre 405", async () => {
    const res = await runCron("promote-waitlist");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("sans CRON_SECRET configuré, « Bearer undefined » est refusé", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = mockRes();
      await emailsHandler(
        mockReq({ method: "GET", query: { type: "promote-waitlist" }, headers: { authorization: "Bearer undefined" } }),
        res
      );
      expect(statusOf(res)).toBe(401);
    } finally {
      process.env.CRON_SECRET = saved;
    }
  });
});

describe("H4 — RGPD en deux étapes", () => {
  it("la demande seule ne supprime rien ; la confirmation par token supprime et purge les PII", async () => {
    const tourId = makeTour(5);
    const a = await register(tourId, "victim@t.fr");
    expect(a.status).toBe(201);

    // Étape 1 : demande (ce qu'un tiers malveillant pourrait poster) — aucune suppression.
    const reqRes = mockRes();
    await registerHandler(mockReq({ query: { action: "gdpr" }, body: { email: "victim@t.fr" } }), reqRes);
    expect(jsonOf(reqRes).ok).toBe(true);
    expect(rawRegsFor(tourId).length).toBe(1);

    // Étape 2 : confirmation avec le token signé (le lien reçu par email).
    const { createRegistrationToken } = await import("../../api/_token.js");
    const token = createRegistrationToken("gdpr", "victim@t.fr").token;
    const confRes = mockRes();
    await registerHandler(mockReq({ query: { action: "gdpr-confirm" }, body: { token } }), confRes);
    expect(jsonOf(confRes).ok).toBe(true);

    // Supprimée ET purgée (plus d'email ni de nom en base).
    expect(rawRegsFor(tourId).length).toBe(0);
    const doc = getAtPath(`registrations/${a.body.registrationId}`);
    expect(doc.deletedAt).toBeTruthy();
    expect(doc.email).not.toContain("victim");
    expect(doc.firstName).not.toBe("F");

    // Un token de confirmation d'inscription ne peut PAS servir pour la suppression.
    const wrongToken = createRegistrationToken(a.body.registrationId, "victim@t.fr").token;
    const wrongRes = mockRes();
    await registerHandler(mockReq({ query: { action: "gdpr-confirm" }, body: { token: wrongToken } }), wrongRes);
    expect(statusOf(wrongRes)).toBe(400);
  });
});
