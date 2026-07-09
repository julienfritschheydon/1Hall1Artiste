import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Neutraliser le singleton dataService (fetch de boot + setInterval au module-load)
vi.mock("./dataService", () => ({
  dataService: {
    getEvents: vi.fn(() => [{ id: "e1" }]),
    getEventById: vi.fn(),
    getLocationById: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock("./achievements", () => ({
  unlockAchievement: vi.fn(),
  AchievementType: { FIRST_EVENT_SAVED: "first", MULTIPLE_EVENTS_SAVED: "multi", NOTIFICATION_SET: "notif" },
}));

vi.mock("@/data/events", () => ({ events: [] }));

import {
  mergeFavorites,
  initFavoritesSync,
  pushNow,
  recoverByEmail,
  _resetForTests,
} from "./favoritesSync";
import { replaceSavedEvents } from "./savedEvents";
import { unlockAchievement } from "./achievements";
import { _resetDeviceIdForTests, getFavoritesDeviceId } from "./deviceId";

function okJson(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

describe("mergeFavorites", () => {
  it("union avec dédup, ordre local d'abord", () => {
    expect(mergeFavorites(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });
  it("tableaux vides", () => {
    expect(mergeFavorites([], [])).toEqual([]);
  });
  it("remote corrompu (non-array) → local seul", () => {
    expect(mergeFavorites(["a"], { foo: 1 })).toEqual(["a"]);
    expect(mergeFavorites(["a"], null)).toEqual(["a"]);
  });
  it("filtre les non-strings", () => {
    expect(mergeFavorites(["a", 42 as unknown as string], ["", "b"])).toEqual(["a", "b"]);
  });
});

describe("favoritesSync", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTests();
    _resetDeviceIdForTests();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Ne PAS appeler vi.unstubAllGlobals() : cela retirerait aussi le stub
    // localStorage installé par src/test/setup.ts.
    vi.clearAllMocks();
  });

  it("boot: serveur vide + local existant → push du local (migration)", async () => {
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    fetchMock.mockResolvedValue(okJson({ events: [], locations: [] }));

    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);

    const post = fetchMock.mock.calls.find(([, opts]) => opts?.method === "POST");
    expect(post).toBeTruthy();
    expect(JSON.parse(post![1].body as string).events).toEqual(["expo-a"]);
  });

  it("boot: IDs distants nouveaux → localStorage mis à jour + dispatch, zéro achievement", async () => {
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    let dispatched = 0;
    window.addEventListener("savedEventsChanged", () => dispatched++);
    fetchMock.mockResolvedValue(okJson({ events: ["expo-b"], locations: [] }));

    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);

    expect(JSON.parse(localStorage.getItem("savedEvents")!)).toEqual(["expo-a", "expo-b"]);
    expect(dispatched).toBeGreaterThanOrEqual(1);
    expect(unlockAchievement).not.toHaveBeenCalled();
  });

  it("anti-résurrection: suppression locale pendant le GET en vol → union abandonnée", async () => {
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a", "expo-b"]));
    let resolveGet!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolveGet = r; }));
    fetchMock.mockResolvedValue(okJson({ success: true }));

    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(10);

    // L'utilisateur supprime expo-b pendant que le GET est en vol
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));

    // Le serveur répond avec l'ancien état (contient encore expo-b)
    resolveGet(okJson({ events: ["expo-a", "expo-b"], locations: [] }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(JSON.parse(localStorage.getItem("savedEvents")!)).toEqual(["expo-a"]);
  });

  it("coalescing: deux changements rapprochés → un seul POST, body relu à l'envoi", async () => {
    fetchMock.mockResolvedValue(okJson({ events: [], locations: [] }));
    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(okJson({ success: true }));

    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a", "expo-b"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));

    await vi.advanceTimersByTimeAsync(1000);

    const posts = fetchMock.mock.calls.filter(([, opts]) => opts?.method === "POST");
    expect(posts).toHaveLength(1);
    // Snapshot relu à l'instant de l'envoi → contient les DEUX ids
    expect(JSON.parse(posts[0][1].body as string).events).toEqual(["expo-a", "expo-b"]);
  });

  it("échec fetch → aucune exception ; event online → re-push", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);

    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));
    await vi.advanceTimersByTimeAsync(1000); // push échoue → pendingPush

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(okJson({ success: true }));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(true);
  });

  it("pagehide avec push en attente → sendBeacon Blob application/json", async () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    fetchMock.mockResolvedValue(okJson({ events: [], locations: [] }));

    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);

    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));
    // Fermeture avant le coalescing
    window.dispatchEvent(new Event("pagehide"));

    expect(beacon).toHaveBeenCalledTimes(1);
    const blob = beacon.mock.calls[0][1] as Blob;
    expect(blob.type).toBe("application/json");

    // @ts-expect-error cleanup
    delete navigator.sendBeacon;
  });

  it("pagehide sans sendBeacon (jsdom par défaut) → pas d'exception", async () => {
    fetchMock.mockResolvedValue(okJson({ events: [], locations: [] }));
    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);

    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
  });

  it("deviceId stable quand setItem jette ; fallback sans randomUUID", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const id1 = getFavoritesDeviceId();
    const id2 = getFavoritesDeviceId();
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
    spy.mockRestore();
  });

  it("recoverByEmail: found → union + attach ; not_found → aucune modif ; erreur réseau distincte", async () => {
    localStorage.setItem("savedEvents", JSON.stringify(["expo-a"]));

    fetchMock.mockResolvedValueOnce(okJson({ found: true, events: ["expo-x"], locations: [] }));
    fetchMock.mockResolvedValue(okJson({ success: true }));
    const r1 = await recoverByEmail("Jean@Test.fr");
    expect(r1).toEqual({ status: "ok", newEvents: 1, newLocations: 0 });
    expect(JSON.parse(localStorage.getItem("savedEvents")!)).toEqual(["expo-a", "expo-x"]);
    expect(localStorage.getItem("favorites-recovery-email")).toBe("jean@test.fr");

    fetchMock.mockResolvedValueOnce(okJson({ found: false, events: [], locations: [] }));
    const r2 = await recoverByEmail("autre@test.fr");
    expect(r2.status).toBe("not_found");

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const r3 = await recoverByEmail("x@test.fr");
    expect(r3.status).toBe("network_error");
  });

  it("replaceSavedEvents: écrit, dispatch une fois, zéro achievement", () => {
    let dispatched = 0;
    window.addEventListener("savedEventsChanged", () => dispatched++);
    replaceSavedEvents(["a", "b", "a"]);
    expect(JSON.parse(localStorage.getItem("savedEvents")!)).toEqual(["a", "b"]);
    expect(dispatched).toBe(1);
    expect(unlockAchievement).not.toHaveBeenCalled();
  });

  it("slice à 300 ids avant push", async () => {
    fetchMock.mockResolvedValue(okJson({ events: [], locations: [] }));
    initFavoritesSync();
    await vi.advanceTimersByTimeAsync(1000);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(okJson({ success: true }));

    const many = Array.from({ length: 350 }, (_, i) => `id-${i}`);
    localStorage.setItem("savedEvents", JSON.stringify(many));
    window.dispatchEvent(new CustomEvent("savedEventsChanged"));
    await vi.advanceTimersByTimeAsync(1000);

    const post = fetchMock.mock.calls.find(([, opts]) => opts?.method === "POST");
    expect(JSON.parse(post![1].body as string).events).toHaveLength(300);
  });

  it("pushNow sérialisé: pas de push concurrent", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight--;
      return okJson({ success: true });
    });

    const p1 = pushNow();
    const p2 = pushNow();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([p1, p2]);

    expect(maxInFlight).toBe(1);
  });
});
