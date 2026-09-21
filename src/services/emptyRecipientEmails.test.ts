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

const sendMock = vi.fn(async (..._args: unknown[]) => ({ status: 200, text: "OK" }));
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

  it("n'envoie que les variables du template : to_email, subject, message", async () => {
    // Le template partagé « Visites Notifications » n'affiche que {{subject}} et
    // {{{message}}} : les anciennes variables (errors_json…) donnaient un e-mail
    // sans destinataire, sans objet et sans corps.
    const { captureError, sendErrorsToTrackingService, ERROR_REPORT_RECIPIENT } = await import(
      "./errorTracking"
    );
    captureError("Boum", "TestComponent");

    await sendErrorsToTrackingService();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const params = sendMock.mock.calls[0][2] as Record<string, unknown>;
    expect(params.to_email).toBe(ERROR_REPORT_RECIPIENT);
    expect(String(params.subject)).not.toBe("");
    expect(String(params.message)).toContain("Boum");
    expect(Object.keys(params).sort()).toEqual(["message", "subject", "to_email"]);
  });

  it("met en forme le rapport pour un template qui ne rend que subject/message", async () => {
    const { buildErrorReportEmail } = await import("./errorTracking");
    const built = buildErrorReportEmail([
      {
        message: "<script>alert(1)</script>",
        url: "https://exemple.fr/visite",
        timestamp: "2026-09-20T20:00:00.000Z",
        userAgent: "Firefox",
        path: "/visite",
        componentName: "VisitPage",
      },
    ]);

    expect(built.subject).toContain("1 erreur");
    expect(built.message).toContain("VisitPage");
    // Le template utilise {{{message}}} (HTML brut) : le texte d'erreur venant
    // du navigateur ne doit pas pouvoir injecter de balise.
    expect(built.message).not.toContain("<script>");
    expect(built.message).toContain("&lt;script&gt;");
  });
});

describe("template des alertes administrateur", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("préfère un template de visite ({{subject}}/{{{message}}}) au template du lien artiste", async () => {
    // EMAILJS_TEMPLATE_ID pointe le template du lien artiste : sujet en dur,
    // corps réduit à {{link}}. L'alerte y perdait tout son contenu.
    const { alertTemplateId } = await import("../../api/_alert-email");
    process.env.EMAILJS_TEMPLATE_ID = "template_lien_artiste";
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({ confirmation: "template_visites" });
    delete process.env.EMAILJS_ALERT_TEMPLATE_ID;

    expect(alertTemplateId()).toBe("template_visites");
  });

  it("respecte EMAILJS_ALERT_TEMPLATE_ID quand il est renseigné", async () => {
    const { alertTemplateId } = await import("../../api/_alert-email");
    process.env.EMAILJS_ALERT_TEMPLATE_ID = "template_alertes";
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({ confirmation: "template_visites" });

    expect(alertTemplateId()).toBe("template_alertes");
  });

  it("retombe sur EMAILJS_TEMPLATE_ID si aucun template de visite n'est configuré", async () => {
    const { alertTemplateId } = await import("../../api/_alert-email");
    delete process.env.EMAILJS_ALERT_TEMPLATE_ID;
    delete process.env.VISIT_EMAILJS_TEMPLATE_IDS;
    process.env.EMAILJS_TEMPLATE_ID = "template_unique";

    expect(alertTemplateId()).toBe("template_unique");
  });
});
