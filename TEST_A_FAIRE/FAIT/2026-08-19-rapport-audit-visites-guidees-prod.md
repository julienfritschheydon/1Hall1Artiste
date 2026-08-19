# Rapport d'audit — Corrections Visites Guidées (Production)

**Date du test :** 19 août 2026
**Environnement :** https://www.1hall1artiste.fr (production)
**Testé par :** Cowork (agent navigateur) + Julien Fritsch
**Référence :** audit du 16/08/2026, PR #23 (mergée)

---

## Verdict global

Les 6 corrections critiques identifiées dans l'audit du 16/08 sont **toutes confirmées corrigées** en production. Un problème de sécurité supplémentaire a été découvert et corrigé en direct pendant le test. Un bug mineur reste ouvert.

---

## Bugs critiques du contexte — tous vérifiés corrigés ✅

| # | Bug avant correction | Statut |
|---|---|---|
| 1 | "Registration not found" à l'acceptation d'une offre de place | ✅ Corrigé — "Place confirmée !" affiché |
| 2 | Rechargement de la page d'acceptation créait un doublon | ✅ Corrigé — pas de doublon, page réaffiche le même message |
| 3 | Annulation puis réinscription bloquée à vie ("already registered") | ✅ Corrigé — réinscription possible |
| 4 | Code d'accès guide accepté sans validation | ✅ Corrigé — code invalide rejeté |
| 5 | Date de visite silencieusement déplacée lors de l'édition | ✅ Corrigé — date stable après "Modifier" sans changement |
| 6 | Suppression RGPD immédiate sans confirmation | ✅ Corrigé — email de confirmation requis avant suppression |

**Autres corrections vérifiées (hors les 6 principales) :**
- Impossibilité d'ajouter un accompagnant à 1 place restante → corrigé
- Écrasement d'un inscrit en file d'attente par un nouvel arrivant → corrigé (V3 et V4 coexistent correctement)
- Marquage "présent" possible sur un inscrit désinscrit → corrigé
- Non-persistance des pointages de présence après rechargement → corrigé
- Faille injection CSV (prénom `=1+1` exporté en texte brut) → corrigée
- Lien "Quitter la file d'attente" nécessite une confirmation avant action → corrigé
- Événement calendrier créé au bon weekend de septembre (pas "prochain samedi") → corrigé, vérifié sur iPhone réel

---

## 🔴 Finding sécurité détecté et corrigé pendant l'audit

**Secret CRON_SECRET par défaut en production.** La variable d'environnement Vercel contenait la valeur `dev-cron-secret-change-in-prod-8b4v2k9z3w` — un placeholder de développement jamais remplacé. N'importe qui connaissant ou devinant ce secret pouvait déclencher manuellement l'endpoint `/api/visit-emails?type=daily`, qui envoie des emails en masse (rappels, promotions de file d'attente, purge de données).

**Statut : 🟢 RÉSOLU pendant l'audit.** Julien a généré un nouveau secret fort et l'a mis à jour dans les variables d'environnement Vercel (production). Vérifié :
- Nouveau secret → `200 OK`
- Ancien secret → `401 invalid authorization`

**Recommandation pour l'avenir :** vérifier systématiquement qu'aucune autre variable d'environnement sensible ne conserve une valeur par défaut de développement avant mise en production.

---

## 🐛 Bug confirmé (mineur) — corrigé le 19/08

**Email de confirmation suppression RGPD — salutation incorrecte.** Le corps de l'email affichait "Bonjour ," avec le prénom manquant dans le template (espace + virgule collée), au lieu de "Bonjour [Prénom],".

**Statut : ✅ Corrigé.** [`api/_visit-email.ts`](../../api/_visit-email.ts) — salutation générique "Bonjour," quand le prénom n'est pas disponible (cas RGPD, requête email-only par design anti-énumération).

---

## 🟡 Points à clarifier avec l'équipe produit (pas des bugs confirmés)

