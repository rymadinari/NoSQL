from pymongo import MongoClient
import time
from datetime import datetime

nodes = [
    "mongodb://mongo1:27017/?directConnection=true",
    "mongodb://mongo2:27017/?directConnection=true",
    "mongodb://mongo3:27017/?directConnection=true"
]

clients = [MongoClient(uri, serverSelectionTimeoutMS=500) for uri in nodes]

last_primary = None
start = time.monotonic()

while True:
    primary = None

    for client in clients:
        try:
            hello = client.admin.command("hello")
            if hello.get("isWritablePrimary"):
                primary = hello.get("me")
                break
        except Exception:
            pass

    if primary != last_primary:
        elapsed = time.monotonic() - start
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        if primary:
            print(f"[{timestamp}] +{elapsed:.3f}s PRIMARY {primary}", flush=True)
        else:
            print(f"[{timestamp}] +{elapsed:.3f}s NO PRIMARY", flush=True)

        last_primary = primary

    time.sleep(0.3)