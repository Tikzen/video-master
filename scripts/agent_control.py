#!/usr/bin/env python3
"""Agent-side loopback controller; never manufactures user confirmations."""
import argparse
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    actions = sub.add_parser("actions")
    actions.add_argument("--file", required=True, help="JSON array of actions")
    actions.add_argument("--revision", help="Optional exact workspace revision")
    for name in ("undo", "redo"):
        sub.add_parser(name)
    propose = sub.add_parser("propose")
    propose.add_argument("--file", required=True)
    wait = sub.add_parser("wait")
    wait.add_argument("--stage", choices=["stage1", "stage2"], required=True)
    wait.add_argument("--timeout", type=float, default=120)
    call = sub.add_parser("request")
    call.add_argument("--route", required=True)
    call.add_argument("--method", choices=["GET", "POST", "PATCH"], default="GET")
    call.add_argument("--file")
    audio = sub.add_parser("import-audio")
    audio.add_argument("--file", required=True)
    args = parser.parse_args()
    url = urlparse(args.url)
    if url.scheme != "http" or url.hostname not in ("localhost", "127.0.0.1") or url.username or url.password:
        parser.error("Only local Video Master HTTP servers are allowed")
    base = args.url.rstrip("/")

    def request(route, data=None, method="GET", raw=False):
        if not route.startswith("/api/") or ".." in route:
            raise ValueError("Route must be /api/...")
        payload = data if raw else None if data is None else json.dumps(data).encode("utf-8")
        req = Request(base + route, data=payload, method=method,
                      headers={"Content-Type": "application/octet-stream" if raw else "application/json"})
        try:
            with urlopen(req, timeout=240) as response:
                return json.load(response)
        except HTTPError as error:
            detail = json.load(error)
            raise RuntimeError(f"HTTP {error.code}: {detail.get('error', 'request failed')}") from None

    def load(file):
        return json.loads(Path(file).read_text(encoding="utf-8-sig"))

    if args.command == "status":
        result = {"workspace": request("/api/workspace"), "workflow": request("/api/workflow"),
                  "notes": request("/api/annotations"), "voice": request("/api/voice-tool"),
                  "music": request("/api/music-tool")}
        try:
            result["quality"] = request("/api/quality-review")
        except RuntimeError as error:
            if "HTTP 404:" not in str(error):
                raise
            result["quality"] = {"available": False, "reason": "Older server; use review_quality.py"}
    elif args.command in ("actions", "undo", "redo"):
        current = request("/api/workspace")
        payload = {"expected_revision": getattr(args, "revision", None) or current["revision"]}
        if args.command == "actions":
            payload["actions"] = load(args.file)
        else:
            payload["command"] = args.command
        result = request("/api/actions", payload, "POST")
    elif args.command == "propose":
        proposal = load(args.file)
        flow = request("/api/workflow")
        if proposal["stage"] == "stage2":
            proposal["stage1_hash"] = flow["confirmations"]["stage1_hash"]
        result = request("/api/proposals", {
            "proposal": proposal, "expected_hash": flow[proposal["stage"]]["proposal_hash"],
        }, "POST")
    elif args.command == "wait":
        start = time.monotonic()
        while True:
            flow = request("/api/workflow")
            if flow["confirmations"].get(args.stage):
                result = flow["confirmations"][args.stage]
                break
            if time.monotonic() - start >= args.timeout:
                print(json.dumps({"status": "waiting", "stage": args.stage, "url": base + "/create"}))
                return
            time.sleep(2)
    elif args.command == "import-audio":
        from urllib.parse import quote
        file = Path(args.file)
        result = request("/api/import-audio?name=" + quote(file.name), file.read_bytes(), "POST", raw=True)
    else:
        if args.route in ("/api/confirm", "/api/checkpoint-response", "/api/treatment-request", "/api/quality-choice"):
            parser.error("Confirmations are user-owned; use the page or explicit chat evidence, never fabricate them")
        result = request(args.route, load(args.file) if args.file else None, args.method)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
