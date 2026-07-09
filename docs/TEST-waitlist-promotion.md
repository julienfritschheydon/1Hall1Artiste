# Test: Promotion Waitlist Immédiate

Test manuel pour vérifier que les offres waitlist sont envoyées immédiatement quand une place se libère.

## Prérequis
- Variables env configurées: EMAILJS_*, VISIT_EMAILJS_TEMPLATE_IDS, REGISTRATION_SECRET
- Env local ou déploiement Vercel
- Accès RTDB Firebase

## Scénario 1: Annulation → offre immédiate

1. **Créer visite pleine**
   - POST `/api/visit-tours` (guide)
   - Capacity: 2
   - Récupérer `tourId`

2. **Inscrire 2 personnes (confirmé)**
   - POST `/api/visit-register`
   - Email1, Email2
   - Confirmer les deux validations

3. **Ajouter 3e personne en waitlist**
   - POST `/api/visit-register` Email3
   - Répond: `status: "waitlist"` position 1

4. **Annuler première inscription**
   - POST `/api/visit-register?action=cancel`
   - Body: `{ registrationId: Email1_registration, email: Email1 }`
   - ✅ Offre email envoyé à Email3 immédiatement
   - Vérifier RTDB: `waitlist/` → Email3 a `invitationSentAt` + `invitationToken`

5. **Email3 accepte offre (24H)**
   - POST `/api/visit-waitlist/activate`
   - Body: `{ token: invitationToken }`
   - ✅ Email3 passe `confirmé`
   - RTDB: registration créée avec status `confirmé`

## Scénario 2: Augmentation capacité → offres multiples

1. **Visite pleine (capacity 2, 2 confirmés, 3 en queue)**
   - Créer visite cap 2, inscrire 2 + 3 waitlist

2. **Guide augmente capacité de 2 → 4**
   - PUT `/api/visit-tours/{id}`
   - Body: `{ capacity: 4 }`
   - ✅ Offres emails envoyés aux 2 premiers de la queue immédiatement
   - RTDB: waits[0] et waits[1] ont `invitationSentAt` + token

3. **Les deux acceptent (ou 24H passe)**
   - Si acceptent: 2 nouvelles registrations créées
   - Si timeout 24H: batch log rejectedAt, prochaine offre

## Vérification RTDB

```js
// Waitlist avec offre envoyée
waitlist/{id} = {
  id: "...",
  tourId: "tour_xxx",
  email: "user@example.com",
  firstName: "...",
  position: 1,
  invitationToken: "...",      // ← créé lors promotion
  invitationExpiresAt: "2025-...", // 24H from now
  invitationSentAt: "2025-...",    // timestamp immédiat
  createdAt: "...",
}

// Nouvelle registration après acceptation
registrations/{id} = {
  id: "...",
  tourId: "tour_xxx",
  email: "user@example.com",
  status: "confirmé",
  confirmedAt: "2025-...", // ← timestamp acceptation
  createdAt: "...",
}
```

## Vérification Logs

Console logs:
```
[visit-register] Promoted waitlist: wait_456 for tour tour_123
[visit-register] Offer accepted: waitlist_wait_456 → registration_reg_789
```

Audit logs (RTDB):
```
audit_logs/{timestamp} = {
  action: "waitlist_promotion_failed" | "waitlist_offer_email_failed",
  tourId: "...",
  error: "..."
}
```

## Edge Cases

| Cas | Comportement attendu |
|-----|-----|
| Annuler si waitlist vide | Aucun email envoyé, fonction sort silencieusement |
| Visite inexistante | Aucun email, log error dans audit |
| EmailJS fail | Erreur loggée, email retry 3x, puis audit log failure |
| User accepte après 24H | "offer already rejected" error |
| Personne suivante refuse → auto promote | Batch job 24H après pour relancer |
