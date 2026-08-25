# TP Jour 2 — Modélisation, Indexation & Drivers — Réponses

---

## Partie 1 — Modélisation & intégrité référentielle

### Q1 — Comptes de base

```js
db.movies.countDocuments({})
// 23539

db.comments.countDocuments({})
// 50304

db.movies.distinct("genres").length
// 25
```

Résultats :

- Nombre de films : **23539**
- Nombre de commentaires : **50304**
- Nombre de genres distincts : **25**

### Q2 — Commentaires orphelins

```js
db.comments.aggregate([
  {
    $lookup: {
      from: "movies",
      localField: "movie_id",
      foreignField: "_id",
      as: "m"
    }
  },
  {
    $match: {
      m: { $size: 0 }
    }
  },
  {
    $count: "orphan_comments"
  }
])
```

Résultat :

**9224** commentaires orphelins.

Un commentaire est considéré comme orphelin lorsque son `movie_id` ne correspond à aucun film présent dans la collection `movies`.

### Q3 — Films distincts référencés

```js
db.comments.aggregate([
  {
    $group: {
      _id: "$movie_id"
    }
  },
  {
    $count: "referenced_movies"
  }
])
```

Résultat :

**14245** films distincts référencés par les commentaires.

### Q4 — Computed Pattern `num_mflix_comments`

**a) Films possédant le champ**

```js
db.movies.countDocuments({
  num_mflix_comments: { $exists: true }
})
```

Résultat :

**15740** films sur 23539, soit environ **66,87 %**.

**b) Film *The Taking of Pelham 1 2 3***

- Compteur stocké : **437**
- Nombre réel de commentaires : **161**

**c) Écart**

- Écart absolu : `437 - 161 = 276`
- Écart en pourcentage par rapport au nombre réel : **171,43 %**

Le compteur stocké surestime donc fortement le nombre réel de commentaires.

**d) Explication**

Le champ `num_mflix_comments` est un exemple de **Computed Pattern**.

Il permet d'afficher rapidement le nombre de commentaires sans devoir compter les documents de la collection `comments` à chaque consultation.

Cependant, ce compteur peut devenir incohérent si les opérations d'ajout ou de suppression de commentaires ne mettent pas correctement à jour le compteur.

Dans notre exemple, le film *The Taking of Pelham 1 2 3* possède 437 commentaires indiqués dans le compteur, alors qu'il possède réellement 161 commentaires.

Cela montre le risque de désynchronisation d'une donnée dénormalisée.

### Q5 — `year` stocké en chaîne de caractères

Résultat :

**37** films possèdent un champ `year` stocké sous forme de chaîne de caractères.

Une requête comme :

```js
db.movies.countDocuments({
  year: { $gte: 2000 }
})
```

ne traite pas ces valeurs comme des années numériques.

MongoDB effectue les comparaisons en tenant compte du type BSON du champ.

Il est donc important d'avoir un type cohérent pour le champ `year`.

### Q6 — `imdb.rating` égal à `""`

Résultat :

**61** films possèdent une valeur vide `""` dans `imdb.rating`.

Ces valeurs doivent être prises en compte lors des calculs statistiques afin d'éviter de mélanger des chaînes de caractères avec des valeurs numériques.

Pour calculer une moyenne correctement, il est préférable de filtrer les valeurs selon leur type BSON.

---

## Partie 2 — Indexation & explain()

### Q7 — Index multi-clés sur `genres`

**Q7a — Avant l'index**

Requête :

```js
db.movies.find({
  genres: "Film-Noir"
}).explain("executionStats")
```

Résultat :

- stage : `COLLSCAN`
- nReturned : **105**
- totalDocsExamined : **23539**
- totalKeysExamined : **0**

MongoDB parcourt donc toute la collection `movies`.

**Q7b — Après création de l'index**

Index créé :

```js
db.movies.createIndex({
  genres: 1
})
```

Résultat : `genres_1`

Requête :

```js
db.movies.find({
  genres: "Film-Noir"
}).explain("executionStats")
```

Résultat :

- stage : `FETCH -> IXSCAN`
- nReturned : **105**
- totalDocsExamined : **105**
- totalKeysExamined : **105**

Le nombre de films correspond également à :

```js
db.movies.countDocuments({
  genres: "Film-Noir"
})
```

Résultat : **105**

