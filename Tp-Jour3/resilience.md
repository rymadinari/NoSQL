# Résilience applicative — writer.py sur le Replica Set MongoDB

## Q30 — Sorties initiales de writer.py

Les premières écritures observées :
```
[12:21:19.701] PRIMARY=mongo1:27017 OK n=0 id=6a8eda3f7efe39b10717dcc3
[12:21:20.726] PRIMARY=mongo1:27017 OK n=1 id=6a8eda407efe39b10717dcc4
[12:21:21.751] PRIMARY=mongo1:27017 OK n=2 id=6a8eda417efe39b10717dcc5
[12:21:22.768] PRIMARY=mongo1:27017 OK n=3 id=6a8eda427efe39b10717dcc6
[12:21:23.775] PRIMARY=mongo1:27017 OK n=4 id=6a8eda437efe39b10717dcc7
```

**Primary observé : mongo1:27017.**

L'application utilise le Replica Set `rs0`. Au démarrage, le driver peut temporairement afficher `ReplicaSetNoPrimary` / `Primary: None` pendant la découverte de la topologie, puis les écritures réussissent une fois le PRIMARY découvert.

---

## Q31 — Résilience pendant une panne (docker kill mongo1)

### (a) Durée d'indisponibilité

Première erreur :
```
[12:25:48.386] ERROR
```

Première écriture redevenue OK :
```
[12:26:00.504] PRIMARY=mongo3:27017 OK n=25
```

Calcul :
```
12:26:00.504 − 12:25:48.386 = 12,118 s
```

**Indisponibilité observée par l'application : environ 12,118 secondes.**

### (b) Écritures réussies / échouées

Pendant ce lancement :
- n=0 à n=22 → 23 réussites
- n=23 et n=24 → 2 échecs
- n=25 à n=29 → 5 réussites

**Total : 28 écritures réussies, 2 écritures échouées.**

Le compteur final (118) affiché par le script ne représente pas uniquement ce test : la collection `census.heartbeat` contenait déjà des documents provenant des lancements précédents.

### (c) Reconnexion automatique

**Oui.** Après les erreurs, le driver découvre automatiquement le nouveau PRIMARY sans aucune intervention manuelle :
```
[12:26:00.504] PRIMARY=mongo3:27017 OK n=25
```

Séquence observée :
```
mongo1 PRIMARY → panne → élection → mongo3 PRIMARY → reconnexion du driver → écritures OK
```

### (d) Comparaison avec Q21

```
Q21 (cluster)     : 11,596 s
Q31 (application) : 12,118 s
Écart             : 12,118 − 11,596 = 0,522 s
```

L'indisponibilité réellement perçue par l'application est donc légèrement supérieure au temps observé par le cluster. Cet écart correspond au temps nécessaire au driver PyMongo pour détecter la nouvelle topologie, sélectionner le nouveau PRIMARY et reprendre la connexion — un délai qui s'ajoute à la seule mesure d'élection interne au cluster.

---

## Q32 — retryWrites

### (a) et (b) Comparaison true / false (docker kill)

Avec `retryWrites=true` : 2 échecs observés pendant la bascule.
Avec `retryWrites=false` : 2 échecs observés pendant la bascule.

**Écart : 0.**

Dans les deux cas, l'exception observée est `ServerSelectionTimeoutError`, avec une attente d'environ 5 secondes correspondant à `serverSelectionTimeoutMS=5000`.

**Conclusion :** pendant une bascule par `kill`, il n'y a temporairement aucun PRIMARY dans le cluster. `retryWrites` ne peut pas aider dans ce cas : il n'y a personne à qui rejouer l'écriture.

### (c) L'expérience qui prouve — rs.stepDown(20)

En relançant le script avec un `rs.stepDown(20)` (le primary reste vivant mais rétrograde en secondary, contrairement au kill), l'écart devient net :

- Avec `retryWrites=true` : l'écriture interrompue par le stepDown est automatiquement rejouée sur le nouveau primary et réussit — pas d'échec visible côté application.
- Avec `retryWrites=false` : l'écriture échoue, avec un type d'exception et un code différents de ceux observés en (a) — une erreur de type `NotWritablePrimary` liée au changement de rôle immédiat du nœud, et non un `ServerSelectionTimeoutError` d'attente.

**Conclusion en une phrase :** `retryWrites` protège efficacement contre une panne où un primary reste joignable mais change de rôle (stepDown), mais ne peut rien contre une fenêtre où aucun primary n'existe dans le cluster (panne brutale par kill).

### (d) Sécurité du rejeu

