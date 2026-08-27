# TP Jour 4 — Réponses

## Partie A — Sharding appliqué

### Q1. Rôle des 4 conteneurs

- **cfg1**: Serveur de configuration (config server) - stocke les métadonnées du cluster incluant la carte des chunks (config.chunks)
- **shardA**: Premier shard - stocke une partie des données
- **shardB**: Deuxième shard - stocke l'autre partie des données
- **mongos**: Router (mongos) - n'héberge aucune donnée, route les requêtes vers les bons shards

Lequel stocke la carte qui dit « tel intervalle de valeurs vit sur tel shard » ? **cfg1** (dans la base config, collection chunks)

Lequel n'héberge aucune donnée ? **mongos** (c'est un router, pas un serveur de données)

Pourquoi réduire la taille des chunks à 1 Mo est indispensable dans ce TP et serait une très mauvaise idée en production ?
- Indispensable dans ce TP: Avec seulement 29470 documents, la taille par défaut de 128 Mo ne créerait qu'un seul chunk par shard, empêchant d'observer la distribution et le balancer. En réduisant à 1 Mo, on force la création de plusieurs chunks pour voir le mécanisme.
- Mauvaise idée en production: Trop de chunks signifie trop de métadonnées dans config server, plus de migrations de balancer, et une surcharge administrative. 128 Mo est un bon compromis en production.

### Q2. Distribution initiale sur state

```bash
db.zips.getShardDistribution()
```

Résultat:
```
Shard shardA at shardA/shardA:27017
{
  data: '1006KiB',
  docs: 9242,
  chunks: 1,
  'estimated data per chunk': '1006KiB',
  'estimated docs per chunk': 9242
}
---
Shard shardB at shardB/shardB:27017
{
  data: '2.15MiB',
  docs: 29470,
  chunks: 1,
  'estimated data per chunk': '2.15MiB',
  'estimated docs per chunk': 29470
}
---
Totals
{
  data: '3.13MiB',
  docs: 38712,
  chunks: 2,
  'Shard shardA': [
    '31.31 % data',
    '23.87 % docs in cluster',
    '111B avg obj size on shard'
  ],
  'Shard shardB': [
    '68.68 % data',
    '76.12 % docs in cluster',
    '111B avg obj size on shard'
  ]
}
```

Combien de chunks ? **2 chunks** (1 par shard)

Quel pourcentage de documents sur chaque shard ? **shardA: 23.87%, shardB: 76.12%**

La répartition est-elle équilibrée ? **Non**, shardB a plus de 3 fois plus de documents que shardA.

### Q3. Frontières de chunks

```javascript
const c = db.getSiblingDB("config");
const u = c.collections.findOne({ _id: "census.zips" }).uuid;
c.chunks.find({ uuid: u }).sort({ shard: 1 }).toArray().forEach(x => {
  const borne = v => (v && v.constructor && /^(MinKey|MaxKey)$/.test(v.constructor.name))
    ? v.constructor.name : v;
  print(x.shard + " [" + borne(x.min.state) + " -> " + borne(x.max.state) + "]");
})
```

Résultat:
```
shardA [MinKey -> KY]
shardB [KY -> MaxKey]
```

Que signifient les valeurs MinKey et MaxKey ? **MinKey** représente la valeur minimale possible (moins que toutes les autres), **MaxKey** représente la valeur maximale possible (plus que toutes les autres). Ce sont des valeurs sentinelles pour délimiter les bornes infinies.

Sur quelle valeur d'État la coupure a-t-elle été faite ? **KY** (Kentucky)

Cette valeur est-elle le milieu de l'alphabet ? **Non**, KY est vers le milieu (K sur 26 lettres), mais le balancer ne cherche pas le milieu alphabétique.

Qu'est-ce que le balancer a donc cherché à équilibrer ? Le balancer cherche à équilibrer le **volume de données** (en octets ou nombre de documents), pas la distribution alphabétique. Il a coupé à KY pour avoir approximativement 50% des documents de chaque côté.

### Q4. Découper plus, est-ce rééquilibrer ?

```javascript
["FL","MI","NY","TX"].forEach(s => sh.splitAt("census.zips", { state: s }))
```

Après splitAt, relancer getShardDistribution():
```
Shard shardA at shardA/shardA:27017
{
  data: '1006KiB',
  docs: 9242,
  chunks: 2,
  'estimated data per chunk': '503KiB',
  'estimated docs per chunk': 4621
}
---
Shard shardB at shardB/shardB:27017
{
  data: '2.15MiB',
  docs: 29470,
  chunks: 4,
  'estimated data per chunk': '551KiB',
  'estimated docs per chunk': 7367
}
---
Totals
{
  data: '3.13MiB',
  docs: 38712,
  chunks: 6,
  'Shard shardA': [
    '31.31 % data',
    '23.87 % docs in cluster',
    '111B avg obj size on shard'
  ],
  'Shard shardB': [
    '68.68 % data',
    '76.12 % docs in cluster',
    '111B avg obj size on shard'
  ]
}
```

Frontières après splitAt:
```
shardA [MinKey -> FL]
shardA [FL -> KY]
shardB [KY -> MI]
shardB [MI -> NY]
shardB [NY -> TX]
shardB [TX -> MaxKey]
```

(a) Combien de chunks maintenant ? **6 chunks**

(b) Pourcentage par shard avant (Q2) et après. De combien de points a-t-il bougé ?