**Conclusion**

Avec l'index, MongoDB n'a plus besoin de parcourir les 23539 documents.

Il examine directement les 105 documents correspondant au genre recherché.

### Q8 — Index composé et règle ESR

Nombre de films correspondant à :

```js
db.movies.countDocuments({
  genres: "Drama",
  year: { $gte: 2000 }
})
```

Résultat : **7761**

**Index utilisé**

```js
db.movies.createIndex({
  genres: 1,
  "imdb.rating": -1,
  year: 1
})
```

Requête :

```js
db.movies.find({
  genres: "Drama",
  year: { $gte: 2000 }
}).sort({
  "imdb.rating": -1
}).hint({
  genres: 1,
  "imdb.rating": -1,
  year: 1
}).explain("executionStats")
```

Résultats :

- nReturned : **7761**
- totalKeysExamined : **7834**
- totalDocsExamined : **7761**
- stage : `FETCH -> IXSCAN`
- aucun stage `SORT`

**Règle ESR**

L'ordre choisi respecte la règle : **Equality → Sort → Range**

```
genres       → Equality
imdb.rating  → Sort
year         → Range
```

Le champ `genres` est placé en premier car il correspond à une égalité.

Le champ `imdb.rating` est ensuite utilisé pour fournir directement l'ordre demandé.

Le champ `year`, qui utilise une condition de type intervalle (`$gte`), est placé après.

**Conclusion**

Oui, le tri est fourni par l'index.

Le résultat de `explain()` ne contient pas de stage `SORT` :

```
FETCH -> IXSCAN
```

### Q9 — Index text

**a) Recherche avec `$regex`**

Recherche de *Godfather* dans le titre :

```js
db.movies.countDocuments({
  title: /Godfather/i
})
```

Résultat : **5**

**b) Recherche avec `$text`**

```js
db.movies.countDocuments({
  $text: {
    $search: "godfather"
  }
})
```

Résultat : **12**

**c) Différence**

La recherche `$text` retourne 12 résultats contre 5 avec le regex sur `title`.

La différence est donc de : **7 films**

L'index textuel permet notamment de rechercher dans les champs configurés pour l'index textuel, comme `title` et `plot`.

Le `$regex` utilisé uniquement sur `title` ne recherche pas dans `plot`.

**d) Recherche de `godfathers`**

```js
db.movies.countDocuments({
  $text: {
    $search: "godfathers"
  }
})
```

Résultat : **12**

La recherche textuelle peut traiter les variations grammaticales grâce au fonctionnement de l'index textuel.

**e) Quand utiliser `$regex` ?**

`$regex` reste intéressant lorsqu'on souhaite rechercher une sous-chaîne précise.

Par exemple :

```js
{
  title: /God/
}
```

Le regex permet de rechercher une partie d'un mot ou une chaîne précise.

### Q10 — Index existants

Les index créés/utilisés pendant le TP sont notamment :

- `_id_`
- `genres_1`
- `genres_1_imdb.rating_-1_year_1`
- `title_text_plot_text`

L'index `_id_` est automatiquement créé par MongoDB.

L'index textuel a ensuite été supprimé avec :

```js
db.movies.dropIndex("title_text_plot_text")
```

Après suppression, les index conservés sont :

- `_id_`
- `genres_1`
- `genres_1_imdb.rating_-1_year_1`

Un index inutilisé représente un coût supplémentaire car il consomme de l'espace disque et de la mémoire.

Il doit également être maintenu lors des opérations d'écriture (insert, update, delete).

---

## Partie 3 — Agrégation analytique

### Q11 — Top 5 genres

Pipeline :

```js
db.movies.aggregate([
  { $unwind: "$genres" },
  { $group: { _id: "$genres", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 5 }
])
```

Résultats :

| Genre    | Nombre de films |
|----------|------------------|
| Drama    | 13789            |
| Comedy   | 7024             |
| Romance  | 3665             |
| Crime    | 2678             |
| Thriller | 2658             |

### Q12 — Top 3 décennies

Pipeline :

```js
db.movies.aggregate([
  {
    $match: {
      year: { $type: "int" }
    }
  },
  {
    $group: {
      _id: {
        $subtract: [
          "$year",
          { $mod: ["$year", 10] }
        ]
      },
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 3 }
])
```

Résultats :

