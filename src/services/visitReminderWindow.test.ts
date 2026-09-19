// Sélection des visites pour les rappels J-7 et J-1.
//
// Régression majeure corrigée ici : ces deux jobs cherchaient les visites dans
// une fenêtre de ±1h autour de l'instant J+7 / J+1. Or le cron ne tourne qu'une
// fois par jour, à 04:00 UTC — la fenêtre ne couvrait donc que les visites
// démarrant entre 03:00 et 05:00 UTC (05h-07h à Paris l'été). Une visite
// l'après-midi n'était jamais sélectionnée et AUCUN rappel ne partait, pour
// personne. Par ricochet, `validation1dSent` n'était jamais posé, donc
// l'auto-annulation des non-répondants ne se déclenchait jamais non plus.
//
// Même harnais que auditRegressions.test.ts : vrais handlers API contre une
// RTDB Firebase simulée en mémoire.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.CRON_SECRET = "test-cron-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  reminder_7d: "tpl_reminder_7d",
  reminder_1d: "tpl_reminder_1d",
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
  // Écriture conditionnelle : l'ETag est ici la valeur sérialisée du nœud, ce
  // qui reproduit la sémantique compare-and-set dont dépend le verrou par
  // visite (api/_tour-lock.ts).
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

let registerHandler: any, emailsHandler: any;
let tourCounter = 0;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
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

