#!/usr/bin/env python3
"""Portable adapter for the experimental, default-off quality review contract."""
import argparse
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--node", help="Node executable, otherwise found on PATH")
    parser.add_argument("command", choices=["status", "settings", "intent", "prepare",
                                           "evidence", "submit", "begin-repair", "compare", "restore"])
    parser.add_argument("--file", help="Structured JSON input (not an executable judge command)")
    parser.add_argument("--run", help="Exact run ID for begin-repair/restore")
    parser.add_argument("--start", type=float)
    parser.add_argument("--end", type=float)
    parser.add_argument("--max-samples", type=int)
    args = parser.parse_args()
    if args.command in ("settings", "intent", "evidence", "submit", "compare") and not args.file:
        parser.error(f"{args.command} requires --file")
    if args.command in ("begin-repair", "restore") and not args.run:
        parser.error(f"{args.command} requires --run")
    if args.command != "prepare" and any(value is not None for value in (args.start, args.end, args.max_samples)):
        parser.error("Sampling options are only for prepare")
    node = args.node or shutil.which("node")
    if not node:
        parser.error("Node.js is required; provide --node or install it on PATH.")
    project = Path(args.project).expanduser().resolve()
    if not project.is_dir():
        parser.error(f"Missing project: {project}")
    helper = Path(__file__).resolve().parents[1] / "assets/starter-project/src/quality-review.mjs"
    command = [node, str(helper), "--project", str(project), args.command]
    for flag, value in (("--file", args.file), ("--run", args.run), ("--start", args.start),
                        ("--end", args.end), ("--max-samples", args.max_samples)):
        if value is not None:
            command.extend([flag, str(value)])
    try:
        result = subprocess.run(command, check=False)
    except OSError as error:
        parser.error(f"Cannot start Node.js: {error}")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
