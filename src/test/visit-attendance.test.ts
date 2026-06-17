// Tests Phase 5: API Attendance
import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../api/visit-attendance";
import { VercelRequest, VercelResponse } from "@vercel/node";

vi.mock("../api/_visit-db", () => ({
  rtdbAttendanceCreate: vi.fn(),
  rtdbAttendanceListByTour: vi.fn(),
  rtdbRegistrationGet: vi.fn(),
  rtdbRegistrationUpdate: vi.fn(),
  rtdbRegistrationsListByTour: vi.fn(),
  rtdbGuideCodeValidate: vi.fn(),
}));

describe("Doodates Phase 5: API Attendance", () => {
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
    };
  });

  describe("POST /api/visit-attendance — marquer présent/absent (guide only)", () => {
    beforeEach(() => {
      mockReq.method = "POST";
    });

    it("should reject without guide code", async () => {
      mockReq.headers = {};
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_123",
        present: true,
      };

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseBody.error).toContain("guide code");
    });

    it("should reject with invalid guide code", async () => {
      mockReq.headers = { "x-guide-code": "INVALID" };
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_123",
        present: true,
      };

      const { rtdbGuideCodeValidate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(false);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
    });

    it("should reject missing registrationId", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        tourId: "tour_123",
        present: true,
      };

      const { rtdbGuideCodeValidate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("registrationId");
    });

    it("should reject missing tourId", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "reg_123",
        present: true,
      };

      const { rtdbGuideCodeValidate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("tourId");
    });

    it("should reject if present is not boolean", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_123",
        present: "yes", // Not boolean
      };

      const { rtdbGuideCodeValidate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("present");
    });

    it("should reject if registration not found", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "nonexistent",
        tourId: "tour_123",
        present: true,
      };

      const { rtdbGuideCodeValidate, rtdbRegistrationGet } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationGet as any).mockResolvedValueOnce(null);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(404);
      expect(responseBody.error).toContain("not found");
    });

    it("should reject if registration belongs to different tour", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_456", // Different tour
        present: true,
      };

      const { rtdbGuideCodeValidate, rtdbRegistrationGet } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationGet as any).mockResolvedValueOnce({
        id: "reg_123",
        tourId: "tour_123", // Different
      });

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("does not belong");
    });

    it("should mark registration as présent", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_123",
        present: true,
      };

      const { rtdbGuideCodeValidate, rtdbRegistrationGet, rtdbAttendanceCreate, rtdbRegistrationUpdate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationGet as any).mockResolvedValueOnce({
        id: "reg_123",
        tourId: "tour_123",
      });
      (rtdbAttendanceCreate as any).mockResolvedValueOnce({
        id: "att_123",
        present: true,
      });
      (rtdbRegistrationUpdate as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
      expect(responseBody.message).toContain("présent");

      // Verify update called with présent status
      expect((rtdbRegistrationUpdate as any)).toHaveBeenCalledWith("reg_123", expect.objectContaining({ status: "présent" }));
    });

    it("should mark registration as absent", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.body = {
        registrationId: "reg_123",
        tourId: "tour_123",
        present: false,
      };

      const { rtdbGuideCodeValidate, rtdbRegistrationGet, rtdbAttendanceCreate, rtdbRegistrationUpdate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationGet as any).mockResolvedValueOnce({
        id: "reg_123",
        tourId: "tour_123",
      });
      (rtdbAttendanceCreate as any).mockResolvedValueOnce({
        id: "att_123",
        present: false,
      });
      (rtdbRegistrationUpdate as any).mockResolvedValueOnce(undefined);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.ok).toBe(true);
      expect(responseBody.message).toContain("absent");

      // Verify update called with absent status
      expect((rtdbRegistrationUpdate as any)).toHaveBeenCalledWith("reg_123", expect.objectContaining({ status: "absent" }));
    });
  });

  describe("GET /api/visit-attendance?tourId=... — lister présences (guide only)", () => {
    beforeEach(() => {
      mockReq.method = "GET";
      mockReq.query = { tourId: "tour_123" };
    });

    it("should reject without guide code", async () => {
      mockReq.headers = {};

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(401);
      expect(responseBody.error).toContain("guide code");
    });

    it("should reject missing tourId", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.query = {};

      const { rtdbGuideCodeValidate } = await import("../api/_visit-db");
      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(400);
      expect(responseBody.error).toContain("tourId");
    });

    it("should return attendance list with counts", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.query = { tourId: "tour_123" };

      const { rtdbGuideCodeValidate, rtdbRegistrationsListByTour, rtdbAttendanceListByTour } = await import("../api/_visit-db");

      const mockRegs = [
        { id: "reg_1", firstName: "Alice", lastName: "Albert", status: "confirmé", deletedAt: undefined },
        { id: "reg_2", firstName: "Bob", lastName: "Brown", status: "confirmé", deletedAt: undefined },
        { id: "reg_3", firstName: "Charlie", lastName: "Brown", status: "confirmé", deletedAt: undefined },
      ];

      const mockAtt = [
        { id: "att_1", registrationId: "reg_1", present: true },
        { id: "att_2", registrationId: "reg_2", present: false },
        // reg_3 not marked yet
      ];

      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationsListByTour as any).mockResolvedValueOnce(mockRegs);
      (rtdbAttendanceListByTour as any).mockResolvedValueOnce(mockAtt);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.tourId).toBe("tour_123");
      expect(responseBody.counts).toEqual({
        total: 3,
        confirmed: 3,
        present: 1,
        absent: 1,
        unmarked: 1,
      });

      // Verify sorted by lastName, firstName
      expect(responseBody.registrations[0].lastName).toBe("Albert");
      expect(responseBody.registrations[1].lastName).toBe("Brown");
      expect(responseBody.registrations[1].firstName).toBe("Bob");
      expect(responseBody.registrations[2].firstName).toBe("Charlie");
    });

    it("should exclude soft-deleted registrations", async () => {
      mockReq.headers = { "x-guide-code": "VALID_CODE" };
      mockReq.query = { tourId: "tour_123" };

      const { rtdbGuideCodeValidate, rtdbRegistrationsListByTour, rtdbAttendanceListByTour } = await import("../api/_visit-db");

      const mockRegs = [
        { id: "reg_1", firstName: "Alice", lastName: "Albert", status: "confirmé", deletedAt: undefined },
        { id: "reg_2", firstName: "Bob", lastName: "Brown", status: "confirmé", deletedAt: "2026-06-20T00:00:00Z" }, // Soft-deleted
      ];

      (rtdbGuideCodeValidate as any).mockResolvedValueOnce(true);
      (rtdbRegistrationsListByTour as any).mockResolvedValueOnce(mockRegs);
      (rtdbAttendanceListByTour as any).mockResolvedValueOnce([]);

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(200);
      expect(responseBody.registrations).toHaveLength(1); // Only non-deleted
      expect(responseBody.registrations[0].id).toBe("reg_1");
    });
  });

  describe("Error Handling", () => {
    it("should reject unsupported method", async () => {
      mockReq.method = "DELETE";

      await handler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusCode).toBe(405);
      expect(responseBody.error).toContain("method not allowed");
    });
  });
});
