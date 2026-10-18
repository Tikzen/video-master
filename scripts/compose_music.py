#!/usr/bin/env python3
"""Generate a local procedural WAV with Node.js; no API, SDK or agent-native tools."""
import argparse
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--style", choices=["electronic", "soft", "pulse"], default="electronic")
    parser.add_argument("--bpm", type=float)
    parser.add_argument("--seed", type=int, default=19)
    parser.add_argument("--output", help="Project-relative audio/music/<name>.wav; never overwritten")
    parser.add_argument("--node", help="Node executable, otherwise found on PATH")
    args = parser.parse_args()
    node = args.node or shutil.which("node")
    if not node:
        parser.error("Node.js is required; provide --node or install it on PATH.")
    project = Path(args.project).expanduser().resolve()
    skill = Path(__file__).resolve().parents[1]
    command = [node, str(skill / "assets/starter-project/src/compose-music.mjs"),
               "--root", str(project), "--duration", str(args.duration),
               "--style", args.style, "--seed", str(args.seed)]
    if args.bpm is not None:
        command += ["--bpm", str(args.bpm)]
    if args.output:
        command += ["--output", args.output]
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
