# TP MongoDB — Jour 3
## Réponses Q1 → Q33 + R1 → R4

### Q1 — État avant initialisation du Replica Set

**Commande 1 :**
```bash
docker exec mongo1 mongosh --quiet --eval 'printjson(db.hello())'
```

**Sortie observée :**
```
isWritablePrimary: false
secondary: false
info: 'Does not have a valid replica set config'
isreplicaset: true
...
```

**Commande 2 :**
```bash
docker exec mongo1 mongosh --quiet --eval 'db.test.insertOne({ a: 1 })'
```

**Sortie observée :**
```
MongoServerError: not primary
```

**Conclusion :** Avant l'initialisation du Replica Set, mongo1 n'est ni PRIMARY ni SECONDARY. Il est lancé avec `--replSet rs0`, mais ne possède pas encore de configuration valide du Replica Set. `isWritablePrimary` vaut donc `false` et toute tentative d'écriture échoue avec `not primary`.

---

### Q2 — État des membres

**Commande :**
```bash
docker exec mongo1 mongosh --quiet --eval "rs.status().members.forEach(m => print(m.name + ' ' + m.stateStr))"
```

**Sortie :**
```
mongo1:27017 PRIMARY
mongo2:27017 SECONDARY
mongo3:27017 SECONDARY
```

**Réponse :** `mongo1:27017` est le PRIMARY, tandis que `mongo2:27017` et `mongo3:27017` sont SECONDARY.

Dans `init-rs.js`, mongo1 possède `priority: 2`, contre `priority: 1` pour mongo2 et mongo3. Cette priorité plus élevée explique pourquoi mongo1 est choisi comme PRIMARY.

---

### Q3 — Statistiques du jeu de données

- Nombre de documents : **29 470**
- Nombre d'États distincts : **51**
- Population totale : **248 709 873**

Le nombre 51 ne correspond pas uniquement aux 50 États américains : le jeu de données contient également DC (District of Columbia), ce qui donne 51 valeurs distinctes dans le champ `state`.

---

### Q4 — ZIP distincts et index unique

- Documents : 29 470
- ZIP distincts : 29 467
- Doublons : 3

**ZIP apparaissant plusieurs fois :**
```json
[
  { "_id": "63673", "count": 2 },
  { "_id": "32350", "count": 2 },
  { "_id": "42223", "count": 2 }
]
```

**Tentative d'index unique :**
```
MongoServerError: Index build failed:
25b52b2d-44d2-4848-8f3e-25bf4520a31d: Collection census.zips
(206f1862-b520-4378-9040-48540c38bd94) :: caused by :: E11000 duplicate key
error collection: census.zips index: zip_1 dup key: { zip: "32350" }
```

**Conclusion :** le champ `zip` n'est pas une clé unique dans ce jeu de données. Les codes 63673, 32350 et 42223 apparaissent chacun deux fois. L'index unique ne peut donc pas être créé et MongoDB retourne l'erreur `E11000 duplicate key error`.

---

### Q5 — Documents avec population nulle

Nombre de documents avec `pop = 0` : **67**.

Exemples observés :
```
ALLEN, AL — 36419
CHEVAK, AK — 99563
EMMONAK, AK — 99581
GRAYLING, AK — 99590
NAKNEK, AK — 99633
...
```

**Conclusion :** les 67 codes postaux avec une population de zéro ne sont pas nécessairement des erreurs de saisie. Ils peuvent correspondre à des zones géographiques réelles mais inhabitées ou sans population recensée.

---

### Q6 — Paramètres du Replica Set

**Sortie de `rs.conf().settings` :**
```
heartbeatIntervalMillis: 2000
electionTimeoutMillis: 10000
```

- `electionTimeoutMillis` = 10 000 ms = 10 secondes
- `heartbeatIntervalMillis` = 2 000 ms = 2 secondes

Un secondary interroge donc le primary avec des heartbeats toutes les 2 secondes et peut considérer le primary comme indisponible après environ 10 secondes selon les conditions de détection.

Autres paramètres observés :
```
catchUpTimeoutMillis: -1
catchUpTakeoverDelayMillis: 30000
```

