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
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const HOBBY_PLAN_LIMIT = 12;

describe("budget de fonctions serverless Vercel", () => {
  it(`api/ ne dépasse pas ${HOBBY_PLAN_LIMIT} routes`, () => {
    const routes = readdirSync(resolve(__dirname, "../../api"))
      .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
      .sort();

    // Message explicite : la liste rend la cause évidente en CI.
    expect(routes.length, `routes détectées :\n${routes.join("\n")}`).toBeLessThanOrEqual(
      HOBBY_PLAN_LIMIT
    );
  });
});
