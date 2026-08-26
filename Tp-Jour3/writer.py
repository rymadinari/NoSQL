from pymongo import MongoClient, WriteConcern
from datetime import datetime
import sys
import time

uri = sys.argv[1]

client = MongoClient(
    uri,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=2000
)

print("Topology:", client.topology_description.topology_type_name)
print("Primary:", client.primary)

db = client.census

collection = db.get_collection(
    "heartbeat",
    write_concern=WriteConcern(w="majority")
)

success = 0

for i in range(30):
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]

    try:
        hello = client.admin.command("hello")
        primary = hello.get("primary", "unknown")

        result = collection.insert_one({
            "n": i,
            "timestamp": datetime.now()
        })

        success += 1

        print(
            f"[{timestamp}] PRIMARY={primary} OK n={i} id={result.inserted_id}",
            flush=True
        )

    except Exception as e:
        print(
            f"[{timestamp}] ERROR {type(e).__name__}: {e}",
            flush=True
        )

    time.sleep(1)

print("\n--- FIN ---")
print("Écritures réussies pendant ce lancement :", success)
print("Documents réellement présents :", collection.count_documents({}))