| Nœud | Priority | Votes | État attendu |
|---|---|---|---|
| mongo1:27017 | 2 | 1 | PRIMARY |
| mongo2:27017 | 1 | 1 | SECONDARY |
| mongo3:27017 | 1 | 1 | SECONDARY |

`electionTimeoutMillis = 10000` est important pour la comparaison avec Q21 et R3.

---

### Q7 — Santé des membres

**Sortie observée :**
```
mongo1:27017 | state=PRIMARY   | health=1 | lastHeartbeat=undefined
mongo2:27017 | state=SECONDARY | health=1 | lastHeartbeat=Wed Aug 26 2026 10:10:31 GMT+0000 (UTC)
mongo3:27017 | state=SECONDARY | health=1 | lastHeartbeat=Wed Aug 26 2026 10:10:31 GMT+0000 (UTC)
```

Les trois membres sont en bonne santé (`health=1`). mongo1 est PRIMARY et mongo2/mongo3 sont SECONDARY.

En production, `health=0` indique notamment qu'un membre n'est plus considéré comme accessible par le nœud qui rapporte son état.

---

### Q8 — Taille de l'oplog

**Commande :**
```bash
docker exec mongo1 mongosh --quiet --eval "const l=db.getSiblingDB('local'); print('maxSize:', l.oplog.rs.stats().maxSize); print('total:', l.oplog.rs.countDocuments({}))"
```

**Sortie :**
```
maxSize: 134217728
total: 29632
```

La taille maximale de l'oplog est **134 217 728 octets = 128 MiB**.

Cette valeur vient de `--oplogSize 128`.

L'oplog est une collection capped dont la taille est limitée. Lorsqu'il est plein, les opérations les plus anciennes sont progressivement supprimées.

Le `total: 29632` correspond au nombre actuel d'entrées présentes dans l'oplog, et non à sa taille maximale.

---

### Q9 — Insertions dans l'oplog

**Commande :**
```bash
docker exec mongo1 mongosh --quiet --eval "db.getSiblingDB('local').oplog.rs.countDocuments({op:'i', ns:'census.zips'})"
```

**Sortie :**
```
29470
```

- Documents importés : 29 470
- Insertions dans l'oplog pour `census.zips` : 29 470

Les deux nombres sont exactement égaux.

**Conclusion :** la réplication est enregistrée dans l'oplog à la granularité de l'opération individuelle. Une entrée d'insertion correspond à chaque document.

---

### Q10 — Lecture d'une entrée de l'oplog

**Sortie observée :**
```
op: 'i'
ns: 'census.zips'
o: {
  _id: ObjectId('5c8eccc1caa187d17ca6ed21'),
  city: 'CALERA',
  zip: '35040',
  loc: { y: 33.1098, x: 86.755987 },
  pop: 4675,
  state: 'AL'
}
ts: Timestamp({ t: 1787738515, i: 2 })
wall: ISODate('2026-08-26T10:01:55.067Z')
```

- `op: 'i'` → opération d'insertion.
- `ns: 'census.zips'` → base `census`, collection `zips`.
- `o` → document inséré.
- `ts` → timestamp de l'opération.
- `wall` → date/heure réelle de l'opération.

Le champ `o` contient notamment l'`_id` unique du document (`ObjectId('5c8eccc1caa187d17ca6ed21')`). Cela permet à MongoDB d'identifier précisément le document concerné lors de la réplication, ce qui rend l'opération idempotente : la rejouer produit toujours le même document.

---

### Q11 — Update et oplog

**Résultat de l'update :**
```json
{
  "acknowledged": true,
  "insertedId": null,
  "matchedCount": 1676,
  "modifiedCount": 1676,
  "upsertedCount": 0
}
```

1 676 documents du Texas ont été modifiés.

**Entrée observée dans l'oplog :**
```
op: 'u'
ns: 'census.zips'
ui: UUID('206f1862-b520-4378-9040-48540c38bd94')
o: {
  '$v': 2,
  diff: { u: { pop: 37700 } }
}
o2: { _id: ObjectId('5c8eccc1caa187d17ca74cf7') }
ts: Timestamp({ t: 1787739326, i: 1 })
t: Long('1')
v: Long('2')
wall: ISODate('2026-08-26T10:15:26.270Z')
```

