# Tests Visites Guidées

## 1. Pages Publiques (/reservations)

- [ ] Charger `/reservations`
- [ ] Vérifier listing tours affichés
- [ ] Cliquer tour → détail visible (titre, date, durée, localisation, capacité)
- [ ] Voir carte avec point de départ
- [ ] Formulaire inscription visible
  - [ ] Email field
  - [ ] Prénom, Nom
  - [ ] Accompagnant (optionnel)
- [ ] Soumettre inscription valide
  - [ ] Message "Vérifiez votre email"
  - [ ] Check email reçue (confirmation + lien validation)
- [ ] Cliquer lien email
  - [ ] Page confirmation charge
  - [ ] Envoyer token
  - [ ] Message "Inscription confirmée"

## 2. Espace Guide (/guide)

- [ ] Charger `/guide`
- [ ] Voir écran login (champ code)
- [ ] Entrer code guide invalide → erreur
- [ ] Entrer code guide valide → dashboard charge
- [ ] Dashboard affiche:
  - [ ] Liste tours (titre, date, inscrits/capacité)
  - [ ] Statut tour (À venir, En cours, Terminée)
- [ ] Cliquer tour → détail:
  - [ ] Onglet "Inscrits" → liste confirmés
  - [ ] Export PDF
  - [ ] Export CSV
  - [ ] Onglet "File d'attente" → positions anonymisées
  - [ ] Onglet "Appel" → feuille présences
    - [ ] Cocher présent/absent pour chaque
    - [ ] Vérifier update en temps réel

## 3. EmailJS + Cron

- [ ] Template `template_q7nh8h2` reçoit variables corrects:
  - [ ] `{{to_email}}`
  - [ ] `{{type}}`
  - [ ] `{{firstName}}`
  - [ ] `{{tourTitle}}`
  - [ ] `{{tourDate}}`

- [ ] Tester cron manuellement (locale ou Vercel logs):
  ```bash
  curl -X POST "https://<vercel-url>/api/visit-emails?type=send-7d-reminder" \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
  - [ ] Réponse 200 OK
  - [ ] Logs indiquent envois réussis

- [ ] Emails d'erreur vont à `VISIT_ALERT_EMAIL` (julien.fritsch@gmail.com)

## 4. Fiabilité

- [ ] Déduplication: même email + tour → erreur "déjà inscrit"
- [ ] Max 3 visites par email → erreur si 4e
- [ ] File attente:
  - [ ] Inscription si complet → waitlist
  - [ ] Email file attente reçu
  - [ ] Position affichée
- [ ] Idempotence:
  - [ ] Cron run 2x → même count (pas doublons)
  - [ ] Validation token 2x → OK (pas erreur)

## 5. RGPD

- [ ] Après tour + 24H:
  - [ ] Batch delete s'exécute
  - [ ] Registrations soft-deleted
  - [ ] Audit log créé
  - [ ] Requête → aucune donnée retournée

## 6. Vercel Logs

- [ ] Vérifier `/api/visit-tours` répond
- [ ] Vérifier `/api/visit-register` répond
- [ ] Vérifier `/api/visit-attendance` répond
- [ ] Vérifier crons exécutés:
  - [ ] `0 0 * * *` (7d reminder)
  - [ ] `0 0 * * *` (1d validation)
  - [ ] `0 1 * * *` (batch delete)
  - [ ] `0 2 * * *` (promote waitlist)
- [ ] Zéro erreurs 500

## Notes

- Template ID: `template_q7nh8h2`
- Env vars: `VISIT_EMAILJS_TEMPLATE_IDS`, `VISIT_ALERT_EMAIL`, `REGISTRATION_SECRET`, `CRON_SECRET`
- Endpoints: `/api/visit-*`
- Pages: `/reservations` (public), `/guide` (privé)
