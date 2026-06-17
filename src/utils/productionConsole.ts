/**
 * Garde-fou des logs en production.
 *
 * En production, on neutralise les logs verbeux (console.log / info / debug)
 * afin de ne pas exposer les logs internes de l'application dans la console
 * des visiteurs. Les avertissements et erreurs (console.warn / console.error)
 * sont volontairement conservés pour le diagnostic.
 *
 * Ce module est importé en tout premier dans main.tsx pour s'appliquer avant
 * l'exécution du reste de l'application (y compris les logs émis au chargement
 * des modules et ceux passant par utils/logger.ts, qui s'appuie sur console.log).
 */
if (import.meta.env.PROD) {
  const noop = (..._args: unknown[]): void => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

export {};