L'oplog ne contient pas directement le `$inc`. Il enregistre la valeur résultante de `pop` (le diff appliqué). MongoDB journalise les informations nécessaires pour reproduire de manière fiable l'état voulu sur les secondaries — ce qui rejoint l'idempotence observée en Q10 : rejouer l'entrée aboutit toujours au même état final, pas à un nouvel incrément.

---

### Q12 — Dimensionnement de l'oplog

Valeurs observées :
- `size` = 12 046 889 octets
- `count` = 31 333
- `maxSize` = 134 217 728 octets

**(a) Taille moyenne**
```
12 046 889 / 31 333 ≈ 384,48 octets
```
Réponse : environ **384,5 octets** par opération.

**(b) Nombre d'opérations dans 128 MiB**
```
134 217 728 / 384,48 ≈ 349 090
```
Réponse : environ **349 090 opérations**.

**(c) Fenêtre à 300 écritures/seconde**
```
349 090 / 300 ≈ 1 163,6 secondes
```
Soit environ **19,4 minutes**, ou **0,32 heure**.

Un secondary arrêté vendredi à 18h jusqu'au lundi à 9h est arrêté pendant 57 heures. Cette durée est largement supérieure à la fenêtre de l'oplog.

**Conclusion :** il ne pourra pas rattraper son retard uniquement avec l'oplog. Une resynchronisation complète (initial sync) sera nécessaire.

---

### Q13 — Lecture directe d'un secondary

La lecture directe d'un secondary nécessite que la lecture sur secondary soit autorisée/configurée par le shell. Dans `mongosh`, la connexion directe à un membre du Replica Set positionne automatiquement le comportement de lecture approprié, ce qui permet de lire depuis ce membre sans avoir à appeler explicitement `rs.secondaryOk()` comme dans les anciennes versions.

---

### Q14 — Écriture sur un secondary

**Résultat :**
```
MongoServerError: not primary
```

L'écriture sur mongo2 échoue avec l'erreur `not primary` (`NotWritablePrimary`) car mongo2 est un nœud secondaire. Un secondary peut accepter des lectures lorsque cela est autorisé, mais les écritures doivent être envoyées au PRIMARY — c'est la seule règle absolue de la réplication MongoDB.

---

### Q15 — Retard de réplication

Avant les insertions :
```
mongo2 → 0 sec
mongo3 → 0 sec
```

Après 1 000 insertions :
```
mongo2 → 0 sec
mongo3 → 0 sec
```

Le retard n'est pas visible avec cette mesure, car la réplication est très rapide sur la machine.

**Important :** 0 sec ne signifie pas que la réplication est synchrone. Cela signifie qu'au moment de la mesure, les secondaries avaient déjà rattrapé le primary — la réplication reste asynchrone par nature.

---

### Q16 — Read Preference

Résultats :
```
readPref("primary")   → 1596
readPref("secondary") → 1596
```

Les résultats sont identiques car les nœuds sont synchronisés au moment de la lecture.

Lire sur un secondary peut être adapté à des statistiques ou rapports qui tolèrent un léger retard (cas acceptable). C'est dangereux pour une information qui doit être immédiatement à jour, comme un solde bancaire (risque de lecture *stale*).

---

### Q17 — Failover après arrêt propre

**Sortie du watcher :**
```
[11:00:08.587] +0.003s  PRIMARY mongo1:27017
[11:00:31.084] +24.184s PRIMARY mongo2:27017
```

- Avant la panne : mongo1 PRIMARY.
- Après la panne : mongo2 PRIMARY.
- **Délai mesuré : 24,184 secondes.**

**Réponse :** après `docker stop mongo1`, un nouveau PRIMARY est élu après 24,184 s. Le nœud élu est mongo2.

---

### Q18 — État pendant la bascule

**Sortie :**
```
mongo1:27017 : (not reachable/healthy) health=0
mongo2:27017 : PRIMARY   health=1
mongo3:27017 : SECONDARY health=1
```

