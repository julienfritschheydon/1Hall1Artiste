// Authentification admin côté serveur : token signé, endpoint de login, et les deux
// routes qu'il protège (génération de lien, écriture de fiche).
// Placé sous src/ car l'include vitest est limité à src/**/*.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

const { putArtistOverride } = vi.hoisted(() => ({ putArtistOverride: vi.fn() }));

vi.mock("../../api/_overrides.js", async () => {
  const actual = await vi.importActual<typeof import("../../api/_overrides")>("../../api/_overrides");
  return { ...actual, putArtistOverride };
});

import { createAdminToken, verifyAdminToken, createToken } from "../../api/_token";
import artistLinkHandler from "../../api/artist-link";
import artistUpdateHandler from "../../api/artist-update";

// Identifiants de test tirés au hasard à chaque exécution : aucune valeur ressemblant à
// un secret ne vit dans le dépôt (les scanners la signalaient, à juste titre), et les
// tests ne peuvent pas se mettre à dépendre d'une valeur particulière.
const TEST_ADMIN_PASSWORD = randomBytes(12).toString("hex");
process.env.ARTIST_SECRET = randomBytes(24).toString("hex");
process.env.ADMIN_SECRET = randomBytes(24).toString("hex");
process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;

const EXPO_CSV = [
  "Prénom et Nom de l'artiste,Deux lignes pour vous présenter,Adresse e-mail,Samedi,Dimanche,Adresse expo",
  "Malou Tual,Peintre,tual.malou@gmail.com,Oui,Oui,quai-turenne-8",
].join("\n");

const CONCERT_CSV = [
  "Nom du groupe,Présentation,Email,Samedi,Dimanche,Adresse concert",
  "Chorale Label Diva (Choeur mixte),,labeldivachorale@gmail.com,Oui,,Cour ovale",
  "Chorale Label Diva (Choeur de femmes),,labeldivachorale@gmail.com,Oui,,Cour ovale",
].join("\n");

// fetch global : sert les CSV du programme et absorbe l'appel EmailJS.
function stubFetch() {
  const emailCalls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("emailjs")) {
        emailCalls.push(u);
        return { ok: true, text: async () => "OK" };
      }
      return { ok: true, text: async () => (u.includes("1bGPyPmm") ? CONCERT_CSV : EXPO_CSV) };
    }) as never
  );
  return emailCalls;
}

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
  };
}

// IP unique par défaut : le rate limit est par IP et partagé entre les tests du module.
const mockReq = (body: unknown, ip = `ip-${Math.random()}`) =>
  ({
    method: "POST",
    body,
    headers: { host: "preview.example", "x-forwarded-for": ip },
  }) as never;

const payload = (res: ReturnType<typeof mockRes>) => res.json.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
});

// ── TU : token admin ─────────────────────────────────────────────────────────

describe("token admin", () => {
  it("aller-retour : un token fraîchement émis est valide", () => {
    expect(verifyAdminToken(createAdminToken())).toBe(true);
  });

  it("rejette une signature falsifiée", () => {
    const [p] = createAdminToken().split(".");
    expect(verifyAdminToken(`${p}.signature-bidon`)).toBe(false);
  });

  it("rejette un token vide ou mal formé", () => {
    expect(verifyAdminToken("")).toBe(false);
    expect(verifyAdminToken("nimporte-quoi")).toBe(false);
  });

  it("un token ARTISTE ne passe pas pour un token admin (pas de confusion de type)", () => {
    const artistToken = createToken(["malou-tual"], "tual.malou@gmail.com");
    expect(verifyAdminToken(artistToken)).toBe(false);
  });

  it("expire", () => {
    const token = createAdminToken();
    // 8h + 1 minute plus tard.
    vi.setSystemTime(new Date(Date.now() + 8 * 60 * 60 * 1000 + 60_000));
    expect(verifyAdminToken(token)).toBe(false);
    vi.useRealTimers();
  });
});

// ── Intégration : /api/admin-login ───────────────────────────────────────────

// Le login est multiplexé dans /api/artist-link (plafond de 12 fonctions sur Hobby).
const loginHandler = artistLinkHandler;
const loginBody = (password?: string) =>
  password === undefined ? { action: "admin-login" } : { action: "admin-login", password };