`retryWrites` peut rejouer sans risque de doublon une opération d'insertion car chaque document porte un `_id` unique (voir le champ `o` de l'oplog en Q10) : rejouer l'insertion avec le même `_id` est idempotent. `updateMany` et `deleteMany` ne sont jamais rejoués automatiquement, car ils opèrent sur un ensemble de documents déterminé par une requête au moment de l'exécution — l'état de la base peut avoir changé entre la tentative initiale et le rejeu, ce qui rendrait un rejeu automatique dangereux (effets différents ou non sûrs).

---

## Q33 — Vérification des écritures réellement présentes

### (a) retryWrites=true

**Premier lancement :**
```
avant : 266 documents
après : 296 documents
nouveaux documents        : 296 − 266 = 30
écritures annoncées réussies : 30
écart                      : 0
```

**Second scénario (après panne) :**
```
avant : 296 documents
après : 325 documents
nouveaux documents        : 325 − 296 = 29
écritures réussies        : 29
écart                      : 0
```

Les deux nombres coïncident dans les deux cas : les écritures annoncées comme réussies sont bien retrouvées dans la collection.

### (b) w:"majority"

```
avant : 325 documents
après : 355 documents
nouveaux documents           : 355 − 325 = 30
écritures annoncées réussies : 30
écart                         : 0
```

Avec `w:"majority"`, les 30 écritures annoncées réussies sont bien présentes dans la collection — aucune différence d'écart observée par rapport à `w:1`.

### (c) Chiffre pour la DSI

> Lors d'une panne serveur brutale, notre service est indisponible en écriture pendant environ **12,1 secondes** du point de vue de l'application. Les mesures réalisées ne montrent **aucune perte** parmi les écritures annoncées comme réussies. Il faut toutefois distinguer une écriture confirmée en `w:1` (acceptée dès son enregistrement local) d'une écriture confirmée en `w:"majority"` (répliquée sur au moins 2 nœuds sur 3) : une erreur de Write Concern ne signifie pas que l'écriture n'a pas eu lieu (Q26), donc une application qui rejoue aveuglément une écriture en échec de Write Concern risque un doublon.

---

## Analyse des pertes : w:1 vs w:"majority"

### w:1

- **Avantage :** faible latence, confirmation dès l'enregistrement sur le PRIMARY.
- **Risque :** si le PRIMARY tombe brutalement avant que l'écriture ne soit répliquée vers un autre membre, celle-ci peut ne pas survivre au failover (rollback potentiel côté ancien PRIMARY à sa réintégration).

### w:"majority"

- **Avantage :** l'écriture est confirmée seulement après réplication vers une majorité des membres votants (au moins 2 sur 3 dans notre Replica Set), garantissant qu'elle survivra à la perte d'un seul nœud, y compris l'ancien PRIMARY.
- **Coût :** latence supplémentaire liée à l'attente de la réplication.

### Write Concern et erreur

Une erreur comme :
```
MongoWriteConcernError: waiting for replication timed out
```
signifie que la confirmation demandée n'a pas été obtenue dans le délai prévu — pas que l'opération n'a pas été exécutée (cf. Q26). Une application qui rejoue aveuglément la même écriture après une telle erreur peut donc provoquer un doublon.

---

## Synthèse de la résilience

| Mesure | Résultat |
|---|---|
| Failover observé par le cluster — Q21 | 11,596 s |
| Indisponibilité vue par l'application — Q31 | 12,118 s |
| Écart cluster / application | 0,522 s |
| Échecs pendant le lancement Q31 | 2 |
| Réussites pendant le lancement Q31 | 28 |
| retryWrites=true vs false — écart d'échecs (kill) | 0 |
| retryWrites=true vs false — écart (stepDown) | net (voir Q32c) |
| Q33(a) — écart écritures/documents | 0 |
| Q33(b) — écart avec w:"majority" | 0 |
| Failover avec timeout 2 s — R3 | 3,231 s |

---

## Conclusion DSI

Le Replica Set MongoDB assure une reprise automatique après la panne du PRIMARY. Dans notre expérience, le cluster retrouve un PRIMARY après environ **11,6 secondes**, tandis que l'application constate environ **12,1 secondes** d'indisponibilité en écriture — un écart de 0,522 s attribuable au temps de reconnexion du driver.

Les mesures ne montrent aucune perte parmi les écritures annoncées comme réussies. Néanmoins, le niveau de garantie dépend directement du Write Concern choisi : `w:1` privilégie la latence tandis que `w:"majority"` apporte une meilleure garantie de survie au failover. Le SLA doit donc être défini à partir de la mesure réellement perçue par l'application, et pas uniquement du temps d'élection interne à MongoDB.