mongo1 est arrêté et donc `health=0`. mongo2 devient PRIMARY et mongo3 reste SECONDARY.

---

### Q19 — Retour de mongo1

Après `docker start mongo1`, mongo1 revient d'abord en SECONDARY (`isWritablePrimary = false`), puis redevient PRIMARY (`isWritablePrimary = true`).

État final :
```
mongo1 → PRIMARY
mongo2 → SECONDARY
mongo3 → SECONDARY
```

Cela s'explique par le **priority takeover** : mongo1 possède une priorité supérieure (`rs.conf().members[0].priority = 2`).

**Nombre de bascules :**
1. mongo1 PRIMARY → mongo2 PRIMARY
2. mongo2 PRIMARY → mongo1 PRIMARY

Total : **2 bascules**.

Des priorités asymétriques peuvent provoquer des élections supplémentaires au retour du nœud prioritaire, ce qui augmente les périodes d'indisponibilité — un argument contre les priorités asymétriques en production.

---

### Q20 — Écritures pendant l'absence du PRIMARY initial

mongo1 a été arrêté, mongo2 est devenu PRIMARY et 3 documents ont été insérés dans `census.charge` :
```
{q20: 1}
{q20: 2}
{q20: 3}
```

Après le redémarrage de mongo1, `{q20: 1}` est bien présent avec `count = 1`.

**Conclusion :** les écritures effectuées pendant l'absence de mongo1 ont été récupérées grâce à la réplication via l'oplog (rejeu des opérations manquées lors de la resynchronisation).

---

### Q21 — Panne brutale

**Sortie du watcher :**
```
[11:06:03.503] +0.003s  PRIMARY mongo1:27017
[11:06:15.889] +12.390s NO PRIMARY
[11:06:25.879] +23.986s PRIMARY mongo2:27017
```

Période sans PRIMARY :
```
23,986 − 12,390 = 11,596 secondes
```

**Réponse :** `docker kill mongo1` provoque la disparition brutale du PRIMARY. Le watcher détecte NO PRIMARY à +12,390 s puis mongo2 devient PRIMARY à +23,986 s.

**Indisponibilité observée par le watcher : environ 11,596 s.**

Cette valeur est légèrement supérieure à `electionTimeoutMillis = 10 000 ms`, car la détection par heartbeats et le déroulement de l'élection ajoutent du temps : le compte à rebours ne démarre pas exactement au moment du kill, mais après que les heartbeats successifs ont échoué.

---

### Q22 — Synthèse

| Scénario | Commande | Délai mesuré | Nœud élu | Écritures perdues ? |
|---|---|---:|---|---|
| Arrêt propre | `docker stop mongo1` | 24,184 s | mongo2 | À vérifier selon le Write Concern |
| Panne brutale | `docker kill mongo1` | ≈ 11,596 s sans PRIMARY | mongo2 | À analyser avec Q24-Q26 |
| Retour du nœud | `docker start mongo1` | Quelques instants, puis priority takeover | mongo1 | Non si les écritures ont été répliquées |

**Commentaire DSI :** Une panne entraîne une indisponibilité temporaire des écritures pendant la phase d'élection, mesurée à environ 11,6 secondes lors de la panne brutale. Notre mesure d'arrêt propre a été de 24,184 secondes, plus longue mais sans période de type "NO PRIMARY" prolongée. Le SLA doit également tenir compte de ce que l'application constate réellement (Q31) et du niveau de confirmation des écritures (Write Concern, Q24-Q26).

---

### Q23 — Perte de majorité

**(a)**
Immédiatement après l'arrêt de mongo2 et mongo3 :
```
false 2
```
Après 15 secondes :
```
false 2
```
mongo1 reste SECONDARY car, avec 2 nœuds sur 3 arrêtés, il ne possède plus la majorité nécessaire pour devenir PRIMARY.

**(b)**
Écriture :
```
MongoServerError: not primary
```
Lecture :
```
0
```
Le nœud survivant ne peut plus accepter d'écriture, mais peut encore accepter une lecture.

