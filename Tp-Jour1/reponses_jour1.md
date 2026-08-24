# TP Jour 1 — Introduction au NoSQL & MongoDB

**Étudiant :** Ryma Dinari  
**Base :** `nyc`  
**Collection :** `restaurants`  
**MongoDB :** 7.0.40

> Les résultats ci-dessous correspondent à l'état de la base après import, puis aux modifications demandées dans les parties 3 et 4.

## Partie 0 — Mise en place

### P0 — Import

Commande :
```javascript
db.restaurants.countDocuments({})
```

Résultat :
```text
25359
```

Le fichier contient **25 359 documents**. `mongoimport` a indiqué : `25359 document(s) imported successfully. 0 document(s) failed to import.`

Exemple de document observé avec `db.restaurants.findOne()` : les champs `address`, `borough`, `cuisine`, `grades`, `name` et `restaurant_id` sont présents.

---

# Partie 1 — Lecture & opérateurs

## Q1. Nombre total de restaurants

Commande :
```javascript
db.restaurants.countDocuments({})
```

Résultat : **25359**

## Q2. Nombre de cuisines distinctes

Commande :
```javascript
db.restaurants.distinct("cuisine").length
```

Résultat : **85**

## Q3. Restaurants à Brooklyn

Commande :
```javascript
db.restaurants.countDocuments({ borough: "Brooklyn" })
```

Résultat : **6086**

## Q4. Cuisine French

Commande :
```javascript
db.restaurants.countDocuments({ cuisine: "French" })
```

Résultat : **344**

## Q5. Manhattan + Italian

Commande :
```javascript
db.restaurants.countDocuments({
  borough: "Manhattan",
  cuisine: "Italian"
})
```

Résultat : **621**

## Q6. Bronx + Chinese

Commande :
```javascript
db.restaurants.countDocuments({
  borough: "Bronx",
  cuisine: "Chinese"
})
```

Résultat : **323**

## Q7. Restaurants nommés exactement Subway

Commande :
```javascript
db.restaurants.countDocuments({ name: "Subway" })
```

Résultat : **421**

Les 3 premiers :
```javascript
db.restaurants.find(
  { name: "Subway" },
  { _id: 0, name: 1, borough: 1 }
).limit(3)
```

Résultat :
```text
{ borough: 'Manhattan', name: 'Subway' }
{ borough: 'Manhattan', name: 'Subway' }
{ borough: 'Queens', name: 'Subway' }
```

## Q8. Cuisine parmi Japanese, Korean, Thai, Indian

Commande :
```javascript
db.restaurants.countDocuments({
  cuisine: {
    $in: ["Japanese", "Korean", "Thai", "Indian"]
  }
})
```

Résultat : **1623**

## Q9. Recherche BBQ et House

### Q9(a)
```javascript
db.restaurants.countDocuments({ name: /BBQ/ })
```

Résultat : **0**

### Q9(b)
```javascript
db.restaurants.countDocuments({ name: /BBQ/i })
```

Résultat : **73**

### Q9(c)

Écart : **73**.

Exemples trouvés uniquement avec la recherche insensible à la casse :
```javascript
db.restaurants.find(
  {
    name: { $regex: "BBQ", $options: "i" },
    $expr: {
      $not: [
        { $regexMatch: { input: "$name", regex: "BBQ" } }
      ]
    }
  },
  { _id: 0, name: 1, borough: 1 }
).limit(3)
```

Résultat :
```text
{ borough: 'Manhattan', name: 'Dallas Bbq' }
{ borough: 'Manhattan', name: 'Dallas Bbq' }
{ borough: 'Manhattan', name: "Virgil'S Bbq" }
```

La base contient donc `Bbq` avec un `b` minuscule au lieu de `BBQ`.

### Q9(d) — House

```javascript
db.restaurants.countDocuments({ name: /House/ })
```
Résultat : **387**

```javascript
db.restaurants.countDocuments({ name: /House/i })
```
Résultat : **503**

Écart : **116**.

Exemples supplémentaires :
```text
Peter Luger Steakhouse
Roadhouse Restaurant
Sammy'S Steakhouse
```

