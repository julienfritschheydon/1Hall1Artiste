# Tests Visites Guidées

Code guide test: `TESTGUIDE123`
Pages: `/reservations` (public), `/guide` (privé)
Voir aussi: `AUDIT-SPECIFICATIONS.md` (couverture spec) et `SETUP.md`.

> ⚠️ **PRÉ-REQUIS Vercel** : renommer les variables d'env (voir SETUP.md §Vercel) :
> `DOODATES_EMAILJS_TEMPLATE_IDS` → `VISIT_EMAILJS_TEMPLATE_IDS`,
> `DOODATES_ALERT_EMAIL` → `VISIT_ALERT_EMAIL`, ajouter `PUBLIC_SITE_URL`.
> Ajouter clé `"cancellation"` dans le JSON template IDs.
> Sans ça → les emails échouent silencieusement.

---

## 1. Espace Guide (/guide)

- [ ] Charger `/guide` → écran login
- [ ] Code invalide → erreur "Code invalide"
- [ ] Code `TESTGUIDE123` → dashboard
- [ ] **Créer une visite** (bouton "+ Créer une visite")
  - [ ] Remplir titre, date/heure, durée, capacité, lat/lng, labels
  - [ ] Valider → visite apparaît dans la liste
- [ ] Cliquer visite → détail
  - [ ] Stats (confirmés, présents, absents, file)
  - [ ] **Modifier** la visite → changement sauvegardé
  - [ ] Modifier visite à < 24h du départ → refusée
  - [ ] Onglet "Inscrits" → liste avec colonnes Accompagnants + Places + "Total places confirmées"
  - [ ] **+ Inscrire sur place** → ajout direct confirmé (sans email)
  - [ ] Onglet "File d'attente" → noms + positions + Places
  - [ ] Onglet "Appel" → cocher présent/absent
  - [ ] **Export CSV** → fichier téléchargé, accents OK
  - [ ] **Imprimer** → dialogue impression
- [ ] Déconnexion → retour login

## 2. Inscription Publique (/reservations)

- [ ] `/reservations` → liste visites
- [ ] **Places restantes affichées** (ex: 13/15) — pas juste capacité
- [ ] Bannière visites visible aussi dans `/programme`
- [ ] Cliquer visite → détail (titre, date, durée, GPS, labels, places)
- [ ] Formulaire : email, prénom, nom (labels dans le bon ordre)
- [ ] **Accompagnants** :
  - [ ] "+ Ajouter un accompagnant" → ligne prénom/nom
  - [ ] Max 4 accompagnants (5 places) — bouton disparaît à 4
  - [ ] Bornage par places restantes (si 3 places libres → max 2 accompagnants)
  - [ ] Retirer un accompagnant (✕)
- [ ] Soumettre groupe → places décomptées correctement (1 + N)
- [ ] Groupe trop grand pour la capacité → **tout le groupe en file d'attente**
- [ ] Soumettre → "Vérifiez votre email"
- [ ] **Email confirmation reçu** (vérifier boîte mail)
  - [ ] Contient lien validation
  - [ ] Contient lien annulation
  - [ ] Contenu correspond au type (pas le template erreur générique)

## 3. Validation 24H (/reservations/confirm)

- [ ] Cliquer lien validation dans email → page charge
- [ ] "Inscription confirmée ✅"
- [ ] Recliquer (idempotence) → toujours OK
- [ ] Token trafiqué → erreur "invalid token"

## 4. Annulation inscription (/reservations/cancel)

- [ ] Lien annulation email → page demande email
- [ ] Mauvais email → "Email incorrect"
- [ ] Bon email → "Inscription annulée"
- [ ] Email de confirmation annulation reçu
- [ ] Place libérée → cron promote prévient file d'attente

## 5. File d'Attente

- [ ] Remplir visite (capacité atteinte)
- [ ] Nouvelle inscription → "file d'attente #N"
- [ ] Email file d'attente reçu (lien annulation file)
- [ ] Annuler place via `/reservations/cancel-waitlist?id=` → retiré + reorder
- [ ] Place se libère → email offre 24H (`/accept-waitlist?token=`)
- [ ] Accepter offre → inscription confirmée
- [ ] Offre expirée 24H → passe au suivant

## 6. RGPD (/reservations/gdpr)

- [ ] Lien "Gérer/supprimer mes données" en bas de `/reservations`
- [ ] Saisir email → "Données supprimées: N inscription(s)..."
- [ ] Vérifier inscriptions disparues (guide ne les voit plus)
- [ ] Audit log `gdpr_request` créé (Firebase `visit_audit_logs`)
- [ ] Suppression auto 24H après visite (cron batch-delete)

## 7. Crons (Vercel logs ou curl)

```bash
curl -X POST "https://www.1hall1artiste.fr/api/visit-emails?type=send-7d-reminder" \
  -H "Authorization: Bearer $CRON_SECRET"
```
- [ ] `send-7d-reminder` → 200, emails rappel
- [ ] `send-1d-validation` → 200, emails + auto-cancel deadline
- [ ] `batch-delete-post-tour` → 200, soft-delete + audit
- [ ] `promote-waitlist` → 200, promo file
- [ ] Mauvais `CRON_SECRET` → 401

## 8. Fiabilité

- [ ] Même email + tour → "already registered"
- [ ] Max 3 visites → 4e refusée
- [ ] Max 5 places → 5 accompagnants (6 places) refusé serveur
- [ ] Capacité comptée en places : groupe de 3 sur visite capacité 4 avec 2 déjà pris → file d'attente
- [ ] Capacité augmentée → cron promote remplit slots libres (groupe entier si tient)
- [ ] Idempotence cron (run 2x) → pas de doublon email
- [ ] API `/api/visit-tours` (public) → 200 `[]` ou liste
- [ ] API `/api/visit-tours` (guide header) → toutes visites
- [ ] Zéro erreur 500 dans Vercel logs

## 9. EmailJS template

- [ ] Template `template_q7nh8h2` : To=`{{to_email}}`, Subject=`{{type}}: {{tourTitle}}`
- [ ] Body gère tous les `{{#if type ...}}` (confirmation, reminder_7d, reminder_1d_validate, waitlist_confirmation, waitlist_offer, validation_expired, cancellation, error)
- [ ] Emails erreur app → `julien.fritsch@gmail.com`

## Notes
- Endpoints : `/api/visit-tours|register|waitlist|attendance|emails`
- Actions register : `?action=confirm|cancel|gdpr` + POST par défaut (créer)
- Action waitlist : `?action=activate`, DELETE (annuler), GET (liste)
