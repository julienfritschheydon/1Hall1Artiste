import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCachedProgram,
  loadProgram,
  fetchRemoteProgram,
} from "./remoteContentService";
import { REMOTE_CACHE_KEY, REMOTE_CACHE_TTL_MS } from "@/config/remoteContent";

const program = {
  events: [{ id: "e1" } as any],
  artists: [{ id: "a1" } as any],
};

function writeRawCache(fetchedAt: number, prog: unknown = program) {
  localStorage.setItem(
    REMOTE_CACHE_KEY,
    JSON.stringify({ fetchedAt, program: prog })
  );
}

describe("remoteContentService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCachedProgram", () => {
    it("retourne null si pas de cache", () => {
      expect(getCachedProgram()).toBeNull();
    });

    it("retourne null si le cache est corrompu", () => {
      localStorage.setItem(REMOTE_CACHE_KEY, "{json invalide");
      expect(getCachedProgram()).toBeNull();
    });

    it("retourne null si le cache n'a pas events/artists", () => {
      writeRawCache(Date.now(), { events: null, artists: null });
      expect(getCachedProgram()).toBeNull();
    });

    it("retourne le programme si le cache est valide", () => {
      writeRawCache(Date.now());
      expect(getCachedProgram()?.events).toHaveLength(1);
    });
  });

  describe("fetchRemoteProgram", () => {
    it("rejette une réponse API sans events/artists", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
      );
      await expect(fetchRemoteProgram()).rejects.toThrow();
    });

    it("rejette un status HTTP non ok", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) })
      );
      await expect(fetchRemoteProgram()).rejects.toThrow();
    });
  });

  describe("loadProgram", () => {
    it("sert le cache valide (TTL frais) sans fetch bloquant", async () => {
      writeRawCache(Date.now());
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => program,
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await loadProgram();
      expect(result?.events).toHaveLength(1);
    });

    it("retombe sur le cache périmé si le fetch échoue", async () => {
      writeRawCache(Date.now() - REMOTE_CACHE_TTL_MS - 1000);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

      const result = await loadProgram();
      expect(result?.events).toHaveLength(1);
    });

    it("retourne null si pas de cache et fetch échoue", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      const result = await loadProgram();
      expect(result).toBeNull();
    });
  });
});
