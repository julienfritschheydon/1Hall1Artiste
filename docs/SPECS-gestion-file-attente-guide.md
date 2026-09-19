# SPEC — Bouton « Gérer file d'attente » (portail guide)

> Statut : spécification, non implémenté.
> Contexte : dans `GuideDashboard.tsx` (bloc « Actions rapides »), le bouton
> `⏳ Gérer file d'attente` fait aujourd'hui un `alert("File d'attente - à implémenter")`
> ([src/components/GuideDashboard.tsx:361](../src/components/GuideDashboard.tsx#L361)).
> Deux autres boutons du même bloc sont dans le même état (voir §7).

Référence métier : [FONCTIONNEMENT-INSCRIPTIONS-FILE-ATTENTE.md](FONCTIONNEMENT-INSCRIPTIONS-FILE-ATTENTE.md).

---

## 1. Objectif

Donner au guide une vue **transverse** (toutes visites confondues) de la file d'attente et les
actions d'exception que l'automatisation ne couvre pas : relancer une offre, retirer quelqu'un,
proposer manuellement une place.

Aujourd'hui le guide voit déjà la file **d'une seule visite** via l'onglet « File d'attente »
du détail visite (`WaitlistList`, [src/pages/GuidePortal.tsx:924](../src/pages/GuidePortal.tsx#L924)),
en lecture seule. Cette spec ajoute la vue globale + les actions.

## 2. Déclenchement / UI

Clic sur `⏳ Gérer file d'attente` → ouverture d'une **modale** (`Dialog`, même pattern que
« Inscrits multi-visites » déjà présent dans `GuideDashboard`), titre « File d'attente », largeur
`max-w-3xl`, contenu scrollable `max-h-[70vh]`.

### 2.1 En-tête

- Total : « N personnes en attente sur M visites » (places, pas entrées : un groupe de 3 compte 3).
- Filtre visite : `<select>` « Toutes les visites » + une option par visite ayant au moins une
  entrée active, libellé `titre — date`.
- Filtre état : `Tous` / `Offre en cours` / `Sans offre` / `Offre refusée ou expirée`.

### 2.2 Liste

Regroupée par visite (tri chronologique des visites), puis par `position` croissante.
Une ligne par entrée :

| Colonne | Contenu |
|---|---|
| # | `position` |
| Nom | `firstName lastName` |
| Email | `email` |
| Places | `places` (1 + accompagnants) |
| État | `Sans offre` / `Offre envoyée, expire dans Xh` / `Refusée/expirée` |
| Actions | boutons §3 |

État vide : « Aucune personne en file d'attente. »

Sur mobile (< 640px) : cartes empilées au lieu du tableau, mêmes informations.

## 3. Actions

Toutes les actions demandent une confirmation (`window.confirm`, comme l'annulation d'inscription
existante), affichent un état `loading` sur le bouton, puis rafraîchissent la liste et les compteurs
du dashboard.

| Action | Visible quand | Effet |
|---|---|---|
| **Proposer la place** | entrée sans offre ET places libres ≥ places de l'entrée | envoie l'offre (token 24H) à cette entrée, hors ordre FIFO si le guide le décide |
| **Relancer l'offre** | offre en cours | renvoie le même email d'offre, sans prolonger `invitationExpiresAt` |
| **Retirer de la file** | toujours | soft-delete + réordonnancement + email `waitlist_left` + promotion du suivant si l'entrée avait une offre active |

Règles :

- **Jamais de dépassement de capacité** : « Proposer la place » est désactivé (avec tooltip
  « Plus de place libre ») si `capacity - registeredPlaces - pendingOfferPlaces < places`.
- « Proposer la place » hors rang est autorisé mais **journalisé** (`console.log` côté API,
  préfixe `[waitlist][guide]`) : c'est une dérogation manuelle au FIFO documenté au §6.7 du doc
  de fonctionnement.
- Le retrait réutilise exactement la logique de `handleDeleteWaitlist` (soft-delete →
  `rtdbWaitlistReorderAfter` → `promoteWaitlist` si offre active) pour ne pas diverger.

## 4. API

Les endpoints publics existants ne suffisent pas : `DELETE /api/visit-waitlist` exige l'email du
titulaire, et aucun endpoint ne permet d'envoyer une offre manuellement.

Ajouts dans [api/visit-waitlist.ts](../api/visit-waitlist.ts), tous protégés par
`x-guide-code` (`rtdbGuideCodeValidate`, 401 si invalide — même contrat que le GET guide) :

### 4.1 `GET /api/visit-waitlist?action=all`

Réponse :

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

Ne renvoie que les visites à venir et non annulées, et uniquement celles ayant ≥ 1 entrée active.
Sans `x-guide-code` valide : 401 (pas de version anonymisée, ces données sont nominatives).

### 4.2 `POST /api/visit-waitlist?action=offer`

Body `{ "waitlistId": "…", "resend": false }`.

- `resend: false` → crée le token (`createRegistrationToken`), écrit `invitationToken`,
  `invitationSentAt`, `invitationExpiresAt`, envoie l'email d'offre.
- `resend: true` → renvoie l'email avec le token existant, sans toucher aux dates
  (`idempotencyKey` distinct pour ne pas être dédupliqué par `sendRegistrationEmail`).
- 409 si l'entrée a déjà une offre active et `resend` est absent/false.
- 409 si les places libres sont insuffisantes (recalcul serveur, la vérification UI ne fait pas foi).
- 410 si l'entrée est soft-deleted, 404 si inconnue.

### 4.3 `DELETE /api/visit-waitlist?action=guide-remove&id=…`

Même effet que la suppression publique mais autorisée par le code guide au lieu de l'email.

## 5. Impacts

- `GuideDashboard.tsx` : nouvelle modale + nouvelle prop `guideCode` (déjà disponible dans
  `GuidePortal`, à passer au dashboard) ; le compteur « En attente » de la carte stats et
  `waitlistCounts` doivent être rafraîchis après action (callback `onWaitlistChanged` →
  `fetchTours`).
- Aucun changement de schéma RTDB.
- `WaitlistList` du détail visite reste en lecture seule (pas de duplication d'actions
  dans cette itération).

## 6. Tests

Stratégie : la logique à risque est côté API (capacité, FIFO, idempotence), l'UI est surtout de
l'affichage. Donc priorité aux tests d'intégration API, plus quelques tests de composant.

- **Intégration API** (fichier `api/visit-waitlist.guide.test.ts`, style des tests existants) :
  - `action=all` sans code guide → 401 ; avec code → visites à venir uniquement.
  - `action=offer` sur entrée déjà offerte → 409 ; avec `resend: true` → 200 et
    `invitationExpiresAt` inchangé.
  - `action=offer` quand `freePlaces < places` → 409, aucune écriture DB.
  - `action=offer` hors rang → l'entrée de rang supérieur n'est pas modifiée.
  - `guide-remove` sur entrée avec offre active → suivant promu (assertion sur `promoteWaitlist`).
  - `guide-remove` deux fois → 410 au second appel.
- **Composant** (`GuideDashboard.test.tsx`, déjà existant) :
  - clic sur le bouton → modale ouverte, appel `action=all` effectué ;
  - file vide → message d'état vide ;
  - « Proposer la place » désactivé quand `freePlaces` insuffisant.
- **Non-régression** : les compteurs `waitlistCounts` du dashboard restent cohérents après
  une action (le total « En attente » diminue après un retrait).
- Pas de test E2E dédié : le parcours d'acceptation d'offre est déjà couvert par
  [TEST-waitlist-promotion.md](TEST-waitlist-promotion.md).

## 7. Hors périmètre

Les deux autres boutons « à implémenter » du même bloc — `📋 Voir appels du jour` et
`📥 Exporter inscriptions` — ne sont pas couverts ici ; ils méritent leur propre spec.
