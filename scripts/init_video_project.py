#!/usr/bin/env python3
"""Copy the bundled deterministic timeline-editor starter into a new project."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_path")
    args = parser.parse_args()
    skill_dir = Path(__file__).resolve().parents[1]
    starter = skill_dir / "assets" / "starter-project"
    target = Path(args.project_path).expanduser().resolve()
    if target.exists() and any(target.iterdir()):
        raise SystemExit(f"Refusing to initialize non-empty project: {target}")
    target.mkdir(parents=True, exist_ok=True)
    def ignored(folder, names):
        generated={"node_modules","__pycache__", ".editor", ".git", "renders", "delivery", "validation",
                   "voice-samples", ".asr-env", ".venv"}
        omitted={name for name in names if name in generated or name.endswith(".pyc")
                 or (name.startswith(".env") and name!=".env.example")}
        if Path(folder)==starter/"assets/catalog":
            omitted.update({"mv.png","studio.png","product.png","report.png"}.intersection(names))
        if Path(folder)==starter/"audio":
            omitted.update({"demo-score.wav"}.intersection(names))
        return omitted
    shutil.copytree(starter, target, dirs_exist_ok=True, ignore=ignored)
    for name in ("assets", "audio", "delivery", "renders", "validation"):
        (target / name).mkdir(exist_ok=True)
    print(target)


if __name__ == "__main__":
    main()
