import { describe, it, expect } from "vitest";
import {
  appendFailedToursNote,
  buildAttendanceSheetsHtml,
  buildFullRegistrationsCsv,
  buildRegistrationsCsv,
  formatCompanions,
  mapWithLimit,
} from "./guideExport";
import { Tour } from "../types/visitTypes";

const tour = (over: Partial<Tour> = {}): Tour => ({
  id: "t1",
  guideId: "all-guides",
  title: "Visite du port",
  date: "2026-09-19T10:00:00.000Z",
  durationMinutes: 90,
  startLocationX: 0,
  startLocationY: 0,
  capacity: 20,
  labels: [],
  status: "upcoming",
  createdAt: "",
  updatedAt: "",
  ...over,
});

const reg = (over: Record<string, any> = {}) => ({
  lastName: "Durand",
  firstName: "Marie",
  email: "marie@example.com",
  status: "confirmé",
  ...over,
});

describe("caractérisation — sortie inchangée pour une visite seule", () => {
  // Ces deux tests verrouillent le refactor : printAttendance et exportCSV
  // vivaient dans GuidePortal.tsx et produisaient exactement ces chaînes.
  // Toute divergence casserait les boutons du détail visite.
  it("produit la feuille d'appel historique", () => {
    const html = buildAttendanceSheetsHtml([
      { tour: tour({ guides: ["Léa"] }), registrations: [reg({ companionFirstName: "Paul" })] },
    ]);
    const dateStr = new Date("2026-09-19T10:00:00.000Z").toLocaleString("fr-FR");

    expect(html).toBe(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Appel — Visite du port</title></head><body style="font-family:sans-serif;padding:20px">
    <h1 style="font-size:18px">Feuille d'appel — Visite du port</h1>
    <p style="color:#555">${dateStr} • 2 personne(s) attendue(s) • Animé par Léa</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr>
        <th style="border:1px solid #999;padding:6px">Présent</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Nom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Prénom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Accompagnant</th>
      </tr></thead>
      <tbody><tr>
        <td style="border:1px solid #999;padding:6px;width:40px;text-align:center">☐</td>
        <td style="border:1px solid #999;padding:6px">Durand</td>
        <td style="border:1px solid #999;padding:6px">Marie</td>
        <td style="border:1px solid #999;padding:6px">Paul</td>
      </tr></tbody>
    </table>
  </body></html>`
    );
  });

  it("produit le CSV inscrits historique", () => {
    const csv = buildRegistrationsCsv([reg(), reg({ firstName: "Léo", companionFirstName: "Ana" })]);

    expect(csv).toBe(
      '"Nom","Prénom","Email","Accompagnants","Places","Statut"\n' +
        '"Durand","Marie","marie@example.com","","1","confirmé"\n' +
        '"Durand","Léo","marie@example.com","Ana","2","confirmé"'
    );
  });
});

describe("buildRegistrationsCsv", () => {
  it("échappe guillemets, virgules et retours ligne", () => {
    const csv = buildRegistrationsCsv([
      reg({ lastName: 'Le "Grand"', firstName: "A,B", email: "x@y.z\nsuite" }),
    ]);
    expect(csv).toContain('"Le ""Grand""","A,B","x@y.z\nsuite"');
  });

  it("neutralise une cellule interprétable comme formule", () => {
    const csv = buildRegistrationsCsv([reg({ firstName: "=1+1" })]);
    expect(csv).toContain('"\'=1+1"');
  });

  it("compte les places avec les accompagnants du tableau companions", () => {
    const csv = buildRegistrationsCsv([
      reg({ companions: [{ firstName: "Ana", lastName: "B" }, { firstName: "Léo" }] }),
    ]);
    expect(csv).toContain('"Ana B, Léo","3"');
  });
});

describe("buildAttendanceSheetsHtml — plusieurs visites", () => {
  it("sépare les feuilles par un saut de page, sans saut après la dernière", () => {
    const html = buildAttendanceSheetsHtml(
      [
        { tour: tour({ id: "a", title: "A" }), registrations: [reg()] },
        { tour: tour({ id: "b", title: "B" }), registrations: [reg()] },
      ],
      "Appels du jour — 19/09/2026"
    );

    expect(html).toContain("<title>Appels du jour — 19/09/2026</title>");
    expect(html.match(/page-break-after:always/g)).toHaveLength(1);
    expect(html).toContain("Feuille d'appel — A");
    expect(html).toContain("Feuille d'appel — B");
  });

  it("garde l'en-tête d'une visite sans inscrit", () => {
    const html = buildAttendanceSheetsHtml([{ tour: tour({ title: "Vide" }), registrations: [] }]);
    expect(html).toContain("Feuille d'appel — Vide");
    expect(html).toContain("0 personne(s) attendue(s)");
    expect(html).toContain("<tbody></tbody>");
  });

  it("échappe le HTML d'un titre et d'un nom", () => {
    const html = buildAttendanceSheetsHtml([
      { tour: tour({ title: "<script>x</script>" }), registrations: [reg({ lastName: "<b>" })] },
    ]);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;");
  });

  it("affiche les places libres quand elles sont fournies", () => {
    const html = buildAttendanceSheetsHtml([
      { tour: tour({ capacity: 20 }), registrations: [reg()], placesLeft: 3 },
    ]);
    expect(html).toContain("Places libres : 3/20");
  });

  it("liste les personnes en file avec offre en cours", () => {
    const html = buildAttendanceSheetsHtml([
      {
        tour: tour(),
        registrations: [reg()],
        waitlistWithOffer: [{ firstName: "Nina", lastName: "Roux", places: 2 }],
      },
    ]);
    expect(html).toContain("En attente (offre envoyée)");
    expect(html).toContain("Roux");
  });

  it("n'ajoute ni places libres ni bloc file quand rien n'est fourni", () => {
    const html = buildAttendanceSheetsHtml([{ tour: tour(), registrations: [reg()] }]);
    expect(html).not.toContain("Places libres");
    expect(html).not.toContain("En attente");
  });
});

describe("formatCompanions", () => {
  it("rend « - » sans accompagnant", () => {
    expect(formatCompanions(reg())).toBe("-");
  });
});

describe("buildFullRegistrationsCsv", () => {
  const t1 = tour({ id: "a", title: "Matin", date: "2026-09-19T09:00:00.000Z" });
  const t2 = tour({ id: "b", title: "Après-midi", date: "2026-09-19T15:00:00.000Z" });

  it("trie les visites par date et reprend l'en-tête complet", () => {
    const csv = buildFullRegistrationsCsv([
      { tour: t2, registrations: [reg({ lastName: "Zoé" })] },
      { tour: t1, registrations: [reg({ lastName: "Abel" })] },
    ]);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      '"Visite","Date","Heure","Nom","Prénom","Email","Accompagnants","Places","Statut","Inscrit le"'
    );
    expect(lines[1]).toContain('"Matin"');
    expect(lines[2]).toContain('"Après-midi"');
  });

  it("n'ajoute la file d'attente que sur demande, avec un statut parlant", () => {
    const entries = [
      {
        tour: t1,
        registrations: [reg()],
        waitlist: [
          { firstName: "Nina", lastName: "Roux", email: "n@x.fr", places: 2, position: 3 },
          { firstName: "Sam", lastName: "Gil", email: "s@x.fr", places: 1, position: 1, hasOffer: true },
          { firstName: "Eve", lastName: "Pic", email: "e@x.fr", places: 1, position: 2, rejectedAt: "2026-09-01" },
        ],
      },
    ];

    expect(buildFullRegistrationsCsv(entries)).not.toContain("Roux");

    const withWl = buildFullRegistrationsCsv(entries, { includeWaitlist: true });
    expect(withWl).toContain('"file d\'attente (position 3)"');
    expect(withWl).toContain('"file d\'attente (offre envoyée)"');
    expect(withWl).toContain('"file d\'attente (offre expirée)"');
  });

  it("laisse « Inscrit le » vide quand la date manque", () => {
    const csv = buildFullRegistrationsCsv([{ tour: t1, registrations: [reg({ createdAt: undefined })] }]);
    expect(csv.split("\n")[1].endsWith(',""')).toBe(true);
  });
});

describe("appendFailedToursNote", () => {
  it("ne touche à rien sans échec", () => {
    expect(appendFailedToursNote("a", [])).toBe("a");
  });

  it("ajoute une ligne de commentaire finale", () => {
    expect(appendFailedToursNote("a", ["Matin", "Soir"])).toContain("Visites non exportées");
  });
});

describe("mapWithLimit", () => {
  it("ne dépasse jamais la concurrence demandée et garde l'ordre", async () => {
    let running = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6, 7];

    const out = await mapWithLimit(items, 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return n * 2;
    });

    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("rapporte la progression une fois par élément", async () => {
    const seen: number[] = [];
    await mapWithLimit([1, 2, 3], 2, async (n) => n, (done) => seen.push(done));
    expect(seen).toEqual([1, 2, 3]);
  });
});
