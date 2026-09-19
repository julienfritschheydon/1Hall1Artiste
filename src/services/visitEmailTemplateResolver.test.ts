// Résolution de l'ID de template EmailJS.
//
// Tous les types d'email partagent les mêmes `template_params` (`to_email`,
// `subject`, `message`, `firstName`) : sujet et corps sont construits dans
// `buildVisitEmail`, le template n'affiche que {{subject}} / {{{message}}}. Les
// templates sont donc interchangeables, et un type sans entrée dédiée dans
// VISIT_EMAILJS_TEMPLATE_IDS peut réutiliser un autre ID configuré.
//
// Sans ce repli, ajouter un type exigeait de créer un template EmailJS ET
// d'éditer la variable d'environnement avant tout envoi.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../api/_firebase.js", () => ({
  rtdbGet: vi.fn(),
  rtdbPut: vi.fn(),
  rtdbPatch: vi.fn(),
  rtdbDelete: vi.fn(),
  rtdbGetWithEtag: vi.fn(async () => ({ value: null, etag: "" })),
  rtdbPutIfMatch: vi.fn(async () => true),
}));

const ORIGINAL = process.env.VISIT_EMAILJS_TEMPLATE_IDS;

async function load() {
  vi.resetModules();
  return (await import("../../api/visit-emails.js")).resolveTemplateId;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.VISIT_EMAILJS_TEMPLATE_IDS;
  else process.env.VISIT_EMAILJS_TEMPLATE_IDS = ORIGINAL;
});

describe("resolveTemplateId", () => {
  it("renvoie l'ID dédié quand il est configuré", async () => {
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
      reminder_7d: "tpl_7d",
      reminder_3h: "tpl_3h",
    });
    const resolveTemplateId = await load();
    expect(resolveTemplateId("reminder_3h")).toBe("tpl_3h");
    expect(resolveTemplateId("reminder_7d")).toBe("tpl_7d");
  });

  it("retombe sur un autre ID configuré quand la clé demandée manque", async () => {
    // Le cas qui motive ce repli : le rappel 3h fonctionne sans avoir à créer un
    // template EmailJS dédié ni à éditer la variable d'environnement.
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({ reminder_7d: "tpl_7d" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolveTemplateId = await load();

    expect(resolveTemplateId("reminder_3h")).toBe("tpl_7d");
    expect(warn).toHaveBeenCalled(); // le repli reste visible dans les logs
  });

  it("ignore une valeur vide et prend un ID réellement renseigné", async () => {
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({
      reminder_3h: "",
      confirmation: "tpl_conf",
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolveTemplateId = await load();
    expect(resolveTemplateId("reminder_3h")).toBe("tpl_conf");
  });

  it("renvoie undefined si aucun ID n'est configuré", async () => {
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = JSON.stringify({});
    const resolveTemplateId = await load();
    expect(resolveTemplateId("reminder_3h")).toBeUndefined();
  });

  it("renvoie undefined si la variable est absente", async () => {
    delete process.env.VISIT_EMAILJS_TEMPLATE_IDS;
    const resolveTemplateId = await load();
    expect(resolveTemplateId("reminder_3h")).toBeUndefined();
  });

  it("ne plante pas sur un JSON invalide", async () => {
    process.env.VISIT_EMAILJS_TEMPLATE_IDS = "{pas du json";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolveTemplateId = await load();

    expect(resolveTemplateId("reminder_3h")).toBeUndefined();
    expect(err).toHaveBeenCalled();
  });
});