describe("connexion admin (action admin-login)", () => {
  it("bon mot de passe → token exploitable", async () => {
    const res = mockRes();
    await loginHandler(mockReq(loginBody(TEST_ADMIN_PASSWORD)), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(verifyAdminToken((payload(res) as { token: string }).token)).toBe(true);
  });

  it("mauvais mot de passe → 401, sans token", async () => {
    const res = mockRes();
    await loginHandler(mockReq(loginBody("0000")), res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(payload(res)).not.toHaveProperty("token");
  });

  it("mot de passe vide → 401", async () => {
    const res = mockRes();
    await loginHandler(mockReq(loginBody()), res as never);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("ADMIN_PASSWORD non configuré → 500, jamais un accès libre", async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = mockRes();
    await loginHandler(mockReq(loginBody("")), res as never);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(payload(res)).not.toHaveProperty("token");
  });

  it("ADMIN_SECRET absent → 500 explicite, pas le 200 générique du flux public", async () => {
    // Sans cette distinction, la signature du token lèverait et le catch final renverrait
    // un faux succès : l'admin verrait « réponse inattendue » au lieu de la vraie cause.
    const saved = process.env.ADMIN_SECRET;
    delete process.env.ADMIN_SECRET;
    try {
      const res = mockRes();
      await loginHandler(mockReq(loginBody(TEST_ADMIN_PASSWORD)), res as never);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(payload(res)).not.toHaveProperty("token");
      // Le message doit nommer la variable absente : un message générique avait envoyé
      // chercher ADMIN_SECRET alors que c'était ARTIST_SECRET qui manquait.
      expect((payload(res) as { error: string }).error).toMatch(/ADMIN_SECRET manquant/);
    } finally {
      process.env.ADMIN_SECRET = saved;
    }
  });

  it("rate limit : les tentatives répétées depuis une IP finissent en 429", async () => {
    const ip = "ip-brute-force";
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = mockRes();
      await loginHandler(mockReq(loginBody("0000"), ip), res as never);
      codes.push(res.status.mock.calls[0][0] as number);
    }
    expect(codes).toContain(429);
  });
});

// ── Intégration : /api/artist-link en mode admin ─────────────────────────────

describe("api/artist-link — mode admin", () => {
  it("renvoie le lien de la fiche sans envoyer d'email", async () => {
    const emailCalls = stubFetch();
    const res = mockRes();
    await artistLinkHandler(
      mockReq({ adminToken: createAdminToken(), artistId: "chorale-label-diva-choeur-mixte" }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = payload(res) as { link: string; email: string; artistIds: string[] };
    expect(body.email).toBe("labeldivachorale@gmail.com");
    // Le lien émis couvre les deux fiches de l'adresse, comme celui reçu par l'artiste.
    expect(body.artistIds).toEqual([
      "chorale-label-diva-choeur-mixte",
      "chorale-label-diva-choeur-de-femmes",
    ]);
    expect(body.link).toContain("/#/artiste/edit?token=");
    expect(emailCalls).toHaveLength(0);
  });

  it("sans token admin → 401", async () => {
    stubFetch();
    const res = mockRes();
    await artistLinkHandler(mockReq({ artistId: "chorale-label-diva-choeur-mixte" }), res as never);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("avec un token ARTISTE au lieu du token admin → 401", async () => {
    stubFetch();
    const res = mockRes();
    await artistLinkHandler(
      mockReq({
        adminToken: createToken(["malou-tual"], "tual.malou@gmail.com"),
        artistId: "chorale-label-diva-choeur-mixte",
      }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("ARTIST_SECRET absent → 500 nommant la variable (panne rencontrée en preview)", async () => {
    // Le lien artiste est signé avec ARTIST_SECRET, pas avec les variables d'admin :
    // configurer l'authentification admin ne suffit pas à faire marcher cette route.
    stubFetch();
    const saved = process.env.ARTIST_SECRET;
    delete process.env.ARTIST_SECRET;
    try {
      const res = mockRes();
      await artistLinkHandler(
        mockReq({ adminToken: createAdminToken(), artistId: "chorale-label-diva-choeur-mixte" }),
        res as never
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect((payload(res) as { error: string }).error).toMatch(/ARTIST_SECRET manquant/);
    } finally {
      process.env.ARTIST_SECRET = saved;
    }
  });

  it("fiche inconnue → 404", async () => {
    stubFetch();
    const res = mockRes();
    await artistLinkHandler(
      mockReq({ adminToken: createAdminToken(), artistId: "groupe-fantome" }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("le mode public par email reste inchangé (réponse générique)", async () => {
    stubFetch();
    const res = mockRes();
    await artistLinkHandler(mockReq({ email: "tual.malou@gmail.com" }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(payload(res)).toMatchObject({ ok: true });
    expect(payload(res)).not.toHaveProperty("link");
  });
});

// ── Intégration : /api/artist-update, chemin admin ───────────────────────────

describe("api/artist-update — chemin admin", () => {
  it("avec un token admin valide, écrit la fiche demandée", async () => {
    putArtistOverride.mockResolvedValue(undefined);
    const res = mockRes();
    await artistUpdateHandler(
      mockReq({ adminToken: createAdminToken(), artistId: "quatuor-liger", fields: { presentation: "ok" } }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(putArtistOverride.mock.calls[0][0]).toBe("quatuor-liger");
  });

  it("sans token admin → 401 et aucune écriture (la faille d'avant)", async () => {
    const res = mockRes();
    await artistUpdateHandler(
      mockReq({ artistId: "quatuor-liger", fields: { presentation: "pirate" } }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(putArtistOverride).not.toHaveBeenCalled();
  });

  it("avec un token ARTISTE présenté comme token admin → 401", async () => {
    const res = mockRes();
    await artistUpdateHandler(
      mockReq({
        adminToken: createToken(["malou-tual"], "tual.malou@gmail.com"),
        artistId: "quatuor-liger",
        fields: { presentation: "pirate" },
      }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(putArtistOverride).not.toHaveBeenCalled();
  });

  it("le chemin portail (token artiste) reste inchangé", async () => {
    putArtistOverride.mockResolvedValue(undefined);
    const res = mockRes();
    await artistUpdateHandler(
      mockReq({ token: createToken(["malou-tual"], "tual.malou@gmail.com"), fields: { presentation: "ok" } }),
      res as never
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(putArtistOverride.mock.calls[0][0]).toBe("malou-tual");
  });
});