**(c)**
Avec 3 nœuds, la majorité est de 2 :
- 3 disponibles → majorité
- 2 disponibles → majorité
- 1 disponible → pas de majorité

Avec 4 nœuds, la majorité est de 3 :
- 4 disponibles → majorité
- 3 disponibles → majorité
- 2 disponibles → pas de majorité

Un Replica Set de 3 nœuds tolère donc 1 panne (il reste 2/3, la majorité). Un set de 4 nœuds ne tolère pas mieux : il perd la majorité dès 2 pannes, exactement comme un set de 3 nœuds n'en tolère qu'une.

---

### Q24 — w:1 vs w:"majority"

Les deux insertions ont réussi avec `acknowledged: true`.

- Avec `w:1`, MongoDB confirme l'écriture dès qu'elle est enregistrée sur le PRIMARY.
- Avec `w:"majority"`, MongoDB attend la confirmation par une majorité des membres votants, donc au moins 2 membres sur 3 dans notre cas.

Une écriture en `w:1` peut donc présenter un risque plus élevé de perte lors d'une panne brutale si elle n'a pas encore été répliquée sur un autre nœud (typiquement, le scénario de la Q21 : le PRIMARY tombe juste après avoir confirmé en local).

---

### Q25 — w:4

**Erreur :**
```
MongoWriteConcernError
Not enough data-bearing nodes
```

Le Replica Set possède seulement 3 nœuds alors que `w:4` demande une confirmation de 4 nœuds. MongoDB sait immédiatement que cette condition est impossible et retourne l'erreur sans attendre les 3 secondes de `wtimeout`.

---

### Q26 — Write Concern avec un nœud arrêté

**(a)**
Avec mongo3 arrêté :
```
{b:1} avec w:"majority" → acknowledged: true
{c:1} avec w:3          → MongoWriteConcernError: waiting for replication timed out
```
La majorité de 2 nœuds est encore disponible, mais les 3 nœuds ne le sont pas.

**(b)**
`db.demo.countDocuments({})` retourne **5 documents**.

Cela montre qu'une écriture peut avoir été effectuée malgré l'échec de la confirmation du Write Concern — le document `{c:1}` a bien été écrit localement même si `w:3` a timeout.

**(c)**
Un échec de Write Concern signifie que MongoDB n'a pas pu garantir le niveau de réplication demandé, et non nécessairement que l'opération n'a pas été exécutée. Une application qui rejoue aveuglément l'écriture après une erreur de Write Concern peut donc provoquer un doublon.

---

### Q27 — j:true

`j:true` demande que l'écriture soit enregistrée dans le journal WiredTiger avant confirmation. Cela apporte une garantie supplémentaire de durabilité en cas de redémarrage ou de panne de la machine, avec une légère augmentation possible de la latence.

**Résultat observé :**
```
{q27: 1}
acknowledged: true
```

`j:true` protège contre une perte de courant simultanée sur les 3 machines en garantissant que l'écriture est sur disque (journal) avant confirmation — mais ne remplace toutefois pas une stratégie de sauvegarde.

---

### Q28 — Read Concern

Avec `readConcern: "local"`, une lecture peut retourner une donnée présente localement sur le nœud, même si elle n'a pas encore été confirmée par une majorité.

Avec `readConcern: "majority"`, MongoDB ne retourne que les données confirmées par une majorité, offrant une vision plus stable du Replica Set.

Cela rejoint directement l'observation de Q26 : une écriture peut exister localement sur le PRIMARY (visible en `local`) tout en n'étant pas encore confirmée par la majorité (donc invisible en `majority`) — un utilisateur final lisant en `majority` ne verra jamais une donnée susceptible d'être annulée par un rollback.

---

### Q29 — PyMongo et découverte du Replica Set

**(a)**
PyMongo essaie de contacter :
```
mongo1:27017
mongo2:27017
mongo3:27017
```

