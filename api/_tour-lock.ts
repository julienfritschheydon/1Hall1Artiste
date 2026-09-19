// Verrou par visite, pour sérialiser l'attribution des places.
//
// Le problème : décider s'il reste de la place puis créer l'inscription, c'est
// lire puis écrire. Entre les deux, une autre requête peut lire la même valeur
// et conclure la même chose — deux personnes obtiennent la dernière place, et
// le guide se retrouve avec 16 inscrits pour 15 places, sans rien avoir fait de
// travers. Ça vaut aussi entre une inscription et une promotion de file
// d'attente qui tomberaient en même temps.
//
// RTDB en REST n'offre pas de transaction, seulement l'écriture conditionnelle
// par ETag (voir _firebase.ts). On s'en sert pour poser un verrou : le premier
// qui réussit le PUT conditionnel entre dans la section critique, les autres
// attendent leur tour.

import { rtdbGetWithEtag, rtdbPutIfMatch } from "./_firebase.js";
import { randomUUID } from "crypto";

interface TourLock {
  owner: string;
  expiresAt: number;
}

// Durée de vie du verrou. Une fonction serverless peut mourir en pleine section
// critique (timeout, redéploiement) : sans expiration, la visite resterait
// verrouillée pour toujours et plus personne ne pourrait s'inscrire. La valeur
// doit rester très au-dessus de la durée réelle de la section critique
// (quelques centaines de millisecondes) pour qu'un verrou ne se libère jamais
// sous les pieds de son détenteur.
const LOCK_TTL_MS = 10_000;

// Budget d'attente pour acquérir le verrou. Dimensionné pour une rafale : à
// l'ouverture des inscriptions, une dizaine de requêtes peuvent viser la même
// visite, et la dernière de la file doit attendre que toutes les autres aient
// fini leur section critique. Un budget trop court les ferait basculer en
// exécution non verrouillée — exactement ce qu'on cherche à éviter.
// ~5 s au total, sous le délai d'exécution d'une fonction Vercel (10 s).
const MAX_ATTEMPTS = 20;
const BASE_DELAY_MS = 40;
const MAX_DELAY_MS = 350;

/**
 * Attente avant la prochaine tentative : progressive, puis plafonnée, avec une
 * part d'aléatoire. Sans ce bruit, tous les candidats évincés au même instant
 * repartent au même instant et se re-percutent indéfiniment.
 */
function retryDelay(attempt: number): number {
  const backoff = Math.min(BASE_DELAY_MS * Math.pow(1.4, attempt), MAX_DELAY_MS);
  return backoff + Math.random() * BASE_DELAY_MS;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function lockPath(tourId: string): string {
  return `tour_locks/${tourId}`;
}

/**
 * Exécute `fn` en exclusion mutuelle sur une visite.
 *
 * Choix assumé en cas d'échec d'acquisition : on exécute `fn` QUAND MÊME, sans
 * verrou, plutôt que de renvoyer une erreur. Refuser une inscription à
 * quelqu'un sur une visite gratuite est un préjudice certain et immédiat ;
 * l'absence de verrou ne fait que rouvrir une fenêtre de concurrence étroite,
 * qui était le comportement permanent avant ce module. On trace l'événement
 * pour qu'il soit visible s'il devient fréquent.
 */
export async function withTourLock<T>(tourId: string, fn: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const acquired = await acquire(tourId, owner);

  if (!acquired) {
    console.warn(
      `[tour-lock] Verrou non acquis pour la visite ${tourId} après ${MAX_ATTEMPTS} tentatives — ` +
        `exécution sans exclusion mutuelle.`
    );
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      await release(tourId, owner).catch((e) =>
        // Un échec de libération n'est pas fatal : le verrou expire seul.
        console.error(`[tour-lock] Libération du verrou ${tourId} impossible:`, e)
      );
    }
  }
}

async function acquire(tourId: string, owner: string): Promise<boolean> {
  const path = lockPath(tourId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { value, etag } = await rtdbGetWithEtag<TourLock>(path);

    // Un verrou périmé est traité comme absent : son détenteur n'existe plus.
    const held = value && typeof value.expiresAt === "number" && value.expiresAt > Date.now();

    if (!held) {
      const lock: TourLock = { owner, expiresAt: Date.now() + LOCK_TTL_MS };
      if (await rtdbPutIfMatch(path, lock, etag)) return true;
      // 412 : quelqu'un a pris le verrou entre notre lecture et notre écriture.
      // C'est le cas nominal sous contention, on repasse par la boucle.
    }

    if (attempt < MAX_ATTEMPTS - 1) await sleep(retryDelay(attempt));
  }

  return false;
}

async function release(tourId: string, owner: string): Promise<void> {
  const path = lockPath(tourId);
  const { value, etag } = await rtdbGetWithEtag<TourLock>(path);

  // Ne jamais libérer le verrou d'autrui : si le nôtre a expiré et qu'un autre
  // l'a repris, l'effacer le ferait entrer dans sa section critique à deux.
  if (!value || value.owner !== owner) return;

  await rtdbPutIfMatch(path, null, etag);
}