// Depuis « confirmer l'inscription sans étape de validation par email », une
// inscription publique est créée directement en « confirmé ».
async function registerConfirmed(tourId: string, email: string) {
  const res = mockRes();
  await registerHandler(mockReq({ body: { tourId, email, firstName: "F", lastName: "L" } }), res);
  expect(statusOf(res)).toBe(201);
  const registrationId = jsonOf(res).registrationId;
  expect(getAtPath(`registrations/${registrationId}`).status).toBe("confirmé");
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

describe("rappels J-7 / J-1 : une visite l'après-midi est bien rappelée", () => {
  it("J-7 part pour une visite à 15:00 UTC, cron lancé à 04:00 UTC", async () => {
    const tourId = makeTour(5, `tour_a_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "aprem@t.fr");

    vi.setSystemTime(new Date("2026-08-01T04:00:00.000Z"));
    const res = await runCron("send-7d-reminder");

    expect(res.body.sent).toBe(1); // valait 0 avant correction
    expect(getAtPath(`registrations/${regId}`).reminder7dSent).toBe(true);
  });

  it("J-1 part pour une visite à 15:00 UTC, cron lancé à 04:00 UTC", async () => {
    const tourId = makeTour(5, `tour_b_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "aprem2@t.fr");

    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    const res = await runCron("send-1d-reminder");

    expect(res.body.sent).toBe(1); // valait 0 avant correction
    expect(getAtPath(`registrations/${regId}`).validation1dSent).toBe(true);
  });

  it("couvre toute la journée, quelle que soit l'heure de départ", async () => {
    // Trois visites le même jour, du matin au soir : les trois sont rappelées.
    const ids = ["2026-08-08T07:00:00.000Z", "2026-08-08T13:00:00.000Z", "2026-08-08T18:00:00.000Z"].map(
      (date, i) => makeTour(5, `tour_c${i}_${tourCounter}`, date)
    );
    for (const [i, id] of ids.entries()) await registerConfirmed(id, `h${i}@t.fr`);

    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(3);
  });
});

describe("le jour est celui de Paris, pas celui d'UTC", () => {
  it("une visite le 9 août à 00h30 (Paris) est rappelée le 8, pas le 7", async () => {
    // 2026-08-08T22:30Z = 9 août 00h30 à Paris (CEST, UTC+2). En UTC brut elle
    // tomberait le 8 — une comparaison de jours naïve la raterait.
    const tourId = makeTour(5, `tour_tz_${tourCounter}`, "2026-08-08T22:30:00.000Z");
    await registerConfirmed(tourId, "minuit@t.fr");

    // Cron du 7 : J+1 = 8 août à Paris → la visite (9 août à Paris) n'est pas
    // encore concernée.
    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(0);

    // Cron du 8 : J+1 = 9 août à Paris → c'est le bon jour.
    vi.setSystemTime(new Date("2026-08-08T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(1);
  });

  it("parisDayKey rend le jour local, y compris en heure d'hiver", async () => {
    const { parisDayKey } = await import("../../api/_visit-db.js");
    // Été (UTC+2) : 21 juin 23h00 UTC = 22 juin 01h00 à Paris.
    expect(parisDayKey(new Date("2026-06-21T23:00:00.000Z"))).toBe("2026-06-22");
    // Hiver (UTC+1) : 15 janvier 23h30 UTC = 16 janvier 00h30 à Paris.
    expect(parisDayKey(new Date("2026-01-15T23:30:00.000Z"))).toBe("2026-01-16");
    // Milieu de journée : aucun basculement.
    expect(parisDayKey(new Date("2026-08-08T15:00:00.000Z"))).toBe("2026-08-08");
  });
});

describe("non-régression", () => {
  it("ne rappelle pas les visites des autres jours", async () => {
    const veille = makeTour(5, `tour_d1_${tourCounter}`, "2026-08-07T15:00:00.000Z");
    const surlendemain = makeTour(5, `tour_d2_${tourCounter}`, "2026-08-09T15:00:00.000Z");
    await registerConfirmed(veille, "d1@t.fr");
    await registerConfirmed(surlendemain, "d2@t.fr");

    // J+1 depuis le 7 = le 8 : aucune des deux visites.
    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(0);
  });

  it("reste idempotent si le cron repasse le même jour", async () => {
    const tourId = makeTour(5, `tour_e_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(tourId, "idem@t.fr");

    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(1);
    expect((await runCron("send-1d-reminder")).body.sent).toBe(0);
  });

  it("ne pose aucune échéance d'annulation et n'annule personne", async () => {
    // Le rappel de la veille annulait auparavant, en silence, quiconque n'avait
    // pas recliqué sous 24h. Une place perdue sans notification est bien pire
    // qu'une absence : on garde la place et on se contente de proposer le
    // désistement.
    const tourId = makeTour(5, `tour_f_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "ghost@t.fr");

    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(1);
    expect(getAtPath(`registrations/${regId}`).validationDeadline).toBeFalsy();

    // Bien au-delà de l'ancienne échéance, visite pas encore commencée.
    vi.setSystemTime(new Date("2026-08-08T05:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.autocancelled).toBeUndefined();
    expect(getAtPath(`registrations/${regId}`).status).toBe("confirmé");
  });

  it("le rappel de la veille porte un lien de désistement, pas de lien de validation", async () => {
    const tourId = makeTour(5, `tour_g_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    const regId = await registerConfirmed(tourId, "link@t.fr");

    fetchMock.mockClear();
    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    expect((await runCron("send-1d-reminder")).body.sent).toBe(1);

    const bodies = fetchMock.mock.calls
      .filter((c: any[]) => String(c[0]).includes("emailjs"))
      .map((c: any[]) => String((c[1] as any)?.body ?? ""));
    const rappel = bodies.find((b) => b.includes("reservations/cancel"));
    expect(rappel).toBeTruthy();
    expect(rappel).toContain(`reservations/cancel?id=${regId}`);
    expect(rappel).not.toContain("reservations/confirm?token=");
  });

  it("ignore une visite dont la date est corrompue plutôt que de planter", async () => {
    makeTour(5, `tour_bad_${tourCounter}`, "pas-une-date");
    const bon = makeTour(5, `tour_ok_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(bon, "ok@t.fr");

    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    const res = await runCron("send-1d-reminder");
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
  });
});

describe("observabilité du cron", () => {
  it("chaque job de rappel rapporte le nombre d'inscriptions examinées", async () => {
    // Sans `examined`, un `sent: 0` dans les logs est ininterprétable : on ne
    // sait pas distinguer « aucune visite ce jour-là » d'un envoi cassé.
    const tourId = makeTour(5, `tour_obs_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(tourId, "obs@t.fr");

    // Jour sans visite concernée : 0 examiné, 0 envoyé.
    vi.setSystemTime(new Date("2026-08-05T04:00:00.000Z"));
    const vide = await runCron("send-1d-reminder");
    expect(vide.body.examined).toBe(0);
    expect(vide.body.sent).toBe(0);

    // Veille de la visite : 1 examiné, 1 envoyé.
    vi.setSystemTime(new Date("2026-08-07T04:00:00.000Z"));
    const plein = await runCron("send-1d-reminder");
    expect(plein.body.examined).toBe(1);
    expect(plein.body.sent).toBe(1);
  });

  it("le job J-7 rapporte aussi les inscriptions examinées", async () => {
    const tourId = makeTour(5, `tour_obs7_${tourCounter}`, "2026-08-08T15:00:00.000Z");
    await registerConfirmed(tourId, "obs7@t.fr");

    vi.setSystemTime(new Date("2026-08-01T04:00:00.000Z"));
    const res = await runCron("send-7d-reminder");
    expect(res.body.examined).toBe(1);
    expect(res.body.sent).toBe(1);
  });
});