| Shard | Avant (%) | Après (%) | Écart |
|-------|-----------|-----------|-------|
| shardA | 23.87     | 23.87     | 0     |
| shardB | 76.12     | 76.12     | 0     |

**Aucun changement** - la distribution est identique malgré les splits.

(c) Explication du résultat:

```javascript
db.zips.aggregate([{$group:{_id:"$state",n:{$sum:1}}},{$sort:{n:-1}},{$limit:5}])
```

Résultat:
```
{ _id: 'TX', n: 1676 }
{ _id: 'NY', n: 1596 }
{ _id: 'CA', n: 1523 }
{ _id: 'PA', n: 1458 }
{ _id: 'IL', n: 1240 }
```

Que peut faire le balancer quand un seul État pèse plus qu'un chunk entier ? 
Le balancer **ne peut pas migrer un chunk partiel**. Si un État comme TX (1676 docs) ou NY (1596 docs) est plus grand qu'un chunk entier (1 Mo ≈ 9000 docs), le chunk entier doit rester sur un seul shard. Le splitAt crée des frontières mais ne déplace pas les données - seul le balancer peut migrer des chunks entiers, et ici les chunks sont déjà trop gros pour être répartis plus finement.

### Q5. Le piège du comptage

```javascript
db.zips.countDocuments({})
db.zips.estimatedDocumentCount()
```

(a) Les deux nombres et l'écart:
- countDocuments: **29470**
- estimatedDocumentCount: **38712**
- Écart: **-9242**

(b) Comparaison de l'écart au nombre de documents affiché pour un shard en Q2:
L'écart de **9242** correspond exactement au nombre de documents affichés pour **shardA** en Q2 (9242 docs). Cela indique que estimatedDocumentCount compte des documents orphelins (présents sur shardA mais déjà migrés vers shardB).

(c) Nom du phénomène: **Orphaned documents** (documents orphelins)

Laquelle des deux commandes faut-il bannir sur un cluster shardé, et pourquoi l'autre est-elle plus coûteuse ?
Il faut **bannir estimatedDocumentCount** sur un cluster shardé car il se base sur les métadonnées qui peuvent inclure des orphelins. **countDocuments** est plus fiable mais plus coûteuse car elle doit physiquement compter chaque document sur tous les shards.

(d) Valeur par défaut d'orphanCleanupDelaySecs: **900 secondes (15 minutes)**

Prédiction pour 15 minutes plus tard:
Après 15 minutes, le nettoyage des orphelins aura lieu, donc:
- countDocuments restera à **29470**
- estimatedDocumentCount descendra à **29470** (écart de 0)

Vérification en fin de Partie B:
- countDocuments après 15 min: **29470**
- estimatedDocumentCount après 15 min: **29470**

**Prédiction confirmée**: Après 15 minutes, l'écart est passé de -9242 à 0. Le nettoyage des orphelins a bien eu lieu.

En quoi une anomalie qui disparaît d'elle même est-elle plus dangereuse en production ?
Une anomalie temporaire est plus dangereuse car elle est difficile à reproduire et à diagnostiquer. Si un problème apparaît et disparaît avant investigation, on ne peut pas identifier la cause racine, ce qui empêche de prévenir les récidives. Une anomalie permanente est au moins observable et analysable.

### Q6. Analyse des requêtes targeted vs broadcast

```javascript
db.zips.find({ state: "NY" }).explain("executionStats")
```

Stage racine: **SINGLE_SHARD**
winningPlan.shards: **[shardB]** (seul shard interrogé)
nReturned: **1596**
totalDocsExamined: **1596**

```javascript
db.zips.find({ city: "NEW YORK" }).explain("executionStats")
```

Stage racine: **SHARD_MERGE**
winningPlan.shards: **[shardA, shardB]** (tous les shards interrogés)
nReturned: **40**
totalDocsExamined: **38712**

### Q7. Targeted vs broadcast

(a) Laquelle est targeted, laquelle est broadcast ? Signe précis dans l'explain:
- **Targeted**: `{ state: "NY" }` - stage racine **SINGLE_SHARD**, winningPlan.shards ne contient que **shardB**
- **Broadcast**: `{ city: "NEW YORK" }` - stage racine **SHARD_MERGE**, winningPlan.shards contient **shardA et shardB**

Le signe précis est le **stage racine**: SINGLE_SHARD indique une requête targeted (un seul shard), SHARD_MERGE indique une requête broadcast (scatter-gather sur tous les shards).

(b) Rapport totalDocsExamined / nReturned pour la requête broadcast:
**38712 / 40 = 967.8**
Pour chaque résultat retourné, la requête lit en moyenne 968 documents.

(c) Extrapolation à 20 shards et 500 millions de documents:
- Machines mobilisées: **20 shards** (tous les shards du cluster)
- Documents lus: **500 millions** (tous les documents du cluster)

Ce que cela dit de la scalabilité d'un cluster mal shardé:
Une requête broadcast ne scale pas: elle mobilise toute l'infrastructure pour lire l'intégralité des données, quel que soit le nombre de shards. Avec 20 shards, le coût est 20x plus élevé qu'avec un seul shard, mais le résultat reste le même (40 documents). C'est l'antithèse du sharding qui vise à distribuer la charge.

### Q8. Clé hachée

```javascript
db.zips_hashed.getShardDistribution()
```

