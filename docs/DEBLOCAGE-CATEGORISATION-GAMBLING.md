# Débloquer la catégorie « Jeux d'argent » — Marche à suivre

## Contexte

Certains réseaux d'entreprise (ex. groupe Lenze, via le filtre **BHN Services**) bloquent
`https://www.1hall1artiste.fr/` en le classant à tort dans la catégorie **« Jeux d'argent »
(Gambling)**.

Le site est **propre** (aucune injection de spam, contenu 100 % culturel). Le blocage est un
**faux positif** de la base de catégorisation d'URL, probablement déclenché par le motif du nom
de domaine (`1hall1artiste` = chiffre-mot-chiffre-mot, comme les sites de paris type `1xbet`)
sur un `.fr` peu/pas catégorisé.

On ne peut pas modifier directement le filtre de Lenze. La solution qui dépend de nous :
**(1) rendre le contenu non ambigu pour les robots**, puis **(2) demander la re-catégorisation
dans les bases de données** que ces filtres utilisent. Une re-soumission relance un crawl
automatique : si la page lit clairement « culture / patrimoine », elle est reclassée.

---

## Étape 0 — Déployer d'abord les corrections de code ✅ (fait côté code)

Des améliorations ont été faites dans `index.html` (branche `claude/code-review-gn5699`) :

- `lang="en"` → **`lang="fr"`**
- `og:url` / `og:image` corrigés vers **`https://www.1hall1artiste.fr/`** (au lieu d'un vieux `github.io`)
- Ajout d'un **`<link rel="canonical">`** vers le vrai domaine
- Ajout de **données structurées Schema.org** (`NGO` / organisation culturelle) + `keywords`

> ⚠️ **Important : fusionner la PR et laisser Vercel redéployer AVANT de soumettre les demandes.**
> Les robots des éditeurs doivent crawler la **nouvelle** version pour voir le contenu culturel.
> Vérifier après déploiement : ouvrir la source de `https://www.1hall1artiste.fr/` et confirmer
> que `lang="fr"`, le `canonical` et le bloc `application/ld+json` sont présents.

---

## Étape 1 — Informations à utiliser (copier-coller)

| Champ | Valeur |
|---|---|
| **URL à soumettre** | `https://www.1hall1artiste.fr/` |
| **URL secondaire** | `https://1hall1artiste.fr/` (sans `www`) |
| **Catégorie actuelle (erronée)** | Gambling / Jeux d'argent |
| **Catégorie demandée** | **Art / Culture** (ou « Society », « Non-profit / Association » selon l'éditeur) |

**Texte de justification (FR)** — à coller dans le champ commentaire :

> Le site www.1hall1artiste.fr est le site officiel du Collectif Feydeau, une association
> culturelle à but non lucratif basée à Nantes (France). Il présente des événements culturels
> et patrimoniaux sur l'Île Feydeau : expositions, concerts, visites guidées et animations
> artistiques. Il n'y a aucun contenu de jeux d'argent, de paris ou de casino. Le classement
> actuel en « Gambling / Jeux d'argent » est erroné. Merci de le reclasser en « Art / Culture »
> (ou « Society / Non-profit »).

**Justification (EN)** — pour les portails en anglais :

> www.1hall1artiste.fr is the official website of Collectif Feydeau, a non-profit cultural
> association based in Nantes, France. It lists cultural and heritage events on Île Feydeau:
> art exhibitions, concerts, guided tours and artistic activities. There is no gambling,
> betting or casino content of any kind. The current "Gambling" classification is incorrect.
> Please reclassify it as "Art / Culture" (or "Society / Non-profit").

---

## Étape 2 — Soumettre sur les portails (self-service, ~10 min)

On ne sait pas quel éditeur Lenze/BHN utilise → **soumettre sur tous**. Chaque portail est gratuit,
sans compte (CAPTCHA possible). Coller l'URL, choisir la catégorie ci-dessous, coller la justification.

| # | Éditeur | Lien | Catégorie à demander |
|---|---|---|---|
| 1 | **Palo Alto** | https://urlfiltering.paloaltonetworks.com/ | *Entertainment and Arts* |
| 2 | **Symantec / BlueCoat (Broadcom)** | https://sitereview.bluecoat.com/ | *Art / Culture / Heritage* |
| 3 | **Forcepoint** | https://csi.forcepoint.com/ | *Cultural Institutions* |
| 4 | **Fortinet FortiGuard** | https://www.fortiguard.com/webfilter | *Arts and Culture* |
| 5 | **Zscaler** | https://sitereview.zscaler.com/ | *Society and Lifestyle* (ou *Art/Culture*) |
| 6 | **Cisco Talos / Umbrella** | https://talosintelligence.com/reputation_center/ | *Arts* |

> 💡 Sur chaque portail : taper d'abord l'URL pour voir la **catégorie actuelle**. Si elle indique
> déjà « Gambling », cliquer sur « Request change / Suggest a different category / Submit a
> dispute », choisir la catégorie du tableau et coller la justification.

---

## Étape 3 — Demander à Lenze (en parallèle)

Écrire au support indiqué sur la page de blocage pour (a) un déblocage immédiat de leur côté et
(b) savoir **quel éditeur de filtrage** ils utilisent (ça permet de cibler la bonne base) :

- **Email** : `serviceline@bhn-services.com`
- **Portail** : https://lenzegroup.service-now.com/esc

**Message type :**

> Bonjour, votre filtre web bloque le site https://www.1hall1artiste.fr/ en le classant en
> « Jeux d'argent ». Il s'agit du site d'une association culturelle nantaise (Collectif Feydeau,
> événements artistiques et patrimoniaux), sans aucun contenu de jeux d'argent. Pourriez-vous
> débloquer ce domaine et, si possible, m'indiquer le fournisseur de filtrage d'URL utilisé afin
> que je fasse corriger la catégorie à la source ? Merci.

---

## Étape 4 — Vérifier (après 3 à 14 jours)

- Re-tester l'URL sur les portails de l'étape 2 : la catégorie doit être passée à Art/Culture.
- Re-tester l'accès depuis le réseau Lenze.
- Si toujours bloqué après 2 semaines : relancer la soumission sur l'éditeur identifié à
  l'étape 3, en mentionnant la date de la première demande.

---

## Récapitulatif

| Tâche | Qui | État |
|---|---|---|
| Corrections `index.html` (lang, canonical, OG, JSON-LD) | Code / PR | ✅ Fait |
| Fusionner la PR + redéploiement Vercel | Toi | ⬜ À faire |
| Soumettre les 6 portails de re-catégorisation | Toi | ⬜ À faire |
| Email à BHN / Lenze | Toi | ⬜ À faire |
| Vérification à J+3 à J+14 | Toi | ⬜ À faire |
