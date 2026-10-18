#!/usr/bin/env python3
"""Run the concrete project validator, refusing to guess an alternate pipeline."""
import argparse
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("project_path")
args = parser.parse_args()
root = Path(args.project_path).expanduser().resolve()
script = root / "src" / "validate.mjs"
if not script.is_file():
    raise SystemExit(f"No bundled validator at {script}; use this project's documented validator.")
raise SystemExit(subprocess.call(["node", str(script)], cwd=root))
