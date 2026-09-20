// Helpers d'affichage de la recherche d'inscrit.
// Le fuseau a déjà mordu ce projet (les fonctions serveur tournent en UTC, les
// visites se lisent en heure de Paris) : on le verrouille ici.
import { describe, it, expect } from "vitest";
import { formatTourDate, statusStyle, tourHasStarted } from "./RegistrantSearchModal";

describe("formatTourDate", () => {
  it("affiche l'heure de Paris, pas l'UTC", () => {
    // 13:00 UTC = 15h00 à Paris en août (CEST).
    expect(formatTourDate("2026-08-20T13:00:00.000Z")).toContain("15:00");
  });

  it("gère l'absence de date et une date invalide sans planter", () => {
    expect(formatTourDate(undefined)).toBe("—");
    expect(formatTourDate("pas-une-date")).toBe("pas-une-date");
  });
});

describe("statusStyle", () => {
  it("donne un libellé lisible pour chaque statut connu", () => {
    expect(statusStyle("confirmé").label).toBe("Confirmé");
    expect(statusStyle("présent").label).toBe("Présent");
    expect(statusStyle("absent").label).toBe("Absent");
    expect(statusStyle("annulé").label).toBe("Annulé");
  });

  it("retombe sur le statut brut pour une valeur inconnue", () => {
    // Des documents anciens portent encore « attente_validation ».
    expect(statusStyle("attente_validation").label).toBe("attente_validation");
  });
});

describe("tourHasStarted", () => {
  const now = new Date("2026-08-20T13:30:00.000Z").getTime();

  it("reconnaît une visite déjà commencée", () => {
    expect(tourHasStarted({ id: "t", title: "V", date: "2026-08-20T13:00:00.000Z" }, now)).toBe(true);
  });

  it("reconnaît une visite à venir", () => {
    expect(tourHasStarted({ id: "t", title: "V", date: "2026-08-20T14:00:00.000Z" }, now)).toBe(false);
  });

  it("ne bloque rien quand la visite est absente ou sa date illisible", () => {
    expect(tourHasStarted(null, now)).toBe(false);
    expect(tourHasStarted({ id: "t", title: "V", date: "n'importe quoi" }, now)).toBe(false);
  });
});