Ici, la différence vient notamment du fait que `House` apparaît à l'intérieur d'un mot ou d'une autre combinaison, avec une casse différente : par exemple `Steakhouse` contient `house` en minuscules.

### Q9(e) — Solution de production

Je ne choisirais pas simplement un regex non ancré. En production, je proposerais une solution de recherche dédiée, par exemple **MongoDB Atlas Search**, avec un index de recherche configuré pour être insensible à la casse et adapté à la recherche textuelle. Cela permet une recherche plus robuste et plus performante qu'un `$regex` non ancré.

## Q10. Code postal 10462

Commande :
```javascript
db.restaurants.countDocuments({
  "address.zipcode": "10462"
})
```

Résultat : **150**

## Q11. Restaurant ID 30075445

Commande :
```javascript
db.restaurants.findOne(
  { restaurant_id: "30075445" },
  { _id: 0, name: 1 }
)
```

Résultat : **Morris Park Bake Shop**

---

# Partie 2 — Tableaux & sous-documents

## Q12. Au moins un score > 50

```javascript
db.restaurants.countDocuments({
  "grades.score": { $gt: 50 }
})
```

Résultat : **349**

## Q13. Grade C

### Q13(a) — Au moins un C dans l'historique
```javascript
db.restaurants.countDocuments({
  "grades.grade": "C"
})
```

Résultat : **2708**

### Q13(b) — Première entrée du tableau = C
```javascript
db.restaurants.countDocuments({
  "grades.0.grade": "C"
})
```

Résultat : **220**

### Q13(c)

Écart : **2708 - 220 = 2488**.

Dans les documents observés, les dates sont décroissantes : l'indice `0` correspond à la note la plus récente. Par exemple, pour `C & C Catering Service`, l'indice 0 est daté du 16/04/2014, puis 23/04/2013, 24/04/2012 et 16/12/2011.

Donc, pour répondre à « restaurants actuellement mal notés », la requête `grades.0.grade: "C"` est la plus pertinente. La requête `grades.grade: "C"` mesure plutôt les restaurants ayant déjà obtenu un C dans leur historique.

## Q14. Tableaux grades vides

```javascript
db.restaurants.countDocuments({
  grades: { $size: 0 }
})
```

Résultat initial : **738**.

Une inspection peut produire un tableau vide lorsqu'aucune inspection/note n'a été enregistrée dans les données exportées pour ce restaurant.

Après la suppression des 51 documents `borough: "Missing"`, il reste **737** tableaux `grades` vides.

## Q15. Au moins 6 notes

```javascript
db.restaurants.countDocuments({
  "grades.5": { $exists: true }
})
```

Résultat : **3864**

## Q16. Première note = A

```javascript
db.restaurants.countDocuments({
  "grades.0.grade": "A"
})
```

Résultat : **20687**

## Q17. Piège $elemMatch

### Q17(a) — Requête naïve
```javascript
db.restaurants.countDocuments({
  "grades.grade": "B",
  "grades.score": { $gt: 20 }
})
```

Résultat : **4908**

### Q17(b) — Requête correcte
```javascript
db.restaurants.countDocuments({
  grades: {
    $elemMatch: {
      grade: "B",
      score: { $gt: 20 }
    }
  }
})
```

Résultat : **4280**

### Q17(c)

Les deux nombres diffèrent de **628** car la requête naïve peut satisfaire `grade: B` avec un élément du tableau et `score > 20` avec un autre élément. `$elemMatch` impose que les deux conditions soient satisfaites par **la même note**. La réponse métier correcte est donc **4280**.

## Q18. Scores négatifs

### Q18(a)
```javascript
db.restaurants.countDocuments({
  "grades.score": { $lt: 0 }
})
```

Résultat : **13**.

Un score négatif n'a pas de sens métier pour une note d'inspection d'hygiène et constitue une anomalie de qualité des données.

### Q18(b) — Moyennes

Avec les scores négatifs :
```javascript
db.restaurants.aggregate([
  { $unwind: "$grades" },
  { $group: { _id: null, moy: { $avg: "$grades.score" } } }
])
```

