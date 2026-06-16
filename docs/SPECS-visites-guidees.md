# Spécifications: Visites Guidées

## Vue d'ensemble

Plateforme d'inscription aux visites guidées. Guides gèrent création/inscriptions via dashboard privé (code accès). Public s'inscrit sur site. File d'attente si complet.

---

## 1. Authentification & Accès

### Guides
- **Accès**: Code d'accès (renouvellable annuellement)
- **Niveau**: Dashboard privé uniquement
- **Partage**: Tous guides avec code accèdent à toutes les visites

---

## 2. Visites Guidées (Interface Guide)

### Création visite
- **Champs requis**:
  - Intitulé (texte libre)
  - Date & horaire de départ
  - Durée (en minutes)
  - Point de départ (coordonnées GPS)
  - Capacité max (définie par guide)
  - Labels (tags libres, ex: "nature", "architecture", "enfants")

- **Limites**:
  - Une visite = 1 session unique (pas de récurrence)
  - Pas de tarif (gratuit)

### Dashboard guide
- **Affichage**:
  - Liste des visites créées/passées
  - État visite: Upcoming, En cours, Terminée
  - Nb inscrits / Capacité
  - Nb en file d'attente

- **Actions par visite**:
  - Voir inscrits + file d'attente (listes séparées)
  - Modifier visite (avant J-1)
  - Faire l'appel: marquer présent/absent
  - Inscrire manuellement (pers présente sur place)
  - Export: PDF, CSV (tous champs inscrits)
  - Imprimer liste présences (sur site, pas generation spéciale)

### Appel (avant/pendant visite)
- Guide coche présent/absent
- Absents: supprimés le lendemain (via batch)
- Confirmation de suppression sur dashboard le jour après

---

## 3. Inscriptions Publiques

### Page programme
- Ajouter section "Visites guidées" parmi programmation
- Afficher: intitulé, date, horaire, durée, labels, places restantes

### Inscription user
- **Flux**:
  1. Choisir visite (jour, horaire, intitulé)
  2. Voir places restantes
  3. **Si places**: Remplir nom, prénom, email
     - Option: +1 accompagnant (max 2 total par inscription, déduplication par email)
     - → Recevoir email confirmation avec lien validation (24H)
     - Lien validation confirme inscription

  4. **Si complet**: Option file d'attente
     - Remplir nom, prénom, email
     - Recevoir confirmation + position queue + lien consultation queue

- **Limite**: Max 3 visites par personne (RGPD: email comme clé dédup)

### Lien validation (24H)
- Valide l'inscription
- Passé 24H: email "validation expirée, inscription supprimée"
- → Suppression

---

## 4. File d'Attente

### Si place libérée
- **Processus**:
  1. Email auto → personne suivante file attente
  2. Contient lien pour s'inscrire (24H valide)
  3. Passé 24H: → personne suivante
  4. Boucle jusqu'à acceptation ou fin queue

### Annulation file d'attente
- User peut annuler son inscription file attente
- Lien dans email + accès site (chercher par email)

---

## 5. Annulation Inscriptions

### User annule inscription
- **Avant 1j**: Place va auto à file d'attente (prévenir premier de queue)
- **Après**: Guide gère manuellement

### Statuts inscription
- `attente_validation` → `confirmé` → `présent` ou `absent` ou `annulé`

---

## 6. Emails & Notifications

### Email confirmation inscription
- **Envoyé**: Immédiat après remplissage form
- **Contenu**: Détails visite (lieu, horaire, durée, intitulé, labels) + lien validation (24H)
- **Action**: Lien valide inscription ou expire

### Email validation expirée
- **Envoyé**: Passé 24H sans action
- **Contenu**: "Validation expirée, inscription supprimée, possibilité se réinscrire"

### Rappel 7j avant
- **Envoyé**: 7 jours avant visite (aux inscrits confirmés)
- **Contenu**: Texte simple "rappel visite X le Y" + prévenir: 24H avant demande confirmation ou annulation auto
- **Pas d'action requise**

### Rappel 1j avant + Demande confirmation (24H)
- **Envoyé**: 1 jour avant visite
- **Contenu**: "Confirmez présence ou inscription annulée dans 24H" + lien confirmation
- **Passé 24H**: Inscription supprimée si pas validation

### Email file d'attente (place libérée)
- **Envoyé**: Immédiat quand place se libère
- **Contenu**: "Une place s'est libérée, inscription valide pour 24H" + lien validation
- **24H après**: → Personne suivante queue

### Email annulation
- **Envoyé**: À user si annule avant J-1
- **Contenu**: Confirmation annulation
- **À file attente**: Email prévenant libération place

### Email suppression données (RGPD)
- **Envoyé**: 1 jour après visite (à qui?)
- **Contenu**: "Vos données supprimées conformément RGPD"

---

## 7. RGPD & Suppression Données

### Données collectées
- Nom, Prénom, Email, +1 accompagnant optionnel
- Timestamp inscription
- Statut (confirmé, absent, etc)

