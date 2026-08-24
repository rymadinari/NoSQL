// Rapport automatisé de la collection nyc.restaurants

const collection = db.restaurants;

print("       RAPPORT MONGODB - JOUR 1");

// 1. Nombre total de restaurants

const totalRestaurants = collection.countDocuments({});

print("\n1. TOTAL DES RESTAURANTS");
print("Total : " + totalRestaurants);

// 2. Top 5 des cuisines

print("\n2. TOP 5 DES CUISINES");

const cuisines = collection.distinct("cuisine");

const cuisineCounts = [];

for (const cuisine of cuisines) {
    const count = collection.countDocuments({
        cuisine: cuisine
    });

    cuisineCounts.push({
        cuisine: cuisine,
        count: count
    });
}

// Tri décroissant selon le nombre de restaurants
cuisineCounts.sort((a, b) => b.count - a.count);

// Affichage du Top 5
for (let i = 0; i < Math.min(5, cuisineCounts.length); i++) {
    print(
        (i + 1) +
        ". " +
        cuisineCounts[i].cuisine +
        " : " +
        cuisineCounts[i].count
    );
}

// 3. Nombre de restaurants par arrondissement

print("\n3. RESTAURANTS PAR ARRONDISSEMENT");

const boroughs = collection.distinct("borough");

// Tri alphabétique pour faciliter la lecture

boroughs.sort();

for (const borough of boroughs) {
    const count = collection.countDocuments({
        borough: borough
    });

    print(borough + " : " + count);
}

print("  FIN DU RAPPORT");
