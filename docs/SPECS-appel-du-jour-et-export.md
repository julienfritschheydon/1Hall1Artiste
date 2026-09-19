# SPEC — Boutons « Voir appels du jour » et « Exporter inscriptions » (portail guide)

> Statut : spécification, non implémenté.
> Les deux boutons du bloc « Actions rapides » de `GuideDashboard.tsx` font aujourd'hui un
> `alert("… à implémenter")`
> ([src/components/GuideDashboard.tsx:347](../src/components/GuideDashboard.tsx#L347) et
> [:355](../src/components/GuideDashboard.tsx#L355)).
>
> Le troisième bouton du bloc a sa propre spec :
> [SPECS-gestion-file-attente-guide.md](SPECS-gestion-file-attente-guide.md).

---

## 0. Ce qui existe déjà — et pourquoi ça change tout

Le détail d'une visite expose déjà deux boutons fonctionnels
([src/pages/GuidePortal.tsx:618](../src/pages/GuidePortal.tsx#L618)) :

- `printAttendance(tour, registrations)` ([:1028](../src/pages/GuidePortal.tsx#L1028)) — ouvre un
  onglet avec une feuille d'appel HTML (cases à cocher, nom, prénom, accompagnants) et lance
  l'impression ;
- `exportCSV(tour, registrations)` ([:1074](../src/pages/GuidePortal.tsx#L1074)) — télécharge le
  CSV des inscrits de la visite (BOM UTF-8, séparateur `,`, échappement via
  [`escapeCsvCell`](../src/utils/csv.ts)).

Les deux boutons du dashboard n'ont donc **pas à réinventer le rendu** : ce qui manque est
l'**agrégation sur plusieurs visites** et le point d'entrée depuis le dashboard. C'est le cœur de
cette spec, et ça la rend nettement plus petite qu'elle n'en a l'air.

Conséquence directe : les deux fonctions sont extraites de `GuidePortal.tsx` vers
`src/utils/guideExport.ts`, généralisées pour accepter **plusieurs visites**, et réutilisées aux
deux endroits. Le comportement par visite doit rester identique — c'est un refactor à iso-sortie,
couvert par des tests de caractérisation (§4).

---

# A. Bouton « 📋 Voir appels du jour »

## A.1 Objectif

Le jour J, le guide veut une feuille d'appel par visite du jour, imprimable d'un coup, sans
ouvrir chaque visite une par une. C'est un usage papier : on imprime le matin, on coche au stylo,
on ressaisit éventuellement le soir via l'onglet « Appel » existant.

## A.2 Comportement

Clic → modale « Appels du jour », avec la date du jour et la liste des visites concernées.

**Périmètre par défaut : les visites d'aujourd'hui**, non annulées, triées par heure. Un sélecteur
de date permet de viser un autre jour (typiquement demain, pour préparer la veille au soir).

Pour chaque visite : titre, heure, guide(s), nombre de personnes attendues, et un bouton
`Imprimer`. En tête de modale, un bouton `🖨️ Tout imprimer` génère **un seul document** avec une
feuille par visite, séparées par un saut de page CSS (`page-break-after: always`).

Aucune visite ce jour-là → « Aucune visite prévue le <date>. » et boutons d'impression désactivés.

## A.3 Contenu d'une feuille

Identique à l'existant `printAttendance` (case à cocher, nom, prénom, accompagnants ; en-tête avec
titre, date/heure, nombre de personnes attendues, guides), avec deux ajouts :

- une ligne « Places libres : X/Y » sous l'en-tête, utile sur place pour accepter des visiteurs
  spontanés ;
- les personnes en **file d'attente avec offre en cours** listées dans un second tableau grisé
  « En attente (offre envoyée) », après un intertitre. Le guide sait ainsi qui peut légitimement
  se présenter en pensant avoir une place.

Qui apparaît sur la feuille : les inscriptions retenues par `holdsSeat`
([api/visit-attendance.ts:22](../api/visit-attendance.ts#L22)) — donc ni les annulées, ni les
supprimées RGPD, ni les `attente_validation` expirées. Cette règle existe déjà côté serveur et
ne doit pas être réimplémentée côté client.

## A.4 Données

Pas de nouvel endpoint. La modale appelle, pour chaque visite du jour :
`GET /api/visit-attendance?tourId=…` et `GET /api/visit-waitlist?tourId=…`, en parallèle
(`Promise.all`), avec le header `x-guide-code` — exactement le pattern déjà utilisé par
`GuidePortal.refresh()` ([:577](../src/pages/GuidePortal.tsx#L577)).

Un jour comporte au plus quelques visites : le fan-out est acceptable et évite un endpoint de
plus. Si le nombre de visites par jour devait dépasser la dizaine, un
`GET /api/visit-attendance?date=YYYY-MM-DD` deviendrait justifié — pas avant.

Erreur 401 sur l'un des appels → retour au login via `onAuthError`, comme ailleurs.

---

# B. Bouton « 📥 Exporter inscriptions »

## B.1 Objectif

Sortir un CSV de **toutes** les inscriptions, toutes visites confondues, pour l'ouvrir dans Excel
ou Google Sheets : bilan de saison, publipostage, contrôle croisé.

## B.2 Comportement

Clic → petite modale d'options plutôt qu'un téléchargement immédiat, parce que le périmètre par
défaut n'est pas évident :

- **Périmètre** : `Visites à venir` (défaut) / `Toutes les visites` / `Une visite` (liste
  déroulante).
- **Inclure** : `Inscrits` (coché) / `File d'attente` (décoché) — la file ajoute des lignes avec
  un statut dédié, pas un second fichier.
- **Inscriptions annulées** : décoché par défaut.

Puis bouton `Télécharger le CSV`.

## B.3 Format

Un seul fichier, une ligne par **inscription** (pas par personne : les accompagnants restent dans
leur colonne, comme dans l'export par visite existant, pour ne pas casser les habitudes).

Colonnes : `Visite, Date, Heure, Nom, Prénom, Email, Accompagnants, Places, Statut, Inscrit le`.
Les lignes de file d'attente reprennent les mêmes colonnes, `Statut` valant
`file d'attente (position N)` ou `file d'attente (offre envoyée)`.

Conventions reprises **à l'identique** de l'export existant : BOM UTF-8, séparateur `,`,
échappement par `escapeCsvCell` puis doublement des guillemets. Ne pas inventer un second dialecte
CSV dans le même produit.

Nom de fichier : `inscriptions-<périmètre>-YYYY-MM-DD.csv`, où `<périmètre>` vaut `a-venir`,
`toutes` ou le slug du titre de la visite.

## B.4 Données

Aucun endpoint nouveau : le dashboard dispose déjà de la liste des visites, et l'export appelle
`GET /api/visit-attendance?tourId=…` (plus `visit-waitlist` si la case est cochée) pour chacune.

Sur « Toutes les visites », le fan-out peut atteindre quelques dizaines d'appels : les requêtes
sont **limitées à 5 en parallèle** et la modale affiche une barre de progression « Visite 7/23 ».
Si une visite échoue, l'export continue et le fichier se termine par une ligne de commentaire
listant les visites manquantes, plutôt que de tout perdre.

## B.5 RGPD

Le fichier contient des données nominatives (nom, email). La modale affiche, au-dessus du bouton
de téléchargement, un rappel court : « Fichier nominatif — à ne pas diffuser hors de
l'organisation, à supprimer après usage. » Pas de mécanisme technique supplémentaire : le guide a
déjà accès à ces données dans l'interface, l'export ne change pas le périmètre de ce qu'il voit.

---

## 4. Tests

Stratégie : tout se passe côté client et il n'y a aucun nouvel endpoint, donc la valeur est dans
les **tests unitaires des fonctions de génération** (CSV et HTML), pas dans des tests d'intégration
API. Les tests de composant se limitent au câblage.

- **Unitaires** (`src/utils/guideExport.test.ts`, nouveau) :
  - **caractérisation du refactor** : pour une visite, la sortie CSV et la sortie HTML après
    extraction sont **identiques** à celles produites aujourd'hui par `GuidePortal` (snapshot pris
    avant le déplacement des fonctions) ;
  - CSV : cellule contenant `,`, `"`, un retour ligne, un `=` en tête (injection de formule —
    déjà traité par `escapeCsvCell`, à ne pas régresser) ;
  - CSV : ligne de file d'attente correctement étiquetée, colonne `Places` cohérente avec
    `placesOf` ;
  - CSV : périmètre « à venir » exclut les visites passées ; annulées exclues sauf option cochée ;
  - HTML : une feuille par visite avec saut de page entre elles ; visite sans inscrit → tableau
    vide mais en-tête présent ; champs échappés (`escapeHtml`) sur un titre contenant `<`.
- **Composant** (`GuideDashboard.test.tsx`) :
  - clic sur « Voir appels du jour » → modale ouverte, visites du jour uniquement ;
  - aucun jour concerné → message d'état vide, boutons désactivés ;
  - clic sur « Exporter inscriptions » → modale d'options, pas de téléchargement immédiat ;
  - échec d'une visite pendant l'export → le fichier est quand même produit.
- **Non-régression** : les boutons `Export CSV` et `Imprimer` du détail visite continuent de
  fonctionner à l'identique après extraction (couvert par les snapshots ci-dessus).
- Pas d'E2E : ni impression ni téléchargement ne se testent utilement en E2E ; ce qui compte est
  le contenu généré, couvert en unitaire.

## 5. Impacts

- Nouveau `src/utils/guideExport.ts` : `buildRegistrationsCsv(...)`, `buildAttendanceSheetsHtml(...)`,
  `downloadCsv(...)`, `printHtml(...)`.
- `GuidePortal.tsx` : `exportCSV` / `printAttendance` supprimées, remplacées par des appels aux
  utilitaires. `escapeHtml` migre avec elles.
- `GuideDashboard.tsx` : deux nouvelles modales, prop `guideCode` (la même que celle requise par
  la spec file d'attente — à n'ajouter qu'une fois).
- Aucun changement d'API ni de schéma RTDB.

## 6. Ordre de réalisation suggéré

1. Extraction des deux fonctions vers `guideExport.ts` + snapshots de caractérisation (aucun
   changement visible, filet de sécurité pour la suite).
2. Généralisation multi-visites + bouton « Voir appels du jour » (le plus utile au quotidien).
3. Bouton « Exporter inscriptions » et sa modale d'options.
