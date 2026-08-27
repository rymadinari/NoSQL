// TP Jour 4 - Pipelines d'agrégation
// Exécution: mongosh -u admin -p ipssi2025 --authenticationDatabase admin citibike < pipelines.js

// Q12: Top 5 des stations de départ par nombre de trajets
db.trips.aggregate([
  { $group: { _id: "$start station id", nom: { $first: "$start station name" }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 }
]);

// Q13: Répartition par type d'abonnement
db.trips.aggregate([
  { $group: { _id: "$usertype", n: { $sum: 1 }, duree_moyenne: { $avg: "$tripduration" } } }
]);

// Q14: Trajets par jour
db.trips.aggregate([
  { $group: { _id: { $dateTrunc: { date: "$start time", unit: "day" } }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);

// Q15: Heure de pointe
db.trips.aggregate([
  { $group: { _id: { $hour: "$start time" }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 5 }
]);

// Q16: Distribution des durées
db.trips.aggregate([
  {
    $bucket: {
      groupBy: "$tripduration",
      boundaries: [0, 300, 600, 1800, 3600, 1000000],
      default: "other"
    }
  }
]);

// Q17: Boucles
db.trips.aggregate([
  { $match: { $expr: { $eq: ["$start station id", "$end station id"] } } },
  { $count: "boucles" }
]);

// Q18: Le champ piégé - type de birth year
db.trips.aggregate([
  { $group: { _id: { $type: "$birth year" }, n: { $sum: 1 } } }
]);

// Q18: Croisement avec usertype
db.trips.aggregate([
  { $group: { _id: { type: { $type: "$birth year" }, usertype: "$usertype" }, n: { $sum: 1 } } }
]);

// Q19: Âge moyen des usagers (années numériques seulement)
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
]);

// Q20: Trajets > 3 heures et > 24 heures
db.trips.countDocuments({ tripduration: { $gt: 10800 } });
db.trips.countDocuments({ tripduration: { $gt: 86400 } });

// Q20: 3 plus longs trajets
db.trips.find(
  { tripduration: { $gt: 86400 } },
  { tripduration: 1, usertype: 1 }
).sort({ tripduration: -1 }).limit(3);

// Q21: Durée moyenne par usertype (excluant > 3h)
db.trips.aggregate([
  { $match: { tripduration: { $lte: 10800 } } },
  { $group: { _id: "$usertype", duree_moyenne: { $avg: "$tripduration" }, n: { $sum: 1 } } }
]);

// Q22: Pipeline A - $match en premier
db.trips.explain("executionStats").aggregate([
  { $match: { usertype: "Subscriber" } },
  { $group: { _id: "$start station id", n: { $sum: 1 } } }
]);

// Q22: Pipeline B - $match après $group
db.trips.explain("executionStats").aggregate([
  { $group: { _id: { s: "$start station id", u: "$usertype" }, n: { $sum: 1 } } },
  { $match: { "_id.u": "Subscriber" } }
]);

// Q23: Limite de l'optimiseur
db.trips.explain("executionStats").aggregate([
  { $group: { _id: "$start station id", n: { $sum: 1 } } },
  { $match: { n: { $gt: 50 } } }
]);

// Q24: $merge - création collection stations
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
]);

// Q24: Top 3 stations par départs
db.stations.find().sort({ departs: -1 }).limit(3);

// Q26: $lookup - top 5 stations d'arrivée avec nom
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
]);

// R2: Test de la règle - $match après $project
db.trips.explain("executionStats").aggregate([
  { $project: { usertype: 1, "start station id": 1 } },
  { $match: { usertype: "Subscriber" } }
]);

// R3: Médiane sur jeu non filtré
db.trips.aggregate([
  { $group: { _id: null, mediane: { $median: { input: "$tripduration", method: "approximate" } } } }
]);
