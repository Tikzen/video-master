#!/usr/bin/env python3
"""Initialize, compose, storyboard, and render an editable code-based MV."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from runtime_tools import npm_command


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--plan", help="Agent-authored executable MV plan; relative media resolve beside this JSON")
    parser.add_argument("--duration", type=float)
    parser.add_argument("--bpm", type=float)
    parser.add_argument("--music-style", choices=("electronic","soft","pulse"))
    parser.add_argument("--no-music", action="store_true")
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--fps", type=int)
    parser.add_argument("--theme", choices=("space", "minimal", "kinetic"))
    parser.add_argument("--title")
    parser.add_argument("--audio", help="Local authorized soundtrack; default is an original instrumental")
    parser.add_argument("--manifest", help="JSON manifest of licensed image/video inputs")
    parser.add_argument("--draft-only", action="store_true", help="Explicitly skip encoding")
    args = parser.parse_args()
    root = Path(args.output).expanduser().resolve()
    skill = Path(__file__).resolve().parents[1]
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required. Install it before creating an MV.")
    try:
        npm = npm_command(node)
    except RuntimeError as error:
        raise SystemExit(str(error)) from None

    def run(command: list[str]) -> None:
        subprocess.run(command, cwd=root, check=True)

    subprocess.run([sys.executable, str(skill / "scripts/init_video_project.py"), str(root)], check=True)
    command = [node, "src/create-mv.mjs", "--prompt", args.prompt]
    for key in ("theme", "title", "duration", "bpm", "music_style", "width", "height", "fps"):
        if getattr(args, key) is not None:
            command += [f"--{key.replace('_', '-')}", str(getattr(args, key))]
    if args.no_music:
        command += ["--no-music"]
    if args.plan:
        source = Path(args.plan).expanduser().resolve(strict=True)
        plan = json.loads(source.read_text(encoding="utf-8-sig"))

        imported = {}

        def import_file(name):
            if name in imported:
                return imported[name]
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts:
                raise SystemExit("Plan media sources must be relative paths inside the plan directory")
            media = (source.parent / relative).resolve(strict=True)
            if not media.is_relative_to(source.parent):
                raise SystemExit("Plan media resolves outside the plan directory")
            digest = hashlib.sha256(media.read_bytes()).hexdigest()[:20]
            target = root / "assets" / "plan-inputs" / f"{digest}{media.suffix.lower()}"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(media, target)
            imported[name] = target.relative_to(root).as_posix()
            return imported[name]

        def copy_visuals(rows):
            for row in rows:
                if row.get("src"):
                    row["src"] = import_file(row["src"])
                if row.get("asset_refs"):
                    row["asset_refs"] = [import_file(name) for name in row["asset_refs"]]
                if row.get("layers"):
                    copy_visuals(row["layers"])

        copy_visuals(plan.get("cues", []))
        copy_visuals(plan.get("storyboard", []))
        target = root / "mv-plan.json"
        target.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        command += ["--plan", "mv-plan.json"]
    if args.audio:
        source = Path(args.audio).expanduser().resolve(strict=True)
        target = root / "audio" / ("supplied" + source.suffix.lower())
        shutil.copy2(source, target)
        command += ["--audio", target.relative_to(root).as_posix()]
    if args.manifest:
        source = Path(args.manifest).expanduser().resolve(strict=True)
        manifest = json.loads(source.read_text(encoding="utf-8-sig"))
        assets = manifest.get("assets", []) if isinstance(manifest, dict) else manifest
        for index, asset in enumerate(assets):
            if asset.get("local"):
                media = (source.parent / asset["local"]).resolve(strict=True)
                target = root / "assets" / "inputs" / f"{index:03d}{media.suffix.lower()}"
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(media, target)
                asset["local"] = target.relative_to(root).as_posix()
        target = root / "assets" / "input-manifest.json"
        target.write_text(json.dumps({"assets": assets}, ensure_ascii=False, indent=2), encoding="utf-8")
        command += ["--manifest", target.relative_to(root).as_posix()]
    run([*npm, "install", "--no-audit", "--no-fund"])
    run([node, "node_modules/playwright/cli.js", "install", "chromium"])
    run(command)
    run([node, "src/validate.mjs"])
    if not args.draft_only:
        destination = "delivery/directed-v1.mp4" if args.plan else "renders/preview/scaffold.mp4"
        run([node, "src/render.mjs", "--output", destination])
        print(f"\n{'Directed candidate' if args.plan else 'Scaffold preview (not a finished MV)'}: {root / destination}")
    if not args.plan:
        print("Author an executable --plan or customize scene code before delivering a finished MV.")
    print(f"Editable project: {root}\nEditor: run npm run editor in this directory.")


if __name__ == "__main__":
    main()
