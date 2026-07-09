# Audit UX: Intégration des Visites Guidées

## État actuel

### Parcours utilisateurs identifiés

#### 1. Arrivée par la Carte (`/map`)
- **Accès direct aux visites**: ❌ **GAP** — Aucun point d'entrée
- **Chemin actuel**: Impossible d'accéder aux visites depuis la carte
- **Action requise**: Ajouter lien/bouton "Visites" sur la carte

#### 2. Arrivée par le Programme (`/program`)
- **Accès direct aux visites**: ✅ **OK**
- **Chemin**: Programme → Bannière orange "Visites guidées" → `/reservations`
- **Qualité**: Bien intégré, visible, call-to-action clair
- **Point faible**: Visible seulement après avoir cliqué sur Programme

#### 3. Arrivée directe par réservation (`/reservations`)
- **Accès direct**: ✅ **OK** (URL directe ou lien externe)
- **UX**: GuidedTours.tsx charge les visites, listing claire
- **Points forts**:
  - Liste les visites avec dates/horaires/places
  - Détails par visite quand clique
  - Lien RGPD visible en bas
- **Points faibles**: Nul point d'entrée depuis app principale

#### 4. Confirmation par email (`/reservations/confirm`, `/reservations/accept-waitlist`)
- **Accès**: ✅ **OK** (lien dans email)
- **Routes existantes**:
  - `/reservations/confirm` → Valider inscription
  - `/reservations/accept-waitlist` → Accepter offre waitlist
  - `/reservations/cancel-waitlist` → Annuler waitlist
  - `/reservations/cancel` → Annuler inscription
  - `/reservations/gdpr` → Supprimer données
- **Flux**: OK — utilisateur valide son email, page affiche status

#### 5. Dashboard guide (`/guide`)
- **Accès**: Guide accède avec code
- **Fonctionnalités**: À spécifier
- **État**: RouteConfig exist, page GuidePortal.tsx exist

---

## Gaps Identifiés

| Gap | Localisation | Impact | Priorité | Solution |
|-----|-----|--------|----------|----------|
| **Pas d'accès visites en BottomNav** | BottomNavigation.tsx | Users ne voient pas l'option | HIGH | Ajouter icône/lien "Réservations" |
| **Visites absentes de la carte** | Map.tsx | Discovery faible, cohérence | MEDIUM | Intégrer visites sur la carte (UI + données) |
| **Pas de mention sur page À propos** | About.tsx | Discoverability | LOW | Ajouter note/lien vers visites |
| **Pas de section "Mes réservations"** | SavedEvents.tsx | Suivi insuffisant | MEDIUM | Afficher inscriptions utilisateur (email-based) |
| **Pas d'accès rapide depuis Map** | Map.tsx header/footer | Friction UX | MEDIUM | Bouton flottant "Réserver une visite" |

---

## Solutions Recommandées

### 1. Ajouter "Réservations" à BottomNavigation (HIGH)
**Fichier**: `src/components/BottomNavigation.tsx`
**Changement**:
```tsx
// Ajouter lien vers /reservations
<Link to="/reservations" className="...">
  <Calendar /> {/* ou Ticket icon */}
  <span>Réservations</span>
</Link>
```
**Impact**: Direct access depuis n'importe quelle page, 1 clic
**Effort**: Minimal (1 lien + icon)

### 2. Afficher visites sur la carte (MEDIUM)
**Fichier**: `src/pages/Map.tsx` + `src/components/MapComponent.tsx`
**Changement**:
- Charger les tours depuis `/api/visit-tours`
- Afficher pins sur la carte avec icône spécifique (ex: 👥 ou 🎫)
- Au clic: afficher popup avec "Titre | Date | Places restantes | [Réserver]"
- Couleur différente de celle des lieux (ex: orange #ff7a45)

**Impact**: Users qui scrollent la carte voient les visites
**Effort**: Moyen (fetch + affichage + modal)

### 3. Ajouter bouton flottant "Réserver une visite" (MEDIUM)
**Fichier**: `src/pages/Map.tsx`
**Changement**:
```tsx
// FAB en bas à droite (au-dessus de BottomNav)
<FloatingActionButton
  onClick={() => navigate('/reservations')}
  label="Réserver une visite"
  icon={Calendar}
/>
```
**Impact**: Découverte opportuniste en scrollant la carte
**Effort**: Bas (1 bouton)

### 4. Intégrer "Mes réservations" dans SavedEvents (MEDIUM)
**Fichier**: `src/pages/SavedEvents.tsx`
**Changement**:
- Récupérer inscriptions utilisateur depuis email (query param ou localStorage)
- Afficher dans une section séparée "Réservations confirmées"
- Boutons: Annuler | Voir détails | Ajouter au calendrier
**Impact**: Utilisateur central pour les users enregistrés
**Effort**: Moyen (API call + affichage)

### 5. Mention dans "À propos" (LOW)
**Fichier**: `src/pages/About.tsx`
**Changement**:
```tsx
<p>... Découvrez aussi nos <a href="#/reservations">visites guidées</a> ...</p>
```
**Impact**: Discoverability supplémentaire
**Effort**: Minimal

---

## Routes Existantes À Vérifier

✅ Routes déjà en place:
- `/reservations` → GuidedTours.tsx ✅
- `/reservations/confirm` → VisitConfirm.tsx ✅
- `/reservations/accept-waitlist` → VisitConfirm.tsx ✅
- `/reservations/cancel-waitlist` → VisitConfirm.tsx ✅
- `/reservations/cancel` → VisitConfirm.tsx ✅
- `/reservations/gdpr` → VisitGdpr.tsx ✅
- `/guide` → GuidePortal.tsx ✅

---

## Parcours Recommandés (Post-Implémentation)

### Nouveau user, découverte organique
1. Arrive sur `/map`
2. Voit FAB "Réserver une visite" → click
3. Atterit sur `/reservations` avec listing
4. Sélectionne une visite → affiche détails + bouton "S'inscrire"
5. Inscription → email validation
6. Clic lien email → `/reservations/confirm` → confirmé ✅

### Utilisateur retour, gestion réservation
1. Navigue via BottomNav → "Réservations"
2. Voit `/reservations` (mes réservations + disponibles)
3. Annule si besoin → `/reservations/cancel`
4. Ou affiche sur `/saved` dans section dédiée

### Guide, gestion visites
1. Accès `/guide` avec code
2. Voir inscriptions, faire appel, exporter liste, etc.

---

## Checklist Implémentation

- [ ] Ajouter "Réservations" dans BottomNavigation (HIGH - 1h)
- [ ] FAB "Réserver une visite" sur Map (MEDIUM - 2h)
- [ ] Afficher visites sur carte (MEDIUM - 3h)
- [ ] Intégrer "Mes réservations" dans SavedEvents (MEDIUM - 3h)
- [ ] Mention dans About (LOW - 15min)
- [ ] Test tous les parcours (2h)
- [ ] Test liens email (1h)
