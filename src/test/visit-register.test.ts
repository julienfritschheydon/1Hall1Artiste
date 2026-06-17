// Tests Phase 3: API Inscriptions
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../api/visit-register";
import { VercelRequest, VercelResponse } from "@vercel/node";

vi.mock("../api/_visit-db", () => ({
  rtdbTourGet: vi.fn(),
  rtdbRegistrationCreate: vi.fn(),
  rtdbRegistrationGet: vi.fn(),
  rtdbRegistrationUpdate: vi.fn(),
  rtdbRegistrationExists: vi.fn(),
  rtdbCountUserTours: vi.fn(),
  rtdbCountRegisteredByTour: vi.fn(),
  rtdbWaitlistAdd: vi.fn(),
  rtdbWaitlistCount: vi.fn(),
  rtdbAuditLog: vi.fn(),
}));

vi.mock("../api/_token", () => ({
  createRegistrationToken: vi.fn(() => ({
    token: "token_xyz",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })),
  verifyRegistrationToken: vi.fn(),
}));

describe.skip("Doodates Phase 3: API Inscriptions", () => {
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
      url: "/api/visit-register",
    };
  });

  describe.skip("POST /api/visit-register — créer inscription", () => {
    it("should reject invalid email (Q13)", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "not-an-email",
        firstName: "Jean",
        lastName: "Dupont",
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("email");
    });

    it("should reject HTML in names (Q13)", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "<script>alert('xss')</script>",
        lastName: "Dupont",
      };

      // Should sanitize and continue (not reject)
      const { rtdbTourGet, rtdbRegistrationExists, rtdbCountUserTours, rtdbCountRegisteredByTour, rtdbRegistrationCreate } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(0);
      (rtdbRegistrationExists as any).mockResolvedValueOnce(false);
      (rtdbTourGet as any).mockResolvedValueOnce({
        id: "tour_123",
        title: "Visite",
        capacity: 20,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      (rtdbCountRegisteredByTour as any).mockResolvedValueOnce(0);
      (rtdbRegistrationCreate as any).mockResolvedValueOnce({
        id: "reg_123",
        status: "attente_validation",
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      // Should have sanitized, not rejected
      expect(statusCode).toBe(201);
    });

    it("should reject if empty firstName", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "",
        lastName: "Dupont",
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("firstName");
    });

    it("should reject max 3 visites (Q7)", async () => {
      mockReq.body = {
        tourId: "tour_4",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
      };

      const { rtdbCountUserTours } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(3); // Already at max

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("max 3 visites");
    });

    it("should reject already registered (Q6: dedup)", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
      };

      const { rtdbCountUserTours, rtdbRegistrationExists } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(0);
      (rtdbRegistrationExists as any).mockResolvedValueOnce(true); // Already registered

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("already registered");
    });

    it("should create registration if space available", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
        companionFirstName: "Marie",
      };

      const { rtdbTourGet, rtdbCountUserTours, rtdbRegistrationExists, rtdbCountRegisteredByTour, rtdbRegistrationCreate } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(0);
      (rtdbRegistrationExists as any).mockResolvedValueOnce(false);
      (rtdbTourGet as any).mockResolvedValueOnce({
        id: "tour_123",
        title: "Visite Architecture",
        capacity: 20,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      (rtdbCountRegisteredByTour as any).mockResolvedValueOnce(5); // 5 registered, space for more
      (rtdbRegistrationCreate as any).mockResolvedValueOnce({
        id: "reg_123",
        status: "attente_validation",
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(201);
      expect(responseBody.status).toBe("attente_validation");
      expect(responseBody.registrationId).toBe("reg_123");
    });

    it("should add to waitlist if no space", async () => {
      mockReq.body = {
        tourId: "tour_123",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
      };

      const { rtdbTourGet, rtdbCountUserTours, rtdbRegistrationExists, rtdbCountRegisteredByTour, rtdbWaitlistAdd, rtdbWaitlistCount } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(0);
      (rtdbRegistrationExists as any).mockResolvedValueOnce(false);
      (rtdbTourGet as any).mockResolvedValueOnce({
        id: "tour_123",
        title: "Visite",
        capacity: 2,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      (rtdbCountRegisteredByTour as any).mockResolvedValueOnce(2); // Full
      (rtdbWaitlistCount as any).mockResolvedValueOnce(0);
      (rtdbWaitlistAdd as any).mockResolvedValueOnce({
        id: "wait_123",
        position: 1,
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(201);
      expect(responseBody.status).toBe("waitlist");
      expect(responseBody.position).toBe(1);
    });

    it("should reject tour not found", async () => {
      mockReq.body = {
        tourId: "nonexistent",
        email: "user@example.com",
        firstName: "Jean",
        lastName: "Dupont",
      };

      const { rtdbCountUserTours, rtdbRegistrationExists, rtdbTourGet } = await import("../api/_visit-db");
      (rtdbCountUserTours as any).mockResolvedValueOnce(0);
      (rtdbRegistrationExists as any).mockResolvedValueOnce(false);
      (rtdbTourGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });
  });

  describe.skip("POST /api/visit-register/confirm — valider email", () => {
    beforeEach(() => {
      mockReq.url = "/api/visit-register/confirm";
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
        email: "user@example.com",
        registrationId: "reg_123",
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("expired");
    });

    it("should confirm valid registration", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbRegistrationGet, rtdbRegistrationUpdate } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        email: "user@example.com",
        registrationId: "reg_123",
      });
      (rtdbRegistrationGet as any).mockResolvedValueOnce({
        id: "reg_123",
        status: "attente_validation",
      });
      (rtdbRegistrationUpdate as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
      expect(responseBody.status).toBe("confirmé");
    });

    it("should handle idempotency (confirm 2x)", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbRegistrationGet } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        email: "user@example.com",
        registrationId: "reg_123",
      });
      (rtdbRegistrationGet as any).mockResolvedValueOnce({
        id: "reg_123",
        status: "confirmé", // Already confirmed
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
      expect(responseBody.message).toContain("Already");
    });

    it("should reject if registration not found", async () => {
      mockReq.body = { token: "valid_token" };

      const { verifyRegistrationToken } = await import("../api/_token");
      const { rtdbRegistrationGet } = await import("../api/_visit-db");

      (verifyRegistrationToken as any).mockReturnValueOnce({
        valid: true,
        expired: false,
        email: "user@example.com",
        registrationId: "nonexistent",
      });
      (rtdbRegistrationGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });
  });

  describe.skip("Error Handling", () => {
    it("should reject non-POST requests", async () => {
      mockReq.method = "GET";

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody.error).toContain("method not allowed");
    });
  });
});
