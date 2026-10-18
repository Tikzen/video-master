#!/usr/bin/env python3
"""Portable, read-only motion audit and optional rendered contact sheet."""
import argparse
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="An initialized Video Master project")
    parser.add_argument("--storyboard", help="Optional project-relative or absolute storyboard JSON")
    parser.add_argument("--sheet", action="store_true", help="Render a PNG plus paired JSON manifest")
    parser.add_argument("--save-frames", action="store_true", help="Also save the sampled frames at full project resolution")
    parser.add_argument("--output", help="New PNG path; defaults to a versioned file in renders/preview")
    parser.add_argument("--columns", type=int)
    parser.add_argument("--start", type=float, help="Absolute start seconds, inclusive")
    parser.add_argument("--end", type=float, help="Absolute end seconds, exclusive")
    parser.add_argument("--max-samples", type=int, help="1..128; default 96, never silently drops cuts")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--node", help="Node executable, otherwise found on PATH")
    args = parser.parse_args()
    if not args.sheet and (args.save_frames or any(value is not None for
                              value in (args.output, args.columns, args.start, args.end, args.max_samples))):
        parser.error("--output/--columns/--start/--end/--max-samples/--save-frames require --sheet.")
    node = args.node or shutil.which("node")
    if not node:
        parser.error("Node.js is required; provide --node or install it on PATH.")
    project = Path(args.project).expanduser().resolve()
    if not project.is_dir():
        parser.error(f"Project directory does not exist: {project}")
    skill = Path(__file__).resolve().parents[1]
    helper = "contact-sheet.mjs" if args.sheet else "motion-review.mjs"
    command = [node, str(skill / "assets/starter-project/src" / helper),
               "--project", str(project)]
    for flag, value in (("--storyboard", args.storyboard), ("--output", args.output),
                        ("--columns", args.columns), ("--start", args.start),
                        ("--end", args.end), ("--max-samples", args.max_samples)):
        if value is not None:
            command += [flag, str(value)]
    if args.save_frames:
        command.append("--save-frames")
    if args.json:
        command.append("--json")
    try:
        result = subprocess.run(command, check=False)
    except OSError as error:
        parser.error(f"Cannot start Node.js ({node}): {error}. Check --node or PATH.")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
