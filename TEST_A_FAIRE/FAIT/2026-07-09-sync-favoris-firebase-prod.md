# Test manuel — Sync des favoris vers Firebase (P1 anonyme + P2 email)

**Date** : 2026-07-09
**Branche** : `main`
**Environnement** : **preview/prod Vercel uniquement** (l'API `/api/favorites` n'existe pas en dev Vite local — les fonctions serverless sont absentes, le sync reste silencieux, c'est voulu)

> ⚠️ **PRÉ-REQUIS** : règles RTDB `.read:false` sur `user-favorites` et `favorites-email-index` déjà posées en console Firebase (voir [FIREBASE-RULES-FAVORITES.md](../docs/FIREBASE-RULES-FAVORITES.md)). Sans ça, ne pas tester le flux email (emails en clair aspirables).

Concerné : [SavedEvents.tsx](../src/pages/SavedEvents.tsx) (page Enregistrés), [favoritesSync.ts](../src/services/favoritesSync.ts), [api/favorites.ts](../api/favorites.ts), boutons save sur fiches événement/bâtiment.

---

## 1. Sync anonyme — sauvegarde de base

- [ ] Ouvrir `/program`, sauver un événement (icône marque-page) → passe en ambre
- [ ] Ouvrir la fiche d'un bâtiment sur `/map`, cliquer **"Enregistrer ce bâtiment"** → passe en ambre
- [ ] Ouvrir la console réseau (DevTools) → une requête `POST /api/favorites` part dans les ~300ms suivants
- [ ] Payload contient `deviceId` (UUID), `events: [...]`, `locations: [...]`
- [ ] Console Firebase → `Realtime Database` → `Données` → nœud `user-favorites/<deviceId>` créé avec les bons IDs

## 2. Page Enregistrés

- [ ] Aller sur `/saved` → événement ET bâtiment sauvés apparaissent (sections séparées)
- [ ] Badge compteur (bottom nav) reflète le bon total
- [ ] Retirer un favori → disparaît immédiatement de la liste, `POST /api/favorites` repart

## 3. Persistance cross-session (le cœur de la feature)

- [ ] Sauver 2-3 favoris
- [ ] Vider le cache navigateur / `localStorage.clear()` en console (simule perte locale)
- [ ] Recharger la page → **les favoris ont disparu** (comportement normal, pas de recovery sans email à ce stade)
- [ ] Revenir en arrière : re-sauver les mêmes favoris, cette fois **sans** vider le storage
- [ ] Fermer complètement l'onglet en < 1 seconde après le save (test du `sendBeacon`)
- [ ] Rouvrir → recharger `/saved` → le favori est bien là (persistance locale) **et** présent côté serveur (vérifier console Firebase)

## 4. Suppression — anti-résurrection

- [ ] Sauver un favori, attendre 2 secondes (laisser le push serveur partir)
- [ ] Recharger la page immédiatement après avoir retiré ce favori (retirer puis F5 très vite)
- [ ] Après rechargement → le favori **ne revient pas** (ne doit pas être "ressuscité" par le pull serveur)
- [ ] Retirer TOUS les favoris → recharger → liste vide, pas de résurrection

## 5. Mode avion / réseau coupé

- [ ] Activer le mode avion (ou throttle "Offline" DevTools)
- [ ] Sauver un événement → **aucune erreur visible**, l'UI reste fluide et instantanée
- [ ] Repasser en ligne → dans les secondes qui suivent, `POST /api/favorites` part automatiquement (écouteur `online`)
- [ ] Vérifier en console Firebase que la donnée est bien arrivée

## 6. Nudge (bandeau incitation email)

- [ ] Avec 0-2 favoris sauvés → pas de bandeau
- [ ] Sauver un 3e favori (événement ou bâtiment, peu importe le mix) → bandeau ambre apparaît : *"Ne perdez pas vos favoris — associez votre email ci-dessous."*
- [ ] Cliquer la croix de fermeture → bandeau disparaît
- [ ] Recharger la page → **le bandeau ne réapparaît pas** (mémorisé dans `localStorage`)

## 7. Section "Mon email" — association simple

- [ ] Sur `/saved`, section **"Mon email"** en haut (remplace l'ancienne "Mes réservations")
- [ ] Entrer un email jamais utilisé, cliquer **"Retrouver mes infos"**
- [ ] Message affiché : *"Vos favoris seront désormais associés à cet email."*
- [ ] Console Firebase → `favorites-email-index/<emailKey>` créé avec `devices: { <deviceId>: <timestamp> }`
- [ ] `user-favorites/<deviceId>.email` = l'email en minuscules
- [ ] Lien **"Dissocier mon email"** apparaît sous le champ

## 8. Récupération sur un 2e appareil (le scénario clé)

Nécessite 2 navigateurs différents (ou un normal + un en navigation privée = 2 devices distincts).

- [ ] **Appareil A** : sauver 2 favoris, associer l'email `test-recovery@example.com`
- [ ] **Appareil B** (jamais utilisé, favoris vides) : aller sur `/saved`, entrer le même email, cliquer **"Retrouver mes infos"**
- [ ] Message : *"2 nouveaux favoris ajoutés."* (pas "2 favoris récupérés" — c'est un delta)
- [ ] Les 2 favoris apparaissent bien sur B
- [ ] **Appareil A** : ajouter un 3e favori après la récupération sur B
- [ ] **Appareil C** (3e device/navigation privée) : entrer le même email → doit voir les **3** favoris (union de tous les devices associés, pas juste le dernier ayant pushé)

## 9. Cas d'erreur — messages distincts

- [ ] Entrer un email qui n'a **jamais** été associé nulle part → message distinct du cas réseau, genre *"Aucune réservation ni favori associé à cet email"* (pas de confusion avec une panne)
- [ ] Couper le réseau puis cliquer "Retrouver mes infos" → message **différent** : *"Connexion indisponible — réessayez plus tard"* (ne doit jamais dire "email inconnu" quand c'est en fait hors-ligne)

## 10. Dissociation (RGPD)

- [ ] Avec un email associé, cliquer **"Dissocier mon email"**
- [ ] Message de confirmation, le lien disparaît (retour à l'état "pas d'email associé")
- [ ] Console Firebase → `user-favorites/<deviceId>.email` supprimé, entrée retirée de `favorites-email-index/<emailKey>/devices`
- [ ] Les favoris locaux restent intacts (dissocier l'email ≠ perdre ses favoris sur cet appareil)

## 11. Réservations (non-régression du flux existant)

- [ ] Avec un email qui a une vraie réservation de visite guidée, cliquer "Retrouver mes infos"
- [ ] Bloc réservations toujours affiché correctement (titre, date, statut) — comportement identique à l'ancien "Mes réservations"
- [ ] Réservations + favoris se chargent **en parallèle** (pas l'un après l'autre, pas de blocage si l'un des deux est lent)

---

## Non-régression

- [ ] Achievements/célébrations toujours déclenchés normalement lors d'un save manuel classique (1er événement sauvé, 5e événement sauvé) — **pas** lors d'un merge automatique au démarrage
- [ ] Notifications de rappel sur un événement sauvé fonctionnent toujours (`setEventNotification`)
- [ ] Aucune erreur console au chargement normal de `/saved`, `/program`, `/map`
- [ ] Bouton save sur fiche bâtiment (bordé, ambre) visuellement identique au bouton save événement — même style
- [ ] Bouton "visité" (checkbox verte) toujours indépendant du bouton "enregistrer" — ne pas confondre les deux features

## Edge cases

- [ ] Deux onglets ouverts simultanément sur `/program`, sauver un favori dans l'un → l'autre onglet reflète le changement après un `storage` event (pas de duplication de push)
- [ ] Navigation privée (Safari/iOS si possible) → sauvegarde fonctionne pendant la session, aucune erreur visible même si le `deviceId` ne survit pas à la fermeture
- [ ] Sauver plus de 300 favoris (test de charge peu probable en usage réel) → pas d'erreur bloquante, le client tronque avant l'envoi

## Si tout OK

- Cocher ce fichier comme validé, le déplacer dans `TEST_A_FAIRE/FAIT/`
- Rien d'autre à nettoyer côté code (pas de feature flag à retirer)

## Si un bug

Noter précisément :
- Numéro de section + étape
- Capture d'écran si visuel
- Contenu de la console DevTools (erreurs réseau/JS)
- Contenu du nœud RTDB concerné si divergence de données (copier le JSON depuis la console Firebase)