**(b)**
Même si l'URI initiale contient `localhost:27017`, `localhost:27018`, `localhost:27019`, MongoDB annonce lui-même les membres du Replica Set (`mongo1:27017`, `mongo2:27017`, `mongo3:27017`). PyMongo découvre cette configuration et utilise ces adresses. Comme le script tourne directement sur la machine hôte, les noms Docker internes `mongo1`, `mongo2`, `mongo3` ne sont pas résolus, d'où `getaddrinfo failed` et `ServerSelectionTimeoutError`.

**(c)**
`?replicaSet=rs0` permet au driver d'utiliser la topologie du Replica Set, mais ce n'est pas ce paramètre qui crée le remplacement des adresses. Le serveur annonce ses membres via `db.hello()` et le driver les découvre automatiquement dès qu'il détecte l'appartenance à un Replica Set.

**(d)**
Avec `directConnection=true`, PyMongo force la connexion au serveur indiqué et empêche la découverte des autres membres.

**Résultat :**
```
Topology: Single
Primary: None
```

Les écritures fonctionnent tant que mongo1 est disponible, mais le driver ne peut pas effectuer automatiquement un failover vers un autre membre.

---

### Q30 — writer.py

**Les 5 premières lignes observées :**
```
[12:21:19.701] PRIMARY=mongo1:27017 OK n=0 id=6a8eda3f7efe39b10717dcc3
[12:21:20.726] PRIMARY=mongo1:27017 OK n=1 id=6a8eda407efe39b10717dcc4
[12:21:21.751] PRIMARY=mongo1:27017 OK n=2 id=6a8eda417efe39b10717dcc5
[12:21:22.768] PRIMARY=mongo1:27017 OK n=3 id=6a8eda427efe39b10717dcc6
[12:21:23.775] PRIMARY=mongo1:27017 OK n=4 id=6a8eda437efe39b10717dcc7
```

Primary observé : **mongo1:27017**.

L'application utilise le Replica Set `rs0` et les écritures sont acceptées. Le script peut initialement afficher `ReplicaSetNoPrimary` / `Primary: None` pendant la découverte de la topologie, puis réussir les écritures une fois le PRIMARY découvert.

---

### Q31 — Résilience de l'application

**(a) Indisponibilité**

Première erreur :
```
[12:25:48.386] ERROR
```
Première écriture redevenue OK :
```
[12:26:00.504] PRIMARY=mongo3:27017 OK n=25
```
Durée :
```
12:26:00.504 − 12:25:48.386 = 12,118 secondes
```
**Indisponibilité observée par l'application : environ 12,118 s.**

**(b) Écritures réussies / échouées**

Pendant ce lancement :
- n=0 à n=22 → 23 réussites
- n=23 et n=24 → 2 échecs
- n=25 à n=29 → 5 réussites

**Total : 28 écritures réussies et 2 échouées.**

Le nombre affiché à la fin (118) ne correspond pas uniquement à ce test car la collection contenait déjà des documents des tests précédents.

**(c) Reconnexion automatique**

Oui. Le driver découvre automatiquement le nouveau PRIMARY :
```
[12:26:00.504] PRIMARY=mongo3:27017 OK n=25
```
La chaîne observée est : mongo1 → panne → élection → mongo3 PRIMARY → reconnexion du driver, sans aucune intervention manuelle.

**(d) Comparaison avec Q21**
```
Q21 : 11,596 s
Q31 : 12,118 s
Écart : 12,118 − 11,596 = 0,522 s
```
L'application subit donc une indisponibilité légèrement supérieure à celle observée par le cluster — l'écart correspond au temps que met le driver PyMongo à détecter la nouvelle topologie et à basculer sa connexion.

---

### Q32 — retryWrites

**(a) et (b)**

Avec `retryWrites=true` : 2 échecs observés pendant la bascule.
Avec `retryWrites=false` : 2 échecs observés également.

**Écart : 0.**

Dans les deux cas, l'exception observée est `ServerSelectionTimeoutError` avec une attente d'environ 5 secondes correspondant à `serverSelectionTimeoutMS=5000`.

`retryWrites` ne peut pas résoudre une période pendant laquelle aucun PRIMARY n'est disponible : le driver attend la découverte d'un serveur, il n'y a personne à qui rejouer l'écriture.

**(c)**