| Décennie | Nombre de films |
|----------|------------------|
| 2000     | 7749             |
| 2010     | 5972             |
| 1990     | 3773             |

### Q13 — Note IMDB moyenne des films Drama

Pipeline :

```js
db.movies.aggregate([
  {
    $match: {
      genres: "Drama",
      "imdb.rating": { $type: "double" }
    }
  },
  {
    $group: {
      _id: null,
      avgRating: { $avg: "$imdb.rating" },
      count: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      avgRating: { $round: ["$avgRating", 4] },
      count: 1
    }
  }
])
```

Résultat :

- Moyenne IMDB : **6.8276**
- Nombre de films pris en compte : **12377**

### Q14 — Top 3 réalisateurs

Pipeline :

```js
db.movies.aggregate([
  { $unwind: "$directors" },
  {
    $group: {
      _id: "$directors",
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 3 }
])
```

Résultats :

| Réalisateur    | Nombre de films |
|----------------|------------------|
| Woody Allen    | 40               |
| John Ford      | 35               |
| Takashi Miike  | 34               |

### Q15 — Top 5 films les plus commentés

Pipeline :

```js
db.comments.aggregate([
  {
    $group: {
      _id: "$movie_id",
      nb_comments: { $sum: 1 }
    }
  },
  { $sort: { nb_comments: -1 } },
  { $limit: 5 },
  {
    $lookup: {
      from: "movies",
      localField: "_id",
      foreignField: "_id",
      as: "movie"
    }
  },
  { $unwind: "$movie" },
  {
    $project: {
      _id: 0,
      title: "$movie.title",
      nb_comments: 1
    }
  }
])
```

Résultats :

| Film                        | Nombre de commentaires |
|-----------------------------|--------------------------|
| The Taking of Pelham 1 2 3  | 161                      |
| 50 First Dates              | 158                      |
| About a Boy                 | 158                      |
| Terminator Salvation        | 158                      |
| Ocean's Eleven               | 158                      |

---

## Partie 4 — Drivers PyMongo

### Q16 — Réconciliation du Computed Pattern

Le script `patterns.py` compare `num_mflix_comments` avec le nombre réel de commentaires présents dans la collection `comments`.

Résultats :

- Films possédant le champ : **15740**
- Compteurs incohérents : **12244**
- Pourcentage incohérent : **77.79 %**

Cela montre que la donnée dénormalisée présente un niveau important d'incohérence avant réconciliation.

### Q17 — Correction des compteurs

Le script utilise `bulk_write()` et `UpdateOne` afin de corriger les compteurs.

Résultat :

`modifiedCount : 20043`

Après la correction, une nouvelle vérification est effectuée.

Résultat : **0 incohérence**

Les compteurs sont donc recalculés à partir des commentaires réellement présents.

### Q18 — Subset Pattern

Le script sélectionne les 10 films les plus commentés puis embarque les 3 commentaires les plus récents dans le champ `recent_comments`.

Pour le film *The Taking of Pelham 1 2 3*, le nombre de commentaires réels est **161** mais seulement **3 sous-documents** sont embarqués dans `recent_comments`.

**Pourquoi utiliser le Subset Pattern ?**

Le principe est de ne pas embarquer tous les commentaires dans le document `movies`.

Seuls quelques commentaires récents sont conservés pour permettre un affichage rapide d'un aperçu.

Les commentaires complets restent disponibles dans la collection `comments`.

---

## Partie 5 — Transaction ACID

### Q19 — Transaction MongoDB

Le fichier `transaction.js` réalise une transaction contenant deux opérations :

1. Suppression d'un commentaire.
2. Décrémentation du champ `num_mflix_comments`.

**Avant le commit**

`num_mflix_comments = 2`

**Après le commit**

`num_mflix_comments = 1`

Le commentaire supprimé n'est plus présent.

**Test d'abort**

Une deuxième transaction est volontairement interrompue avec une erreur.

Après `abortTransaction()`, le compteur reste inchangé et le commentaire est toujours présent.

Résultat :

- `num_mflix_comments` APRÈS abort = **1**
- commentaire encore présent = **true**

**ACID**

**Atomicité**

Les opérations de suppression du commentaire et de modification du compteur sont exécutées comme une seule unité.

Si la transaction est annulée, aucune des opérations n'est conservée.

