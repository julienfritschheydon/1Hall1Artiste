# ROADMAP — Collectif Feydeau

> Anciennes "Toutes nouvelles idées". Repackagé en roadmap priorisée avec contexte technique.
> Mise à jour : 2026-05-22.

---

## ✅ Récemment livré

- [x] Sync programme depuis Google Sheets (events + artists) — PR `feat/remote-program-sync` (en attente merge).
- [x] Image entière sur "Histoire des lieux" (fix `cover` → `object-contain`) — PR `fix/location-history-photo-full`.
- [x] Photos 12 et 9-10 allée Duguay-Trouin (PR #2 mergée).
- [x] MP3 audioguides ajoutés.
- [x] Fix bouton bruitage : reclic ne s'éteignait pas — pilotage `isPlaying` via events natifs `onPlay`/`onPause` dans `AudioGuide.tsx` (cette session, à committer).

---

## 🔥 Priorité 1 — Gestion des données / Données manquantes

### Export OpenAgenda
- **Objectif** : générer un export (CSV/JSON) du programme aux formats attendus par OpenAgenda pour copier-coller rapide.
- **Pourquoi** : éviter double saisie organisateurs (Google Sheet → OpenAgenda).
- **Approche technique** :
  - Lire `dataService.getEvents()` (post-sync Sheets).
  - Mapper champs internes → schéma OpenAgenda (title, description, dates, location, image, type).
  - Bouton "Exporter pour OpenAgenda" dans `/admin` ou page dédiée.
  - Téléchargement client-side (Blob + `<a download>`).
- **Effort** : ~½ jour.

### Images événements principaux
- **Objectif** : 5–10 photos phares (concerts/expos), 400×300px, <50KB.
- **Pourquoi** : page programme / cartes événements actuellement texte-only ou placeholders.
- **Stockage** : `public/images/events/<event-id>.jpg`. Référencer via `event.image` (déjà supporté côté type ?).
- **À vérifier** : `Event` type a-t-il un champ `image`. Si non, ajouter + fallback locationImage.
- **Effort** : 1h code + dépend de la livraison des visuels.

---

## 🐛 Priorité 1 — Bugs UX

### ✅ Bouton bruitage — reclic ne s'éteint pas
- **Statut** : FIXÉ cette session. À committer + PR.
- **Cause** : `togglePlayPause` toggle React state immédiatement, sans écouter events natifs `play`/`pause`. Promise `audio.play()` en vol pouvait désynchroniser état UI vs élément audio.
- **Fix** : `isPlaying` piloté par `onPlay`/`onPause` listeners HTML5, togglePlayPause se contente d'appeler `play()`/`pause()` selon `audio.paused`.

### Surcharge boutons header lieu (étude faite)
- **Symptôme** : header de `LocationDetailsModern` contient 5 boutons d'action côte à côte (Like, Visité, Témoignage, Share, Close) + badge "Bâtiment fermé" parfois. Sur mobile <375px, débordement.
- **Options évaluées** :
  1. **Menu kebab (⋮) regroupant secondaires** — Recommandé. Garde Like + Visité + Close visibles, masque Témoignage + Share dans dropdown. Préserve esthétique.
  2. Réduire à `h-8 w-8` — quick win mais nuit accessibilité tactile (cible <44px).
  3. Déplacer Témoignage + Share dans une "action bar" en pied de modal — plus de place mais nécessite refonte layout.
  4. Séparer titre/actions sur 2 lignes — simple, économique en code, garde tous les boutons visibles.
- **Décision** : à valider entre 1 (menu kebab) et 4 (2 lignes).
- **Fichier** : `src/components/LocationDetailsModern.tsx:199-280`.
- **Effort** : 2h.

---

## 🗺️ Priorité 2 — Carte au Trésor (refonte visuelle)

### Compteur "X Visité, Y À découvrir" — style parchemin (étude faite)
- **État actuel** : `MapHeader.tsx` a déjà la structure (badge double `Visité | À découvrir` avec gradient brun sur la partie droite, bordure `rgba(139,69,19,0.3)`).
- **Manque** :
  - Texture parchemin réelle (utiliser `IMAGE_PATHS.BACKGROUNDS.PARCHMENT` en `background-image` sur partie gauche, semi-transparent).
  - Bordure déchirée / ondulée (SVG `<path>` ou `clip-path: polygon(...)`).
  - Typo serif plus appuyée (`font-lora` + italique pour "Visité"/"À découvrir").
  - Optionnel : sceau de cire (PNG/SVG) en accroche centrale séparant les deux moitiés.
- **Fichier** : `src/components/MapHeader.tsx:30-67`.
- **Effort** : 2–3h pour version raffinée.

### Boutons "Localisation" et "Ambiance" en haut
- **État actuel** : déjà en haut dans `MapHeader.tsx:71-103` sous le compteur. IDEES disait "les bouger en haut" — déjà fait, peut-être obsolète. À confirmer avec mockup.
- **Refinement possible** : style cohérent avec compteur (même bordure parchemin, même gradient).

### Marqueurs de carte améliorés
- **Rose des vents miniature** au lieu de cercles : SVG 32×32 ; bleu si visité, gris sinon. Remplacer cercles dans le marker layer de la carte.
- **À localiser** : composant qui rend les markers (probablement dans `Map.tsx`).

### Fenêtres modales décorées
- Rose des vents sous titres
- Bordures dessinées à la main (SVG border-image)
- Boutons style sceau de cire
- Améliorer contraste texte sur parchemin

### Eau & décor
- Motifs de vagues SVG dans zones d'eau du fond carte
- Lavis bleu aquarelle (gradient + texture noise)
- Rose des vents détaillée en coin (décor)
- Bordures vieillies (taches thé, bords déchirés)
- Illustrations nautiques (ancres, navires) dans espaces vides

---

## 🚀 Priorité 3 — Évolutions stratégiques

### Navigation par chemins praticables
- Système de waypoints représentant rues réelles île Feydeau.
- Algorithme A* sur graphe des chemins.
- Toggle UI navigation simple vs avancée.
- Visualisation intersections.

### Gamification
**Éducatif**
- Quiz histoire île Feydeau
- Chasse au trésor

**Achievements**
- Implémenter `ALL_LOCATIONS_VISITED` dans `markLocationAsVisited`
- Page dédiée achievements
- Nouveaux : premier lieu, 50% lieux, week-end complet
- Liés aux événements : concerts, expos, collection complète
- Liés à l'engagement : partages, feedback

**Progression**
- Niveaux : Débutant → Explorateur → Guide → Expert
- Barre de progression
- Badges débloquables
- Classements anonymisés
- Partage réseaux sociaux

**UX**
- Notifications visuelles améliorées
- Journal d'activité / historique
- Stats perso (visites, temps passé)

**Tech**
- Enrichir service achievements existant
- Service progression
- Hooks suivi actions

---

## 🔧 Dette technique / Hygiène repo

- **Line endings CRLF** dans `package.json`, etc. — polluent diffs. Fix : `.gitattributes` `* text=auto eol=lf` + renormalize.
- **`setInterval` polling Sheets jamais clear** dans `DataService.constructor` — bénin car singleton, à nettoyer si refacto.
- **GH `gh pr create`** échoue (collaborator perms manquantes pour le user git local). PRs créées via lien web pour l'instant.
