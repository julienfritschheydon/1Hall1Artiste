// Limiteur de débit en mémoire, partagé par les endpoints publics.
//
// Portée : PAR INSTANCE serverless. Vercel multiplie et recycle les instances,
// donc ce n'est pas une protection contre un attaquant distribué — c'est un
// garde-fou contre la boucle accidentelle et contre le script naïf lancé depuis
// une seule machine. Les limites ci-dessous sont dimensionnées pour ça : elles
// doivent rester très au-dessus de l'usage humain légitime.
//
// Le même mécanisme existait déjà, codé en dur, dans api/favorites.ts ; il est
// extrait ici pour que les endpoints d'inscription en bénéficient aussi.

type Bucket = { count: number; reset: number };

// Une Map par nom de seau : deux actions différentes ne se volent pas leur quota
// (un formulaire d'inscription rempli plusieurs fois ne doit pas bloquer une
// demande RGPD, et réciproquement).
const buckets = new Map<string, Map<string, Bucket>>();

export interface RateLimitRule {
  /** Nombre de requêtes autorisées par fenêtre. */
  limit: number;
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number;
}

/**
 * Incrémente le compteur de `key` dans le seau `bucket` et dit si la requête
 * dépasse la limite. Retourne `true` quand il faut refuser (429).
 */
export function rateLimited(bucket: string, key: string, rule: RateLimitRule): boolean {
  let map = buckets.get(bucket);
  if (!map) {
    map = new Map<string, Bucket>();
    buckets.set(bucket, map);
  }

  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now > entry.reset) {
    map.set(key, { count: 1, reset: now + rule.windowMs });
    // Purge opportuniste : sans elle la Map grossit indéfiniment sur une
    // instance longue durée, chaque IP vue laissant une entrée morte.
    if (map.size > 5000) {
      for (const [k, v] of map) if (now > v.reset) map.delete(k);
    }
    return false;
  }

  entry.count++;
  return entry.count > rule.limit;
}

/**
 * IP du client derrière le proxy Vercel. `x-forwarded-for` peut contenir une
 * chaîne « client, proxy1, proxy2 » : la première entrée est le client.
 * Falsifiable par l'appelant — acceptable ici, le limiteur n'est qu'un
 * garde-fou et non un contrôle d'accès.
 */
export function clientIp(req: { headers: Record<string, any> }): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (typeof raw === "string" && raw.trim()) return raw.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return "unknown";
}

// ── Règles ───────────────────────────────────────────────────────────────────

// Inscription : large. Un poste partagé (office de tourisme, guide qui inscrit
// plusieurs personnes sur place) doit pouvoir enchaîner sans être bloqué.
export const REGISTER_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

// Demande de suppression RGPD : stricte. Chaque appel envoie un email à
// l'adresse indiquée, qui n'est PAS celle de l'appelant : sans limite, cet
// endpoint est un outil de harcèlement par email aux frais du quota EmailJS
// du collectif.
export const GDPR_RULE: RateLimitRule = { limit: 3, windowMs: 3_600_000 };