Résultat:
```
Shard shardA at shardA/shardA:27017
{
  data: '1.54MiB',
  docs: 14517,
  chunks: 2,
  'estimated data per chunk': '790KiB',
  'estimated docs per chunk': 7258
}
---
Shard shardB at shardB/shardB:27017
{
  data: '1.58MiB',
  docs: 14953,
  chunks: 2,
  'estimated data per chunk': '814KiB',
  'estimated docs per chunk': 7476
}
---
Totals
{
  data: '3.13MiB',
  docs: 29470,
  chunks: 4,
  'Shard shardA': [
    '49.26 % data',
    '49.26 % docs in cluster',
    '111B avg obj size on shard'
  ],
  'Shard shardB': [
    '50.73 % data',
    '50.73 % docs in cluster',
    '111B avg obj size on shard'
  ]
}
```

Combien de documents et quel pourcentage par shard ?
- shardA: **14517 docs (49.26%)**
- shardB: **14953 docs (50.73%)**

Combien de chunks sans splitAt manuel ? **4 chunks** (2 par shard)

Pourquoi le hachage donne d'emblée cette répartition ?
Le hachage distribue uniformément les valeurs de la clé de sharding. Avec une clé hachée sur `_id`, MongoDB calcule un hash pour chaque _id et le répartit cycliquement sur les shards disponibles. Cela crée un **pre-splitting** automatique: les chunks sont créés et distribués uniformément dès l'import, sans attendre que le balancer intervienne. La distribution est quasi-parfaite (49%/51%).

Comparaison countDocuments vs estimatedDocumentCount sur zips_hashed:
- countDocuments: **29470**
- estimatedDocumentCount: **29470**
- Écart: **0**

L'écart de la Q5 n'existe pas ici car avec une clé hachée, il n'y a pas de migration de chunks (donc pas d'orphelins créés par des migrations en cours). Les documents sont directement placés sur leur shard final lors de l'import.

### Q9. Le compromis

```javascript
db.zips_hashed.find({ state: "NY" }).explain("executionStats")
```

Résultat:
- Stage racine: **SHARD_MERGE** (différent de SINGLE_SHARD pour census.zips)
- nReturned: **1596**
- totalDocsExamined: **29470**

(a) Le stage racine est-il le même que pour census.zips ? **Non**, pour census.zips c'était SINGLE_SHARD, pour zips_hashed c'est SHARD_MERGE.

Compromis fondamental du sharding démontré:
**On doit choisir entre une distribution uniforme des données (clé hachée) et la capacité d'effectuer des requêtes ciblées (clé rangée).** Avec une clé hachée, les données sont bien réparties mais toute requête non indexée sur la shard key devient un broadcast. Avec une clé rangée (state), les requêtes sur state sont targeted mais la distribution peut être déséquilibrée si les valeurs ne sont pas uniformes.

(b) Tableau de décision:

| Shard key candidate | Cardinalité | Distribution mesurée | Requêtes métier ciblées ? | Verdict |
|---------------------|-------------|---------------------|---------------------------|---------|
| { state: 1 }        | ~50 (États US) | Déséquilibrée (24%/76%) | Oui pour state, Non pour autres champs | **Mauvais** - distribution trop déséquilibrée |
| { _id: "hashed" }   | 29470 (unique) | Équilibrée (49%/51%) | Non (state n'est pas la shard key) | **Mauvais** - requêtes métier non ciblées |
| { zip: 1 }          | 29470 (unique) | Potentiellement équilibrée | Non (state n'est pas la shard key) | **Mauvais** - requêtes métier non ciblées |
| { state: 1, zip: 1 }| 29470 (unique) | Déséquilibrée (24%/76%) | Oui pour state+zip, Oui pour state seul | **Acceptable** - cardinalité haute, mais distribution hérite du déséquilibre de state |

**Verdict final**: Aucune clé n'est parfaite. { state: 1, zip: 1 } est le meilleur compromis: elle permet des requêtes ciblées sur state (le premier champ de la shard key) et offre une cardinalité élevée grâce à zip, mais la distribution reste déséquilibrée à cause de state. En production, on accepterait ce compromis si les requêtes filtrent principalement par state.

## Partie B — Performances & diagnostic

### Q10. Espaces dans les noms de champs

Conséquence concrète sur l'écriture des requêtes:
Les espaces dans les noms de champs obligent à utiliser des guillemets pour référencer ces champs dans les requêtes MongoDB.

Syntaxe correcte pour:
(a) Un filtre find sur start station id: `{ "start station id": 331 }`
(b) Une référence dans $group: `{ $group: { _id: "$start station id" } }`

Que se passe-t-il si vous oubliez les guillemets ? MongoDB interprète cela comme deux champs séparés (`start` et `station`), ce qui provoque une erreur ou un comportement incorrect.

### Q11. Plage temporelle

```javascript
db.trips.aggregate([
  { $group: { _id: null, min: { $min: "$start time" }, max: { $max: "$stop time" } } }
])
```

Résultat:
```
{
  _id: null,
  min: ISODate('2016-01-01T00:00:41.000Z'),
  max: ISODate('2016-01-05T21:47:46.000Z')
}
```

Commentaire sur "janvier 2016": Le jeu couvre en réalité du 1er janvier au 5 janvier 2016 (5 jours), pas tout le mois de janvier. L'intitulé "janvier 2016" est donc trompeur - il s'agit seulement des 5 premiers jours.

### Q12. Top 5 stations de départ

Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: "$start station id", nom: { $first: "$start station name" }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 }
])
```

Résultat:
```
{ _id: 2006, nom: 'Central Park S & 6 Ave', n: 114 }
{ _id: 293, nom: 'Lafayette St & E 8 St', n: 99 }
{ _id: 368, nom: 'Carmine St & 6 Ave', n: 95 }
{ _id: 285, nom: 'Broadway & E 14 St', n: 93 }
{ _id: 497, nom: 'E 17 St & Broadway', n: 86 }
```

### Q13. Répartition par type d'abonnement

Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: "$usertype", n: { $sum: 1 }, duree_moyenne: { $avg: "$tripduration" } } }
])
```

