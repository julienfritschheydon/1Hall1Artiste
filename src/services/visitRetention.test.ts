// Délai de conservation des inscriptions après une visite.
//
// Il était de 24 h, ce qui effaçait les inscrits du samedi alors que le
// festival durait encore, et rendait impossible un appel fait le lundi. Il est
// désormais de 30 jours, surchargeable sans redéploiement.
//
// Ce fichier ne teste que la lecture du réglage : le comportement de purge
// lui-même est verrouillé dans visitOverbooking.test.ts, contre les vrais
// handlers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL = process.env.VISIT_RETENTION_DAYS;

async function load() {
  vi.resetModules();
  return await import("../../api/_visit-db.js");
}

beforeEach(() => {
  delete process.env.VISIT_RETENTION_DAYS;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VISIT_RETENTION_DAYS;
  else process.env.VISIT_RETENTION_DAYS = ORIGINAL;
  vi.restoreAllMocks();
});

describe("délai de conservation", () => {
  it("vaut 30 jours par défaut", async () => {
    const { retentionDays, DEFAULT_RETENTION_DAYS } = await load();

    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    expect(retentionDays()).toBe(30);
  });

  it("se règle par variable d'environnement", async () => {
    process.env.VISIT_RETENTION_DAYS = "7";
    const { retentionDays } = await load();

    expect(retentionDays()).toBe(7);
  });

  it("retombe sur la valeur par défaut si le réglage est illisible", async () => {
    // Le risque à éviter absolument : qu'une coquille se traduise par une
    // purge immédiate de toutes les inscriptions.
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});

    for (const mauvais of ["", "trente", "0", "-5", "NaN"]) {
      process.env.VISIT_RETENTION_DAYS = mauvais;
      const { retentionDays } = await load();
      expect(retentionDays(), `valeur « ${mauvais} »`).toBe(30);
    }

    // Une valeur vide est un réglage absent, pas une erreur : elle ne doit pas
    // alerter. Les quatre autres, si.
    expect(erreur).toHaveBeenCalledTimes(4);
  });
});
