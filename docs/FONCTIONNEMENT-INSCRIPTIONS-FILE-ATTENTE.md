# Fonctionnement réel : Inscriptions & File d'attente

> Ce document décrit le comportement **effectivement implémenté** dans le code (par opposition à
> [SPECS-visites-guidees.md](SPECS-visites-guidees.md), qui est le cahier des charges d'origine).
> À tenir à jour à chaque changement de logique métier sur inscriptions/waitlist.

Fichiers clés :
- [api/visit-register.ts](../api/visit-register.ts) — inscription, confirmation, annulation
- [api/visit-emails.ts](../api/visit-emails.ts) — jobs cron (rappels, expiration, promotion waitlist)
- [api/_visit-db.ts](../api/_visit-db.ts) — accès RTDB, calcul des places
- [api/_token.ts](../api/_token.ts) — tokens de validation/invitation (signés, TTL embarqué)

---

## 1. Statuts d'une inscription (`Registration.status`)

```
attente_validation → confirmé → présent
                   ↘         ↘ absent
                     annulé
```

- `attente_validation` — vient de s'inscrire, email de confirmation envoyé, lien valide 24H
- `confirmé` — a cliqué le lien de validation
- `présent` / `absent` — pointage par le guide le jour J
- `annulé` — annulation user, expiration non confirmée, ou surnombre

Une entrée `waitlist` a un cycle séparé : `position` (en attente, pas encore offerte) →
`invitationSentAt` set (offre envoyée, 24H pour répondre) → soit acceptée (devient une
`Registration` `confirmé`) soit `rejectedAt` set (expirée/refusée, passe au suivant).

---

## 2. Règle de capacité — qu'est-ce qui "occupe" une place ?

`rtdbCountRegisteredByTour(tourId)` ([api/_visit-db.ts:161](../api/_visit-db.ts:161)) compte les
places occupées. Compte une place si :

- `status === "confirmé"` ou `"présent"` — toujours
- `status === "attente_validation"` **ET** `validationExpiresAt > maintenant` — la place est
  réservée pendant les 24H de délai de confirmation email

Une fois `validationExpiresAt` dépassé, la place n'est **plus comptée** (même si le statut DB
dit encore `attente_validation` — voir §4, le ménage DB peut être en retard sur le calcul).

`rtdbCountWaitlistedPlaces(tourId)` ([api/_visit-db.ts](../api/_visit-db.ts)) compte les places
réservées par TOUTE la file d'attente non rejetée — offre envoyée ou pas (voir §6.7). Une entrée
`rejectedAt` set (offre expirée/déclinée) ne compte plus, elle a rendu son rang.

**Formule utilisée à l'inscription** ([api/visit-register.ts](../api/visit-register.ts)) :

```
hasSpace = registeredPlaces + waitlistedPlaces + groupSize(nouvelle inscription) <= capacity
```

Si `hasSpace` → inscription directe (`attente_validation`). Sinon → file d'attente.

`rtdbCountPendingWaitlistOffers(tourId)` ([api/_visit-db.ts:284](../api/_visit-db.ts:284)) reste
utilisée ailleurs, uniquement par l'algorithme de **promotion** (`promoteWaitlist` /
`promoteFromWaitlist`) pour calculer les places libres à offrir — voir §6.7.

---

## 3. Places restantes affichées (`placesLeft`)

`GET /api/visit-tours` ([api/visit-tours.ts:123](../api/visit-tours.ts:123)) calcule
`placesLeft = capacity - registeredPlaces`. Comme `registeredPlaces` exclut déjà les
`attente_validation` expirées (§2), l'affichage est **toujours à jour en lecture**, même si le
ménage DB (annulation formelle du statut) n'a pas encore tourné. Aucune action utilisateur ne
peut donc voir un nombre de places faux à cause d'un délai de cron.

---

## 4. Qui "nettoie" les inscriptions expirées, et quand ?

Le calcul de capacité (§2, §3) ignore déjà les pendings expirées en lecture — mais leur
**statut DB** reste `attente_validation` tant que rien ne l'annule formellement, et tant que
personne n'a été promue de la file d'attente. Deux déclencheurs, redondants par design :

