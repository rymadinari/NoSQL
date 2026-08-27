// TP Jour 4 - Requêtes géospatiales
// Exécution: mongosh -u admin -p ipssi2025 --authenticationDatabase admin citibike < geo.js

// Point de référence: Times Square
const timesSquare = {
  type: "Point",
  coordinates: [-73.9855, 40.7580]
};

// Q27: Sans index - doit échouer
print("=== Q27: Sans index ===");
try {
  db.trips.find({
    "start station location": {
      $near: {
        $geometry: timesSquare,
        $maxDistance: 500
      }
    }
  });
} catch (e) {
  print("Erreur: " + e);
}

// Q28: Création index 2dsphere
print("\n=== Q28: Création index 2dsphere ===");
db.trips.createIndex({ "start station location": "2dsphere" });

// Requête $near avec index
print("\nRequête $near à 500m de Times Square:");
db.trips.find({
  "start station location": {
    $near: {
      $geometry: timesSquare,
      $maxDistance: 500
    }
  }
}, { "start station name": 1 }).limit(5);

// Q29: Comptage avec $geoWithin (remplacement de $near dans countDocuments)
print("\n=== Q29: Comptage avec $geoWithin ===");

// 500m = 0.5 / 6378.1 radians
const radius500m = 500 / 6378.1;
const count500m = db.trips.countDocuments({
  "start station location": {
    $geoWithin: {
      $centerSphere: [timesSquare.coordinates, radius500m]
    }
  }
});
print("Trajets à moins de 500m: " + count500m);

// 1000m = 1.0 / 6378.1 radians
const radius1000m = 1000 / 6378.1;
const count1000m = db.trips.countDocuments({
  "start station location": {
    $geoWithin: {
      $centerSphere: [timesSquare.coordinates, radius1000m]
    }
  }
});
print("Trajets à moins de 1000m: " + count1000m);

// Q30: $geoNear sur collection stations
print("\n=== Q30: $geoNear sur stations ===");

// Création index sur stations
db.stations.createIndex({ position: "2dsphere" });

// Pipeline $geoNear
db.stations.aggregate([
  {
    $geoNear: {
      near: timesSquare,
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
]);