**Cohérence**

Le compteur et la suppression du commentaire sont modifiés ensemble afin de maintenir une cohérence entre les deux collections.

**Isolation**

La transaction utilise `readConcern: { level: "snapshot" }`, ce qui permet de travailler avec une vue cohérente des données pendant la transaction.

**Durabilité**

La transaction utilise `writeConcern: { w: "majority" }`.

Le commit est confirmé après réplication sur la majorité des nœuds.

---

## Partie 6 — Réflexion

### R1 — Ce que le SGBD ne fait plus pour vous

Le nombre de commentaires orphelins est **9224** sur un total de **50304** commentaires.

Cela représente environ **18.34 %**.

MongoDB ne fournit pas de clé étrangère classique comme une base relationnelle.

L'application doit donc gérer l'intégrité référentielle.

Deux stratégies sont possibles :

**Stratégie 1 — Vérification à l'écriture**

Avant d'ajouter un commentaire, l'application vérifie que le film existe.

- Avantage : limite la création de nouveaux commentaires orphelins.
- Inconvénient : nécessite une requête supplémentaire ; peut nécessiter une transaction pour garantir la cohérence en cas de concurrence.

**Stratégie 2 — Nettoyage périodique**

Un processus périodique recherche les commentaires orphelins et les supprime ou les archive.

- Avantage : permet de nettoyer les données existantes.
- Inconvénient : les données peuvent rester temporairement incohérentes entre deux nettoyages.

### R2 — Embed vs Reference

Le film le plus commenté possède **161 commentaires**. Il s'agit de *The Taking of Pelham 1 2 3*.

La taille moyenne approximative d'un commentaire est d'environ **362 octets**.

Une estimation de la taille de 161 commentaires donne :

`161 × 362 ≈ 58 300 octets`

soit environ **57 Ko**.

Cette taille reste largement inférieure à la limite MongoDB de 16 Mo par document.

Cependant, l'embarquement de tous les commentaires n'est pas forcément adapté.

Les commentaires sont des données fréquemment ajoutées et consultées indépendamment du film.

Le modèle par référence permet notamment :

- la pagination ;
- le tri des commentaires ;
- la gestion indépendante des commentaires ;
- d'éviter de faire grossir le document `movies`.

Le Subset Pattern constitue un compromis : quelques commentaires sont embarqués pour l'aperçu, tandis que tous les commentaires restent dans `comments`.

### R3 — ESR vérifié par l'expérience

La règle ESR signifie : **Equality → Sort → Range**

Dans notre cas :

```
genres       → Equality
imdb.rating  → Sort
year         → Range
```

L'index utilisé est :

```js
{
  genres: 1,
  "imdb.rating": -1,
  year: 1
}
```

**Avec l'ordre ESR**

Résultats :

- stage = `FETCH -> IXSCAN`
- totalKeysExamined = **7834**
- totalDocsExamined = **7761**
- nReturned = **7761**

Aucun stage `SORT` n'est présent.

**Avec un mauvais ordre**

Un index comme :

```js
{
  genres: 1,
  year: 1,
  "imdb.rating": -1
}
```

ne permet pas de fournir directement le tri demandé après la condition de range.

Un stage `SORT` peut alors être nécessaire.

Le mauvais ordre peut donc entraîner un coût supplémentaire en CPU et en mémoire.

Si un tri dépasse la limite mémoire autorisée, MongoDB peut produire une erreur de dépassement de mémoire lorsque l'utilisation du disque n'est pas autorisée.

### R4 — Patterns : bénéfice et coût

Le Computed Pattern permet de stocker directement le nombre de commentaires (`num_mflix_comments`).

Cela évite de compter les commentaires à chaque affichage.

Dans notre dataset, 14245 films distincts sont référencés par les commentaires.

Sans compteur pré-calculé, il faudrait effectuer des opérations de comptage pour obtenir le nombre de commentaires.

Cependant, le risque est la désynchronisation.

Avant correction : **12244** compteurs incohérents sur **15740** films possédant le champ, soit **77.79 %**.

L'utilisation du Computed Pattern doit donc être accompagnée d'un mécanisme garantissant la mise à jour du compteur.

La transaction utilisée en Q19 montre une solution possible : effectuer simultanément la suppression du commentaire et la mise à jour du compteur dans une transaction ACID.