### a) Déclencheur "lazy" — à chaque tentative d'inscription
[api/visit-register.ts:201-209](../api/visit-register.ts:201) : avant de calculer `hasSpace`
pour un nouvel inscrit sur un tour, on scanne les inscriptions de **ce tour uniquement** :
- `attente_validation` + `validationExpiresAt` dépassé → `status: "annulé"`
- pour chaque place ainsi libérée → appelle `promoteWaitlist(tourId)`
  ([api/visit-register.ts:367](../api/visit-register.ts:367)) qui envoie une offre email
  immédiate à la personne suivante en file d'attente (24H pour répondre)

Ciblé (un seul tour), déclenché uniquement par une écriture (POST), jamais par lecture publique
(`GET /api/visit-tours` ne fait aucun scan ni écriture — évite coût/abus sur route publique
haute fréquentation).

### b) Filet de sécurité — cron quotidien `promote-waitlist`
[api/visit-emails.ts](../api/visit-emails.ts), job `promoteFromWaitlist()`, exécuté chaque jour
à 02:00 (`vercel.json`, plan Hobby = 1 cron/jour max). Appelle d'abord
`expirePendingRegistrations()` (même logique que §4a mais sur **tous les tours**), puis
promeut la file d'attente pour toutes les places libres restantes. Couvre le cas où un tour a une
place libérée par expiration mais que personne ne retente de s'inscrire dessus (donc le
déclencheur lazy ne se déclenche jamais).

