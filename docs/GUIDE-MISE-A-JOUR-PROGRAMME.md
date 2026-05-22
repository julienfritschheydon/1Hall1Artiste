# Guide de mise à jour du programme

Ce guide est destiné aux organisateurs des Journées du Patrimoine sur l'Île Feydeau. Il explique comment mettre à jour le programme (concerts, expositions, artistes) directement depuis Google Sheets, sans aucune intervention technique.

## Principe

L'application lit deux Google Sheets à chaque ouverture :

- **Expositions** : <https://docs.google.com/spreadsheets/d/1vplrT7GpDU7cJcIYmFMpZ5CUEj0bCE6owhwt0rdaKos/edit>
- **Concerts** : <https://docs.google.com/spreadsheets/d/1bGPyPmm0BLo23JTZ_zMn_OY6x88nrUBfnpIKCTAVl2U/edit>

Toute modification enregistrée dans le Sheet sera visible **immédiatement** par les utilisateurs (à la prochaine ouverture de l'app, ou en tirant l'écran vers le bas pour rafraîchir).

## Une seule règle critique : le partage

Pour que l'application puisse lire un Sheet, il doit être partagé en mode **« Toute personne disposant du lien peut lire »** :

1. Ouvrir le Sheet
2. Cliquer sur **Partager** (en haut à droite)
3. Dans « Accès général », choisir **Tout utilisateur disposant du lien** → **Lecteur**
4. Enregistrer

⚠️ Si ce partage n'est pas activé, l'app utilisera la dernière version connue (cache) ou les données de secours embarquées dans le code.

## Onglet Expositions — colonnes utilisées

| Colonne | Utilisée par l'app ? | Notes |
|---|---|---|
| Samedi | ✅ | Mettre `Oui` ou `Non` |
| Dimanche | ✅ | Mettre `Oui` ou `Non` |
| Adresse expo | ✅ | **Doit correspondre exactement à un nom de lieu** (voir liste plus bas) |
| Prénom et Nom de l'artiste | ✅ | Affiché comme nom de l'artiste |
| Email | ✅ | Affiché dans la fiche |
| Téléphone | ❌ | Ignoré (donnée non publique) |
| Compte Instagram | ✅ | Lien complet (`https://www.instagram.com/...`) |
| Compte Facebook | ✅ | Lien complet |
| Présentation | ✅ | Bio affichée dans la fiche |
| Site internet | ✅ | Affiché si rempli |
| Liens vers exemples de travail | ❌ | Ignoré |
| Exemples d'expositions | ❌ | Ignoré |
| Dimensions / Disposition / Préférence jour / Remarques | ❌ | Ignorés |

Si **Samedi** et **Dimanche** sont tous deux à `Non`, la ligne est ignorée — pratique pour garder un artiste dans le Sheet sans le publier.

## Onglet Concerts — colonnes utilisées

| Colonne | Utilisée par l'app ? | Notes |
|---|---|---|
| Samedi | ✅ | `Oui` / `Non` |
| Dimanche | ✅ | `Oui` / `Non` |
| Horaires | ✅ | Choisir parmi : `14:00 - 14:30`, `14:45 - 15:15`, `15:30 - 16:00`, `16:00 - 16:45`, `17:00 - 17:30`, `17:45 - 18:15`, `18:30 - 19:00` |
| Adresse concert | ✅ | Nom exact d'un lieu |
| Nom du groupe | ✅ | |
| Email | ✅ | |
| Téléphone | ❌ | Ignoré |
| Compte Instagram / Facebook | ✅ | URL complète |
| Présentation | ✅ | |
| Site internet | ✅ | |
| Liens vers une photo (1, 2, 3) | ✅ | Jusqu'à 3 URLs publiques d'images |

## Liste des lieux acceptés (colonne Adresse)

La colonne Adresse accepte soit l'**identifiant interne** (recommandé, déjà disponible en liste déroulante dans le Sheet), soit le **nom affiché**.

| Identifiant (à utiliser dans le Sheet) | Nom affiché dans l'app |
|---|---|
| `quai-turenne-8` | 8 quai Turenne |
| `quai-turenne-9` | 09 quai Turenne / 11 rue Kervégan |
| `quai-turenne-10` | 10 quai Turenne / 13 rue Kervégan |
| `quai-turenne-11` | 11 quai Turenne |
| `rue-duguesclin` | Rue Duguesclin |
| `rue-kervegan-17` | 17 rue Kervégan |
| `allee-duguay-trouin-11` | 11 allée Duguay Trouin / 20 rue Kervégan |
| `allee-duguay-trouin-15` | 15 allée Duguay Trouin |
| `allee-duguay-trouin-16` | 16 allée Duguay Trouin |
| `rue-kervegan-32` | 32 rue Kervégan / 2 place de la Petite Hollande |
| `quai-turenne-9-concert` | (réservé aux concerts) |

💡 La liste déroulante du Sheet contient déjà ces identifiants — utilisez-la pour éviter toute faute de frappe.

## Liens vers des images

Coller une **URL publique** dans la colonne photo. Sources possibles :

- **Google Drive** : clic droit sur l'image → Partager → « Tout utilisateur avec le lien » → copier le lien. Puis transformer le lien `https://drive.google.com/file/d/<ID>/view` en `https://drive.google.com/uc?export=view&id=<ID>`.
- **GitHub** : si l'image est déjà dans le repo, utiliser une URL `raw.githubusercontent.com`.
- **Imgur, Cloudinary, ou tout autre hébergeur public** : copier l'URL directe vers le fichier image (qui termine généralement en `.jpg`, `.png`).

## Ce qui se passe en cas de problème

L'application est conçue pour ne jamais montrer un écran vide :

1. Si le Sheet est inaccessible (réseau coupé, partage retiré, panne Google) → elle utilise la **dernière version mise en cache** sur l'appareil de l'utilisateur (jusqu'à 24h).
2. Si le cache est aussi indisponible → elle utilise les **données embarquées dans l'application** lors du dernier déploiement (filet de sécurité).

Les erreurs de format (lignes mal remplies, lieu introuvable…) n'arrêtent pas le chargement : la ligne fautive est simplement ignorée. Il vaut donc mieux que vous vérifiiez régulièrement le résultat dans l'app après une modification.

## Vérifier le résultat

1. Ouvrir l'app sur un téléphone ou navigateur
2. Tirer l'écran vers le bas pour forcer un rafraîchissement (ou fermer/rouvrir l'app)
3. Vérifier que la modification apparaît bien

Si rien ne change, vérifier :
- Que le Sheet est bien partagé en lecture (cf. début du document)
- Que la ligne a bien `Oui` dans Samedi ou Dimanche
- Que le nom du lieu correspond à la liste ci-dessus
