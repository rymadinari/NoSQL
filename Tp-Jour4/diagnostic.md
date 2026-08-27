# Diagnostic — explain() et Profiler

## Q31: explain() avant/après index

### Requête testée
```javascript
db.trips.find({ "start station id": 476 })
```

### (a) Avant tout index

```javascript
db.trips.find({ "start station id": 476 }).explain("executionStats")
```

- Stage: **COLLSCAN**
- totalDocsExamined: **10000**
- nReturned: **36**

### (b) Après création de l'index

```javascript
db.trips.createIndex({ "start station id": 1 })
db.trips.find({ "start station id": 476 }).explain("executionStats")
```

- Stage: **FETCH** (avec IXSCAN)
- totalKeysExamined: **36**
- totalDocsExamined: **36**
- nReturned: **36**

### (c) Ratios

| Scénario | totalDocsExamined | nReturned | Ratio |
|----------|-------------------|-----------|-------|
| Avant index | 10000             | 36        | 277.8 |
| Après index | 36                | 36        | 1     |

Valeur idéale visée: **1** (un document examiné par document retourné)

Pourquoi ne l'atteint-on presque jamais sans projection: Sans projection, MongoDB doit lire le document entier pour retourner tous les champs, donc totalDocsExamined = nReturned même avec un index parfait. Pour atteindre un ratio < 1, il faudrait utiliser une projection qui ne retourne que les champs indexés (covered query).

## Q32: Le profiler

### Activation
```javascript
db.setProfilingLevel(1, { slowms: 0 })
```

### Requêtes exécutées

```javascript
// Requête sur champ non indexé
db.trips.find({ "end station name": "W 52 St & 9 Ave" })

// Agrégation
db.trips.aggregate([{ $group: { _id: "$usertype", n: { $sum: 1 } } }])
```

### Désactivation
```javascript
db.setProfilingLevel(0)
```

### Interrogation de system.profile

```javascript
db.system.profile.find()
```

- Nombre d'entrées: **2**

| Entrée | op     | ns             | millis | planSummary |
|--------|--------|----------------|--------|-------------|
| 1      | query  | citibike.trips | 7      | COLLSCAN    |
| 2      | command| citibike.trips | 21     | COLLSCAN    |

Que vaut planSummary et qu'est-ce que cela apprend: planSummary indique le type d'exécution: **COLLSCAN** signifie un scan complet de la collection (pas d'index utilisé). Cela apprend que ces requêtes sont inefficaces et bénéficieraient d'un index sur les champs utilisés.

## Q33: Niveaux de profiling

### Trois niveaux

- **Niveau 0**: Profiling désactivé (par défaut)
- **Niveau 1**: Profile uniquement les opérations lentes (slowms configurable)
- **Niveau 2**: Profile toutes les opérations

### Choix en production

Niveau recommandé: **Niveau 1**

slowms recommandé: **100ms** (ou valeur adaptée à l'application)

### Risques du niveau 2

1. **Surcharge de performance**: Le profiling lui-même consomme des ressources CPU et I/O
2. **Saturation de system.profile**: La collection capped peut se remplir rapidement et perdre les anciennes entrées

### Conséquence de system.profile capped
system.profile est une collection capped de taille fixe (par défaut 1MB). Quand elle est pleine, les nouvelles entrées écrasent les plus anciennes (FIFO). Cela signifie qu'on peut perdre des informations de profiling si le volume d'opérations est élevé.

## Q34: Requête de surveillance COLLSCAN

```javascript
db.system.profile.find({
  "execStats.stage": "COLLSCAN",
  millis: { $gt: N }
})
```

Remplacer N par le seuil en millisecondes.

Cette requête isole les opérations qui effectuent un scan complet de la collection (COLLSCAN) et qui prennent plus de N millisecondes. C'est exactement ce qu'on met dans un tableau de bord de production pour identifier les requêtes lentes qui nécessitent un index.
