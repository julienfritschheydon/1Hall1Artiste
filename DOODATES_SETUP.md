# Doodates (Visites Guidées) - Setup Manual

## Code vs Manual Setup

### ✅ Complètement automatisé en code:
- Routes API (POST/GET/PUT/DELETE)
- Base de données Firebase RTDB (schéma + queries)
- Batch cron jobs Vercel (rappels, validation, suppression RGPD, promo)
- Frontend pages (/reservations, /guide)
- Tokens HMAC (validation 24H)
- Guide auth (code accès)
- Tests (unit + integration)

### 🔧 Manuel (EmailJS Dashboard):
Créer 6 templates email dans EmailJS Dashboard:
1. **doodates_confirmation** — Confirmation inscription
2. **doodates_reminder_7d** — Rappel 7j avant
3. **doodates_reminder_1d_validate** — Validation 1j avant
4. **doodates_waitlist_confirmation** — File attente
5. **doodates_waitlist_offer** — Place libérée
6. **doodates_validation_expired** — Lien expiré

---

## Setup Steps

### 1. Email Templates (EmailJS)

Go to https://dashboard.emailjs.com → Templates

**Template 1: doodates_confirmation**
- ID: `template_doodates_confirmation`
- Variables: `firstName`, `tourTitle`, `tourDate`, `validationLink`
- Subject: `Confirmation inscription: {{tourTitle}}`
- Body:
```
Bienvenue {{firstName}}!

Votre inscription à {{tourTitle}} le {{tourDate}} est enregistrée.
Veuillez confirmer votre présence avec ce lien: {{validationLink}}

Lien valide 24h.
```

**Template 2: doodates_reminder_7d**
- ID: `template_doodates_reminder_7d`
- Variables: `firstName`, `tourTitle`, `tourDate`
- Subject: `Rappel: {{tourTitle}}`
- Body:
```
Bonjour {{firstName}},

Rappel! Visite {{tourTitle}} le {{tourDate}}.

À bientôt!
```

**Template 3: doodates_reminder_1d_validate**
- ID: `template_doodates_reminder_1d_validate`
- Variables: `firstName`, `tourTitle`, `validationLink`, `deadline`
- Subject: `Confirmation nécessaire: {{tourTitle}}`
- Body:
```
Bonjour {{firstName}},

Confirmez votre présence à {{tourTitle}} avant {{deadline}}.
Sinon, votre inscription sera annulée automatiquement.

Confirmer: {{validationLink}}
```

**Template 4: doodates_waitlist_confirmation**
- ID: `template_doodates_waitlist_confirmation`
- Variables: `firstName`, `tourTitle`, `position`, `queueLink`
- Subject: `Liste d'attente: {{tourTitle}}`
- Body:
```
Bonjour {{firstName}},

Vous êtes #{{position}} sur la liste d'attente pour {{tourTitle}}.
Vous recevrez un email si une place se libère.

Consulter votre position: {{queueLink}}
```

**Template 5: doodates_waitlist_offer**
- ID: `template_doodates_waitlist_offer`
- Variables: `firstName`, `tourTitle`, `acceptLink`, `deadline`
- Subject: `Une place s'est libérée: {{tourTitle}}`
- Body:
```
Bonjour {{firstName}},

Une place s'est libérée pour {{tourTitle}}!
Acceptez cette offre avant {{deadline}}: {{acceptLink}}

Passé ce délai, la place sera proposée à la personne suivante.
```

**Template 6: doodates_validation_expired**
- ID: `template_doodates_validation_expired`
- Variables: `firstName`, `tourTitle`
- Subject: `Inscription expirée: {{tourTitle}}`
- Body:
```
Bonjour {{firstName}},

Votre lien de validation pour {{tourTitle}} a expiré.
Veuillez vous réinscrire via le site.
```

### 2. Environment Variables (Vercel + Local)

`.env` (local) et Vercel Dashboard:
```
# Doodates (Phase 1-6)
REGISTRATION_SECRET=<long-random-string-change-in-prod>
DOODATES_ALERT_EMAIL=julien.fritsch@gmail.com
DOODATES_EMAILJS_TEMPLATE_IDS={"confirmation":"template_doodates_confirmation","reminder_7d":"template_doodates_reminder_7d","reminder_1d_validate":"template_doodates_reminder_1d_validate","waitlist_confirmation":"template_doodates_waitlist_confirmation","waitlist_offer":"template_doodates_waitlist_offer","validation_expired":"template_doodates_validation_expired"}
CRON_SECRET=<long-random-string-change-in-prod>

# Existing
ARTIST_SECRET=<change-in-prod>
FIREBASE_DB_SECRET=<from-firebase>
EMAILJS_PRIVATE_KEY=<from-emailjs>
EMAILJS_TEMPLATE_ID=<generic-template-for-alerts>
EMAILJS_SERVICE_ID=<from-emailjs>
EMAILJS_PUBLIC_KEY=<from-emailjs>
```

### 3. Routes Wiring

Add to app router (if using React Router v6+):

```tsx
import GuidedTours from './pages/GuidedTours'
import GuidePortal from './pages/GuidePortal'

<Route path="/reservations" element={<GuidedTours />} />
<Route path="/guide" element={<GuidePortal />} />
```

### 4. Deploy to Vercel

```bash
vercel env pull  # Pull env vars
npm run build
vercel deploy
```

Vercel automatically:
- Deploys `/api/*` as Serverless Functions
- Schedules cron jobs (from `vercel.json`)

### 5. Verify Setup

- Visit `/reservations` → should list tours
- Fill form → should receive confirmation email
- Visit `/guide` + enter code → should show dashboard
- Cron jobs start automatically (logs in Vercel Dashboard)

---

## Troubleshooting

**Cron jobs not running?**
- Check Vercel Dashboard → Functions → Scheduled Functions
- Must be on Vercel Standard plan or higher

**Emails not sending?**
- Verify `DOODATES_EMAILJS_TEMPLATE_IDS` JSON is valid
- Check EmailJS Dashboard → Logs
- Verify template IDs match exactly

**Code validation failing?**
- Ensure `CRON_SECRET` header matches `Authorization: Bearer <CRON_SECRET>`
- Test manually: `curl -H "Authorization: Bearer <secret>" https://site.com/api/doodates-emails?type=send-7d-reminder`

---

## Phase Timeline

✅ Phase 1: Infrastructure DB + Tokens (done)
✅ Phase 2: API Tours (done)
✅ Phase 3: API Inscriptions (done)
✅ Phase 4: API Waitlist (done)
✅ Phase 5: API Attendance (done)
✅ Phase 6: Batch Cron Jobs (done)
✅ Phase 7+8: Frontend (done)

🔧 Setup: Email templates + env vars + deploy

📊 Future: Tests E2E, admin dashboard, analytics
