// Tests Phase 2: API Tours
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../api/visit-tours";
import { VercelRequest, VercelResponse } from "@vercel/node";

// Mock Firebase RTDB access
vi.mock("../api/_visit-db", () => ({
  rtdbTourCreate: vi.fn(),
  rtdbTourGet: vi.fn(),
  rtdbTourUpdate: vi.fn(),
  rtdbToursListFuture: vi.fn(),
  rtdbToursListAll: vi.fn(),
  rtdbGuideCodeValidate: vi.fn(),
}));

describe("Doodates Phase 2: API Tours", () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let statusCode: number;
  let responseBody: any;

  beforeEach(() => {
    vi.clearAllMocks();

    statusCode = 200;
    responseBody = null;

    mockRes = {
      status: vi.fn((code: number) => {
        statusCode = code;
        return mockRes;
      }),
      json: vi.fn((data: any) => {
        responseBody = data;
        return mockRes;
      }),
    };

    mockReq = {
      method: "GET",
      headers: {},
      query: {},
      body: {},
    };
  });

  describe("POST /api/visit-tours — créer visite (guide only)", () => {
    beforeEach(() => {
      mockReq.method = "POST";
    });

    it("should reject without guide code", async () => {
      mockReq.headers = {};
      mockReq.body = {
        title: "Visite",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: ["nature"],
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseBody.error).toBe("guide code required");
    });

    it("should reject invalid title", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        title: "", // Empty
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: ["nature"],
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.errors).toBeDefined();
      expect(responseBody.errors.some((e: string) => e.includes("title"))).toBe(true);
    });

    it("should reject past date", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        title: "Visite Passée",
        date: new Date(Date.now() - 1000).toISOString(), // Past
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: ["nature"],
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.errors).toBeDefined();
      expect(responseBody.errors.some((e: string) => e.includes("date"))).toBe(true);
    });

    it("should reject invalid coordinates", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        title: "Visite",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        startLocationLat: 100, // Out of bounds
        startLocationLng: -1.56,
        capacity: 20,
        labels: ["nature"],
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.errors).toBeDefined();
      expect(responseBody.errors.some((e: string) => e.includes("Lat"))).toBe(true);
    });

    it("should reject capacity < 1", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        title: "Visite",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 0, // Invalid
        labels: ["nature"],
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.errors).toBeDefined();
      expect(responseBody.errors.some((e: string) => e.includes("capacity"))).toBe(true);
    });

    it("should create tour with valid data", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        title: "Visite Architecture",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 90,
        startLocationLat: 47.2199,
        startLocationLng: -1.5574,
        capacity: 20,
        labels: ["architecture", "histoire"],
      };

      const mockTour = {
        id: "tour_123",
        guideId: "all-guides",
        title: mockReq.body.title,
        date: mockReq.body.date,
        durationMinutes: 90,
        startLocationLat: 47.2199,
        startLocationLng: -1.5574,
        capacity: 20,
        labels: ["architecture", "histoire"],
        status: "upcoming",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { rtdbTourCreate } = await import("../api/_visit-db");
      (rtdbTourCreate as any).mockResolvedValueOnce(mockTour);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(201);
      expect(responseBody.id).toBe("tour_123");
      expect(responseBody.status).toBe("upcoming");
    });
  });

  describe("GET /api/visit-tours — lister visites", () => {
    beforeEach(() => {
      mockReq.method = "GET";
    });

    it("should return only future tours for public", async () => {
      mockReq.headers = {}; // No guide code
      const futureTours = [
        {
          id: "tour_1",
          title: "Future Tour",
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "upcoming",
        },
      ];

      const { rtdbToursListFuture } = await import("../api/_visit-db");
      (rtdbToursListFuture as any).mockResolvedValueOnce(futureTours);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody).toHaveLength(1);
      expect(responseBody[0].title).toBe("Future Tour");
    });

    it("should return all tours for guide", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      const allTours = [
        {
          id: "tour_1",
          title: "Past Tour",
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "completed",
        },
        {
          id: "tour_2",
          title: "Future Tour",
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "upcoming",
        },
      ];

      const { rtdbToursListAll } = await import("../api/_visit-db");
      (rtdbToursListAll as any).mockResolvedValueOnce(allTours);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody).toHaveLength(2);
    });
  });

  describe("PUT /api/visit-tours/{id} — modifier visite", () => {
    beforeEach(() => {
      mockReq.method = "PUT";
      mockReq.query = { id: "tour_123" };
    });

    it("should reject without guide code", async () => {
      mockReq.headers = {};
      mockReq.body = { title: "Updated" };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
    });

    it("should reject if within 24h of start (Q11)", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = { title: "Updated" };

      const mockTour = {
        id: "tour_123",
        title: "Visite",
        date: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h from now
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: [],
        status: "upcoming",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { rtdbTourGet } = await import("../api/_visit-db");
      (rtdbTourGet as any).mockResolvedValueOnce(mockTour);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("within 24h");
    });

    it("should update tour if > 24h before start", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = { title: "Updated Title" };

      const mockTour = {
        id: "tour_123",
        title: "Old Title",
        date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h from now
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: [],
        status: "upcoming",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { rtdbTourGet, rtdbTourUpdate } = await import("../api/_visit-db");
      (rtdbTourGet as any).mockResolvedValueOnce(mockTour);
      (rtdbTourUpdate as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
    });

    it("should reject invalid coordinates update", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = { startLocationLat: 200 }; // Out of bounds

      const mockTour = {
        id: "tour_123",
        title: "Visite",
        date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        startLocationLat: 47.22,
        startLocationLng: -1.56,
        capacity: 20,
        labels: [],
        status: "upcoming",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { rtdbTourGet } = await import("../api/_visit-db");
      (rtdbTourGet as any).mockResolvedValueOnce(mockTour);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("invalid");
    });
  });

  describe("Error Handling", () => {
    it("should return 405 for unsupported method", async () => {
      mockReq.method = "DELETE";

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody.error).toContain("method not allowed");
    });

    it("should return 404 if tour not found for PUT", async () => {
      mockReq.method = "PUT";
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.query = { id: "nonexistent_tour" };
      mockReq.body = { title: "Updated" };

      const { rtdbTourGet } = await import("../api/_visit-db");
      (rtdbTourGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });
  });
});
