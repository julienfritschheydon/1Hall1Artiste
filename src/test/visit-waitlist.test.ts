// Tests Phase 4: API Waitlist
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../api/visit-waitlist";
import { VercelRequest, VercelResponse } from "@vercel/node";

vi.mock("../api/_visit-db", () => ({
  rtdbWaitlistGet: vi.fn(),
  rtdbWaitlistSoftDelete: vi.fn(),
  rtdbWaitlistUpdate: vi.fn(),
  rtdbWaitlistListByTour: vi.fn(),
  rtdbWaitlistReorderAfter: vi.fn(),
  rtdbRegistrationCreate: vi.fn(),
  rtdbTourGet: vi.fn(),
}));

vi.mock("../api/_token", () => ({
  verifyRegistrationToken: vi.fn(),
}));

describe("Doodates Phase 4: API Waitlist", () => {
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
      method: "POST",
      headers: {},
      query: {},
      body: {},
      url: "/api/visit-waitlist",
    };
  });

  describe("POST /api/visit-waitlist/activate — accepter offre (Q4, Q5)", () => {
    beforeEach(() => {
      mockReq.url = "/api/visit-waitlist/activate";
      mockReq.method = "POST";
    });

    it("should reject missing token", async () => {
      mockReq.body = {};

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("token");
    });

    it("should reject invalid token", async () => {
      mockReq.body = { token: "invalid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      (verifyRegistrationToken as any).mockReturnValueOnce({ valid: false });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("invalid");
    });

    it("should reject expired token", async () => {
      mockReq.body = { token: "expired_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: true,
        registrationId: "wait_123",
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("expired");
    });

    it("should reject if waitlist entry not found", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbWaitlistGet } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        registrationId: "nonexistent",
      });
      (rtdbWaitlistGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });

    it("should reject if offer already rejected (Q5)", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbWaitlistGet } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        registrationId: "wait_123",
      });
      (rtdbWaitlistGet as any).mockResolvedValueOnce({
        id: "wait_123",
        rejectedAt: new Date().toISOString(), // Q5: Already rejected
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("passed over");
    });

    it("should activate waitlist entry and create registration", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbWaitlistGet, rtdbWaitlistSoftDelete, rtdbRegistrationCreate } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        registrationId: "wait_123",
      });
      (rtdbWaitlistGet as any).mockResolvedValueOnce({
        id: "wait_123",
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
        position: 1,
      });
      (rtdbRegistrationCreate as any).mockResolvedValueOnce({
        id: "reg_456",
        status: "confirmé",
      });
      (rtdbWaitlistSoftDelete as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
      expect(responseBody.registrationId).toBe("reg_456");

      // Verify soft delete was called
      expect((rtdbWaitlistSoftDelete as any)).toHaveBeenCalledWith("wait_123");
    });
  });

  describe("DELETE /api/visit-waitlist/{id} — annuler (Q4: reorder)", () => {
    beforeEach(() => {
      mockReq.method = "DELETE";
      mockReq.query = { id: "wait_123" };
    });

    it("should reject missing id", async () => {
      mockReq.query = {};

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("id");
    });

    it("should reject if waitlist not found", async () => {
      const { rtdbWaitlistGet } = await import("../api/_visit-db");
      (rtdbWaitlistGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });

    it("should reject if already deleted", async () => {
      const { rtdbWaitlistGet } = await import("../api/_visit-db");
      (rtdbWaitlistGet as any).mockResolvedValueOnce({
        id: "wait_123",
        deletedAt: new Date().toISOString(),
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(410);
      expect(responseBody.error).toContain("already cancelled");
    });

    it("should soft-delete and reorder positions (Q4)", async () => {
      const { rtdbWaitlistGet, rtdbWaitlistSoftDelete, rtdbWaitlistReorderAfter } = await import("../api/_visit-db");

      (rtdbWaitlistGet as any).mockResolvedValueOnce({
        id: "wait_123",
        tourId: "tour_123",
        position: 2, // Position 2 deleted
      });
      (rtdbWaitlistSoftDelete as any).mockResolvedValueOnce(undefined);
      (rtdbWaitlistReorderAfter as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);

      // Verify reorder called with position 2
      expect((rtdbWaitlistReorderAfter as any)).toHaveBeenCalledWith("tour_123", 2);
    });
  });

  describe("GET /api/visit-waitlist/{tourId} — voir liste (anonymized)", () => {
    beforeEach(() => {
      mockReq.method = "GET";
      mockReq.query = { tourId: "tour_123" };
    });

    it("should reject missing tourId", async () => {
      mockReq.query = {};

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("tourId");
    });

    it("should return anonymized waitlist", async () => {
      const { rtdbWaitlistListByTour } = await import("../api/_visit-db");

      (rtdbWaitlistListByTour as any).mockResolvedValueOnce([
        {
          id: "wait_1",
          position: 1,
          invitationSentAt: new Date().toISOString(),
        },
        {
          id: "wait_2",
          position: 2,
          invitationSentAt: undefined, // No offer sent yet
        },
        {
          id: "wait_3",
          position: 3,
          invitationSentAt: undefined,
        },
      ]);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.totalInWaitlist).toBe(3);
      expect(responseBody.positions).toHaveLength(3);
      expect(responseBody.positions[0]).toEqual({ position: 1, hasOffer: true });
      expect(responseBody.positions[1]).toEqual({ position: 2, hasOffer: false });
    });

    it("should return empty waitlist", async () => {
      const { rtdbWaitlistListByTour } = await import("../api/_visit-db");

      (rtdbWaitlistListByTour as any).mockResolvedValueOnce([]);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.totalInWaitlist).toBe(0);
      expect(responseBody.positions).toHaveLength(0);
    });
  });

  describe("Error Handling", () => {
    it("should reject unsupported method", async () => {
      mockReq.method = "PATCH";

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody.error).toContain("method not allowed");
    });

    it("should reject invalid POST path", async () => {
      mockReq.method = "POST";
      mockReq.url = "/api/visit-waitlist/invalid";

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody.error).toContain("invalid POST path");
    });
  });
});
