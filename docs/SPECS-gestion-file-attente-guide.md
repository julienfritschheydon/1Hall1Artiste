# SPEC — Gestion de la file d'attente (portail guide)

> Statut : spécification, non implémenté.
> Contexte : dans `GuideDashboard.tsx` (bloc « Actions rapides »), le bouton
> `⏳ Gérer file d'attente` fait aujourd'hui un `alert("File d'attente - à implémenter")`
> ([src/components/GuideDashboard.tsx:361](../src/components/GuideDashboard.tsx#L361)).
> Deux autres boutons du même bloc sont dans le même état (voir §9).

Référence métier : [FONCTIONNEMENT-INSCRIPTIONS-FILE-ATTENTE.md](FONCTIONNEMENT-INSCRIPTIONS-FILE-ATTENTE.md).

---

## 1. Objectif

Donner au guide la main sur la file d'attente : une vue **transverse** (toutes visites) depuis le
dashboard, et les mêmes actions **au niveau d'une visite** depuis l'onglet « File d'attente » du
détail visite. L'automatisation (promotion FIFO, offres 24H) reste la norme ; ces actions sont les
exceptions qu'elle ne sait pas traiter.

Aujourd'hui l'onglet « File d'attente » du détail visite
(`WaitlistList`, [src/pages/GuidePortal.tsx:924](../src/pages/GuidePortal.tsx#L924)) est en lecture
seule ; il devient actionnable.

## 2. Emplacements et UI

Les actions du §3 sont exposées à deux endroits, via **un composant partagé** `WaitlistActions`
(pas de duplication de logique) :

- **Modale globale** — clic sur `⏳ Gérer file d'attente` → `Dialog` (même pattern que
  « Inscrits multi-visites » déjà présent dans `GuideDashboard`), titre « File d'attente »,
  `max-w-3xl`, contenu scrollable `max-h-[70vh]`.
- **Onglet « File d'attente »** du détail visite — mêmes colonnes et mêmes boutons, filtrés sur
  la visite courante.

### 2.1 En-tête de la modale globale

- Total : « N personnes en attente sur M visites » (en **places** : un groupe de 3 compte 3).
- Filtre visite : `<select>` « Toutes les visites » + une option par visite ayant au moins une
  entrée, libellé `titre — date`.
- Filtre état : `Tous` / `Offre en cours` / `Sans offre` / `Offre refusée ou expirée`.
- Bouton `➕ Ajouter à la file` (§3.2) et bouton `📥 Exporter la file (CSV)` (§6).

### 2.2 Liste

Groupée par visite (tri chronologique), puis par `position` croissante.

| Colonne | Contenu |
|---|---|
| # | `position`, avec flèches ↑ ↓ de réordonnancement (§3.3) |
| Nom | `firstName lastName` |
| Email | `email` |
| Places | `places` (1 + accompagnants) |
| État | `Sans offre` / `Offre envoyée, expire dans Xh` / `Refusée le …` / `Expirée le …` |
| Actions | boutons §3 |

Les entrées **refusées ou expirées restent affichées en ligne**, grisées et en italique, à leur
place chronologique — elles ne comptent ni dans les positions ni dans les places réservées.

État vide : « Aucune personne en file d'attente. »
Mobile (< 640px) : cartes empilées, mêmes informations.

## 3. Actions

Toutes demandent une confirmation (`window.confirm`, comme l'annulation d'inscription existante),
affichent un état `loading`, puis rafraîchissent la liste, les compteurs du dashboard et
l'historique (§5).

### 3.1 Sur une entrée

| Action | Visible quand | Effet |
|---|---|---|
| **Proposer la place** | entrée sans offre active ET places libres ≥ places de l'entrée | envoie l'offre (token 24H) |
| **Relancer l'offre** | offre en cours | renvoie l'email d'offre ; case à cocher « prolonger de 24H » dans la confirmation (décochée par défaut) |
| **Redonner une offre** | entrée refusée / expirée | repose une offre neuve ; l'entrée **retrouve son rang d'origine**, les suivantes sont décalées |
| **Inscrire directement** | toujours (hors entrée déjà consommée) ET places libres suffisantes | convertit en inscription `confirmé` sans passer par l'email d'offre |
| **Retirer de la file** | toujours | soft-delete + réordonnancement + email `waitlist_left` + promotion du suivant si offre active |

Règles :

- **Jamais de dépassement de capacité.** « Proposer la place », « Redonner une offre » et
  « Inscrire directement » sont désactivés (tooltip « Plus de place libre ») si
  `capacity - registeredPlaces - pendingOfferPlaces < places`. Le serveur revérifie : l'UI ne fait
  pas foi.
- **Hors FIFO autorisé.** Le guide peut proposer une place à n'importe quel rang. Chaque dérogation
  est journalisée (§5) et la confirmation rappelle combien de personnes sont doublées.
- **Inscription directe** : crée une `Registration` en statut `confirmé` (pas
  `attente_validation` : le guide fait foi du consentement, typiquement recueilli au téléphone),
  envoie l'email de confirmation habituel avec le lien calendrier, et soft-delete l'entrée de file.
  Réutilise le chemin de `handleActivateWaitlist` pour rester idempotent.
- **Retrait** : réutilise exactement la logique de `handleDeleteWaitlist` (soft-delete →
  `rtdbWaitlistReorderAfter` → `promoteWaitlist` si offre active) et le template `waitlist_left`
  existant, pour ne pas diverger.

### 3.2 Ajout manuel

Bouton `➕ Ajouter à la file` → petit formulaire : visite (présélectionnée dans l'onglet visite),
prénom, nom, email, nombre d'accompagnants (0–5), noms des accompagnants optionnels.
L'entrée est ajoutée **en fin de file** via `rtdbWaitlistAdd`. Refus si un email identique a déjà
une entrée active ou une inscription active sur cette visite (409, message explicite).
Sert aux demandes reçues par téléphone ou sur place.

### 3.3 Réordonnancement manuel

Flèches ↑ ↓ sur chaque entrée sans offre active. Déplace l'entrée d'un rang et décale la voisine.
Interdit sur une entrée dont l'offre est en cours (sa place est déjà réservée) et sur une entrée
refusée/expirée. Chaque déplacement est journalisé (§5).

> Attention produit : la position est visible par l'inscrit côté public (réponse anonymisée du
> `GET` public). Un réordonnancement modifie donc ce qu'il voit, sans notification. À utiliser
> pour corriger une erreur, pas comme outil de priorisation courante.

## 4. API

Les endpoints publics existants ne suffisent pas : `DELETE /api/visit-waitlist` exige l'email du
titulaire, et rien ne permet d'agir côté guide.

Ajouts dans [api/visit-waitlist.ts](../api/visit-waitlist.ts), tous protégés par `x-guide-code`
(`rtdbGuideCodeValidate`, 401 si invalide — même contrat que le GET guide actuel) :

### 4.1 `GET /api/visit-waitlist?action=all`

```json
{
  "tours": [
    {
      "tourId": "…", "title": "…", "date": "…",
      "capacity": 20, "registeredPlaces": 18, "freePlaces": 0,
      "waitlist": [ { "id": "…", "position": 1, "firstName": "…", "lastName": "…",
                      "email": "…", "places": 2, "hasOffer": true,
                      "invitationExpiresAt": "…", "rejectedAt": null } ]
    }
  ],
  "totalPlacesWaiting": 7
}
```

Visites à venir et non annulées, ayant ≥ 1 entrée (y compris refusées, désormais affichées).
Sans `x-guide-code` valide : 401 — pas de version anonymisée, ces données sont nominatives.

### 4.2 `POST /api/visit-waitlist?action=offer`

Body `{ "waitlistId": "…", "resend": false, "extend": false }`.

- offre neuve → `createRegistrationToken`, écrit `invitationToken`, `invitationSentAt`,
  `invitationExpiresAt`, envoie l'email.
- `resend: true` → renvoie l'email avec le token existant ; `extend: true` décale
  `invitationExpiresAt` de 24H à partir de maintenant et régénère le token, `extend: false` n'y
  touche pas. `idempotencyKey` distinct par envoi, sinon `sendRegistrationEmail` déduplique.
- sur une entrée `rejectedAt` → efface `rejectedAt`, repose une offre neuve, **conserve
  `position`** et décale les entrées de rang ≥ à celle-ci.
- 409 si offre déjà active sans `resend`, 409 si places insuffisantes (recalcul serveur),
  410 si soft-deleted, 404 si inconnue.

### 4.3 `POST /api/visit-waitlist?action=register`

Body `{ "waitlistId": "…" }`. Conversion directe en inscription `confirmé` (§3.1).
409 si places insuffisantes, 410 si déjà consommée. Idempotent : si une inscription active existe
déjà pour cet email sur cette visite, renvoie `{ ok: true, registrationId }` sans doublon.

### 4.4 `POST /api/visit-waitlist?action=add`

Body `{ "tourId", "firstName", "lastName", "email", "companions": [] }`. Ajoute en fin de file.
409 si doublon (entrée ou inscription active pour cet email sur cette visite).

### 4.5 `POST /api/visit-waitlist?action=reorder`

Body `{ "waitlistId": "…", "direction": "up" | "down" }`. Échange la position avec la voisine
éligible. 409 si l'entrée a une offre active ou est refusée, 409 si déjà en bout de file.

### 4.6 `DELETE /api/visit-waitlist?action=guide-remove&id=…`

Même effet que la suppression publique, autorisée par le code guide au lieu de l'email.

### 4.7 `GET /api/visit-waitlist?action=history&tourId=…`

Renvoie l'historique (§5), le plus récent d'abord, 100 entrées max.

## 5. Historique des actions

Nouveau nœud RTDB `waitlistHistory/{tourId}/{entryId}` :

```json
{ "at": "2026-09-19T15:33:00Z", "guideCode": "…", "guideName": "…",
  "action": "offer" | "resend" | "register" | "add" | "reorder" | "remove",
  "waitlistId": "…", "target": "prénom nom", "details": "hors rang (3 personnes doublées)" }
```

- Écrit par chaque endpoint du §4 (sauf les GET), après le succès de l'opération.
- `guideName` résolu comme ailleurs via `visit-tours?action=guide-names`.
- Affiché dans la modale sous un accordéon « Historique » (replié par défaut), et dans l'onglet
  visite filtré sur la visite.
- Conservation : pas de purge automatique dans cette itération ; le volume est faible (quelques
  dizaines d'entrées par saison).
- Les règles Firebase doivent interdire la lecture publique de ce nœud (données nominatives) —
  à ajouter dans [firebase-database-rules.json](../firebase-database-rules.json).

## 6. Export CSV

Bouton `📥 Exporter la file (CSV)` dans la modale globale (et dans l'onglet visite, limité à la
visite). Généré **côté client** à partir des données déjà chargées, pas d'endpoint dédié.

Colonnes : `visite, date, position, prénom, nom, email, places, accompagnants, état, offre envoyée le, expire le`.
Séparateur `;` et BOM UTF-8 (ouverture directe dans Excel FR). Nom de fichier :
`file-attente-YYYY-MM-DD.csv`. Respecte les filtres actifs.

Indépendant du bouton « Exporter inscriptions » du dashboard, qui garde sa propre spec (§9).

## 7. Impacts

- `GuideDashboard.tsx` : nouvelle modale, nouvelle prop `guideCode` (déjà disponible dans
  `GuidePortal`, à passer au dashboard), callback `onWaitlistChanged` → `fetchTours` pour
  rafraîchir le compteur « En attente » et `waitlistCounts`.
- `GuidePortal.tsx` : `WaitlistList` passe en mode actionnable via `WaitlistActions`.
- Nouveau composant partagé `src/components/WaitlistActions.tsx`.
- RTDB : nouveau nœud `waitlistHistory` + règles de sécurité. Aucun changement sur
  `waitlist` / `registrations`.

## 8. Tests

Stratégie : la logique à risque est côté API (capacité, FIFO, idempotence, réordonnancement),
l'UI est surtout de l'affichage. Priorité aux tests d'intégration API, plus quelques tests de
composant.

- **Intégration API** (`api/visit-waitlist.guide.test.ts`, style des tests existants) :
  - `action=all` sans code guide → 401 ; avec code → visites à venir uniquement.
  - `action=offer` sur entrée déjà offerte → 409 ; `resend: true, extend: false` → 200 et
    `invitationExpiresAt` inchangé ; `extend: true` → expiration repoussée de 24H.
  - `action=offer` quand `freePlaces < places` → 409, **aucune écriture DB**.
  - `action=offer` hors rang → l'entrée de rang supérieur n'est pas modifiée.
  - `action=offer` sur entrée rejetée → `rejectedAt` effacé, position d'origine conservée,
    suivantes décalées.
  - `action=register` → inscription `confirmé`, entrée soft-deleted, pas de dépassement de
    capacité ; second appel → pas de doublon.
  - `action=add` avec email déjà en file ou déjà inscrit → 409.
  - `action=reorder` sur entrée avec offre active → 409 ; en bout de file → 409 ;
    cas nominal → positions échangées, aucune autre entrée touchée.
  - `guide-remove` sur entrée avec offre active → suivant promu (assertion sur `promoteWaitlist`) ;
    second appel → 410.
  - Chaque action écrit une ligne d'historique ; un échec (409) n'en écrit aucune.
- **Composant** (`GuideDashboard.test.tsx`, déjà existant) :
  - clic sur le bouton → modale ouverte, appel `action=all` effectué ;
  - file vide → message d'état vide ;
  - « Proposer la place » désactivé quand `freePlaces` insuffisant ;
  - entrée refusée rendue grisée et sans flèches de réordonnancement ;
  - export CSV : contenu généré conforme aux filtres actifs (test unitaire de la fonction de
    sérialisation, pas du téléchargement).
- **Non-régression** : le total « En attente » du dashboard diminue après un retrait et après une
  inscription directe.
- Pas de test E2E dédié : le parcours d'acceptation d'offre est déjà couvert par
  [TEST-waitlist-promotion.md](TEST-waitlist-promotion.md).

## 9. Hors périmètre

Les deux autres boutons « à implémenter » du même bloc — `📋 Voir appels du jour` et
`📥 Exporter inscriptions` — ne sont pas couverts ici ; ils méritent leur propre spec.
