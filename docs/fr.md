# Ascenseurs en gare SNCF

L'**état des ascenseurs, escalators et trottoirs roulants** des gares SNCF, en service ou en panne,
lu sur le portail open data de SNCF. Environ 2 500 équipements dans quelque 600 gares gérées par
SNCF Gares & Connexions. **Sans compte ni clé.**

Intégration non officielle, sans lien avec SNCF. Développée sans le matériel (et sans flux dédié) :
les données ont été vérifiées en direct le 29/10/2026, vos retours sont les bienvenus.

## Ce que vous obtenez

- Un **appareil par gare** ajoutée : un capteur par ascenseur, escalator ou trottoir roulant (1 = en
  service, 0 = en panne), plus trois capteurs de synthèse : équipements en panne, équipements à
  l'état inconnu, et « Tout en service ».
- Un **widget** « Ascenseurs de la gare » : les équipements d'une gare, en panne d'abord, en rouge,
  gris ou vert.
- Deux **déclencheurs de scène** : un ascenseur ou un escalator tombe en panne, un équipement est
  remis en service, pour toute gare ou celles choisies, et pour un type d'équipement si vous le
  souhaitez.
- Une **action de scène** : un résumé en une phrase (« Toulouse Matabiau : 1 équipement sur 25 en
  panne (…). »), prêt pour un message ou une enceinte, avec les compteurs.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un accès à Internet depuis Gladys : les données viennent de `ressources.data.sncf.com`.
- Ni compte, ni clé d'API.

## Installation

1. Dans Gladys, ouvrez **Intégrations → Installer depuis GitHub**.
2. Collez l'adresse du dépôt : `https://github.com/guim31/gladys-ascenseurs-gares`.
3. Validez, puis ouvrez l'intégration une fois installée.

## Configuration

### Réglages

| Réglage                     | Effet                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Gares                       | Les noms de vos gares, séparés par `;` (10 au plus), par exemple `Toulouse Matabiau; Paris Saint-Lazare`. |
| Rafraîchissement            | Toutes les 10, 15 (par défaut) ou 30 minutes. SNCF recalcule les états toutes les heures.                 |
| Langue des noms et messages | Langue des noms des capteurs de synthèse, du widget et de la phrase de scène. Français par défaut.        |

Un nom est comparé sans accents, majuscules ni tirets (`paris st lazare` fonctionne). Un nom
partiel, une ville par exemple, liste ses gares équipées (`Marseille` donne Marseille Saint-Charles
et Marseille Blancarde), dix au plus. Un code UIC à 8 chiffres fonctionne aussi.

### Ajouter des gares

1. Tapez vos gares et enregistrez.
2. Ouvrez l'onglet **Découverte** de l'intégration : chaque gare trouvée y figure, avec tous ses
   équipements.
3. Ajoutez celles qui vous intéressent à Gladys.

Une gare ajoutée reste suivie même si vous retirez ensuite son nom des réglages.

### Vérifier

Le bouton **État** de la configuration affiche, pour chaque nom saisi, les gares trouvées (ou
pourquoi aucune ne l'est), l'heure de la dernière lecture et la dernière erreur.

## Appareils

Une gare est un appareil nommé « <gare> · ascenseurs et escalators », en lecture seule :

| Fonctionnalité                | Type     | Valeur                                               |
| ----------------------------- | -------- | ---------------------------------------------------- |
| En panne                      | compteur | nombre d'équipements en panne                        |
| État inconnu                  | compteur | nombre d'équipements dont SNCF ne connaît pas l'état |
| Tout en service               | binaire  | 1 quand tous les équipements fonctionnent, sinon 0   |
| Une par équipement (nom SNCF) | binaire  | 1 = en service, 0 = en panne                         |

Les fonctionnalités des équipements gardent le nom SNCF (« Ascenseur - 11 Sortie Londres ») : c'est
celui affiché en gare. Quand SNCF ne connaît pas l'état d'un équipement, son capteur garde la
dernière valeur connue et le compteur « État inconnu » le signale. Si SNCF ajoute un équipement à la
gare, l'onglet Découverte propose de **mettre à jour** l'appareil.

## Widget du tableau de bord

« Ascenseurs de la gare » affiche les équipements d'une gare (la première suivie si aucune n'est
choisie) : en panne d'abord (rouge), état inconnu (gris), puis en service (vert). Dix lignes au
plus, les autres sont comptées en dessous. Le réglage « Masquer les équipements en service » ne
garde que les problèmes.

