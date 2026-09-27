# Cékalivre — Cahier des charges (MVP)

Sep 24, 2026 · @claude

## Contexte et objectif

Premier projet solo d'application mobile / SaaS. L'objectif principal n'est pas (encore) de générer des revenus, mais de se lancer concrètement sur une idée réelle, d'apprendre le développement mobile de bout en bout, et d'accepter que le projet puisse échouer sans que ce soit un problème — l'apprentissage prime sur le résultat pour cette v0. Vu le nombre de chauffeurs livreurs que l'auteur connaît personnellement, le potentiel de générer un vrai revenu avec ce projet est désormais pris au sérieux — mais la priorité pour la v0 reste de valider gratuitement, sans aucune dépense, avant d'envisager la monétisation.

## Problème à résoudre

L'auteur est chauffeur-livreur indépendant pour un sous-traitant UPS en Belgique, en complément de son activité salariée. Il livre environ 100 adresses par jour et paie actuellement \~20 €/mois pour l'application Spoke (anciennement Circuit Route Planner) qui calcule l'ordre optimal de ses arrêts à partir de sa position et d'un point d'arrivée. Plusieurs collègues chauffeurs du même sous-traitant utilisent aussi cet outil et payent le même abonnement.

## Utilisateur cible

Premier testeur réel : l'auteur lui-même, sur ses propres tournées de livraison. Si la v0 tient ses promesses, l'outil pourra être proposé aux collègues chauffeurs du même sous-traitant.

Chaque chauffeur gère sa tournée de façon totalement indépendante — il n'y a pas de patron/dispatcher qui assigne ou supervise les tournées des autres. L'application n'a donc besoin d'aucune vue multi-chauffeurs ni fonctionnalité de gestion d'équipe pour cette version.

## Périmètre fonctionnel — MVP v0

- Saisie d'une liste d'adresses pour la tournée du jour (collage de texte ou saisie manuelle, une adresse par ligne)
- Pour chaque arrêt, possibilité d'ajouter une note et une photo du colis, pour aider le chauffeur à le retrouver facilement parmi la centaine de colis du camion
- Point de départ = position GPS actuelle du téléphone
- Point d'arrivée optionnel (sinon la tournée se termine simplement au dernier arrêt optimisé)
- Un bouton "Optimiser" qui calcule l'ordre de passage le plus efficace
- Affichage de la liste des arrêts dans l'ordre optimisé
- Vue carte avec un repère numéroté par arrêt, correspondant à l'ordre de passage optimisé
- Possibilité de modifier une adresse déjà ajoutée, d'en dupliquer une (utile si plusieurs colis à la même adresse) ou de la supprimer avant de lancer la tournée
- Pour chaque arrêt (ou pour la tournée entière), un bouton qui ouvre directement Google Maps pour la navigation turn-by-turn réelle — l'application ne réimplémente pas sa propre navigation. Waze n'est pas requis pour cette version.
- Marquer un arrêt comme livré (avec possibilité d'annuler), pour suivre sa progression au fil de la tournée
- Compteur de progression affiché (ex. 73/74) indiquant le nombre d'arrêts terminés sur le total du jour

## Hors périmètre pour la v0

Ces fonctionnalités existent dans Spoke mais sont volontairement exclues du MVP — à ajouter seulement si le concept de base fait ses preuves à l'usage :

- Scan OCR d'une adresse à partir d'une photo pour la saisie automatique (différent de la photo du colis, qui elle fait partie du MVP)
- Ajout d'arrêts par commande vocale
- Import de feuille de calcul (Excel/CSV)
- Toute fonctionnalité multi-chauffeurs, dispatch ou vue patron

## Contraintes et choix techniques

Le volume d'environ 100 arrêts par jour dépasse la limite gratuite/simple de la plupart des API de cartes grand public, qui plafonnent souvent l'optimisation automatique autour de 25 points d'arrêt. Deux options possibles :

1. **API de routing avancée, payante à l'usage** — par exemple la Route Optimization API de Google, qui gère nativement de gros volumes de points mais engendre un coût récurrent par requête.
2. **Combo open-source gratuite** — un moteur de calcul de distances auto-hébergé (OSRM) couplé à un solveur d'optimisation gratuit (OR-Tools de Google), pour calculer soi-même l'ordre optimal sans dépendre d'une API payante.

Contrainte budgétaire précisée : le coût doit rester de l'ordre de quelques centimes par mois et par utilisateur, même avec plusieurs optimisations par jour, tous les jours. À ce niveau de fréquence d'usage, une API payante à l'usage devient risquée à budgétiser sur la durée, alors que la combo open-source (OSRM + OR-Tools) auto-hébergée n'a quasiment aucun coût marginal par optimisation — seul le coût d'hébergement du serveur compte, mutualisé entre tous les utilisateurs. C'est donc l'option recommandée pour la v0, y compris si le projet reste payant pour l'utilisateur final.

## Stack technique recommandée

- **Application mobile : Expo (React Native)** — permet de tester très rapidement sur téléphone via l'app Expo Go, sans passer par une validation App Store/Play Store au départ. Publication native sur les deux stores possible une fois le concept validé.
- **Backend simple** — un service exposant un seul endpoint qui reçoit la liste d'adresses (+ point de départ/arrivée) et renvoie la liste ordonnée des arrêts, en s'appuyant sur le choix technique retenu dans la section précédente.
- Stockage des photos de colis — un espace de stockage de fichiers simple et peu coûteux (ex. un bucket compatible S3), lié à chaque arrêt de la tournée
- Carte : Google Maps intégré directement dans l'app via le Maps SDK (Android/iOS) — l'affichage de la carte et des repères numérotés est gratuit et illimité pour un usage mobile natif, exactement comme dans l'exemple Spoke montré par l'auteur. Navigation turn-by-turn : lien direct (deep link) vers l'app Google Maps séparée du téléphone plutôt que le SDK de Navigation payant de Google (qui facture au-delà de 1000 trajets gratuits/mois) — cette approche reste gratuite quel que soit le volume d'utilisation.

## Parcours utilisateur

1. Le chauffeur ouvre l'application au début de sa journée
2. Il colle ou saisit la liste des adresses à livrer ce jour-là
3. Pour les arrêts qui le nécessitent, il ajoute une note et/ou une photo du colis correspondant
4. L'application récupère sa position GPS actuelle comme point de départ
5. Il précise le point d'arrivée qui est deja enregistrer par defaut dans les parametre de l'app maiss il peux la modifier pour ce trajet
6. Il appuie sur "Optimiser"
7. L'application affiche la liste des arrêts dans l'ordre optimisé
8. Il appuie sur le premier arrêt, qui ouvre Google Maps pour la navigation réelle
9. Une fois arrivé, il revient à l'application et passe à l'arrêt suivant, et ainsi de suite jusqu'à la fin de la tournée

## Critères de succès

La v0 est considérée comme un succès si l'auteur parvient à remplacer Spoke par cette application pendant plusieurs jours réels de tournée, et que :

- L'ordre des arrêts proposé est fiable et cohérent avec le terrain
- Le temps gagné (ou perdu) par rapport à Spoke est mesurable et comparé honnêtement
- L'usage au quotidien reste simple, sans friction majeure

Ce n'est qu'après cette validation personnelle que la question de proposer l'outil à des collègues chauffeurs se posera.