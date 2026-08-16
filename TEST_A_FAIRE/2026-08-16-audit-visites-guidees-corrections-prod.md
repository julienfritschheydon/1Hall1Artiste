# Test manuel — Corrections audit Visites Guidées (parcours complet A→Z, production)

**Date** : 2026-08-16
**Branche** : `main` (PR #23 mergée, déployée en production)
**URL** : https://www.1hall1artiste.fr
**Portail guide** : `/#/guide` (code d'accès annuel nécessaire)

## Préparation (5 min)

- [ ] Prévoir **3 adresses email réelles** consultables. Astuce Gmail : les alias `+` comptent comme des emails distincts pour l'app (`julien.fritsch+v1@gmail.com`, `+v2`, `+v3`) mais arrivent dans la même boîte.
- [ ] Se connecter au portail guide (`/#/guide`) avec le vrai code.
- [ ] **Créer une visite de test** : titre `TEST AUDIT — ne pas s'inscrire`, **capacité 2**, durée 60 min, un créneau du week-end du festival. La petite capacité permet de tester la file d'attente à 3 personnes.
- [ ] Garder un onglet sur la boîte mail — presque chaque étape envoie un email.

> ⚠️ Certains messages d'erreur serveur s'affichent encore en anglais brut (`already registered for this tour`, `already in waitlist for this tour`) — c'est attendu, pas un bug.

---

# 1. PARCOURS VISITEUR — consultation & inscription

## 1.1 Liste et détail (`/#/reservations`)

- [ ] Les visites sont groupées par **jour** puis **créneau horaire**, la visite de test apparaît
- [ ] Ouvrir la visite de test : **« Places restantes : 2/2 »**, départ affiché, labels
- [ ] Depuis l'onglet **Programme** : ouvrir la même visite dans le modal → mêmes infos
- [ ] Modal : **cliquer en dehors** (sur le fond sombre) → le modal **se ferme** *(corrigé — avant, seul le X fonctionnait)*

## 1.2 Première inscription (email V1)

- [ ] Formulaire : email V1, prénom, nom → **"S'inscrire"**
- [ ] Message : **« Vérifiez votre email pour valider votre inscription. »**
- [ ] **"Faire une autre inscription"** → le compteur affiche maintenant **« Places restantes : 1/2 »** *(corrigé — avant, l'ancien chiffre restait affiché)*
- [ ] Email reçu « Confirmation — TEST AUDIT… » : **l'heure affichée est l'heure française réelle de la visite** (pas −2h) *(corrigé — avant, 14h s'affichait « 12:00 »)*
- [ ] Cliquer **"Valider mon inscription"** → page « Inscription confirmée ! »
- [ ] **Recharger la page du lien** → toujours un succès (« déjà confirmée »), pas d'erreur

## 1.3 Accompagnants et bascule en file d'attente

- [ ] Nouvelle inscription (email V2) : il reste 1 place. **Ajouter 1 accompagnant** → possible *(corrigé — avant, impossible d'ajouter un accompagnant quand il restait 1 place)*
- [ ] Un bandeau ambre apparaît : **« Votre groupe (2 personnes) dépasse les places restantes (1)… liste d'attente »** et le bouton devient **"Rejoindre la liste d'attente"**
- [ ] Soumettre → message **« Visite complète — vous êtes #1 en file d'attente »**
- [ ] Email « File d'attente — TEST AUDIT… » reçu (position #1)
- [ ] Retenter la même soumission avec **le même email V2** → erreur `already in waitlist for this tour` *(corrigé — avant, on pouvait s'ajouter deux fois)*
- [ ] S'inscrire avec l'email V3 (solo) → part aussi en file, **position #2** (le groupe V2 réserve son rang)

---

# 2. FILE D'ATTENTE — le cœur des corrections

## 2.1 Libération de place → offre immédiate

- [ ] Retrouver l'email de confirmation V1 → cliquer **"Annuler mon inscription"**
- [ ] La page demande de **confirmer l'email** → saisir V1 → « Inscription annulée »
- [ ] Email « Annulation — … » reçu sur V1
- [ ] **Dans les minutes qui suivent** : email « Une place s'est libérée — … » reçu sur **V2** (premier de la file)

## 2.2 Acceptation de l'offre ⭐ (bug critique corrigé)

- [ ] Cliquer **"Accepter ma place"** dans l'email V2
- [ ] La page affiche **« Place confirmée ! Votre inscription est validée. »** *(corrigé — avant, ce lien affichait « registration not found » et la place était perdue)*
- [ ] **Recharger la même page** → toujours « Inscription déjà confirmée », **pas de doublon** *(corrigé — avant, chaque rechargement créait une inscription en double)*
- [ ] Côté guide : l'onglet **Inscrits** montre V2 **une seule fois**, statut `confirmé`

## 2.3 Intégrité de la file ⭐ (perte silencieuse corrigée)

- [ ] V3 est toujours en file (visible côté guide, onglet **File d'attente (1)**)
- [ ] S'inscrire avec un 4ᵉ email → part en file → côté guide, la file affiche **V3 ET le nouveau** *(corrigé — avant, un nouvel arrivant pouvait écraser un inscrit existant qui disparaissait sans trace)*

## 2.4 Quitter la file

- [ ] Email « File d'attente » de V3 → cliquer **"Quitter la file d'attente"**
- [ ] La page demande un **clic de confirmation** avant d'agir *(corrigé — avant, le simple chargement du lien désinscrivait, y compris via les scanners d'emails)*
- [ ] Confirmer → « Vous avez été retiré de la file d'attente »

## 2.5 Réinscription après annulation ⭐

- [ ] Avec l'email **V1** (qui a annulé en 2.1) : se réinscrire à la même visite
- [ ] L'inscription **passe** (file d'attente ou place selon l'état) *(corrigé — avant : « already registered for this tour » à vie)*

---

# 3. PORTAIL GUIDE (`/#/guide`)

## 3.1 Connexion

- [ ] Se déconnecter, puis tenter un **code bidon** (ex. `AAAABBBB1234`) → **« Code invalide »** *(corrigé — avant, n'importe quel code était accepté et le portail affichait des erreurs incompréhensibles ensuite)*
- [ ] Se connecter avec le vrai code → tableau de bord OK

## 3.2 Liste des visites

- [ ] Les visites **à venir** sont en premier (chronologique), les **terminées à la fin**
- [ ] Pendant l'heure d'une visite : badge **« En cours »** (vert) *(corrigé — avant, une visite en train de se dérouler affichait « Terminée »)* — testable le jour J ou en créant une visite qui démarre dans 2 min
- [ ] Ouvrir la visite de test : compteurs **Confirmés / Présents / Absents / File d'attente** cohérents avec les étapes précédentes (les offres refusées/expirées ne gonflent pas le compteur de file)

## 3.3 Inscription manuelle sur place

- [ ] La visite de test est pleine → **"+ Inscrire sur place"** avec un email non utilisé → l'inscription passe **ET une alerte s'affiche** : « Attention : la visite était complète… » *(corrigé — avant, aucun signal)*
- [ ] Réinscrire sur place quelqu'un qui avait **annulé** (email V1 si dispo) → passe *(corrigé)*

## 3.4 Modification de visite

- [ ] Ouvrir **"Modifier"** sur la visite de test, ne rien toucher, enregistrer → **la date ne bouge pas** *(corrigé — avant, la date pouvait être silencieusement déplacée sur le samedi du festival)*
- [ ] Augmenter la capacité (ex. 2 → 4) → si quelqu'un est en file, il reçoit une offre

---

# 4. ÉMARGEMENT (onglet Appel, jour J ou sur la visite de test)

- [ ] La feuille d'appel **ne liste pas** les inscriptions annulées *(corrigé — avant, on pouvait marquer « présent » quelqu'un d'annulé dont la place avait été redonnée)*
- [ ] Marquer un inscrit **✓ présent**, un autre **✗ absent**
- [ ] **Recharger la page** → le présent est vert **et l'absent est rouge** *(corrigé — avant, les absents redevenaient « non pointés » et on repointait tout le monde)*
- [ ] Cliquer ✓ puis ✗ rapidement sur deux lignes différentes → pas d'état incohérent, les compteurs suivent
- [ ] **Export CSV** : le fichier s'ouvre dans Excel/LibreOffice sans exécuter de formule — pour le test complet, inscrire quelqu'un avec le prénom `=1+1` : la cellule doit afficher le **texte** `=1+1`, pas `2` *(faille corrigée)*
- [ ] **Imprimer** : la feuille ne contient que les inscriptions valides

---

# 5. RGPD (`/#/reservations` → lien « Gérer / supprimer mes données »)

- [ ] Saisir l'email V2 → **"Recevoir l'email de confirmation"** → message « email envoyé »
- [ ] **Vérifier côté guide : rien n'a été supprimé à ce stade** *(corrigé — avant, la suppression était immédiate et sans vérification : n'importe qui pouvait désinscrire n'importe qui)*
- [ ] Email « Confirmez la suppression de vos données » reçu sur V2 → cliquer **"Supprimer mes données"**
- [ ] La page demande un **clic de confirmation** → confirmer → « Données supprimées : … »
- [ ] Côté guide : V2 a disparu des inscrits
- [ ] Se **réinscrire** avec V2 → possible

---

# 6. CRON QUOTIDIEN (à vérifier le lendemain matin)

- [ ] Dashboard Vercel → projet `1hall1artiste` → **Logs** vers 04:00 UTC (06:00 Paris) : une invocation `GET /api/visit-emails?type=daily` en **200** avec un JSON `{ ok: true, type: "daily", reminder7d: …, validation1d: …, promotion: …, cleanup: … }`
- [ ] Vérification à froid possible tout de suite : ouvrir `https://www.1hall1artiste.fr/api/visit-emails?type=daily` dans le navigateur → **401 `invalid authorization`** (normal sans le secret ; l'ancien code cassé répondait 405) ✅ *déjà vérifié le 16/08*

---

# Non-régression

- [ ] Carte : le point de départ des visites s'affiche, la fiche bâtiment liste les visites
- [ ] Programme : onglets, événements, modal événement OK
- [ ] Ajout au calendrier d'un **événement du festival** : l'événement est créé **au bon week-end de septembre** *(corrigé — avant : « prochain samedi » après le jour du clic)* ; sur iOS, le partage/téléchargement `.ics` propose bien Calendrier *(le faux « succès » webcal est supprimé)*
- [ ] Aucune erreur rouge dans la console navigateur sur les pages testées

# Edge cases

- [ ] Inscription avec un email invalide (`test@test`) → erreur de validation
- [ ] Coupure réseau pendant une inscription (mode avion) → message **« Erreur réseau… »** lisible, pas de `Unexpected token '<'`
- [ ] Onglet laissé ouvert sur une visite passée → l'inscription est refusée (`tour already started`) *(corrigé)*
- [ ] Mobile : formulaire, modal, portail guide utilisables en 390px de large

# Nettoyage après test

- [ ] Supprimer les inscriptions de test via RGPD (chaque email utilisé) — ou laisser la purge automatique post-visite s'en charger 24h après la date de la visite de test
- [ ] La visite de test ne peut pas être supprimée via l'UI : la dater loin dans le futur et la renommer, ou la laisser expirer

# Si tout OK

- [ ] Déplacer ce fichier dans `TEST_A_FAIRE/FAIT/`

# Si un bug

Noter : numéro de section (ex. `2.2`), URL exacte, email utilisé, capture d'écran, et les erreurs de la console navigateur (F12 → Console). Les logs serveur sont dans Vercel → projet `1hall1artiste` → Logs.