## Déclencheurs de scène

| Déclencheur                             | Quand                                          |
| --------------------------------------- | ---------------------------------------------- |
| Ascenseur ou escalator en panne         | un équipement d'une gare suivie tombe en panne |
| Ascenseur ou escalator remis en service | un équipement en panne fonctionne de nouveau   |

Filtres : les gares (vide = toutes) et le type d'équipement : ascenseur, escalator ou trottoir
roulant (vide = tous). Variables : gare, équipement, emplacement, nombre en panne dans la gare,
nombre d'équipements. Pour surveiller **un** équipement, utilisez sa fonctionnalité dans un
déclencheur « état d'un appareil » de Gladys.

Un équipement qui passe à l'état inconnu ne déclenche rien ; un équipement qui revient de l'état
inconnu à en service non plus.

## Action de scène

« Résumer l'état des ascenseurs », pour toutes les gares suivies ou celles choisies. Sorties :
`sentence` (phrase), `out_of_order` (en panne), `unknown` (état inconnu), `total` (équipements),
`all_ok` (1 = oui, 0 = non, pour une étape « Continuer seulement si »).

## Exemples de scènes

- Chaque matin avant de partir : lancez le résumé de votre gare, puis envoyez la phrase par Telegram.
- Quand un ascenseur de votre gare tombe en panne : une notification avec l'équipement et son
  emplacement.
- Quand « Tout en service » repasse à 1 : annoncez-le sur l'enceinte de l'entrée.

## Données et rafraîchissement

- Source : le jeu « Etat de fonctionnement des équipements d'élévatique en gare » du portail open
  data SNCF (états OK, KO et INCONNU), et la liste « Gares de voyageurs » pour les noms.
- SNCF recalcule les états **toutes les heures**, à partir des équipements et des équipes de
  maintenance ; ils ne sont pas contractuels.
- L'intégration lit les états de toutes vos gares en **une requête** par cycle, filtrée sur elles,
  et la liste des gares une fois par jour. L'usage anonyme est limité par le portail (quelques
  milliers de requêtes par jour) : l'intégration reste très en dessous.

## Dépannage

- **Aucune gare dans l'onglet Découverte** : appuyez sur **État**. « Aucune gare trouvée » :
  vérifiez l'orthographe, ou tapez une partie du nom. « Aucun ascenseur ni escalator recensé » : la
  gare n'a pas d'équipement dans le jeu de données.
- **Liste des gares indisponible** : le portail SNCF n'a pas répondu ; l'intégration réessaie au
  cycle suivant.
- **Un capteur ne change jamais** : certains équipements restent longtemps à l'état inconnu ; le
  compteur « État inconnu » le montre.
- Logs : **Intégrations → Ascenseurs en gare SNCF → Logs** ; `LOG_LEVEL=debug` pour chaque lecture.

## Limites

- Seules les gares gérées par SNCF Gares & Connexions qui publient leurs équipements (environ 600).
- Les stations de métro et de RER de la RATP ne sont pas couvertes. L'état des ascenseurs
  d'Île-de-France Mobilités demande un compte : non utilisé.
- Un état peut dater d'une heure, parfois plus : vérifiez avant de partir si c'est important.
- Les noms des équipements sont ceux de SNCF, en français.

## Crédits

- Données : SNCF Gares & Connexions, portail open data SNCF (`ressources.data.sncf.com`), sous
  licence ODbL.
- Construit sur le SDK d'intégration de Gladys Assistant. Sans lien avec SNCF.
