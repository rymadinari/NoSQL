# index_bench.md — Partie 2 : Bench explain() avant / après index

## Q7 — Index sur `genres`

### Q7(a) — Avant la création de l'index

Requête exécutée :

```js
db.movies.find({
    genres: "Film-Noir"
}).explain("executionStats")
```

Résultat :

| Étape | Index utilisé | Stage   | totalDocsExamined | totalKeysExamined | nReturned |
|-------|----------------|---------|--------------------|---------------------|-----------|
| Avant | aucun          | COLLSCAN| 23539              | 0                   | 105       |

Le plan d'exécution utilise un `COLLSCAN`, c'est-à-dire que MongoDB parcourt toute la collection `movies`.

### Q7(b) — Après création de l'index

Index créé :

```js
db.movies.createIndex({ genres: 1 })
```

Résultat : `genres_1`

Requête :

```js
db.movies.find({
    genres: "Film-Noir"
}).explain("executionStats")
```

Résultat :

| Étape  | Index utilisé   | Stage           | totalDocsExamined | totalKeysExamined | nReturned |
|--------|------------------|-----------------|---------------------|---------------------|-----------|
| Après  | { genres: 1 }    | FETCH → IXSCAN  | 105                 | 105                 | 105       |

Le plan utilise maintenant l'index `genres_1`.

L'index permet de réduire fortement le nombre de documents examinés :

```
Avant  : 23539 documents examinés
Après  : 105 documents examinés
```

Le nombre de résultats reste identique :

`nReturned = 105`

### Conclusion Q7

L'index sur `genres` améliore fortement la recherche.

Sans index, MongoDB doit parcourir les 23539 documents de la collection.

Avec l'index, MongoDB examine seulement les 105 documents correspondants.

---

## Q8 — Index composé et règle ESR

Requête :

```js
db.movies.countDocuments({
    genres: "Drama",
    year: { $gte: 2000 }
})
```

Résultat : **7761**

La requête de recherche et de tri est :

```js
db.movies.find({
    genres: "Drama",
    year: { $gte: 2000 }
}).sort({
    "imdb.rating": -1
})
```

**Index utilisé**

```js
{
    genres: 1,
    "imdb.rating": -1,
    year: 1
}
```

L'index a été utilisé avec :

```js
.hint({
    genres: 1,
    "imdb.rating": -1,
    year: 1
})
```

**Résultat de `explain("executionStats")`**

| Ordre de l'index | Champs                                        | SORT en mémoire ? | totalKeysExamined | totalDocsExamined | nReturned |
|-------------------|-----------------------------------------------|---------------------|---------------------|---------------------|-----------|
| ESR               | {genres:1, "imdb.rating":-1, year:1}          | Non                  | 7834                | 7761                | 7761      |

Le plan obtenu est :

```
FETCH → IXSCAN
```

Aucun stage `SORT` n'est présent.

**Explication de l'ordre ESR**

L'ordre choisi respecte la règle ESR :

- **E — Equality** : `genres: "Drama"` est placé en premier.
- **S — Sort** : `"imdb.rating": -1` est placé ensuite afin de fournir directement le tri.
- **R — Range** : `year: { $gte: 2000 }` est placé en dernier.

L'index permet donc à MongoDB d'utiliser directement l'ordre de l'index pour le tri sur `imdb.rating`.

### Conclusion Q8

L'index :

```js
{ genres: 1, "imdb.rating": -1, year: 1 }
```

permet d'effectuer la requête sans stage `SORT` supplémentaire.

---

## R3 — Vérification expérimentale de la règle ESR

La règle ESR signifie : **Equality → Sort → Range**

Dans notre requête :

```js
db.movies.find({
    genres: "Drama",
    year: { $gte: 2000 }
}).sort({
    "imdb.rating": -1
})
```

l'ordre recommandé est donc :

```js
{
    genres: 1,
    "imdb.rating": -1,
    year: 1
}
```

### R3(a) — Comparaison avec un mauvais ordre

Index ESR :

```js
{
    genres: 1,
    "imdb.rating": -1,
    year: 1
}
```

Résultat :

- Stage : `FETCH → IXSCAN`
- totalKeysExamined : **7834**
- totalDocsExamined : **7761**
- nReturned : **7761**

Avec l'ordre ESR, aucun stage `SORT` n'est nécessaire.

Avec le mauvais ordre :

```js
{
    genres: 1,
    year: 1,
    "imdb.rating": -1
}
```

le tri sur `imdb.rating` ne peut plus être fourni directement par l'index.

Le plan contient alors un stage `SORT` en mémoire.

### R3(b) — Pourquoi l'ordre ESR est préférable ?

Avec l'index ESR :

```
FETCH → IXSCAN
```

Avec le mauvais ordre :

```
FETCH → SORT → IXSCAN
```

Le mauvais ordre examine :

```
totalKeysExamined  : 7761
totalDocsExamined  : 7761
```

L'ordre ESR examine :

```
totalKeysExamined  : 7834
totalDocsExamined  : 7761
```

Même si le mauvais ordre examine légèrement moins de clés, il doit effectuer un `SORT` supplémentaire en mémoire.

Cela entraîne un coût supplémentaire en :

- CPU ;
- mémoire ;
- temps d'exécution.

L'ordre ESR est donc préférable car il permet à MongoDB de récupérer directement les résultats dans le bon ordre depuis l'index.

### R3(c) — Limite du tri en mémoire

Si le tri dépasse la limite mémoire autorisée, MongoDB peut retourner une erreur de type :

```
Sort exceeded memory limit of 33554432 bytes,
but did not opt in to external sorting
```

Le tri peut être autorisé à utiliser le disque avec :

```js
.allowDiskUse(true)
```

Cependant, l'utilisation du disque est plus lente que le tri effectué directement grâce à un index adapté.

### Conclusion R3

L'expérience montre l'intérêt de la règle ESR :

**Equality → Sort → Range**

Dans notre cas :

```js
{ genres: 1, "imdb.rating": -1, year: 1 }
```

permet d'éviter le stage `SORT`, contrairement à :

```js
{ genres: 1, year: 1, "imdb.rating": -1 }
```

---

## Q10 — Index existants sur `movies`

Avant suppression de l'index text, les index présents étaient :

```json
[
  {
    v: 2,
    key: { _id: 1 },
    name: "_id_"
  },
  {
    v: 2,
    key: { genres: 1 },
    name: "genres_1"
  },
  {
    v: 2,
    key: {
      genres: 1,
      "imdb.rating": -1,
      year: 1
    },
    name: "genres_1_imdb.rating_-1_year_1"
  },
  {
    v: 2,
    key: {
      _fts: "text",
      _ftsx: 1
    },
    name: "title_text_plot_text",
    weights: {
      plot: 1,
      title: 1
    }
  }
]
```

L'index `_id_` est créé automatiquement par MongoDB.

L'index text :

```
title_text_plot_text
```

a ensuite été supprimé avec :

```js
db.movies.dropIndex("title_text_plot_text")
```

Après suppression, les principaux index restants sont :

- `_id_`
- `genres_1`
- `genres_1_imdb.rating_-1_year_1`

### Pourquoi un index inutilisé représente un coût ?

Un index inutilisé :

- occupe de l'espace disque ;
- utilise de la mémoire ;
- doit être maintenu lors des `insert`, `update` et `delete` ;
- n'apporte aucun gain aux requêtes qui ne l'utilisent pas.