# Bench Shard — Distribution et Performance

## Distribution sur state (Q2)

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

## Frontières de chunks (Q3)

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

## Distribution après splitAt (Q4)

```javascript
["FL","MI","NY","TX"].forEach(s => sh.splitAt("census.zips", { state: s }))
```

Après splitAt:

```bash
db.zips.getShardDistribution()
```

Résultat:
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

## Distribution sur clé hachée (Q8)

```bash
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

## explain() targeted vs broadcast (Q6)

### Requête targeted (state: "NY")

```javascript
db.zips.find({ state: "NY" }).explain("executionStats")
```

- Stage racine: **SINGLE_SHARD**
- winningPlan.shards: **[shardB]**
- nReturned: **1596**
- totalDocsExamined: **1596**

### Requête broadcast (city: "NEW YORK")

```javascript
db.zips.find({ city: "NEW YORK" }).explain("executionStats")
```

- Stage racine: **SHARD_MERGE**
- winningPlan.shards: **[shardA, shardB]**
- nReturned: **40**
- totalDocsExamined: **38712** 

## Rapport totalDocsExamined / nReturned (Q7b)

Pour la requête broadcast: **967.8** (38712 / 40) 

## Tableau de décision (Q9b)

| Shard key candidate | Cardinalité | Distribution mesurée | Requêtes métier ciblées ? | Verdict |
|---------------------|-------------|---------------------|---------------------------|---------|
| { state: 1 }        | ~50 (États US) | Déséquilibrée (24%/76%) | Oui pour state, Non pour autres champs | **Mauvais** - distribution trop déséquilibrée |
| { _id: "hashed" }   | 29470 (unique) | Équilibrée (49%/51%) | Non (state n'est pas la shard key) | **Mauvais** - requêtes métier non ciblées |
| { zip: 1 }          | 29470 (unique) | Potentiellement équilibrée | Non (state n'est pas la shard key) | **Mauvais** - requêtes métier non ciblées |
| { state: 1, zip: 1 }| 29470 (unique) | Déséquilibrée (24%/76%) | Oui pour state+zip, Oui pour state seul | **Acceptable** - cardinalité haute, mais distribution hérite du déséquilibre de state |
