// Alertes e-mail sur erreur serveur.
//
// Les 500 des routes api/ ne se voyaient que dans les logs Vercel. Elles
// déclenchent maintenant un e-mail à l'administrateur avec le contexte de
// l'action (route, action, identifiants, erreur, horodatage).
//
// Ce que ces tests protègent :
// - le contexte de l'action est bien dans le corps du message (sinon l'alerte
//   n'est qu'un « une erreur est survenue » inexploitable) ;
// - aucun secret (token, mot de passe, code guide) ne part par e-mail ;
// - une panne d'EmailJS ne fait jamais échouer la requête en cours ;
// - l'anti-rafale évite qu'une panne Firebase noie la boîte de réception.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.REGISTRATION_SECRET = "test-secret";
process.env.EMAILJS_SERVICE_ID = "svc";
process.env.EMAILJS_TEMPLATE_ID = "tpl";
process.env.EMAILJS_PUBLIC_KEY = "pub";
process.env.EMAILJS_PRIVATE_KEY = "priv";

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.end = vi.fn();
  return res;
}
function statusOf(res: any) {
  return res.status.mock.calls[res.status.mock.calls.length - 1]?.[0] ?? 200;
}
function alertPayloads() {
  return fetchMock.mock.calls
    .filter((c: any[]) => String(c[0]).includes("emailjs.com"))
    .map((c: any[]) => JSON.parse(c[1].body).template_params);
}

let alertApiError: any, sendAdminAlert: any, buildApiErrorMessage: any, alertRecipient: any, resetAlertThrottle: any;

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
  delete process.env.VISIT_ALERT_EMAIL;
  const mod = await import("../../api/_alert-email.js");
  ({ alertApiError, sendAdminAlert, buildApiErrorMessage, alertRecipient, resetAlertThrottle } = mod);
  resetAlertThrottle();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("destinataire des alertes", () => {
  it("écrit à l'administrateur du projet par défaut", () => {
    expect(alertRecipient()).toBe("julien.fritsch@gmail.com");
  });

  it("laisse VISIT_ALERT_EMAIL rediriger les alertes sans redéployer", () => {
    process.env.VISIT_ALERT_EMAIL = "autre@exemple.fr";
    expect(alertRecipient()).toBe("autre@exemple.fr");
  });
});

describe("contexte de l'action dans le message", () => {
  it("reprend route, action, méthode, identifiants et erreur", () => {
    const message = buildApiErrorMessage(
      {
        route: "visit-register",
        action: "confirm",
        error: new Error("Firebase indisponible"),
        req: {
          method: "POST",
          url: "/api/visit-register?action=confirm",
          query: { action: "confirm" },
          body: { registrationId: "reg-42", email: "visiteur@exemple.fr" },
        },
        details: { tourId: "tour-7" },
      },
      new Date("2026-08-01T12:34:00.000Z")
    );

    expect(message).toContain("/api/visit-register");
    expect(message).toContain("confirm");
    expect(message).toContain("POST");
    expect(message).toContain("Error: Firebase indisponible");
    expect(message).toContain("reg-42");
    expect(message).toContain("visiteur@exemple.fr");
    expect(message).toContain("tour-7");
    // Horodatage en heure de Paris : 12:34 UTC = 14:34 l'été.
    expect(message).toContain("14:34");
  });

  it("n'embarque ni token, ni mot de passe, ni code guide", () => {
    const message = buildApiErrorMessage({
      route: "visit-register",
      action: "gdpr-confirm",
      error: new Error("boom"),
      req: {
        method: "POST",
        url: "/api/visit-register",
        query: { token: "jwt-très-secret" },
        body: { password: "hunter2", guideCode: "GUIDE-OK", id: "reg-1" },
      },
    });

    expect(message).not.toContain("jwt-très-secret");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("GUIDE-OK");
    expect(message).toContain("reg-1");
  });

  it("accepte une erreur qui n'est pas un Error", () => {
    const message = buildApiErrorMessage({ route: "favorites", error: "timeout réseau" });
    expect(message).toContain("timeout réseau");
    expect(message).toContain("(non précisée)");
  });
});

describe("envoi de l'alerte", () => {
  it("poste sur EmailJS avec le sujet et le destinataire attendus", async () => {
    await alertApiError({ route: "visit-tours", action: "update", error: new Error("boom") });

    const [params] = alertPayloads();
    expect(params.to_email).toBe("julien.fritsch@gmail.com");
    expect(params.subject).toBe("DooDates — erreur API /visit-tours (update)");
    expect(params.message).toContain("boom");
  });

  it("ne lève jamais quand EmailJS est en panne", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("réseau coupé");
    });
    await expect(
      alertApiError({ route: "visit-tours", action: "update", error: new Error("boom") })
    ).resolves.toBeUndefined();
  });

  it("n'alerte qu'une fois par fenêtre pour la même erreur", async () => {
    for (let i = 0; i < 4; i++) {
      await alertApiError({ route: "visit-tours", action: "update", error: new Error("boom") });
    }
    expect(alertPayloads()).toHaveLength(1);

    // Une erreur différente sur la même route passe : ce n'est pas la même panne.
    await alertApiError({ route: "visit-tours", action: "update", error: new Error("autre") });
    expect(alertPayloads()).toHaveLength(2);
  });

  it("réalerte une fois la fenêtre écoulée", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T10:00:00.000Z"));
    await alertApiError({ route: "visit-tours", action: "update", error: new Error("boom") });
    vi.setSystemTime(new Date("2026-08-01T10:06:00.000Z"));
    await alertApiError({ route: "visit-tours", action: "update", error: new Error("boom") });
    expect(alertPayloads()).toHaveLength(2);
  });

  it("sendAdminAlert envoie un message libre", async () => {
    await sendAdminAlert("Sujet", "Corps du message");
    const [params] = alertPayloads();
    expect(params.subject).toBe("Sujet");
    expect(params.message).toBe("Corps du message");
  });
});

describe("intégration : une route en erreur alerte l'administrateur", () => {
  it("un 500 de /api/visit-tours part en e-mail avec le contexte", async () => {
    vi.doMock("../../api/_visit-db.js", async () => {
      const actual: any = await vi.importActual("../../api/_visit-db.js");
      return {
        ...actual,
        rtdbGuideCodeValid: vi.fn(async () => true),
        rtdbToursListFuture: vi.fn(async () => {
          throw new Error("Firebase indisponible");
        }),
      };
    });
    const handler = (await import("../../api/visit-tours.js")).default;

    const res = mockRes();
    await handler(
      { method: "GET", query: {}, body: {}, headers: {}, url: "/api/visit-tours" } as any,
      res
    );

    expect(statusOf(res)).toBe(500);
    const [params] = alertPayloads();
    expect(params.to_email).toBe("julien.fritsch@gmail.com");
    expect(params.subject).toContain("/visit-tours");
    expect(params.message).toContain("Firebase indisponible");
    expect(params.message).toContain("GET");
    vi.doUnmock("../../api/_visit-db.js");
  });
});
