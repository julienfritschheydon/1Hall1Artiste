import { describe, it, expect } from "vitest";

// TEST VOLONTAIREMENT CASSÉ — sert à prouver que le job `test` bloque le
// déploiement (gate `needs: test`). À SUPPRIMER après vérification.
describe("gate check (à supprimer)", () => {
  it("échoue exprès pour vérifier le gate CI", () => {
    expect(1).toBe(2);
  });
});