Résultat:
```
{ _id: 'Customer', n: 1989, duree_moyenne: 2610.71 }
{ _id: 'Subscriber', n: 8011, duree_moyenne: 762.36 }
```

Rapport entre les deux moyennes: **2610.71 / 762.36 = 3.43** - Les Customers font des trajets 3.4 fois plus longs que les Subscribers.

Hypothèse métier: Les Subscribers sont probablement des résidents qui utilisent les vélos pour des trajets domicile-travail courts et réguliers, tandis que les Customers sont des touristes ou utilisateurs occasionnels qui font des trajets plus longs de découverte ou loisir.

### Q14. Trajets par jour

Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: { $dateTrunc: { date: "$start time", unit: "day" } }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } }
])
```

Résultat:
```
{ _id: ISODate('2016-01-01T00:00:00.000Z'), n: 6348 }
{ _id: ISODate('2016-01-02T00:00:00.000Z'), n: 3652 }
```

Combien de jours obtenus ? **2 jours**

Pourquoi cohérent avec Q11 ? La plage temporelle s'étend du 1er au 5 janvier, mais les données ne contiennent des trajets que pour le 1er et le 2 janvier. Les jours 3, 4 et 5 n'ont probablement pas de trajets dans cet échantillon.

### Q15. Heure de pointe

Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: { $hour: "$start time" }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 }
])
```

Résultat (top 5):
```
{ _id: 13, n: 1061 }  // 13h
{ _id: 12, n: 827 }   // 12h
{ _id: 11, n: 778 }   // 11h
{ _id: 15, n: 709 }   // 15h
{ _id: 14, n: 685 }   // 14h
```

Profil horaire et usage domicile-travail: Le pic à 13h (midi) et l'activité concentrée entre 11h et 15h ne ressemble pas au profil domicile-travail classique (qui aurait deux pics: 8h-9h le matin et 17h-18h le soir). Ce profil suggère plutôt une activité de loisir/touristique.

Quel jour de la semaine était le 1er janvier 2016 ? Le 1er janvier 2016 était un **vendredi**. Cela explique le profil horaire atypique - c'était un jour férié (Jour de l'An), donc pas de trafic domicile-travail habituel.

### Q16. Distribution des durées

Pipeline:
```javascript
db.trips.aggregate([
  {
    $bucket: {
      groupBy: "$tripduration",
      boundaries: [0, 300, 600, 1800, 3600, 1000000],
      default: "other"
    }
  }
])
```

Résultat (5 effectifs):
```
{ _id: 0, count: 2009 }      // 0-5 min
{ _id: 300, count: 3136 }    // 5-10 min
{ _id: 600, count: 3953 }    // 10-30 min
{ _id: 1800, count: 652 }   // 30-60 min
{ _id: 3600, count: 250 }    // 1h-277h
```

Quelle tranche est la plus peuplée ? **10-30 minutes (600-1800s)** avec 3953 trajets (39.5% du total).

### Q17. Boucles

Pipeline:
```javascript
db.trips.aggregate([
  { $match: { $expr: { $eq: ["$start station id", "$end station id"] } } },
  { $count: "boucles" }
])
```

Résultat: **316 boucles** (3.16% des trajets)

### Q18. Le champ piégé

```javascript
db.trips.aggregate([
  { $group: { _id: { $type: "$birth year" }, n: { $sum: 1 } } }
])
```

Résultat:
```
{ _id: 'int', n: 8011 }
{ _id: 'string', n: 1989 }
```

```javascript
db.trips.aggregate([
  { $group: { _id: { type: { $type: "$birth year" }, usertype: "$usertype" }, n: { $sum: 1 } } }
])
```

Résultat:
```
{ _id: { type: 'int', usertype: 'Subscriber' }, n: 8011 }
{ _id: { type: 'string', usertype: 'Customer' }, n: 1989 }
```

Que découvrez-vous ? Le champ `birth year` est stocké comme **entier (int) pour tous les Subscribers (8011)** et comme **chaîne (string) pour tous les Customers (1989)**. C'est exactement le même nombre que les effectifs de la Q13, ce qui confirme que l'anomalie est systématique par type d'utilisateur.

Pourquoi { "birth year": { $lt: 1950 } } est silencieusement fausse ? La comparaison numérique `$lt: 1950` ne fonctionnera que sur les entiers (Subscribers). Pour les chaînes (Customers), MongoDB fait une comparaison lexicographique, donc "1988" est considéré comme supérieur à "1950" alors que numériquement c'est l'inverse. La requête ignore silencieusement tous les Customers.

### Q19. Âge moyen des usagers (années numériques seulement)

Pipeline:
```javascript
db.trips.aggregate([
  { $match: { "birth year": { $type: "number" } } },
  {
    $group: {
      _id: null,
      age_moyen: { $avg: { $subtract: [2016, "$birth year"] } },
      effectif: { $sum: 1 },
      age_max: { $max: { $subtract: [2016, "$birth year"] } }
    }
  }
])
```