### Suppression auto
- **Timing**: 24H après fin visite
- **Quoi**: Tous inscrits + file attente + logs
- **Logs**: Garder trace suppression (audit RGPD compatible)
- **Confirmation**: Email ou dashboard notification

### Droit à l'oublie
- User demand suppression avant visite: Désinscrire + expliquer clairement
- Données supprimées immédiatement
- Si en file attente: annuler + notifier

---

## 8. Base de Données

### Tables

#### `guided_tours`
- `id` (PK)
- `title` (string)
- `date` (datetime)
- `duration_minutes` (int)
- `start_location` (coordinates: lat, lng)
- `capacity` (int)
- `labels` (json array)
- `created_by_guide` (guide_id)
- `created_at` (datetime)
- `updated_at` (datetime)
- `status` (upcoming, ongoing, completed)

#### `tour_registrations`
- `id` (PK)
- `tour_id` (FK)
- `email` (string)
- `first_name` (string)
- `last_name` (string)
- `companion_first_name` (string, nullable)
- `companion_last_name` (string, nullable)
- `status` (awaiting_validation, confirmed, present, absent, cancelled)
- `validation_token` (string, unique)
- `validation_expires_at` (datetime)
- `registered_at` (datetime)
- `confirmed_at` (datetime, nullable)
- `attended_at` (datetime, nullable)
- `cancelled_at` (datetime, nullable)
- `created_at` (datetime)
- `deleted_at` (datetime, soft delete pour audit)

#### `tour_waitlist`
- `id` (PK)
- `tour_id` (FK)
- `email` (string)
- `first_name` (string)
- `last_name` (string)
- `companion_first_name` (string, nullable)
- `companion_last_name` (string, nullable)
- `position` (int, order in queue)
- `invitation_token` (string, unique)
- `invitation_expires_at` (datetime)
- `registered_at` (datetime)
- `created_at` (datetime)
- `deleted_at` (datetime, soft delete pour audit)

#### `tour_attendance`
- `id` (PK)
- `tour_id` (FK)
- `registration_id` (FK)
- `present` (boolean)
- `marked_at` (datetime)
- `marked_by_guide` (guide_id)

#### `guide_access_codes`
- `id` (PK)
- `code` (string, unique)
- `created_at` (datetime)
- `renewal_date` (datetime, annual)
- `active` (boolean)

---

## 9. Cas Limites & Edge Cases

### Inscription & déduplication
- **Email comme clé**: Une personne = 1 email
- **Max 2 places par inscription**: Personne + 1 accompagnant
- **Max 3 visites par personne**: Limiter au niveau app

### Si réinscription après cancel
- User annule, file attente prend place → user peut se réinscrire
- Email dédup check: max 2 places sur TOUTE la visite

### Si place se libère en cascade
- Batch traite file attente: email → 24H → next
- Parallélisation possible si plusieurs libérations

### Données avant suppression
- Dashboard affiche "données supprimées" 24H après
- Audit log: timestamp + who deleted + why (auto/manual/gdpr)

### Guide modifie capacité
- Si réduit: surnuméraires vont en file attente
- Si augmente: email auto aux premiers en queue

---

## 10. Flux d'Emails (Résumé)

| Timing | À qui | Contenu | Action |
|--------|-------|---------|--------|
| **Immédiat** | User inscrit | Confirmation + lien validation | Cliquer lien (24H) |
| **Immédiat** | User file attente | Position queue + lien consultation | Voir queue ou annuler |
| **+24H** | User (si pas validation) | "Expirée, supprimée" | Réinscrire si possible |
| **+24H** | Queue (si place libérée) | "Place dispo, lien inscription" | Cliquer lien (24H) |
| **+7j** | Confirmés | Rappel visite | Lecture info |
| **+7j** | Confirmés aussi | "24H avant, confirmez ou annulation" | Confirmer ou annuler |
| **+1j avant** | Confirmés | Demande confirmation (24H deadline) | Confirmer ou annuler |
| **+24H après** | Inscrits | "Données supprimées RGPD" | N/A |

---

## 11. Priorités MVP vs Futur

### MVP (V1)
- ✅ Création visite (guide)
- ✅ Inscription simple + validation email
- ✅ File d'attente + auto email libération
- ✅ Appel présence
- ✅ Suppression auto 24H après
- ✅ Export PDF/CSV
- ✅ Lien annulation file attente

### Futur
- Récurrence visites
- Catégories/filtrage avancé
- SMS rappels
- Paiements/donations
- Analytics (taux participation, etc)
- Intégration calendrier (ical)

---

## 12. Notes Techniques

- **Authentification**: Code accès guide (pas de login/mdp, lien protégé comme artiste)
- **Tokens email**: JWT ou UUID, expiration 24H ou 7j selon contexte
- **Batch jobs**: Suppression 24H après, relance file attente, rappels 7j/1j
- **Emails**: Template HTML, replay test possible
- **Audit logs**: Garder trace suppression RGPD (soft delete + log table)
