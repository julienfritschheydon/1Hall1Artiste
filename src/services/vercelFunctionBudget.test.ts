// Garde-fou de déploiement.
//
// Le plan Vercel Hobby refuse un déploiement au-delà de 12 fonctions serverless, et le
// projet est exactement à la limite. Ce plafond ne se voit pas en local : `npm run build`
// ne compile que le front, pas les fonctions api/. Ajouter un fichier de route casse donc
// le déploiement sans qu'aucune vérification locale ne bronche — c'est arrivé.
//
// Chaque fichier .ts de api/ devient une route, sauf ceux préfixés par « _ » (helpers).
// Pour ajouter une action sans dépasser le plafond, la multiplexer dans une route
// existante (voir /api/visit-emails?type=… ou l'action admin-login de /api/artist-link).
//
// Les routes Edge (`export const config = { runtime: "edge" }`, ex. api/share.ts) ne
// comptent pas dans ce plafond : elles sont exclues du décompte.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOBBY_PLAN_LIMIT = 12;

describe("budget de fonctions serverless Vercel", () => {
  it(`api/ ne dépasse pas ${HOBBY_PLAN_LIMIT} routes`, () => {
    const apiDir = resolve(__dirname, "../../api");
    const isEdge = (f: string) =>
      /runtime\s*:\s*["']edge["']/.test(readFileSync(resolve(apiDir, f), "utf-8"));
    const routes = readdirSync(apiDir)
      .filter((f) => f.endsWith(".ts") && !f.startsWith("_") && !isEdge(f))
      .sort();

    // Message explicite : la liste rend la cause évidente en CI.
    expect(routes.length, `routes détectées :\n${routes.join("\n")}`).toBeLessThanOrEqual(
      HOBBY_PLAN_LIMIT
    );
  });
});
