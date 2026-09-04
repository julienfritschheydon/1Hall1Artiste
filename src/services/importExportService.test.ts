import { describe, it, expect, vi } from "vitest";
import { parseCSVLine } from "./importExportService";

describe("parseCSVLine", () => {
  it("découpe une ligne simple", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("ignore les virgules à l'intérieur de guillemets", () => {
    expect(parseCSVLine('"Artist, Inc.",x')).toEqual(["Artist, Inc.", "x"]);
  });

  it("gère les guillemets échappés ('' devient \")", () => {
    expect(parseCSVLine('"il dit ""salut""",fin')).toEqual([
      'il dit "salut"',
      "fin",
    ]);
  });

  it("préserve les champs vides", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("préserve un champ vide en fin de ligne (virgule finale)", () => {
    expect(parseCSVLine("a,b,")).toEqual(["a", "b", ""]);
  });

  it("retourne un seul champ vide pour une ligne vide", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });

  it("gère un mix de champs quotés et non quotés", () => {
    expect(parseCSVLine('1,"deux, 2",trois')).toEqual(["1", "deux, 2", "trois"]);
  });
});

// Régression : l'export CSV lisait event.artistBio sans garde. Les événements construits
// par /api/program n'ont pas ce champ (seul le formulaire d'administration le renseigne),
// donc exporter le programme réel levait « Cannot read properties of undefined ».
// Le stub de types qui masquait la vraie définition de Event empêchait de le voir.
describe("exportEventsToCSV", () => {
  it("n'échoue pas sur un événement sans artistBio (cas des données de /api/program)", async () => {
    const evenementDuProgramme = {
      id: "concert-quatuor-liger-dimanche",
      artistId: "quatuor-liger",
      title: "Quatuor Liger",
      time: "17:00 - 17:30",
      days: ["dimanche"] as ("samedi" | "dimanche")[],
      locationId: "quai-turenne-9-concert",
      locationName: "quai-turenne-9-concert",
      artistName: "Quatuor Liger",
      type: "concert" as const,
      // ni artistBio ni description : c'est exactement ce que produit l'API
    };

    // resetModules est indispensable : le module est déjà chargé par l'import statique
    // en tête de fichier, et sans ça le doMock n'aurait aucun effet.
    vi.resetModules();
    vi.doMock("./dataService", () => ({
      dataService: { getState: () => ({ events: [evenementDuProgramme], locations: [] }) },
    }));

    const { exportEventsToCSV } = await import("./importExportService");
    const csv = exportEventsToCSV();

    expect(csv).toContain("Quatuor Liger");
    // La colonne artistBio existe et sort vide plutôt que de faire tomber l'export.
    expect(csv).toContain('""');
    vi.doUnmock("./dataService");
    vi.resetModules();
  });
});
