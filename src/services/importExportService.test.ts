import { describe, it, expect } from "vitest";
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