Avec `rs.stepDown(20)` (le primary reste vivant mais rétrograde), l'écart devient net :
- Avec `retryWrites=true`, l'écriture interrompue par le stepDown est automatiquement rejouée sur le nouveau primary et réussit.
- Avec `retryWrites=false`, l'écriture échoue avec un type d'exception et un code différents de ceux du (a) — une erreur liée au changement de rôle du nœud (`NotWritablePrimary` / `NotPrimaryError`) plutôt qu'un timeout de sélection de serveur.

**Conclusion en une phrase :** `retryWrites` protège efficacement contre une panne où un primary reste joignable mais change de rôle (stepDown), mais ne peut rien contre une fenêtre où aucun primary n'existe dans le cluster (panne brutale).

**(d)**

`retryWrites` peut rejouer sans risque de doublon une opération d'insertion car chaque document porte un `_id` unique (visible dans le champ `o` de l'oplog en Q10) : rejouer l'insertion avec le même `_id` est idempotent, MongoDB refusera un doublon d'`_id` si l'écriture a déjà réussi. `updateMany` et `deleteMany` ne sont jamais rejoués automatiquement car ils opèrent sur un ensemble de documents déterminé par une requête, et l'état de la base peut avoir changé entre la tentative initiale et le rejeu — un rejeu pourrait affecter un jeu de documents différent, ce qui n'est pas sûr.

---

### Q33 — Le décompte final

**(a) retryWrites=true**

Premier lancement :
- avant : 266 documents
- après : 296 documents
- nouveaux documents : 296 − 266 = 30
- écritures annoncées réussies : 30
- **écart : 0**

Second scénario :
- avant : 296 documents
- après : 325 documents
- nouveaux documents : 325 − 296 = 29
- écritures réussies : 29
- **écart : 0**

**(b) w:"majority"**
- avant : 325 documents
- après : 355 documents
- nouveaux documents : 355 − 325 = 30
- écritures annoncées réussies : 30
- **écart : 0**

**(c)** « Lors d'une panne serveur brutale, notre service est indisponible en écriture pendant environ **12,1 secondes**. Dans nos tests, aucune perte n'a été observée parmi les écritures annoncées comme réussies. Cette observation ne constitue toutefois pas une garantie générale : la durabilité dépend notamment du Write Concern utilisé. Avec `w:"majority"`, les écritures confirmées bénéficient d'une garantie de réplication sur une majorité des membres. »

---

## R1 — Le collègue qui veut un 4ᵉ nœud

Nous avons ajouté un 4ᵉ membre :
```
mongo1 = PRIMARY
mongo2 = SECONDARY
mongo3 = SECONDARY
mongo4 = SECONDARY
```

Avec 4 membres, nous avons arrêté mongo3 et mongo4. Il ne restait que 2 membres disponibles et l'écriture a échoué :
```
MongoServerError: not primary
```

Avec 3 membres et 1 panne (Q23), l'écriture a réussi :
```
acknowledged: true
```

Avec 4 membres, la majorité nécessite 3 membres. Après 2 pannes, il ne reste que 2 membres et aucune majorité n'est possible. Avec 3 membres, la majorité est de 2 et une panne laisse encore une majorité.

**Conclusion :** ajouter un 4ᵉ nœud n'augmente pas la tolérance aux pannes de manière utile dans ce cas : 4 membres tolèrent toujours seulement 1 panne pour conserver une majorité (il en faudrait 5 pour tolérer 2 pannes). Si le budget permet 4 machines, la 4ᵉ peut plutôt servir d'arbitre (vote sans données) ou être dédiée à un autre rôle/service.

---

## R2 — Deux problèmes, deux réponses

La **réplication** répond au problème de **disponibilité et de tolérance aux pannes** : plusieurs copies des mêmes données sont conservées sur plusieurs machines, ce qui permet au service de survivre à la perte d'un nœud.

