// Attribution des places sous concurrence.
//
// Décider s'il reste de la place puis créer l'inscription, c'est lire-puis-
// écrire. Sans exclusion mutuelle, deux requêtes simultanées lisent toutes les
// deux « il reste 1 place » et créent chacune une inscription : le guide se
// retrouve avec 16 personnes pour 15 places, sans que personne n'ait rien fait
// de travers. api/_tour-lock.ts sérialise cette section critique ; ce fichier
// vérifie qu'elle tient réellement.
//
// Horloge RÉELLE ici (et non les faux timers du reste de la suite) : le verrou
// s'appuie sur des attentes entre tentatives, qui ne s'écouleraient jamais avec
// une horloge figée.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
  confirmation: "tpl_confirmation",
  waitlist_confirmation: "tpl_waitlist_confirmation",
  waitlist_offer: "tpl_waitlist_offer",
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

// Chaque opération cède la main avant d'agir. Sans cela, les flux concurrents
// s'exécuteraient d'affilée et la course ne se produirait jamais dans le test —
// on passerait à côté du bug qu'on prétend verrouiller.
const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock("../../api/_firebase.js", () => ({
  rtdbGet: vi.fn(async (path: string) => {
    await yieldTurn();
    return getAtPath(path);
  }),
  rtdbPut: vi.fn(async (path: string, value: any) => {
    await yieldTurn();
    setAtPath(path, JSON.parse(JSON.stringify(value)));
  }),
  rtdbPatch: vi.fn(async (path: string, value: any) => {
    await yieldTurn();
    const existing = getAtPath(path) || {};
    setAtPath(path, { ...existing, ...JSON.parse(JSON.stringify(value)) });
  }),
  rtdbDelete: vi.fn(async (path: string) => {
    await yieldTurn();
    setAtPath(path, null);
  }),
  rtdbGetWithEtag: vi.fn(async (path: string) => {
    await yieldTurn();
    const value = getAtPath(path);
    return { value, etag: JSON.stringify(value ?? null) };
  }),
  // Le compare-and-set, LUI, est atomique : pas de point de reprise entre la
  // comparaison et l'écriture. C'est exactement la garantie que RTDB offre via
  // l'en-tête `if-match`, et tout le verrou repose dessus.
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

let registerHandler: any;
let tourCounter = 0;

beforeEach(async () => {
  vi.useRealTimers();
  vi.resetModules();
  for (const k of Object.keys(store)) delete store[k];
  fetchMock.mockClear();
  tourCounter++;

  registerHandler = (await import("../../api/visit-register.js")).default;
});

afterEach(() => {
  vi.useRealTimers();
});

// Date très postérieure à l'exécution des tests : l'horloge n'est pas figée,
// la visite doit rester à venir quoi qu'il arrive.
const FUTURE = "2099-08-08T14:00:00.000Z";

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

function registerCall(tourId: string, email: string, companions: number = 0) {
  const res = mockRes();
  return registerHandler(
    mockReq({
      headers: { "x-forwarded-for": `10.9.${tourCounter}.${email.length}` },
      body: {
        tourId,
        email,
        firstName: "F",
        lastName: "L",
        companions: Array.from({ length: companions }, (_, i) => ({ firstName: `A${i}` })),
      },
    }),
    res
  ).then(() => ({ status: statusOf(res), body: jsonOf(res) }));
}

function confirmedPlacesFor(tourId: string): number {
  const all = (getAtPath("registrations") || {}) as Record<string, any>;
  return Object.values(all)
    .filter((r) => r.tourId === tourId && r.status === "confirmé" && !r.deletedAt)
    .reduce((sum, r) => sum + 1 + (r.companions?.length ?? 0), 0);
}

describe("attribution concurrente de la dernière place", () => {
  it("n'accorde la dernière place qu'à une seule personne", async () => {
    const tourId = makeTour(1, `tour_race_${tourCounter}`);

    // Les deux requêtes partent ensemble, sans await intermédiaire : elles
    // s'entrelacent réellement sur chaque accès à la base.
    const [a, b] = await Promise.all([
      registerCall(tourId, "premier@t.fr"),
      registerCall(tourId, "second@t.fr"),
    ]);

    const statuts = [a.body.status, b.body.status].sort();
    expect(statuts).toEqual(["confirmé", "waitlist"]);
    expect(confirmedPlacesFor(tourId)).toBe(1);
  });

  it("ne dépasse jamais la capacité, même à dix requêtes simultanées", async () => {
    const tourId = makeTour(4, `tour_race10_${tourCounter}`);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerCall(tourId, `p${i}@t.fr`))
    );

    const confirmes = results.filter((r) => r.body.status === "confirmé");
    const attente = results.filter((r) => r.body.status === "waitlist");

    expect(confirmes).toHaveLength(4);
    expect(attente).toHaveLength(6);
    expect(confirmedPlacesFor(tourId)).toBe(4);
  });

  it("compte les groupes entiers, sans en couper un en deux", async () => {
    // Capacité 5. Deux groupes de 3 arrivent ensemble : l'un passe, l'autre
    // part en file d'attente EN ENTIER. Le pire scénario serait d'en confirmer
    // un et demi.
    const tourId = makeTour(5, `tour_groupes_${tourCounter}`);

    const [a, b] = await Promise.all([
      registerCall(tourId, "groupe-a@t.fr", 2),
      registerCall(tourId, "groupe-b@t.fr", 2),
    ]);

    const statuts = [a.body.status, b.body.status].sort();
    expect(statuts).toEqual(["confirmé", "waitlist"]);
    expect(confirmedPlacesFor(tourId)).toBe(3);
  });

  it("laisse passer tout le monde quand la capacité suffit", async () => {
    // Contrôle négatif : le verrou ne doit pas refuser des gens par excès de
    // prudence ni perdre d'inscription en route.
    const tourId = makeTour(10, `tour_large_${tourCounter}`);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => registerCall(tourId, `libre${i}@t.fr`))
    );

    expect(results.every((r) => r.body.status === "confirmé")).toBe(true);
    expect(confirmedPlacesFor(tourId)).toBe(6);
  });

  it("libère le verrou après chaque inscription", async () => {
    // Un verrou laissé en place bloquerait toute la visite jusqu'à expiration.
    const tourId = makeTour(3, `tour_release_${tourCounter}`);

    await registerCall(tourId, "un@t.fr");
    expect(getAtPath(`tour_locks/${tourId}`)).toBeNull();

    // Et une inscription ultérieure passe sans attendre.
    const suivant = await registerCall(tourId, "deux@t.fr");
    expect(suivant.body.status).toBe("confirmé");
  });

  it("ne reste pas bloqué derrière un verrou périmé", async () => {
    // Une fonction serverless peut mourir en pleine section critique. Le verrou
    // porte donc une échéance : passée celle-ci, il est ignoré.
    const tourId = makeTour(2, `tour_stale_${tourCounter}`);
    setAtPath(`tour_locks/${tourId}`, { owner: "fonction-morte", expiresAt: Date.now() - 60_000 });

    const res = await registerCall(tourId, "apres-crash@t.fr");

    expect(res.body.status).toBe("confirmé");
  });
});
