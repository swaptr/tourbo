import argparse
import os


def main() -> None:
    ap = argparse.ArgumentParser(prog="tourbo-mock", description="Local fan-data mock: saved answers, near matches, synthetic fallback.")
    ap.add_argument("--host", default=os.environ.get("MOCK_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("MOCK_PORT", "8790")))
    args = ap.parse_args()
    from .server import serve

    serve(args.host, args.port)
