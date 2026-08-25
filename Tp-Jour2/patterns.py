"""
TP Jour 2 — Partie 4 : Drivers PyMongo

Q16 : réconciliation du Computed Pattern
Q17 : correction des compteurs avec bulk_write
Q18 : Subset Pattern

Lancement :

python patterns.py

Pré-requis :

pip install "pymongo>=4.6"
"""

from pymongo import MongoClient, UpdateOne


client = MongoClient(
    "mongodb://admin:ipssi2025@localhost:27017/?authSource=admin"
)

db = client["mflix"]


def q16_reconciliation():
    """
    Compare le compteur stocké dans movies avec
    le nombre réel de commentaires dans comments.
    """

    print("\n=== Q16 — Réconciliation des compteurs ===")

    # Calcul des vrais nombres de commentaires
    # côté serveur MongoDB.
    pipeline = [
        {
            "$group": {
                "_id": "$movie_id",
                "real_count": {"$sum": 1}
            }
        }
    ]

    real_counts = {
        doc["_id"]: doc["real_count"]
        for doc in db.comments.aggregate(pipeline)
    }

    incoherent = 0
    total_with_field = 0

    for movie in db.movies.find(
        {"num_mflix_comments": {"$exists": True}},
        {"_id": 1, "num_mflix_comments": 1}
    ):

        total_with_field += 1

        real = real_counts.get(movie["_id"], 0)
        stored = movie["num_mflix_comments"]

        if real != stored:
            incoherent += 1

    print(
        "Films avec le champ num_mflix_comments :",
        total_with_field
    )

    print(
        "Films avec compteur incohérent :",
        incoherent
    )

    if total_with_field:
        percentage = (
            100 * incoherent / total_with_field
        )

        print(
            f"Pourcentage incohérent : {percentage:.2f}%"
        )

    return real_counts


def q17_fix_counters(real_counts):
    """
    Corrige les compteurs pour tous les films.
    """

    print("\n=== Q17 — Correction des compteurs ===")

    operations = []

    for movie in db.movies.find({}, {"_id": 1}):

        real = real_counts.get(
            movie["_id"],
            0
        )

        operations.append(
            UpdateOne(
                {"_id": movie["_id"]},
                {
                    "$set": {
                        "num_mflix_comments": real
                    }
                }
            )
        )

    if operations:

        result = db.movies.bulk_write(
            operations
        )

        print(
            "modifiedCount :",
            result.modified_count
        )

    else:

        print(
            "Aucune opération à effectuer."
        )

    print(
        "\n=== Vérification après correction ==="
    )

    q16_reconciliation()


def q18_subset_pattern():
    """
    Ajoute les 3 commentaires les plus récents
    aux 10 films les plus commentés.
    """

    print(
        "\n=== Q18 — Subset Pattern ==="
    )

    top10 = list(
        db.comments.aggregate([
            {
                "$group": {
                    "_id": "$movie_id",
                    "nb": {"$sum": 1}
                }
            },
            {
                "$sort": {
                    "nb": -1
                }
            },
            {
                "$limit": 10
            }
        ])
    )

    for entry in top10:

        movie_id = entry["_id"]

        recent = list(
            db.comments.find(
                {"movie_id": movie_id},
                {
                    "name": 1,
                    "text": 1,
                    "date": 1,
                    "_id": 0
                }
            )
            .sort(
                "date",
                -1
            )
            .limit(3)
        )

        db.movies.update_one(
            {"_id": movie_id},
            {
                "$set": {
                    "recent_comments": recent
                }
            }
        )

        print(
            f"movie_id={movie_id} "
            f"nb_comments={entry['nb']} "
            f"recent_comments={len(recent)}"
        )

    # Vérification sur le premier film du top 10

    if top10:

        check = db.movies.find_one(
            {
                "_id": top10[0]["_id"]
            },
            {
                "title": 1,
                "recent_comments": 1
            }
        )

        print(
            "\nVérification sur :",
            check.get("title")
        )

        print(
            "Nombre de sous-documents dans recent_comments :",
            len(
                check.get(
                    "recent_comments",
                    []
                )
            )
        )


if __name__ == "__main__":

    real_counts = q16_reconciliation()

    q17_fix_counters(
        real_counts
    )

    q18_subset_pattern()