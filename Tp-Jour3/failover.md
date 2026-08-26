# Failover — Mesures du Replica Set MongoDB

## Tableau des mesures

| Scénario | Commande | Délai mesuré | Nœud élu | Écritures perdues ? |
|---|---|---:|---|---|
| Arrêt propre | `docker stop mongo1` | 24,184 s | mongo2 | Aucune perte observée ; les écritures répliquées ont été récupérées |
| Panne brutale | `docker kill mongo1` | ≈ 11,596 s sans PRIMARY | mongo2 | Aucune perte observée dans nos tests |
| Timeout réduit (2 s) | panne + `electionTimeoutMillis=2000` | ≈ 3,231 s sans PRIMARY | mongo3 | Aucune perte observée dans nos tests |
| Retour du nœud | `docker start mongo1` | Quelques instants, puis priority takeover | mongo1 | Aucune perte observée ; les écritures répliquées ont été récupérées |

---

## 1. Arrêt propre

**Commande :**
```bash
docker stop mongo1
```

**Mesure du watcher :**
```
[11:00:08.587] +0.003s  PRIMARY mongo1:27017
[11:00:31.084] +24.184s PRIMARY mongo2:27017
```

- **Délai mesuré : 24,184 s**
- **Nouveau PRIMARY : mongo2:27017**

Avec docker stop, le processus mongod reçoit un arrêt propre. Le Replica Set détecte ensuite l'indisponibilité du PRIMARY et élit un nouveau PRIMARY.

Dans notre mesure, le nouveau PRIMARY est devenu mongo2:27017 après 24,184 secondes.

Les écritures réalisées pendant l'absence de mongo1 ont ensuite été récupérées par réplication lorsque le nœud est revenu.

---

## 2. Panne brutale

**Commande :**
```bash
docker kill mongo1
```

**Mesure du watcher :**
```
[11:06:03.503] +0.003s  PRIMARY mongo1:27017
[11:06:15.889] +12.390s NO PRIMARY
[11:06:25.879] +23.986s PRIMARY mongo2:27017
```

Période observée sans PRIMARY :
```
23,986 − 12,390 = 11,596 s
```

- **Délai observé : ≈ 11,596 s**
- **Nouveau PRIMARY : mongo2:27017**

Cette mesure est légèrement supérieure à `electionTimeoutMillis = 10000 ms`, car le timeout d'élection n'est pas l'intégralité du temps de failover : il faut aussi détecter la panne via les heartbeats manqués, communiquer entre les membres et effectuer l'élection elle-même.

---

## 3. Comparaison avec electionTimeoutMillis = 2000 ms

Après reconfiguration (`cfg.settings.electionTimeoutMillis = 2000; rs.reconfig(cfg)`) et nouveau `docker kill mongo1` :
```
NO PRIMARY       : +14,228 s
PRIMARY mongo3   : +17,459 s
```

```
17,459 − 14,228 = 3,231 s
```

Comparaison avec la panne brutale à 10000 ms :
```
11,596 / 3,231 ≈ 3,59
```

La bascule est donc environ **3,6 fois plus rapide**, et non 5 fois plus rapide comme le ratio des timeouts (10000/2000) le suggérerait — une partie du délai de failover ne dépend pas de `electionTimeoutMillis`.

---

## 4. Retour du nœud

**Commande :**
```bash
docker start mongo1
```

mongo1 revient d'abord en SECONDARY puis reprend le rôle de PRIMARY grâce à sa priorité supérieure (`priority: 2`) — c'est un **priority takeover**.

État final :
```
mongo1 → PRIMARY
mongo2 → SECONDARY
mongo3 → SECONDARY
```

Cela provoque une **deuxième bascule** dans le scénario complet (mongo1→mongo2 puis mongo2→mongo1).

---

## Commentaire DSI

Une panne entraîne une indisponibilité temporaire des écritures pendant la phase d'élection, mesurée à environ **11,6 secondes** lors de la panne brutale — un scénario réaliste de crash serveur. Notre mesure d'arrêt propre a été de **24,184 secondes**, ce qui montre que le délai réel dépend fortement du scénario et du comportement du cluster, et pas seulement du réglage `electionTimeoutMillis`. Le SLA ne doit donc pas être évalué uniquement sur le temps d'élection : il faut également mesurer ce que l'application constate réellement (12,118 s en Q31) et le risque lié aux écritures non confirmées par la majorité (Q26).

---

## Conclusion

Le Replica Set assure la continuité du service grâce à l'élection automatique d'un nouveau PRIMARY. Cependant, le temps de réélection côté cluster n'est pas identique au temps d'indisponibilité perçu par l'application.

**Les mesures principales retenues :**
- **24,184 s** pour l'arrêt propre (Q17)
- **11,596 s** sans PRIMARY lors de la panne brutale (Q21)
- **12,118 s** d'indisponibilité observée par l'application (Q31)
- **3,231 s** avec `electionTimeoutMillis = 2000 ms` (R3)