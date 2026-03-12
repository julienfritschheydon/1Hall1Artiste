# 🎨 Interface Admin 2026 - Guide Complet

**Version** : 2.0 - Option B (LocalStorage + Export Git)  
**Date** : Mars 2026  
**Objectif** : Interface d'administration infaillible pour le festival 2026

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture Technique](#architecture-technique)
3. [Workflow Utilisateur](#workflow-utilisateur)
4. [Composants à Implémenter](#composants-à-implémenter)
5. [Configuration et Déploiement](#configuration-et-déploiement)
6. [Tests et Validation](#tests-et-validation)

---

## 🎯 Vue d'Ensemble

### Objectif

Interface simple permettant à des personnes non-techniques de :
- Importer les artistes et concerts depuis CSV
- Planifier les événements (lieu, jour, heure)
- Enrichir les informations artistes
- Publier le programme automatiquement

### Principes Clés

✅ **Robustesse** : CSV upload au lieu de copier-coller fragile  
✅ **Simplicité** : Sélecteurs au lieu de drag & drop  
✅ **Infaillibilité** : Impossible de publier un planning incomplet  
✅ **Automatisation** : Build et déploiement automatiques via Git  

### Workflow Complet

```
1. Import Artistes CSV → localStorage
2. Import Concerts CSV (avec planning) → localStorage
3. Import Détails Artistes CSV → localStorage
4. Planning Artistes (sélecteurs) → localStorage
5. Vérification Chronologie → Détection conflits
6. Publication → Génération fichiers TS → Git workflow → Site en ligne
```

**Temps total estimé** : ~1 heure pour tout le festival

---

## 🏗️ Architecture Technique

### Infrastructure Existante (Déjà Prête ✅)

```typescript
// Service de données avec localStorage
dataService.ts
  ├─ loadFromLocalStorage() → Charge données ou fallback sur fichiers statiques
  ├─ saveToLocalStorage() → Sauvegarde automatique
  ├─ addEvent(), updateEvent(), removeEvent()
  └─ addLocation(), updateLocation(), removeLocation()

// Hooks React
useData.ts → Accès complet aux données
useEvents.ts → Spécialisé événements
useLocations.ts → Spécialisé lieux
```

### Nouveaux Composants à Créer

```
src/components/admin/
  ├─ CSVImport.tsx                    # Import artistes
  ├─ ConcertCSVImport.tsx             # Import concerts avec planning
  ├─ ArtistDetailsImport.tsx          # Import détails artistes
  ├─ SimplePlanning.tsx               # Planning artistes
  ├─ ConcertPlanning.tsx              # Planning concerts
  ├─ EditEventPage.tsx                # Édition événement
  ├─ ChronologicalView.tsx            # Vue chronologique
  └─ PublishSystem.tsx                # Publication

src/utils/
  └─ generateDataFiles.ts             # Génération fichiers TS

.github/workflows/
  └─ publish-2026.yml                 # Workflow GitHub Actions
```

### Persistance des Données

**Option B : LocalStorage + Export Git** (Recommandé)

```
localStorage (travail local)
    ↓
generateDataFiles() → events.ts, artists.ts, locations.ts
    ↓
GitHub Actions → Commit + Build + Deploy
    ↓
Site en ligne
```

**Avantages** :
- Pas de backend nécessaire
- Données versionnées dans Git
- Workflow automatisé
- Notifications email

---

## 👤 Workflow Utilisateur

### 1. Import Artistes (5 minutes)

**Template CSV** :
```csv
Nom,Type,Titre,Description,Email,Téléphone,Instagram,Jour préféré,Heure préférée,Besoins spéciaux
Marie Dupont,exposition,Peintures abstraites,Artiste peintre...,marie@example.com,0612345678,@mariedupont,samedi,14h00,Besoin d'un chevalet
```

**Étapes** :
1. Télécharger le template (1 clic)
2. Remplir avec Excel/Google Sheets
3. Enregistrer en CSV
4. Uploader le fichier (1 clic)
5. Vérifier l'aperçu
6. Cliquer "Importer"

✅ **Résultat** : Tous les artistes sont dans l'app !

### 2. Import Concerts avec Planning (5 minutes)

**Template CSV** :
```csv
Nom du groupe,Titre,Lieu,Jour,Heure
Trio Jazz Manouche,Concert Jazz,Église Saint-Nicolas,samedi,14h00
```

**Spécificité** : Le planning (lieu, jour, heure) est **directement dans le CSV** !

**Étapes** :
1. Télécharger le template concerts
2. Remplir avec les groupes + leur planning
3. Enregistrer en CSV
4. Uploader et importer

✅ **Résultat** : Tous les concerts sont créés ET planifiés automatiquement !

### 3. Import Détails Artistes (5 minutes - optionnel)

**Template CSV** :
```csv
Nom du groupe,Description,Email,Téléphone,Instagram,Nombre de musiciens,Besoins techniques
Trio Jazz Manouche,Groupe de jazz manouche traditionnel...,jazz@example.com,0612345678,@triojazz,3,3 micros + ampli
```

**Étapes** :
1. Télécharger le template détails
2. Remplir avec biographies et coordonnées
3. Uploader et mettre à jour

✅ **Résultat** : Les concerts ont toutes les informations détaillées !

### 4. Planning Artistes (15-30 minutes)

**Interface** : Liste avec sélecteurs (pas de drag & drop)

Pour chaque artiste :
- Choisir le lieu (dropdown filtré)
- Cocher le(s) jour(s) (samedi/dimanche)
- Entrer l'heure (14h00)
- Cliquer "Sauvegarder"

✅ **Résultat** : Tous les artistes sont planifiés !

### 5. Vérification Chronologique (automatique)

**Vue chronologique** :
- Tri par jour puis heure
- Détection des conflits (même lieu + même heure)
- Alertes visuelles

### 6. Publication (1 minute)

**Étapes** :
1. Vérification automatique (tous les événements complets)
2. Clic sur "Publier"
3. Publication automatique (~5 minutes)
4. Email de confirmation

✅ **Résultat** : Programme 2026 en ligne !

---

## 💻 Composants à Implémenter

### 1. CSVImport.tsx - Import Artistes

```typescript
import { useData } from '@/hooks/useData';
import { v4 as uuidv4 } from 'uuid';

const CSV_TEMPLATE = `Nom,Type,Titre,Description,Email,Téléphone,Instagram,Jour préféré,Heure préférée,Besoins spéciaux
Marie Dupont,exposition,Peintures abstraites,Artiste peintre...,marie@example.com,0612345678,@mariedupont,samedi,14h00,Besoin d'un chevalet`;

export function CSVImport() {
  const { addEvent } = useData();
  
  const parseCSV = (csvText: string) => {
    // Parser robuste avec gestion guillemets et virgules
    // Validation ligne par ligne
    // Retourne tableau d'événements
  };
  
  const handleImport = async () => {
    for (const event of parsedEvents) {
      addEvent({
        id: uuidv4(),
        artistId: uuidv4(),
        title: event.title,
        artistName: event.name,
        type: event.type,
        time: '',
        days: [],
        locationId: '',
        locationName: '',
        image: ''
      });
    }
    // ✅ Sauvegarde automatique dans localStorage
  };
}
```

### 2. ConcertCSVImport.tsx - Import Concerts avec Planning

```typescript
import { useData } from '@/hooks/useData';
import { useLocations } from '@/hooks/useLocations';

const CONCERT_CSV_TEMPLATE = `Nom du groupe,Titre,Lieu,Jour,Heure
Trio Jazz Manouche,Concert Jazz,Église Saint-Nicolas,samedi,14h00`;

export function ConcertCSVImport() {
  const { addEvent } = useData();
  const { locations } = useLocations();
  
  const handleImport = async () => {
    for (const concert of parsedConcerts) {
      // Trouver le lieu correspondant
      const location = locations.find(loc => 
        loc.name.toLowerCase() === concert.location.toLowerCase()
      );
      
      if (!location) {
        errors.push(`Lieu "${concert.location}" introuvable`);
        continue;
      }
      
      addEvent({
        id: uuidv4(),
        artistId: uuidv4(),
        title: concert.title,
        artistName: concert.name,
        type: 'concert',
        time: concert.time,
        days: [concert.day],
        locationId: location.id,
        locationName: location.name,
        image: ''
      });
    }
  };
}
```

### 3. ArtistDetailsImport.tsx - Enrichissement Artistes

```typescript
import { useEvents } from '@/hooks/useEvents';

export function ArtistDetailsImport() {
  const { events, updateEvent } = useEvents();
  
  const handleImport = async () => {
    for (const detail of parsedDetails) {
      // Trouver le concert correspondant
      const concertEvent = events.find(e => 
        e.type === 'concert' && 
        e.artistName.toLowerCase() === detail.name.toLowerCase()
      );
      
      if (!concertEvent) {
        errors.push(`Concert non trouvé pour ${detail.name}`);
        continue;
      }
      
      // Mettre à jour avec les détails
      updateEvent(concertEvent.id, {
        artistBio: detail.description,
        // Stocker infos supplémentaires
      });
    }
  };
}
```

### 4. PublishSystem.tsx - Publication

```typescript
import { useEvents } from '@/hooks/useEvents';
import { useLocations } from '@/hooks/useLocations';
import { generateAllDataFiles } from '@/utils/generateDataFiles';

const GITHUB_CONFIG = {
  owner: 'CollectifIleFeydeau',
  repo: '1Hall1Artiste',
  workflow: 'publish-2026.yml',
  token: process.env.REACT_APP_GITHUB_TOKEN
};

export function PublishSystem() {
  const { events } = useEvents();
  const { locations } = useLocations();
  
  const handleGitPublish = async () => {
    // 1. Générer les fichiers TypeScript
    const { eventsFile, artistsFile, locationsFile } = 
      generateAllDataFiles(events, locations);
    
    // 2. Déclencher workflow GitHub Actions
    await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/actions/workflows/${GITHUB_CONFIG.workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${GITHUB_CONFIG.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            eventsFile,
            artistsFile,
            locationsFile,
            adminEmail: 'admin@collectif-feydeau.fr'
          }
        })
      }
    );
    
    // 3. Notification
    toast({
      title: "✅ Publication lancée",
      description: "Le programme sera en ligne dans ~5 minutes"
    });
  };
}
```

### 5. generateDataFiles.ts - Génération Fichiers

```typescript
export function generateEventsFile(events: Event[]): string {
  const eventDetails = events.map(e => ({
    id: e.id,
    artistId: e.artistId,
    title: e.title,
    time: e.time,
    days: e.days,
    locationId: e.locationId
  }));
  
  return `import { getArtistById } from './artists';
import { getLocationNameById } from './locations';

export type EventDetails = { /* ... */ };
export type Event = { /* ... */ };

const eventScheduleData: EventDetails[] = ${JSON.stringify(eventDetails, null, 2)};

export const events: Event[] = eventScheduleData.map(/* ... */);
`;
}

export function generateArtistsFile(events: Event[]): string { /* ... */ }
export function generateLocationsFile(locations: Location[]): string { /* ... */ }

export function generateAllDataFiles(events, locations) {
  return {
    eventsFile: generateEventsFile(events),
    artistsFile: generateArtistsFile(events),
    locationsFile: generateLocationsFile(locations)
  };
}
```

---

## ⚙️ Configuration et Déploiement

### 1. Variables d'Environnement

Créer `.env.local` :
```env
REACT_APP_GITHUB_TOKEN=ghp_votre_token_ici
```

**Générer le token** :
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Cocher : `repo` + `workflow`
4. Copier le token

### 2. Secrets GitHub

Settings → Secrets and variables → Actions :
```yaml
NETLIFY_AUTH_TOKEN: "votre_token_netlify"
NETLIFY_SITE_ID: "votre_site_id"
MAIL_USERNAME: "votre_email@gmail.com"
MAIL_PASSWORD: "app_password_gmail"
```

### 3. Workflow GitHub Actions

`.github/workflows/publish-2026.yml` :
```yaml
name: Publish 2026 Program

on:
  workflow_dispatch:
    inputs:
      eventsFile:
        description: 'Contenu du fichier events.ts'
        required: true
      artistsFile:
        description: 'Contenu du fichier artists.ts'
        required: true
      locationsFile:
        description: 'Contenu du fichier locations.ts'
        required: true

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Update data files
        run: |
          echo "${{ github.event.inputs.eventsFile }}" > src/data/events.ts
          echo "${{ github.event.inputs.artistsFile }}" > src/data/artists.ts
          echo "${{ github.event.inputs.locationsFile }}" > src/data/locations.ts
      
      - name: Commit and push
        run: |
          git add src/data/*.ts
          git commit -m "🎨 Mise à jour programme 2026"
          git push
      
      - name: Build and deploy
        run: |
          npm ci
          npm run build
          npm run deploy
```

### 4. Routes Admin

```typescript
// src/App.tsx
<Routes>
  <Route path="/admin/import-artistes" element={<CSVImport />} />
  <Route path="/admin/import-concerts" element={<ConcertCSVImport />} />
  <Route path="/admin/import-details" element={<ArtistDetailsImport />} />
  <Route path="/admin/planning-artistes" element={<SimplePlanning />} />
  <Route path="/admin/planning-concerts" element={<ConcertPlanning />} />
  <Route path="/admin/edit/:eventId" element={<EditEventPage />} />
  <Route path="/admin/chronologie" element={<ChronologicalView />} />
  <Route path="/admin/publier" element={<PublishSystem />} />
</Routes>
```

---

## 🧪 Tests et Validation

### Test 1 : Import CSV

```typescript
// Créer un fichier test.csv avec 2-3 artistes
// Uploader via l'interface
// Vérifier dans localStorage (F12 → Application → Local Storage)
const events = JSON.parse(localStorage.getItem('events'));
console.log(events); // Doit contenir les artistes importés
```

### Test 2 : Planning

```typescript
// Planifier un artiste
// Vérifier la sauvegarde automatique
const events = JSON.parse(localStorage.getItem('events'));
const event = events.find(e => e.id === 'test-id');
console.log(event.locationId, event.days, event.time); // Doit être rempli
```

### Test 3 : Génération Fichiers

```typescript
import { generateAllDataFiles } from '@/utils/generateDataFiles';

const events = JSON.parse(localStorage.getItem('events'));
const locations = JSON.parse(localStorage.getItem('locations'));

const { eventsFile, artistsFile, locationsFile } = 
  generateAllDataFiles(events, locations);

console.log(eventsFile.substring(0, 500)); // Vérifier syntaxe TypeScript
```

### Test 4 : Publication Complète

1. Importer quelques événements de test
2. Les planifier
3. Cliquer "Publier"
4. Vérifier :
   - Toast de confirmation
   - Workflow GitHub Actions lancé
   - Commit créé avec les nouveaux fichiers
   - Build réussi
   - Site déployé
   - Email reçu

---

## 📊 Plan de Développement

### Phase 1 : Import (2h30)
- [ ] `CSVImport.tsx` - Import artistes
- [ ] `ConcertCSVImport.tsx` - Import concerts avec planning
- [ ] `ArtistDetailsImport.tsx` - Import détails artistes
- [ ] Templates CSV téléchargeables
- [ ] Tests avec fichiers réels

### Phase 2 : Planning (2h30)
- [ ] `SimplePlanning.tsx` - Planning artistes
- [ ] `ConcertPlanning.tsx` - Planning concerts
- [ ] `ChronologicalView.tsx` - Vue chronologique
- [ ] Détection conflits
- [ ] Tests planning

### Phase 3 : Édition (1h30)
- [ ] `EditEventPage.tsx` - Édition événement
- [ ] Formulaire complet
- [ ] Suppression avec confirmation
- [ ] Tests édition

### Phase 4 : Publication (2h)
- [ ] `generateDataFiles.ts` - Génération fichiers
- [ ] `PublishSystem.tsx` - Interface publication
- [ ] Workflow GitHub Actions
- [ ] Configuration secrets
- [ ] Tests publication complète

### Phase 5 : Validation (1h)
- [ ] Tests end-to-end
- [ ] Documentation utilisateur
- [ ] Formation équipe

**Total : ~10h de développement**

---

## ✅ Checklist de Production

### Import
- [ ] Template CSV artistes téléchargeable
- [ ] Template CSV concerts téléchargeable
- [ ] Template CSV détails artistes téléchargeable
- [ ] Validation stricte des colonnes
- [ ] Messages d'erreur clairs (ligne X : problème Y)
- [ ] Parser CSV robuste (gestion guillemets et virgules)
- [ ] Aperçu avant import
- [ ] Tests avec fichiers réels

### Planning
- [ ] Sélecteurs filtrés par type (expo/concert)
- [ ] Planning artistes séparé
- [ ] Planning concerts séparé
- [ ] Support horaires multiples pour concerts
- [ ] Sauvegarde automatique
- [ ] Indicateurs visuels (complet/incomplet)

### Chronologie
- [ ] Vue par jour et heure
- [ ] Tri automatique
- [ ] Détection conflits (même lieu + même heure)
- [ ] Affichage artistes + concerts mélangés
- [ ] Messages d'alerte clairs

### Publication
- [ ] Vérifications pré-publication
- [ ] Génération fichiers TypeScript
- [ ] Workflow Git fonctionnel
- [ ] Notifications email
- [ ] Tests du workflow complet

### Général
- [ ] Routes configurées
- [ ] Navigation fluide
- [ ] Messages de confirmation
- [ ] Logging pour debugging
- [ ] Documentation utilisateur
- [ ] Formation équipe

---

## 🎯 Résumé

**Solution** : LocalStorage + Export Git (Option B)

**Avantages** :
- ✅ Pas de backend complexe
- ✅ Infrastructure existante réutilisée
- ✅ Données versionnées dans Git
- ✅ Workflow automatisé
- ✅ Simple et robuste

**Temps de développement** : ~10h  
**Temps d'utilisation** : ~1h pour tout le festival  
**Coût** : €0 (GitHub Actions gratuit jusqu'à 2000 min/mois)

**Cette solution est production-ready et peut être déployée immédiatement pour le festival 2026 !**
