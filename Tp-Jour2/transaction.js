// TP Jour 2 — Partie 5
// Q19 — Transaction ACID
//
// La transaction réalise :
// 1. suppression d'un commentaire
// 2. décrémentation du compteur du film
//
// Lancement :
//
// docker exec -i mongo-ipssi mongosh -u admin -p ipssi2025 --authenticationDatabase admin mflix < transaction.js


print("\n=== Q19 — Transaction ACID ===");


print(
  "Nombre de films dans la base :",
  db.movies.countDocuments({})
);

print(
  "Nombre de commentaires dans la base :",
  db.comments.countDocuments({})
);


// 1 — Sélection d'un commentaire dont le film existe

var target = db.comments.aggregate([

  {
    $lookup: {
      from: "movies",
      localField: "movie_id",
      foreignField: "_id",
      as: "m"
    }
  },

  {
    $unwind: "$m"
  },

  {
    $limit: 1
  }

]).toArray()[0];


print(
  "\nCommentaire choisi :",
  target._id
);

print(
  "Film associé :",
  target.movie_id
);

print(
  "Titre :",
  target.m.title
);


var beforeMovie = db.movies.findOne(
  {
    _id: target.movie_id
  },
  {
    num_mflix_comments: 1
  }
);


print(
  "num_mflix_comments AVANT :",
  beforeMovie.num_mflix_comments
);


// 2 — Transaction COMMIT

var session =
  db.getMongo().startSession();

var sessionDb =
  session.getDatabase("mflix");


session.startTransaction({
  readConcern: {
    level: "snapshot"
  },

  writeConcern: {
    w: "majority"
  }
});


try {

  sessionDb.comments.deleteOne({
    _id: target._id
  });


  sessionDb.movies.updateOne(
    {
      _id: target.movie_id
    },
    {
      $inc: {
        num_mflix_comments: -1
      }
    }
  );


  session.commitTransaction();


  print(
    "\nTransaction COMMIT réussie."
  );


} catch (e) {

  session.abortTransaction();

  print(
    "\nTransaction ABORT :",
    e
  );
}


var afterMovie = db.movies.findOne(
  {
    _id: target.movie_id
  },
  {
    num_mflix_comments: 1
  }
);


print(
  "num_mflix_comments APRÈS commit :",
  afterMovie.num_mflix_comments
);


print(
  "Commentaire encore présent ?",
  db.comments.findOne({
    _id: target._id
  }) !== null
);


// 3 — Test d'ABORT volontaire

print(
  "\n=== Test d'abort volontaire ==="
);


var target2 = db.comments.aggregate([

  {
    $match: {
      _id: {
        $ne: target._id
      }
    }
  },

  {
    $lookup: {
      from: "movies",
      localField: "movie_id",
      foreignField: "_id",
      as: "m"
    }
  },

  {
    $unwind: "$m"
  },

  {
    $limit: 1
  }

]).toArray()[0];


var beforeMovie2 = db.movies.findOne(
  {
    _id: target2.movie_id
  },
  {
    num_mflix_comments: 1
  }
);


print(
  "Compteur AVANT abort :",
  beforeMovie2.num_mflix_comments
);


var session2 =
  db.getMongo().startSession();

var sessionDb2 =
  session2.getDatabase("mflix");


session2.startTransaction();


try {

  sessionDb2.comments.deleteOne({
    _id: target2._id
  });


  sessionDb2.movies.updateOne(
    {
      _id: target2.movie_id
    },
    {
      $inc: {
        num_mflix_comments: -1
      }
    }
  );


  // Erreur volontaire avant commit

  throw new Error(
    "Erreur simulée au milieu de la transaction"
  );


  session2.commitTransaction();


} catch (e) {

  print(
    "Erreur interceptée :",
    e.message
  );

  session2.abortTransaction();

  print(
    "abortTransaction() appelé."
  );
}


var afterMovie2 = db.movies.findOne(
  {
    _id: target2.movie_id
  },
  {
    num_mflix_comments: 1
  }
);


print(
  "Compteur APRÈS abort :",
  afterMovie2.num_mflix_comments
);


print(
  "Commentaire encore présent après abort ?",
  db.comments.findOne({
    _id: target2._id
  }) !== null
);


session.endSession();

session2.endSession();


print(
  "\n=== Fin Q19 ==="
);