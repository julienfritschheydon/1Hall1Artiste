import { describe, it, expect } from "vitest";
import { placesOf } from "@/types/visitTypes";

// placesOf est la base de tous les compteurs du portail guide (onglets,
// total places, feuille d'appel imprimée, export CSV) : un inscrit compte
// pour lui-même + ses accompagnants.
describe("placesOf", () => {
  it("compte 1 place pour un inscrit sans accompagnant", () => {
    expect(placesOf({})).toBe(1);
    expect(placesOf({ companions: [] })).toBe(1);
  });

  it("compte le titulaire plus chaque accompagnant", () => {
    expect(placesOf({ companions: [{ firstName: "Bob" }] })).toBe(2);
    expect(
      placesOf({ companions: [{ firstName: "Bob" }, { firstName: "Chloé" }, { firstName: "Dan" }] })
    ).toBe(4);
  });

  it("gère le format legacy à un seul accompagnant", () => {
    expect(placesOf({ companionFirstName: "Bob" })).toBe(2);
  });

  it("additionne correctement sur une liste d'inscriptions", () => {
    const registrations = [
      {},
      { companions: [{ firstName: "Bob" }] },
      { companionFirstName: "Chloé" },
    ];
    const total = registrations.reduce((s, r) => s + placesOf(r), 0);
    // 1 + 2 + 2 = 5 personnes pour seulement 3 lignes d'inscription.
    expect(total).toBe(5);
    expect(total).not.toBe(registrations.length);
  });
});
