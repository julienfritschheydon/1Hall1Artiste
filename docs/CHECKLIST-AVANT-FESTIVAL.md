# Checklist avant festival — visites guidées

À dérouler **dans la semaine qui précède** le premier jour de visites. Chaque
point correspond à une panne déjà vue ou à un risque identifié : rien ici n'est
décoratif.

---

## 1. Réactiver le rappel « quelques heures avant » ⚠️

**C'est le point le plus important de cette liste.**

GitHub désactive automatiquement tout workflow planifié après **60 jours sans
activité sur le dépôt** — soit exactement la situation entre deux éditions. Le
rappel du jour même ne part alors pas du tout, sans aucune alerte.

1. Ouvrir **Actions → ⏰ Rappel visite 3h avant** sur le dépôt GitHub.
2. Si un bandeau propose « Enable workflow », cliquer dessus.
3. Lancer un run manuel (**Run workflow**) et vérifier qu'il finit en vert.

Un run à vide est normal et attendu s'il n'y a aucune visite dans les 4 heures :
le job répond `sent: 0`. Ce qui compte, c'est qu'il réponde.

## 2. Vérifier le cron quotidien Vercel

Dans le tableau de bord Vercel → **Settings → Cron Jobs**, vérifier que
`/api/visit-emails?type=daily` est actif et que son dernier run est en succès.
Ce job porte les rappels J-7 et J-1, la promotion de la file d'attente et la
purge RGPD.

## 3. Vérifier les variables d'environnement

Sur Vercel, ces variables doivent toutes être renseignées, sinon des pans
entiers tombent en silence :

| Variable | Sans elle |
|---|---|
| `CRON_SECRET` | tous les jobs répondent 401, aucun email ne part |
| `REGISTRATION_SECRET` | les liens des emails (offre, RGPD) sont invalides |
| `VISIT_EMAILJS_TEMPLATE_IDS` | aucun email n'est envoyé |
| `EMAILJS_SERVICE_ID` / `EMAILJS_PUBLIC_KEY` / `EMAILJS_PRIVATE_KEY` | idem |
| `VISIT_ALERT_EMAIL` | les alertes d'échec d'envoi ne vous parviennent pas |

Le même secret `CRON_SECRET` doit figurer dans les **secrets du dépôt GitHub**,
sinon le rappel du jour même échoue en 401.

## 4. Vérifier le quota EmailJS

Compter grossièrement : `nombre d'inscrits × 4` (confirmation + J-7 + J-1 +
jour même), plus les emails de file d'attente. Si le quota du mois est
inférieur, les derniers emails ne partiront pas.

## 5. Vérifier les codes d'accès guides

Un code expire au bout d'un an. Dans l'espace admin → **Codes guides**,
vérifier qu'au moins un code est actif et que sa date de renouvellement est
postérieure au festival. Le communiquer aux guides.

## 6. Faire une inscription de bout en bout

Sur le site public, s'inscrire à une vraie visite avec une adresse personnelle,
puis vérifier :

- l'email de confirmation arrive, avec le bon horaire et le bon lieu ;
- le lien « ajouter au calendrier » fonctionne ;
- le lien d'annulation fonctionne ;
- l'inscription apparaît bien dans le portail guide.

Annuler ensuite l'inscription de test pour libérer la place.

---

## Après le festival

- **Terminer les appels** dans le portail guide. Vous avez 30 jours après
  chaque visite : passé ce délai, noms et emails sont effacés (RGPD) et les
  présences non pointées sont perdues pour de bon.
- Relever le **bilan de fréquentation** (inscrits, présents, absents, taux
  d'absentéisme). Les compteurs anonymes sont conservés sans limite, mais notez
  le taux quelque part : c'est lui qui permettra de régler le surbooking
  l'année suivante.
- Noter les créneaux qui ont affiché complet et la taille des files d'attente :
  c'est la meilleure indication pour dimensionner le programme suivant.
