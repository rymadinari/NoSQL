// TP Jour 2 — Partie 3 : Agrégation analytique


// Q11 — Top 5 genres par nombre de films

print("\n=== Q11 — Top 5 genres par nombre de films ===");

printjson(
    db.movies.aggregate([
        { $unwind: "$genres" },

        {
            $group: {
                _id: "$genres",
                count: { $sum: 1 }
            }
        },

        { $sort: { count: -1 } },

        { $limit: 5 }
    ]).toArray()
);


// Q12 — Top 3 décennies par nombre de films

print("\n=== Q12 — Top 3 décennies par nombre de films ===");

printjson(
    db.movies.aggregate([
        // On garde uniquement les années stockées comme entier
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
    ]).toArray()
);


// Q13 — Note IMDB moyenne des films Drama

print("\n=== Q13 — Note IMDB moyenne des films Drama ===");

printjson(
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

                avgRating: {
                    $avg: "$imdb.rating"
                },

                count: {
                    $sum: 1
                }
            }
        },

        {
            $project: {
                _id: 0,
                avgRating: {
                    $round: ["$avgRating", 4]
                },
                count: 1
            }
        }
    ]).toArray()
);


// Q14 — Top 3 réalisateurs par nombre de films

print("\n=== Q14 — Top 3 réalisateurs par nombre de films ===");

printjson(
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
    ]).toArray()
);


// Q15 — Top 5 films les plus commentés

print("\n=== Q15 — Top 5 films les plus commentés ===");

printjson(
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
    ]).toArray()
);