Résultat : **11.434842161583735**

Sans les scores négatifs :
```javascript
db.restaurants.aggregate([
  { $unwind: "$grades" },
  { $match: { "grades.score": { $gte: 0 } } },
  { $group: { _id: null, moy: { $avg: "$grades.score" } } }
])
```

Résultat : **11.436572235838051**

Écart relatif : environ **-0.01513 %** (la moyenne avec les négatifs est légèrement plus faible).

### Q18(c)

Les 13 anomalies représentent une faible quantité et ne déplacent la moyenne que d'environ **0,01513 %**. Elles doivent néanmoins être nettoyées ou contrôlées car elles sont incohérentes métier, mais le chiffre montre qu'elles ne provoquent pas une déformation importante de la moyenne globale.

## Q19. Score maximal

Commande :
```javascript
db.restaurants.find(
  {},
  { _id: 0, name: 1, "grades.score": 1 }
).sort({ "grades.score": -1 }).limit(1)
```

Résultat :
```text
name: "Murals On 54/Randolphs'S"
score maximal: 131
```

---

# Partie 3 — Création & mise à jour

## Q20. INSERT

Restaurant ajouté :
```javascript
db.restaurants.insertOne({
  name: "Restaurant RD",
  borough: "Montpellier",
  cuisine: "French",
  address: {
    coord: [3.8767, 43.6108]
  },
  grades: [
    {
      grade: "A",
      score: 7,
      date: new Date()
    }
  ]
})
```

Résultat : insertion réussie avec un nouvel `ObjectId`.

Le restaurant a été vérifié avec `findOne({name: "Restaurant RD"})`.

Impact sur le nombre de documents : **+1**.

## Q21. $push sur Morris Park Bake Shop

```javascript
db.restaurants.updateOne(
  { restaurant_id: "30075445" },
  {
    $push: {
      grades: {
        grade: "A",
        score: 3,
        date: new Date()
      }
    }
  }
)
```

Résultat : `matchedCount: 1`, `modifiedCount: 1`.

Le restaurant avait 5 notes et en possède maintenant **6 notes**.

## Q22. Ajout de risque

```javascript
db.restaurants.updateMany(
  { "grades.score": { $gt: 50 } },
  { $set: { risque: "eleve" } }
)
```

Résultat :
```text
matchedCount: 349
modifiedCount: 349
```

## Q23. Label qualité pour French

```javascript
db.restaurants.updateMany(
  { cuisine: "French" },
  { $set: { label_qualite: true } }
)
```

Résultat :
```text
matchedCount: 345
modifiedCount: 345
```

Le nombre est **345** car le restaurant `Restaurant RD` ajouté en Q20 est lui aussi de cuisine French.

---

# Partie 4 — Suppression & qualité

## Q24. Borough Missing

```javascript
db.restaurants.countDocuments({
  borough: "Missing"
})
```

Résultat : **51**

## Q25. Suppression

```javascript
db.restaurants.deleteMany({
  borough: "Missing"
})
```

Résultat : **deletedCount: 51**.

Nouveau total :
```javascript
db.restaurants.countDocuments({})
```

Résultat : **25309**.

## Q26. Gouvernance des grades vides

Nombre actuel : **737**.

Effectif actuel : **25309**.

Pourcentage :

**737 / 25309 × 100 ≈ 2,91 %**.

Les 51 documents `borough: "Missing"` ont été supprimés car leur arrondissement est irrécupérable dans le dataset. Les documents avec `grades: []` sont conservés car l'absence de notes est une information exploitable et le restaurant peut potentiellement être enrichi lors d'une future inspection.

---

# Partie 5 — Automatisation

## Q27. Rapport automatisé

Le script `rapport.js` est fourni séparément dans le dossier.

Résultat du rapport final :

**Total : 25309 restaurants.**

Top 5 des cuisines :
1. American : **6173**
2. Chinese : **2412**
3. Café/Coffee/Tea : **1210**
4. Pizza : **1162**
5. Italian : **1069**