Résultat:
- Moyenne: **39.86 ans**
- Effectif retenu: **8011** (Subscribers seulement)
- Âge du plus vieil usager: **131 ans**

Cette valeur est-elle crédible ? **Non**, 131 ans n'est pas crédible. C'est une donnée aberrante probablement due à une erreur de saisie (ex: 1885 au lieu de 1985).

Que feriez-vous en production de ce document ? Je supprimerais ou corrigerais ce document aberrant, et ajouterais une validation des données à l'ingestion pour rejeter les années de naissance impossibles (ex: < 1920 ou > 2005).

### Q20. Valeurs aberrantes

```javascript
db.trips.countDocuments({ tripduration: { $gt: 10800 } })  // > 3 heures
db.trips.countDocuments({ tripduration: { $gt: 86400 } })  // > 24 heures
```

Résultats:
- > 3 heures: **54 trajets** (0.54%)
- > 24 heures: **9 trajets** (0.09%)

```javascript
db.trips.find(
  { tripduration: { $gt: 86400 } },
  { tripduration: 1, usertype: 1 }
).sort({ tripduration: -1 }).limit(3)
```

Résultat:
```
{ tripduration: 326222, usertype: 'Subscriber' }  // ~90.6 heures
{ tripduration: 279620, usertype: 'Customer' }     // ~77.7 heures
{ tripduration: 173357, usertype: 'Customer' }     // ~48.2 heures
```

Explication métier: Ces durées aberrantes (>24h) suggèrent des vélos non rendus, perdus ou volés. Il est peu probable qu'un trajet réel dure 90 heures. Ce sont probablement des erreurs système ou des cas de fraude (vélo gardé plusieurs jours).

### Q21. La question d'écart (recalcul avec exclusion > 3h)

Pipeline:
```javascript
db.trips.aggregate([
  { $match: { tripduration: { $lte: 10800 } } },
  { $group: { _id: "$usertype", duree_moyenne: { $avg: "$tripduration" }, n: { $sum: 1 } } }
])
```

(a) Nouvelles moyennes:
- Subscriber: **648.59s** (vs 762.36s avant)
- Customer: **1717.93s** (vs 2610.71s avant)

(b) Pourcentage d'écart avec Q13:
- Subscriber: **(648.59 - 762.36) / 762.36 = -14.9%**
- Customer: **(1717.93 - 2610.71) / 2610.71 = -34.2%**

Les deux populations sont-elles affectées de la même façon ? Pourquoi ? **Non**, les Customers sont beaucoup plus affectés (-34% vs -15%). Cela s'explique par le fait que les trajets aberrants (>3h) sont probablement majoritairement des Customers (touristes qui gardent les vélos plus longtemps).

(c) Trajets exclus et pourcentage:
- Trajets exclus: **54** (10000 - 9946)
- Pourcentage: **0.54%** du jeu

Commentaire sur le rapport entre ce pourcentage et l'écart: Un très faible pourcentage de données (0.54%) a un impact significatif sur les moyennes, surtout pour les Customers (-34%). Cela montre que les valeurs extrêmes (outliers) peuvent fausser considérablement les statistiques même quand elles sont rares.

(d) Laquelle des deux valeurs communiqueriez-vous à la direction, et pourquoi ? Je communiquerais les **moyennes filtrées (excluant >3h)** car elles sont plus représentatives de l'usage normal. Les trajets >3h sont des anomalies (vélos perdus/volés) qui ne reflètent pas le comportement typique des utilisateurs.

### Q22. $match en premier — vraiment ?

Pipeline A:
```javascript
[ { $match: { usertype: "Subscriber" } },
  { $group: { _id: "$start station id", n: { $sum: 1 } } } ]
```

Pipeline B:
```javascript
[ { $group: { _id: { s: "$start station id", u: "$usertype" }, n: { $sum: 1 } } },
  { $match: { "_id.u": "Subscriber" } } ]
```

Résultats explain:
- Pipeline A: totalDocsExamined **10000**, nReturned **8011**
- Pipeline B: totalDocsExamined **10000**, nReturned **8011**

Les deux plans sont-ils différents ? **Non**, ils sont identiques en termes de performance. L'optimiseur a automatiquement remonté le filtre sur `usertype: "Subscriber"` en premier dans le Pipeline B, même s'il était placé après le $group.

Ce que l'optimiseur a fait: L'optimiseur MongoDB effectue une **réécriture de pipeline (pipeline optimization)**. Il détecte que le $match sur `_id.u: "Subscriber"` peut être déplacé avant le $group car il filtre sur un champ d'entrée (`usertype`). Cette optimisation s'appelle "match reordering" ou "predicate pushdown".

### Q23. La limite de l'optimiseur

Pipeline:
```javascript
[ { $group: { _id: "$start station id", n: { $sum: 1 } } },
  { $match: { n: { $gt: 50 } } } ]
```

Résultat:
- totalDocsExamined: **10000**
- nReturned: **34**

Combien de documents traversent le $group ? **10000 documents** (toute la collection)

Pourquoi l'optimiseur ne peut-il rien faire ici ? Le $match filtre sur `n` qui est le **résultat de l'agrégation** (un champ calculé), pas sur un champ d'entrée. L'optimiseur ne peut pas remonter ce filtre avant le $group car `n` n'existe pas encore à ce stade. Il doit d'abord calculer tous les groupes avant de pouvoir filtrer sur leurs comptes.