- **Pas d'email de suivi** après acceptation d'une offre de place libérée, ni après désinscription de la file d'attente — seule la page web confirme l'action. Choix de design possible, à valider.
- **Libellé "Confirmés" ambigu** dans le portail guide : le compteur représente en réalité les inscriptions "non pointées" (il diminue au fur et à mesure que le guide marque présent/absent), ce qui peut prêter à confusion sur le terrain.
- **Export CSV limité aux inscrits confirmés**, la file d'attente n'est pas exportable — probablement voulu (le CSV sert à l'émargement), à confirmer.

---

## Notes UX mineures

- Plusieurs messages d'erreur backend non traduits en français : `"already in waitlist for this tour"`, `"email: valid email required"`.
- La page de reconfirmation d'une offre de place affiche le même message qu'au premier clic plutôt qu'un texte distinct type "déjà confirmée" — le comportement (idempotence, pas de doublon) est correct, seul le texte ne change pas.
- Délais de rafraîchissement ponctuels observés sur certains compteurs (places restantes, statut d'offre envoyée, synchronisation de la file d'attente) — un rechargement manuel suffit à résoudre, non bloquant.
- Sur iOS, l'app Calendrier n'apparaît pas toujours directement dans la feuille de partage native lors du tap sur "Ajouter au calendrier" (dépend des apps favorites de l'utilisateur) — mais passer par "Enregistrer dans Fichiers" puis ouvrir le fichier fonctionne parfaitement. Comportement normal d'iOS, pas un bug de l'application.

---

## Non testé

| Test | Raison |
|---|---|
| Coupure réseau / mode avion pendant une inscription | Reporté à la demande de Julien — nécessite une coupure réseau manuelle OS-level |
| "Tour already started" sur une visite déjà passée | Pas de visite passée disponible dans les données de test actuelles |
| Tri "visites terminées en fin de liste" côté portail guide | Pas de visite terminée dans les données actuelles pour vérifier |
| Responsive mobile réel à 390px | Limitation technique de l'outil de redimensionnement de l'agent — à tester via DevTools Chrome ou téléphone réel |

---

## Détail des phases testées

| Phase | Contenu | Statut |
|---|---|---|
| 1 | Inscription visiteur (V1, V2+accompagnant, V3, idempotences) | ✅ Complet |
| 2 | File d'attente (annulation, offre, acceptation, intégrité, désinscription, réinscription) | ✅ Complet |
| 3 | Portail guide (connexion, tri, badge "En cours", compteurs, inscription sur place, modification, capacité) | ✅ Complet |
| 4 | Émargement (présence/absence, persistance, export CSV, anti-injection) | ✅ Complet |
| 5 | RGPD (demande, confirmation email, suppression, réinscription) | ✅ Complet |
| 6 | Cron quotidien (déclenchement manuel, rotation de secret) | ✅ Complet |
| 7 | Non-régression (carte, programme, calendrier, iOS .ics, console) | ✅ Complet |
| 8 | Edge cases (email invalide) | ✅ Partiel — réseau/mobile non testés |

---

## Suites données après le rapport

1. ✅ Bug template email RGPD ("Bonjour ,") — corrigé le 19/08
2. Nettoyage des données de test (`+v1` à `+v5`, `+vformula`) — voir note ci-dessous
3. Ce rapport classé dans `TEST_A_FAIRE/FAIT/` avec le fichier de test associé
4. Emails de suivi manquants (offre acceptée, désinscription file) — discussion produit en cours

### Note nettoyage données de test

Suppression complète (RGPD) nécessite de cliquer un lien de confirmation envoyé par email — un agent sans accès boîte mail ne peut pas finaliser ce flux lui-même. Deux options :
- Laisser la purge automatique 24h post-visite s'en charger (mécanisme déjà vérifié fonctionnel en §6 de l'audit).
- Toi : cliquer les liens RGPD reçus sur chaque alias `+v1` à `+v5`/`+vformula`.
