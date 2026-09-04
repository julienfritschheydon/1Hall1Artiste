// Support multi-fiches du portail artiste : un même email peut être inscrit sur
// plusieurs lignes du programme (chorale avec deux chœurs, exposant dans deux halls).
// Placé sous src/ car l'include vitest est limité à src/**/*.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { putArtistOverride } = vi.hoisted(() => ({ putArtistOverride: vi.fn() }));

vi.mock("../../api/_overrides.js", async () => {
  const actual = await vi.importActual<typeof import("../../api/_overrides")>("../../api/_overrides");
  return { ...actual, putArtistOverride };
});

import { buildEmailToArtistIds } from "../../api/_sheets";
import { createToken, verifyToken } from "../../api/_token";
import handler from "../../api/artist-update";

process.env.ARTIST_SECRET = "secret-de-test";

// ── Fixtures CSV ─────────────────────────────────────────────────────────────

const EXPO_CSV = [
  "Prénom et Nom de l'artiste,Deux lignes pour vous présenter,Adresse e-mail,Samedi,Dimanche,Adresse expo",
  // Même artiste, deux halls → deux fiches, un seul email.
  "John Do,Escape game,thomas@john-doe.fr,Oui,Oui,allee-duguay-trouin-15",
  "John Do,Escape game,thomas@john-doe.fr,Oui,Oui,quai-turenne-11",
  // Fiche simple.
  "Malou Tual,Peintre,tual.malou@gmail.com,Oui,Oui,quai-turenne-8",
  // Absente les deux jours → hors programme.
  "Marion Peeters,Tentures,marion.peeters@free.fr,Non,Non,quai-turenne-8",
  // Lieu inconnu → hors programme.
  "Fantome Test,Rien,fantome@example.com,Oui,Oui,lieu-inexistant",
].join("\n");

const CONCERT_CSV = [
  "Nom du groupe,Présentation,Email,Samedi,Dimanche,Adresse concert",
  // Le cas Label Diva : deux fiches, une seule adresse.
  "Chorale Label Diva (Choeur mixte),,labeldivachorale@gmail.com,Oui,,Cour ovale",
  "Chorale Label Diva (Choeur de femmes),,labeldivachorale@gmail.com,Oui,,Cour ovale",
  "Quatuor Liger,,solenne.guilbert@quatuorliger.fr,,Oui,Cour ovale",
].join("\n");

function mockCsvFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      text: async () => (String(url).includes("1bGPyPmm") ? CONCERT_CSV : EXPO_CSV),
    })) as never
  );
}

// ── req/res mockés pour le handler serverless ────────────────────────────────

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

const mockReq = (body: unknown) => ({ method: "POST", body }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ── TU : collecte des fiches par email ───────────────────────────────────────

describe("buildEmailToArtistIds", () => {
  it("un email sur deux lignes renvoie ses deux fiches dans l'ordre du programme", async () => {
    mockCsvFetch();
    const map = await buildEmailToArtistIds();
    expect(map.get("thomas@john-doe.fr")).toEqual(["john-do", "john-do-2"]);
    expect(map.get("labeldivachorale@gmail.com")).toEqual([
      "chorale-label-diva-choeur-mixte",
      "chorale-label-diva-choeur-de-femmes",
    ]);
  });

  it("un email unique renvoie un tableau à un élément", async () => {
    mockCsvFetch();
    const map = await buildEmailToArtistIds();
    expect(map.get("tual.malou@gmail.com")).toEqual(["malou-tual"]);
    expect(map.get("solenne.guilbert@quatuorliger.fr")).toEqual(["quatuor-liger"]);
  });

  it("ignore les lignes hors programme (aucun jour, lieu inconnu)", async () => {
    mockCsvFetch();
    const map = await buildEmailToArtistIds();
    expect(map.has("marion.peeters@free.fr")).toBe(false);
    expect(map.has("fantome@example.com")).toBe(false);
  });
});

// ── TU : token multi-fiches ──────────────────────────────────────────────────

describe("token artiste", () => {
  it("aller-retour sur plusieurs fiches", () => {
    const token = createToken(["chorale-label-diva-choeur-mixte", "chorale-label-diva-choeur-de-femmes"], "labeldivachorale@gmail.com");
    const result = verifyToken(token);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.expired).toBe(false);
    expect(result.artistIds).toEqual([
      "chorale-label-diva-choeur-mixte",
      "chorale-label-diva-choeur-de-femmes",
    ]);
    expect(result.artistId).toBe("chorale-label-diva-choeur-mixte");
    expect(result.email).toBe("labeldivachorale@gmail.com");
  });

  it("un token mono-fiche (format legacy) reste lisible comme liste à un élément", () => {
    const token = createToken("malou-tual", "tual.malou@gmail.com");
    const result = verifyToken(token);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.artistIds).toEqual(["malou-tual"]);
    expect(result.artistId).toBe("malou-tual");
  });

  it("rejette une signature falsifiée", () => {
    const token = createToken(["malou-tual"], "tual.malou@gmail.com");
    const [payload] = token.split(".");
    expect(verifyToken(`${payload}.signature-bidon`).valid).toBe(false);
  });

  it("refuse de créer un token sans fiche", () => {
    expect(() => createToken([], "vide@example.com")).toThrow();
  });
});

// ── Intégration : handler artist-update ──────────────────────────────────────

describe("api/artist-update — choix de la fiche", () => {
  const IDS = ["chorale-label-diva-choeur-mixte", "chorale-label-diva-choeur-de-femmes"];
  const token = () => createToken(IDS, "labeldivachorale@gmail.com");

  it("écrit sur la fiche demandée quand elle est couverte par le lien", async () => {
    putArtistOverride.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(mockReq({ token: token(), artistId: IDS[1], fields: { presentation: "Chœur de femmes" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(putArtistOverride).toHaveBeenCalledTimes(1);
    expect(putArtistOverride.mock.calls[0][0]).toBe(IDS[1]);
    expect(putArtistOverride.mock.calls[0][1]).toMatchObject({ presentation: "Chœur de femmes" });
  });

  it("rejette en 403 une fiche absente du token, sans rien écrire", async () => {
    const res = mockRes();
    await handler(mockReq({ token: token(), artistId: "malou-tual", fields: { presentation: "pirate" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(putArtistOverride).not.toHaveBeenCalled();
  });

  it("un token présent l'emporte sur le mode admin : pas de contournement par le body", async () => {
    // Sans cette priorité, un porteur de lien valide pourrait éditer la fiche d'un autre
    // en joignant simplement un artistId (le mode admin ne vérifie pas de token).
    const res = mockRes();
    await handler(mockReq({ token: token(), artistId: "quatuor-liger", fields: { presentation: "pirate" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(putArtistOverride).not.toHaveBeenCalled();
  });

  it("mode admin (sans token) : écrit la fiche demandée", async () => {
    putArtistOverride.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(mockReq({ artistId: "quatuor-liger", fields: { presentation: "depuis l'admin" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(putArtistOverride.mock.calls[0][0]).toBe("quatuor-liger");
  });

  it("ni token ni artistId → 401", async () => {
    const res = mockRes();
    await handler(mockReq({ fields: { presentation: "anonyme" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(putArtistOverride).not.toHaveBeenCalled();
  });

  it("sans artistId dans le body, retombe sur la première fiche du lien", async () => {
    putArtistOverride.mockResolvedValue(undefined);
    const res = mockRes();
    await handler(mockReq({ token: token(), fields: { presentation: "Chœur mixte" } }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(putArtistOverride.mock.calls[0][0]).toBe(IDS[0]);
  });
});