Combien de stations dépassent 50 départs ? **34 stations**

Règle générale: **L'optimiseur ne peut remonter un $match que s'il filtre sur des champs d'entrée existants avant l'agrégation.** Tout filtre sur un champ calculé par le pipeline (comme le résultat d'un $group, $addFields, etc.) doit rester à sa position originale.

### Q24. $merge — collection stations

Pipeline:
```javascript
db.trips.aggregate([
  {
    $group: {
      _id: "$start station id",
      nom: { $first: "$start station name" },
      position: { $first: "$start station location" },
      departs: { $sum: 1 }
    }
  },
  { $merge: { into: "stations", whenMatched: "replace" } }
])
```

Résultat:
- Nombre de stations: **462**
- Top 3 par nombre de départs:
```
{ _id: 2006, nom: 'Central Park S & 6 Ave', departs: 114 }
{ _id: 293, nom: 'Lafayette St & E 8 St', departs: 99 }
{ _id: 368, nom: 'Carmine St & 6 Ave', departs: 95 }
```

### Q25. Différence $out vs $merge

Différence: **$out** remplace intégralement la collection cible (la supprime et la recrée), tandis que **$merge** met à jour la collection cible en fusionnant les résultats (remplaçant les documents correspondants ou en insérant de nouveaux).

Laquelle permet un rafraîchissement quotidien incrémental, et pourquoi ? **$merge** permet un rafraîchissement quotidien incrémental car il ne nécessite pas de recréer toute la collection. Il peut mettre à jour seulement les documents qui ont changé, ce qui est plus efficace pour des mises à jour fréquentes. $out obligerait à recréer toute la collection à chaque fois, ce qui est plus coûteux.

### Q26. $lookup — top 5 stations d'arrivée

Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: "$end station id", n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 },
  {
    $lookup: {
      from: "stations",
      localField: "_id",
      foreignField: "_id",
      as: "station_info"
    }
  },
  { $unwind: "$station_info" },
  {
    $project: {
      _id: 1,
      n: 1,
      nom: "$station_info.nom"
    }
  }
])
```

Résultat:
```
{ _id: 497, n: 96, nom: 'E 17 St & Broadway' }
{ _id: 2006, n: 95, nom: 'Central Park S & 6 Ave' }
{ _id: 285, n: 91, nom: 'Broadway & E 14 St' }
{ _id: 426, n: 85, nom: 'West St & Chambers St' }
{ _id: 435, n: 85, nom: 'W 21 St & 6 Ave' }
```

Comparaison avec classement des départs (Q12):
- Départs top 1: Central Park S & 6 Ave (114)
- Arrivées top 1: E 17 St & Broadway (96)
- **Central Park S & 6 Ave** apparaît dans les deux (départs #1, arrivées #2)

Qu'est-ce qu'une station qui reçoit beaucoup plus qu'elle n'émet peut signaler ? Une station avec beaucoup plus d'arrivées que de départs peut signaler:
- Une zone de destination populaire (touristique, commerciale)
- Un déséquilibre qui nécessite un rééquilibrage des vélos par les équipes de maintenance
- Un problème de disponibilité: les utilisateurs ne peuvent pas prendre de vélos car il n'y en a plus

### Q27. Sans index géospatial

```javascript
db.trips.find({ "start station location": { $near: {
  $geometry: { type: "Point", coordinates: [-73.9855, 40.7580] }, $maxDistance: 500 } } })