Le **sharding** répond au problème de **capacité et de montée en charge** : les données sont réparties (partitionnées) entre plusieurs machines afin de distribuer le stockage et la charge d'écriture/lecture, ce qu'une simple réplication ne peut pas faire (chaque nœud répliqué contient toujours l'intégralité des données).

Pour un cluster de production à 3 shards, en reprenant la règle de majorité de la Q23(c) (chaque shard doit lui-même être un Replica Set pour être tolérant aux pannes) :
- 3 shards × 3 nœuds par shard (Replica Set) = 9 machines
- 3 Config Servers (eux-mêmes en Replica Set pour la même raison de majorité)
- au moins 1 à 2 `mongos` (routeurs)

**Total minimum réaliste : environ 13 à 14 machines.**

Un cluster shardé dont les shards ne seraient pas répliqués serait plus fragile qu'un simple Replica Set car la perte d'un seul nœud d'un shard rendrait indisponible la portion de données de ce shard, sans aucune majorité ni aucun mécanisme de bascule pour la restaurer — alors qu'un Replica Set seul survit à la perte d'un nœud sur trois.

---

## R3 — Régler le curseur

**(a) Comparaison**

Avec `electionTimeoutMillis = 10000 ms` :
```
NO PRIMARY      : +12,390 s
nouveau PRIMARY : +23,986 s
indisponibilité : 11,596 s
```

Avec `electionTimeoutMillis = 2000 ms` :
```
NO PRIMARY      : +14,228 s
nouveau PRIMARY : +17,459 s
indisponibilité : 3,231 s
```

Rapport :
```
11,596 / 3,231 ≈ 3,59
```

La bascule est donc environ **3,6 fois plus rapide**, mais pas 5 fois plus rapide comme le ratio 10000/2000 le laisserait penser. Une partie du délai (détection par heartbeats, communication entre membres, déroulement effectif de l'élection) ne dépend pas linéairement de `electionTimeoutMillis`.

**(b) Risque d'un timeout trop bas**

Un timeout trop faible augmente le risque de déclencher une élection lors d'un simple ralentissement réseau. Avec un hoquet réseau de 3 secondes, un timeout de 2 secondes peut provoquer une élection inutile (le primary est en réalité toujours vivant), une indisponibilité temporaire en écriture pendant l'élection, et potentiellement des élections répétées si le réseau reste instable — ce qui coûte plus cher en stabilité que ce qu'on gagne en rapidité de bascule.

**(c) Recommandation**

Nous remettons `electionTimeoutMillis` à 10000 ms.

Je recommande de conserver **10000 ms** : le réglage à 2000 ms réduit la période sans PRIMARY de 11,596 s à 3,231 s (gain mesuré d'environ 3,6 fois), mais augmente fortement la sensibilité aux perturbations réseau transitoires. Le SLA de 99,9 % (43 min/mois) est très largement respecté même avec 10000 ms — le risque de faux positifs à 2000 ms n'est pas justifié par le gain.

---

## R4 — Le chiffre honnête

**Phrase à livrer à la DSI :**

> « Le Replica Set MongoDB retrouve un PRIMARY après environ 11,6 secondes lors d'une panne brutale, mais l'application constate elle-même une indisponibilité en écriture d'environ 12,1 secondes, et une écriture peut être exécutée localement sans être confirmée par la majorité du cluster — le SLA doit donc être évalué sur l'expérience réelle de l'application et sur le Write Concern utilisé, pas sur le seul temps d'élection du cluster. »

Annoncer uniquement le chiffre de la Q21 serait malhonnête car :
1. **Q21** mesure le temps de réélection observé côté cluster (`rs.status()`), pas ce que subit réellement l'utilisateur final.
2. **Q31** montre que l'application perçoit une indisponibilité légèrement supérieure (12,118 s vs 11,596 s), l'écart correspondant au temps de détection et de reconnexion du driver.
3. **Q26** montre qu'une écriture peut avoir été exécutée sur le PRIMARY sans avoir obtenu la confirmation demandée par le Write Concern — un chiffre de disponibilité ne dit rien de la fiabilité des écritures elles-mêmes.

**Conclusion générale :** la résilience ne se mesure pas uniquement au temps d'élection. Il faut considérer simultanément le temps de failover, l'indisponibilité réellement vue par l'application, le Write Concern utilisé, les écritures éventuellement non confirmées, et le comportement du driver applicatif.