**Pourquoi les deux** : le lazy donne une réaction immédiate à la file d'attente sans dépendre
du cron (qui ne tourne qu'une fois/jour sur plan gratuit) ; le cron garantit que rien ne reste
bloqué indéfiniment si le lazy ne se déclenche jamais.

---

## 5. Exemple complet — 3 personnes

**Contexte** : tour complet. A inscrite plus tôt (`attente_validation`, jamais confirmé, token
expiré). B en file d'attente position #1, aucune offre envoyée. C tente de s'inscrire maintenant.

1. C soumet le formulaire → `POST /api/visit-register`
2. Sweep ciblé sur ce tour ([api/visit-register.ts:201](../api/visit-register.ts:201)) :
   trouve A expirée → `status: "annulé"` → appelle `promoteWaitlist(tourId)`
3. `promoteWaitlist` envoie une offre email à B, marque `invitationSentAt` +
   `invitationExpiresAt` (+24H)
4. Calcul `hasSpace` pour C : la place libérée par A est maintenant comptée dans
   `pendingWaitlistPlaces` (offre active de B) → `hasSpace = false`
5. C part en file d'attente, position après B (jamais devant)

**Dénouement possible** :
- B clique le lien dans les 24H → `confirm` endpoint le passe `confirmé` (place prise)
- B ne répond pas → le cron `promote-waitlist` du lendemain détecte l'offre expirée
  (`rejectedAt` set), passe au suivant en file (C, s'il n'y a personne entre les deux)
- Si A clique son (vieux) lien de validation après expiration : le token est auto-expirant
  ([api/_token.ts:78](../api/_token.ts:78), timestamp signé dans le token, indépendant du
  statut DB) → rejeté avec "token expired" même si le ménage DB n'a pas encore tourné

---

## 6. Règles à retenir pour tout futur changement

1. **Ne jamais compter une `attente_validation` expirée** comme occupant une place — ni dans
   `rtdbCountRegisteredByTour`, ni dans `placesLeft`. C'est ce qui permet l'affichage temps réel
   sans dépendre du cron.
2. **Toute libération de place doit appeler `promoteWaitlist(tourId)` immédiatement** (annulation
   manuelle, expiration détectée en lazy, ou cron) — jamais laisser une place "silencieusement"
   libre pendant que des gens attendent en file. Sinon un nouvel inscrit peut doubler la file.

   **Corollaire (bug corrigé) : `promoteWaitlist` doit ignorer qui a déjà une offre active.**
   Si deux places se libèrent avant qu'une seule offre soit acceptée/refusée (ex: une expiration
   lazy suivie d'une annulation), l'algorithme naïf "prendre la position #1" relance sans arrêt
   la même personne (déjà offerte, pas encore répondue) au lieu d'offrir la 2e place libre à la
   personne suivante — celle-ci reste bloquée jusqu'à ce que la première réponde ou que son
   délai expire (24H), alors qu'une place lui est en réalité disponible tout de suite.
   `promoteWaitlist` doit donc recalculer les places libres (`capacity - confirmé - offres en
   cours`) et parcourir les candidats **sans offre active**, comme le fait déjà le cron
   `promoteFromWaitlist`.
3. **Le sweep d'expiration doit rester scopé à un seul tour** quand déclenché depuis une route
   publique à fort trafic (`GET /api/visit-tours`) — jamais de scan global ni d'écriture depuis
   une lecture publique anonyme (coût + risque d'abus).
4. **Plan Vercel Hobby = 1 cron/jour max.** Toute nouvelle vérification périodique doit soit se
   greffer sur un cron existant (comme `expirePendingRegistrations()` fait dans
   `promoteFromWaitlist()`), soit être déclenchée en lazy depuis un endpoint existant — pas de
   nouveau cron dédié sans vérifier le plan.
5. **Le token de validation/invitation porte sa propre expiration** (signée, dans le payload) —
   il expire indépendamment du statut DB. Ne jamais se fier uniquement au statut DB pour rejeter
   un lien expiré ; `verifyRegistrationToken` doit toujours être appelé en premier.
6. **La règle 2 (toujours appeler `promoteWaitlist`) s'applique à TOUT point d'entrée qui libère
   une place, pas seulement l'annulation/expiration côté inscription** (bugs corrigés) :
   - `DELETE /api/visit-waitlist` ([api/visit-waitlist.ts](../api/visit-waitlist.ts)) — annuler
     sa propre file d'attente alors qu'on a déjà une offre active libère cette place ; il faut
     promouvoir le suivant, pas seulement réordonner les positions.
   - `POST /api/visit-register?action=gdpr` ([api/visit-register.ts](../api/visit-register.ts)) —
     supprimer les données d'une personne qui occupait une place (confirmée, en attente de
     validation non expirée, ou avec une offre active) doit promouvoir la file d'attente du/des
     tour(s) concerné(s), pas juste soft-delete silencieusement.
7. **Toute entrée en file d'attente, même SANS offre envoyée, réserve sa place — pas de saut de
   rang.** `hasSpace` (inscription d'un nouvel arrivant) compte
   `registeredPlaces + rtdbCountWaitlistedPlaces` où `rtdbCountWaitlistedPlaces`
   ([api/_visit-db.ts](../api/_visit-db.ts)) additionne `placesOf` de TOUTE entrée waitlist non
   rejetée (offre envoyée ou pas). Un groupe en position #1 qui ne rentrait pas au moment de son
   inscription reste donc prioritaire : un plus petit groupe/solo arrivé après lui ne peut plus le
   doubler juste parce qu'il rentre dans la capacité brute restante. Ancien comportement (corrigé
   sur demande explicite) : seules les offres actives réservaient une place, ce qui permettait ce
   saut de rang — jugé contre-intuitif, éliminé.

   **Important : `promoteWaitlist`/`promoteFromWaitlist` ne doivent PAS utiliser
   `rtdbCountWaitlistedPlaces` pour leur propre calcul de places libres.** Ces fonctions décident
   qui promouvoir PARMI les gens déjà en attente ; elles calculent `freeSlots = capacity -
   confirmé - offres actives` (candidats sans offre exclus du calcul), sinon un candidat se
   réserverait contre lui-même et `freeSlots` ne serait jamais positif.

---

## 7. Couverture de tests

[src/services/visitRegistrationFlow.test.ts](../src/services/visitRegistrationFlow.test.ts) —
tests d'intégration contre une RTDB simulée en mémoire (mock de `api/_firebase.ts`), temps
accéléré via fake timers. Couvre : groupes/accompagnants et équité FIFO (§6.7), contournement
guide volontaire, les deux bugs corrigés au §6.6, anti-abus (doublon, max 3 visites confirmées
Q7, reset après annulation), et un cycle complet multi-personnes vérifiant que la capacité
n'est jamais dépassée hors override guide.
