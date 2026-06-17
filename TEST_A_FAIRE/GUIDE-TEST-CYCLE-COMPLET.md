# 🎭 Test grandeur nature — Visites Guidées

Document à faire ensemble (guide + organisateur). On crée de fausses visites, on s'inscrit,
et on déroule tout le cycle pour vérifier que tout fonctionne avant le vrai lancement.

**Durée : ~30 min.** Prévoir 2 personnes minimum (toi guide + 1 « participant » qui s'inscrit).
Idéalement 2-3 adresses email différentes pour jouer plusieurs participants.

---

## 🔑 Infos utiles

| | |
|---|---|
| Site public (inscription) | **https://www.1hall1artiste.fr/#/reservations** |
| Espace guide | **https://www.1hall1artiste.fr/#/guide** |
| Code d'accès guide (test) | **TESTGUIDE123** |

💡 **Astuce** : si tu changes d'adresse directement dans la barre du navigateur, **recharge la page (F5)**.
Sinon clique simplement les liens/boutons dans le site.

---

## Étape 0 — (ADMIN) Préparer les lieux de départ 📍

*Réservé à l'organisateur/admin, une seule fois. Le guide ne saisit jamais de coordonnées GPS.*

Les points de départ sont gérés dans Firebase (comme le code guide).

1. Console Firebase → **Realtime Database**
2. Ajouter un nœud **`visit_locations`**
3. Sous `visit_locations`, créer un lieu (ex. `lieu_1`) avec :
   - `name` : `Place de la Petite Hollande`
   - `lat` : `47.2110`
   - `lng` : `-1.5540`
4. Répéter pour 2-3 lieux (ex. `Quai Turenne`, `Allée Duguay-Trouin`).

✅ Ces lieux apparaîtront dans le menu déroulant du guide.

---

## Étape 1 — Le guide crée une visite test 🗺️

1. Va sur **https://www.1hall1artiste.fr/#/guide**
2. Entre le code **TESTGUIDE123** → *Accéder*
3. Clique **« + Créer une visite »**
4. Remplis (exemple) :
   - **Intitulé** : `TEST — Visite de l'Île Feydeau`
   - **Date & heure** : demain, 14:00
   - **Durée** : 90 min
   - **Capacité** : `3` *(petit exprès, pour tester la file d'attente)*
   - **Point de départ** : choisis un lieu dans le menu déroulant *(préparé par l'admin)*
   - **Labels** : `test, architecture`
5. Clique **Créer**

✅ La visite apparaît dans le tableau de bord.

> Si le menu « Point de départ » est vide → l'admin doit d'abord faire l'Étape 0.

---

## Étape 2 — Premier participant s'inscrit ✍️

*(sur un autre onglet / téléphone, avec une 1ʳᵉ adresse email)*

1. Va sur **https://www.1hall1artiste.fr/#/reservations**
2. Clique la visite **TEST — Visite de l'Île Feydeau**
3. Vérifie : **Places restantes : 3/3**
4. Remplis : prénom, nom, **ton email**
5. *(optionnel)* clique **« + Ajouter un accompagnant »** → ajoute 1 personne
   *(rappel : jusqu'à 4 accompagnants = 5 places max par inscription)*
6. Clique **S'inscrire**

✅ Message « Vérifiez votre email ».
📧 **Vérifie ta boîte mail** → email de confirmation reçu avec un **lien de validation**.

---

## Étape 3 — Valider l'inscription (lien email) ✅

1. Dans l'email reçu, clique le **lien de validation**
2. La page affiche **« Inscription confirmée ✅ »**

🔁 Côté guide : recharge le détail de la visite → le participant apparaît dans **Inscrits**,
et **Places restantes** a diminué (du nombre de places du groupe).

---

## Étape 4 — Remplir la visite + tester la FILE D'ATTENTE 🧍🧍🧍

*(avec d'autres emails — ou demande à 1-2 personnes de t'aider)*

1. Inscris assez de participants pour **dépasser la capacité de 3**
2. Le participant en trop voit : **« file d'attente #1 »**
3. 📧 Il reçoit un email confirmant sa position en file d'attente

🔁 Côté guide : onglet **File d'attente** → il apparaît avec sa position.

---

## Étape 5 — Une place se libère → promotion automatique 🔄

1. Un participant **confirmé** annule (lien **« annuler »** dans son email de confirmation,
   puis il confirme son email)
2. *(la promotion tourne automatiquement chaque jour — pour un test immédiat, préviens l'organisateur)*
3. 📧 La personne en file d'attente reçoit un email **« une place s'est libérée »** avec un lien (valable 24h)
4. Elle clique → **« Place confirmée »** → elle passe inscrite

✅ La file d'attente avance toute seule.

---

## Étape 6 — Le jour de la visite : l'APPEL 📋

Côté guide, sur le détail de la visite :

1. Onglet **Appel**
2. Coche **présent / absent** pour chaque inscrit
3. Les compteurs **Présents / Absents** se mettent à jour

Tu peux aussi :
- **Inscrire sur place** quelqu'un qui arrive sans inscription (bouton dans l'onglet Inscrits)
- **Export CSV** : télécharge la liste des inscrits
- **Imprimer** : ouvre une feuille d'appel propre (cases à cocher)

---

## Étape 7 — Modifier une visite ✏️

1. Sur le détail, clique **Modifier**
2. Change par exemple la capacité de 3 → 5
3. Enregistre

✅ Si tu augmentes la capacité et qu'il y a une file d'attente, les places libérées sont
proposées automatiquement aux suivants (par email).
⚠️ Si tu réduis en dessous du nombre d'inscrits, un message t'avertit du surnombre
(à toi de gérer les annulations).

---

## Étape 8 — Droit à l'oubli (RGPD) 🔒

1. En bas de **https://www.1hall1artiste.fr/#/reservations** → lien **« Gérer / supprimer mes données »**
2. Saisis l'email d'un participant test
3. Confirme

✅ Toutes ses inscriptions sont supprimées. *(les données sont aussi effacées automatiquement 24h après chaque visite.)*

---

## ✅ Check-list récap

- [ ] (Admin) Lieux de départ créés
- [ ] Guide crée une visite (choix du lieu dans la liste)
- [ ] Participant s'inscrit (+ accompagnant)
- [ ] Email de confirmation reçu
- [ ] Lien de validation → confirmé
- [ ] Visite pleine → file d'attente
- [ ] Email file d'attente reçu
- [ ] Annulation → place proposée au suivant
- [ ] Appel présent/absent
- [ ] Inscription sur place
- [ ] Export CSV + impression
- [ ] Modifier la visite
- [ ] Suppression RGPD

---

## 🧹 Après le test : nettoyage

Quand on a fini, dis-le à l'organisateur : on supprime les visites et inscriptions de test
(ou on utilise le lien RGPD pour chaque email test). Les vraies visites pourront ensuite être créées proprement.

**Un souci pendant le test ?** Note l'étape + ce que tu as vu (capture d'écran si possible)
et envoie à l'organisateur.