Restaurants par arrondissement :
- Bronx : **2338**
- Brooklyn : **6086**
- Manhattan : **10259**
- Montpellier : **1**
- Queens : **5656**
- Staten Island : **969**

Écart entre Q1 et le rapport final :

**25359 - 25309 = 50 documents de moins.**

Explication :
- Q20 a ajouté **+1** restaurant fictif.
- Q24-Q25 ont supprimé **51** restaurants `borough: "Missing"`.
- Q21, Q22 et Q23 sont des mises à jour et ne changent pas le nombre de documents.
- Bilan : **+1 - 51 = -50**.
- Donc : **25359 - 50 = 25309**.

La nouvelle valeur d'arrondissement est **Montpellier**, créée par le restaurant ajouté en Q20.

## Q28. Export Staten Island

Commande utilisée avec un fichier de requête JSON :
```text
mongoexport --username admin --password ipssi2025 --authenticationDatabase admin --db nyc --collection restaurants --queryFile /tmp/query.json --out /tmp/staten_island.json
```

Résultat : **969 records exportés**.

Le fichier `staten_island.json` contient **969 lignes/documents JSON**.

---

# Partie 6 — Réflexion

## R1. Les 5 V

Le **Volume** est visible avec les **25 359 restaurants** importés initialement (Q1), ce qui représente déjà une quantité importante de documents. La **Variété** apparaît avec **85 types de cuisine distincts** (Q2) et avec des documents contenant des sous-documents `address` et des tableaux `grades`. La **Véracité** est illustrée par les **13 scores négatifs** détectés en Q18(a), alors qu'un score négatif n'a pas de sens pour une inspection. La différence entre les moyennes avec et sans ces anomalies est d'environ **0,01513 %** (Q18b), ce qui montre que l'impact statistique est faible malgré l'anomalie métier. Enfin, la **Valeur** vient des requêtes métier, par exemple les **10 259 restaurants de Manhattan** dans le rapport final (Q27), permettant d'exploiter la donnée pour l'application publique.

## R2. CAP & BASE

Pour un service public affichant des inspections d'hygiène, je privilégierais la **cohérence (C)** lorsqu'une partition réseau survient. Prenons `Morris Park Bake Shop`, identifié en Q11 par le restaurant_id `30075445`. Si le restaurant vient d'être fermé pour insalubrité et que l'application privilégie C, l'usager peut temporairement recevoir une indisponibilité ou une réponse indiquant que la donnée ne peut pas être confirmée, plutôt qu'une information ancienne. Avec A, l'application resterait accessible mais pourrait afficher une information obsolète indiquant encore le restaurant comme ouvert. Dans ce contexte sanitaire, je préfère C : j'accepte une perte temporaire de disponibilité pour éviter de diffuser une information potentiellement dangereuse.

## R3. Embarqué vs référencé

La Q15 indique que **3864 restaurants ont au moins 6 notes**. En Q21, `Morris Park Bake Shop` passe de 5 à **6 notes** après le `$push`. Sur un document observé, `Object.bsonsize(doc)` donne **524 octets** pour 6 notes, soit une estimation simple de **87,33 octets par note**. Avec 520 notes, une extrapolation donne environ **45 413 octets**, soit environ 44,3 KiB : cela reste très loin de la limite BSON de **16 MiB (16 777 216 octets)** par document. Le modèle embarqué est donc adapté à 520 inspections et facilite la lecture de toutes les inspections d'un restaurant. Sa limite est la croissance continue du tableau : à très long terme, le document pourrait devenir trop volumineux. Je basculerais vers un modèle référencé lorsque le volume prévisible des inspections devient suffisamment important pour approcher la limite de 16 MiB ou lorsque les inspections doivent être requêtées et mises à jour indépendamment à très grande échelle.

---

# Annexe — Environnement reproductible

Conteneurs utilisés :
- `mongo-ipssi` : MongoDB 7.0
- `mongo-express-ipssi` : mongo-express 1.0.2

MongoDB est exposé sur `localhost:27017` et mongo-express sur `localhost:8081`.

Import : **25 359 documents réussis, 0 échec**.
