// Destinataire vide : les envois EmailJS partaient sans adresse.
//
// Le tableau de bord EmailJS montrait un fort taux d'échec « The recipients
// address is empty ». Deux causes :
// - le rapport d'erreurs client n'envoyait aucun `to_email` — le template
//   adresse pourtant l'e-mail à {{to_email}}, donc 100 % de ces envois
//   échouaient ;
// - côté API, une adresse absente ou blanche partait quand même, consommant
//   trois tentatives de quota pour rien.
//
// Ces tests protègent les deux garde-fous.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeRecipient } from "../../api/_recipient";

describe("normalizeRecipient", () => {
  it("nettoie une adresse utilisable", () => {
    expect(normalizeRecipient("  julien@example.com ")).toBe("julien@example.com");
  });

  it("refuse une adresse vide, blanche ou absente", () => {
    expect(normalizeRecipient("")).toBeNull();
    expect(normalizeRecipient("   ")).toBeNull();
    expect(normalizeRecipient(undefined)).toBeNull();
    expect(normalizeRecipient(null)).toBeNull();
    expect(normalizeRecipient(42)).toBeNull();
  });
});

const sendMock = vi.fn(async () => ({ status: 200, text: "OK" }));
vi.mock("@emailjs/browser", () => ({
  send: sendMock,
  init: vi.fn(),
  default: { send: sendMock, init: vi.fn() },
}));

describe("rapport d'erreurs client", () => {
  beforeEach(() => {
    sendMock.mockClear();
    localStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("PROD", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("adresse le rapport à l'administrateur", async () => {
    const { captureError, sendErrorsToTrackingService, ERROR_REPORT_RECIPIENT } = await import(
      "./errorTracking"
    );
    captureError("Boum", "TestComponent");

    await sendErrorsToTrackingService();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const params = sendMock.mock.calls[0][2] as Record<string, unknown>;
    expect(params.to_email).toBe(ERROR_REPORT_RECIPIENT);
    expect(String(params.to_email)).not.toBe("");
  });
});
