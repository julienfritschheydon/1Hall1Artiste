// Tests du handler serverless api/favorites.ts (req/res mockés).
// Placé sous src/ car l'include vitest est limité à src/**/*.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rtdbGet, rtdbPatch, rtdbDelete } = vi.hoisted(() => ({
  rtdbGet: vi.fn(),
  rtdbPatch: vi.fn(),
  rtdbDelete: vi.fn(),
}));

vi.mock("../../api/_firebase.js", () => ({ rtdbGet, rtdbPatch, rtdbDelete }));
vi.mock("../../api/_visit-db.js", () => ({
  emailKey: (email: string) => email.toLowerCase().replace(/[.#$[\]/]/g, ","),
}));

import handler from "../../api/favorites";

const DEVICE = "123e4567-e89b-42d3-a456-426614174000";

function mockRes() {
  const res: Record<string, unknown> = {};
  res.setHeader = vi.fn();
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res as unknown as {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    query: {},
    body: undefined,
    headers: { "x-forwarded-for": `ip-${Math.random()}` }, // IP unique → pas de rate limit entre tests
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api/favorites handler", () => {
  it("GET nœud absent → tableaux vides (RTDB: [] ≡ null)", async () => {
    rtdbGet.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ query: { deviceId: DEVICE } }), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ events: [], locations: [], updatedAt: null });
  });

  it("GET nœud sans clé events (vidé volontairement) → []", async () => {
    rtdbGet.mockResolvedValue({ updatedAt: "2026-01-01" });
    const res = mockRes();
    await handler(mockReq({ query: { deviceId: DEVICE } }), res as never);
    expect(res.json).toHaveBeenCalledWith({ events: [], locations: [], updatedAt: "2026-01-01" });
  });

  it("POST body string (sendBeacon text/plain) → parsé", async () => {
    rtdbPatch.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: JSON.stringify({ deviceId: DEVICE, events: ["expo-a"], locations: [] }),
      }),
      res as never
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(rtdbPatch).toHaveBeenCalledWith(
      `user-favorites/${DEVICE}`,
      expect.objectContaining({ events: ["expo-a"] })
    );
  });

  it("POST > 300 items → 400", async () => {
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { deviceId: DEVICE, events: Array.from({ length: 301 }, (_, i) => `id-${i}`), locations: [] },
      }),
      res as never
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("POST deviceId invalide → 400", async () => {
    const res = mockRes();
    await handler(
      mockReq({ method: "POST", body: { deviceId: "../likes-data", events: [], locations: [] } }),
      res as never
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(rtdbPatch).not.toHaveBeenCalled();
  });

  it("POST filtre les ids hors whitelist sans les transformer", async () => {
    rtdbPatch.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { deviceId: DEVICE, events: ["expo-a", "Bad/Id#1", ""], locations: [] },
      }),
      res as never
    );
    expect(rtdbPatch).toHaveBeenCalledWith(
      `user-favorites/${DEVICE}`,
      expect.objectContaining({ events: ["expo-a"] })
    );
  });

  it("POST avec email → PATCH email + index devices", async () => {
    rtdbPatch.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(
      mockReq({
        method: "POST",
        body: { deviceId: DEVICE, events: [], locations: [], email: "Jean@Test.fr" },
      }),
      res as never
    );
    expect(rtdbPatch).toHaveBeenCalledWith(
      `user-favorites/${DEVICE}`,
      expect.objectContaining({ email: "jean@test.fr" })
    );
    expect(rtdbPatch).toHaveBeenCalledWith(
      "favorites-email-index/jean@test,fr",
      expect.objectContaining({ email: "jean@test.fr" })
    );
  });

  it("GET ?email= union multi-devices, rejette les docs dont l'email ne matche pas", async () => {
    const device2 = "223e4567-e89b-42d3-a456-426614174000";
    rtdbGet.mockImplementation(async (path: string) => {
      if (path.startsWith("favorites-email-index/")) {
        return { email: "a@b.fr", devices: { [DEVICE]: "t1", [device2]: "t2" } };
      }
      if (path === `user-favorites/${DEVICE}`) {
        return { email: "a@b.fr", events: ["expo-a"], locations: ["lieu-1"] };
      }
      if (path === `user-favorites/${device2}`) {
        return { email: "autre@x.fr", events: ["expo-hacked"], locations: [] }; // email ≠ → rejeté
      }
      return null;
    });
    const res = mockRes();
    await handler(mockReq({ query: { email: "A@b.fr" } }), res as never);
    expect(res.json).toHaveBeenCalledWith({ found: true, events: ["expo-a"], locations: ["lieu-1"] });
  });

  it("GET ?email= inconnu → found:false", async () => {
    rtdbGet.mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ query: { email: "inconnu@x.fr" } }), res as never);
    expect(res.json).toHaveBeenCalledWith({ found: false, events: [], locations: [] });
  });

  it("DELETE → retire email du doc puis device de l'index", async () => {
    rtdbGet.mockResolvedValue({ email: "a@b.fr", events: [] });
    rtdbPatch.mockResolvedValue(undefined);
    rtdbDelete.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(mockReq({ method: "DELETE", query: { deviceId: DEVICE } }), res as never);
    expect(rtdbPatch).toHaveBeenCalledWith(`user-favorites/${DEVICE}`, { email: null });
    expect(rtdbDelete).toHaveBeenCalledWith(`favorites-email-index/a@b,fr/devices/${DEVICE}`);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("méthode inconnue → 405", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "PUT" }), res as never);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