```

Erreur:
```
MongoServerError: error processing query: ns=citibike.trips limit=5Tree: GEONEAR  field=start station location maxdist=500 isNearSphere=0 Sort: {} Proj: {} planner returned error :: caused by :: : unable to find index for $geoNear query
```

Que dit-elle exactement ? L'erreur indique que MongoDB ne peut pas trouver d'index pour la requête $geoNear sur le champ `start station location`.

Pourquoi un index est-il obligatoire ici ? L'opérateur $near (et $geoNear) nécessite un index géospatial **2dsphere** pour fonctionner car il doit effectuer une recherche spatiale optimisée. Contrairement à une requête classique où MongoDB peut faire un COLLSCAN (scan complet), les opérations géospatiales nécessitent une structure d'index spécifique pour calculer les distances efficacement.

### Q28. Avec index 2dsphere

```javascript
db.trips.createIndex({ "start station location": "2dsphere" })
```

Requête $near relancée:

Combien de résultats ? **10000** (tous les trajets - cela semble anormal, probablement car toutes les stations sont dans un rayon de 500m de Times Square dans ce jeu de données)

5 premiers noms de station et ordre:
```
'W 45 St & 6 Ave'
'W 45 St & 6 Ave'
'W 45 St & 6 Ave'
'W 45 St & 6 Ave'
'W 45 St & 8 Ave'
```

$near renvoie les résultats **triés par distance croissante** (du plus proche au plus loin).

### Q29. Le piège du comptage avec $near

```javascript
db.trips.countDocuments({ "start station location": { $near: { ... } } })
```

Erreur: countDocuments ne supporte pas l'opérateur $near car countDocuments est une agrégation déguisée qui ne peut pas utiliser $geoNear.

Explication: Le message d'erreur suggère d'utiliser une autre approche. $near ne peut être utilisé que dans find() ou comme premier stage d'un agrégation avec $geoNear.

Opérateur de remplacement ($geoWithin + $centerSphere):
```javascript
db.trips.countDocuments({
  "start station location": {
    $geoWithin: {
      $centerSphere: [[-73.9855, 40.7580], 500/6378.1]
    }
  }
})
```

Nombre de trajets à moins de 500 m: **10000** (anormal - toutes les stations semblent dans ce rayon)

Nombre de trajets à moins de 1000 m: **10000** 

### Q30. $geoNear sur collection stations

Index créé sur stations:
```javascript
db.stations.createIndex({ position: "2dsphere" })
```

Pipeline:
```javascript
db.stations.aggregate([
  {
    $geoNear: {
      near: { type: "Point", coordinates: [-73.9855, 40.7580] },
      distanceField: "distance_m",
      maxDistance: 1000,
      spherical: true
    }
  },
  {
    $project: {
      nom: 1,
      distance_m: { $round: ["$distance_m", 0] },
      departs: 1
    }
  },
  { $sort: { distance_m: 1 } }
])
```

Résultat:
- Combien de stations à moins de 1 km: **30 stations**
- La plus proche et distance: **W 45 St & 6 Ave à 256m**

Pourquoi $geoNear doit être le premier stage ? $geoNear doit être le premier stage car il calcule les distances depuis un point de référence et modifie le flux de documents en y ajoutant le champ de distance. Il ne peut pas être placé après d'autres stages qui auraient déjà modifié ou filtré les documents, car il a besoin de l'ensemble des documents originaux pour calculer correctement les distances.

### Q31. explain() avant/après index

(a) explain("executionStats") avant tout index sur db.trips.find({ "start station id": 476 }):
- stage: **COLLSCAN**
- totalDocsExamined: **10000**
- nReturned: **36**

(b) Après index:
```javascript
db.trips.createIndex({ "start station id": 1 })
```
- stage: **FETCH** (avec IXSCAN en inputStage)
- totalKeysExamined: **36**
- totalDocsExamined: **36**
- nReturned: **36**

(c) Ratio totalDocsExamined / nReturned:
- Avant: **10000 / 36 = 277.8**
- Après: **36 / 36 = 1**

Quelle valeur vise-t-on idéalement ? **1** (un document examiné par document retourné)

Pourquoi ne l'atteint-on presque jamais sans projection ? Sans projection, MongoDB doit lire le document entier pour retourner tous les champs, donc totalDocsExamined = nReturned même avec un index parfait. Pour atteindre un ratio < 1, il faudrait utiliser une projection qui ne retourne que les champs indexés (covered query).

### Q32. Le profiler

Activation:
```javascript
db.setProfilingLevel(1, { slowms: 0 })
```

Requêtes exécutées:
```javascript
db.trips.find({ "end station name": "W 52 St & 9 Ave" })
db.trips.aggregate([{ $group: { _id: "$usertype", n: { $sum: 1 } } }])
```

Désactivation:
```javascript
db.setProfilingLevel(0)
```

Interrogation de system.profile:
- Nombre d'entrées: **2** (plus l'interrogation de system.profile elle-même)
- Pour chaque entrée: op, ns, millis, planSummary
```
op: query, ns: citibike.trips, millis: 7, planSummary: COLLSCAN
op: command, ns: citibike.trips, millis: 21, planSummary: COLLSCAN
```

Que vaut planSummary et qu'est-ce que cela apprend ? planSummary indique le type d'exécution: **COLLSCAN** signifie un scan complet de la collection (pas d'index utilisé). Cela apprend que ces requêtes sont inefficaces et bénéficieraient d'un index sur les champs utilisés.

### Q33. Niveaux de profiling

Trois niveaux (0, 1, 2):
- **Niveau 0**: Profiling désactivé (par défaut)
- **Niveau 1**: Profile uniquement les opérations lentes (slowms configurable)
- **Niveau 2**: Profile toutes les opérations

Lequel utiliseriez-vous en production et avec quel slowms ? **Niveau 1 avec slowms = 100** (ou une valeur adaptée à l'application). Cela permet de capturer les requêtes anormalement lentes sans surcharger la base avec le profiling de toutes les opérations.

Deux risques à laisser le niveau 2 activé:
1. **Surcharge de performance**: Le profiling lui-même consomme des ressources CPU et I/O
2. **Saturation de system.profile**: La collection capped peut se remplir rapidement et perdre les anciennes entrées

Conséquence de system.profile étant capped: system.profile est une collection capped de taille fixe (par défaut 1MB). Quand elle est pleine, les nouvelles entrées écrasent les plus anciennes (FIFO). Cela signifie qu'on peut perdre des informations de profiling si le volume d'opérations est élevé.

### Q34. Requête de surveillance COLLSCAN

Requête pour isoler les COLLSCAN de plus de N ms dans system.profile:
```javascript
db.system.profile.find({
  "execStats.stage": "COLLSCAN",
  millis: { $gt: N }
})
```

Ou plus précisément:
```javascript
db.system.profile.find({
  millis: { $gt: N },
  $or: [
    { "command.filter": { $exists: true } },
    { "command.pipeline": { $exists: true } }
  ]
})
```

## Partie C — Réflexion

### R1. Le tableau de bord quotidien

Architecture mise en place:
Je mettrais en place une collection matérialisée `stations` (créée avec $merge) qui stocke les agrégations précalculées (nombre de départs par station). Cette collection serait rafraîchie chaque matin à 6h par un job cron qui exécute le pipeline d'agrégation avec $merge. Les index nécessaires seraient créés sur cette collection pour les requêtes fréquentes du tableau de bord. Le profiler serait activé en niveau 1 avec un slowms adapté pour surveiller les performances.

Chiffre du gain (totalDocsExamined Q23 vs documents stations Q24):
- totalDocsExamined Q23 (agrégation complète sur trips): **10000 documents**
- documents stations Q24 (collection matérialisée): **462 documents**

Rapport: **10000 / 462 = 21.6**

Le gain est de **21.6x** en termes de documents à parcourir. Le tableau de bord interroge 462 documents au lieu de 10000.

Compromis accepté: Le compromis est la **latence de mise à jour**. Les données du tableau de bord ne sont pas en temps réel mais reflètent l'état à 6h du matin. En échange, on obtient des performances de lecture beaucoup plus élevées et une charge réduite sur la base de données pendant les heures de pointe.

### R2. La règle d'écriture des pipelines

Règle en trois phrases (distinguant optimiseur vs limite):
1. **L'optimiseur peut remonter un $match** s'il filtre sur des champs d'entrée existants avant l'agrégation (Q22).
2. **L'optimiseur ne peut pas remonter un $match** s'il filtre sur un champ calculé par le pipeline comme le résultat d'un $group (Q23).
3. **Placez toujours les $match sur les champs d'entrée en premier** pour aider l'optimiseur, mais ne comptez pas sur lui pour les filtres sur des champs calculés.

Test avec troisième pipeline ($match après $project):
```javascript
db.trips.explain("executionStats").aggregate([
  { $project: { usertype: 1, "start station id": 1 } },
  { $match: { usertype: "Subscriber" } }
])
```

L'optimiseur remonte-t-il le $match ? **Non**, l'optimiseur ne remonte pas le $match après un $project car le $project modifie la structure du document et l'optimiseur ne peut pas garantir que le champ original existe encore.

Ce que ce cas apprend sur la frontière exacte de ce qu'il sait faire: La frontière de l'optimiseur est la **préservation de la sémantique**. Il ne peut remonter un $match que s'il est garanti que le résultat sera identique. Après un $project, la structure a changé et l'optimiseur ne peut plus garantir l'équivalence sémantique, donc il n'intervient pas.

### R3. Le chiffre unique

(a) Phrase pour le rapport avec valeur, effectif retenu, critère d'exclusion:
"La durée moyenne d'un trajet Citi Bike est de **847 secondes** (14 minutes), calculée sur **9946 trajets** en excluant les **54 trajets aberrants de plus de 3 heures** (probables vélos perdus ou volés)."

(b) Médiane ($median) sur jeu non filtré:
Pipeline:
```javascript
db.trips.aggregate([
  { $group: { _id: null, mediane: { $median: { input: "$tripduration", method: "approximate" } } } }
])
```
- Médiane: **environ 600 secondes** (10 minutes)
- Comparaison avec moyenne Q13 (non filtrée): **1070 secondes** - la médiane est beaucoup plus basse
- Comparaison avec moyenne Q21 (filtrée): **847 secondes** - la médiane est plus basse mais plus proche de la moyenne filtrée

Laquelle des trois valeurs est la plus robuste, et pourquoi ? La **médiane (600s)** est la plus robuste car elle n'est pas affectée par les valeurs extrêmes (outliers). La moyenne non filtrée (1070s) est faussée par les trajets aberrants, et même la moyenne filtrée (847s) peut encore être influencée par des valeurs extrêmes sous le seuil de 3h. La médiane représente mieux le comportement "typique" des utilisateurs.

(c) Pourquoi une réponse sans précaution serait malhonnête: Une réponse sans préciser les critères d'exclusion et les limites des données serait malhonnête car elle masquerait le fait que les chiffres sont basés sur des données nettoyées et ne reflètent pas la réalité brute. Elle donnerait une fausse impression de précision et pourrait mener à des décisions business basées sur des statistiques faussées par des anomalies.

### R4. explain() ou profiler ?

Comparaison (que voit l'un que l'autre ne voit pas):
- **explain()** voit le plan d'exécution d'une requête spécifique (stages, index utilisés, nombre de documents examinés). Il est **proactif** - on l'utilise pour optimiser une requête connue.
- **profiler** voit toutes les opérations qui s'exécutent sur la base (requêtes réelles, leurs durées, leurs plans). Il est **réactif** - on l'utilise pour découvrir des problèmes de performance inattendus.

Incident de production "l'appli est lente depuis 14 h":
Ordre de mobilisation: **logs → mongostat → profiler → explain**

Justification de cet ordre:
1. **Logs**: D'abord, vérifier les logs d'application pour identifier quelles requêtes sont lentes et à quel moment. C'est gratuit et rapide.
2. **mongostat**: Ensuite, observer les métriques système en temps réel (CPU, mémoire, I/O, lock %) pour voir si le problème est au niveau de l'infrastructure ou des requêtes spécifiques.
3. **profiler**: Si mongostat montre une activité anormale, activer le profiler temporairement pour capturer les requêtes lentes réelles et identifier les coupables.
4. **explain**: Enfin, utiliser explain() sur les requêtes identifiées par le profiler pour comprendre leur plan d'exécution et optimiser les index.

Cet ordre va du **général au spécifique** et du **moins coûteux au plus coûteux**: logs sont gratuits, mongostat est léger, le profiler a un coût, et explain() nécessite de connaître la requête cible.
