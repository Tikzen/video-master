#!/usr/bin/env python3
"""Studio look / host casting gallery rounds for the WebUI review panel.

  python studio_rounds.py prepare --project P          # copy source-choice cards into the project
  python studio_rounds.py check   --project P --file host-source.json
  python studio_rounds.py publish --project P --file studio-look.json --url http://127.0.0.1:5180

Templates: assets/studio-rounds/*.example.json. Then open the round with
  python start_workbench.py --project P --panel review
and read `response.candidate` / `response.uploads` from GET /api/checkpoints.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
GALLERY_MIN = {"studio-look": 3, "host-design": 3}   # real alternatives, not one option plus fillers


def prepare(args):
    root = Path(args.project).resolve(strict=True)
    target = root / "assets/studio-rounds"
    target.mkdir(parents=True, exist_ok=True)
    for card in (SKILL / "assets/studio-rounds").glob("source-*.png"):
        shutil.copy2(card, target / card.name)
    print(json.dumps({"status": "prepared", "folder": "assets/studio-rounds"}))


def problems(root, proposal):
    out = []
    cands = proposal.get("candidates") or []
    need = GALLERY_MIN.get(proposal.get("id", "").split("-v")[0])
    if need and len(cands) < need:
        out.append(f"{proposal['id']} needs at least {need} real candidates (got {len(cands)})")
    digests = {}
    for c in cands:
        media = c.get("media") or []
        media = media if isinstance(media, list) else [media]
        if need and not media:
            out.append(f"candidate {c.get('id')} has no rendered preview; show real frames, not a description")
        for src in media:
            path = root / src
            if not path.is_file():
                out.append(f"missing media {src}")
                continue
            h = hashlib.sha256(path.read_bytes()).hexdigest()
            if h in digests and digests[h] != c.get("id"):
                out.append(f"{src} is identical to a preview of {digests[h]}: candidates must differ")
            digests[h] = c.get("id")
            if need and path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                from PIL import Image
                with Image.open(path) as im:
                    if proposal["id"].startswith("studio-look") and im.width < 960:
                        out.append(f"{src} is {im.width}px wide; render studio previews at ≥960px from the real renderer")
                    if proposal["id"].startswith("host-design") and im.mode != "RGBA":
                        out.append(f"{src} has no alpha channel; host art must be transparent")
    if proposal.get("id", "").startswith("host-source"):
        if not any(c.get("warning") for c in cands if "template" in c.get("id", "")):
            out.append("host-source must label the template option as not recommended (warning)")
        if not proposal.get("notice"):
            out.append("host-source must carry the 'template not recommended' notice")
    return out


def check(args):
    root = Path(args.project).resolve(strict=True)
    proposal = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
    found = problems(root, proposal)
    print(json.dumps({"ok": not found, "problems": found}, ensure_ascii=False, indent=1))
    return proposal, found


def publish(args):
    proposal, found = check(args)
    if found:
        raise SystemExit(1)
    request = urllib.request.Request(args.url.rstrip("/") + "/api/checkpoints", method="POST",
                                     data=json.dumps(proposal, ensure_ascii=False).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=20) as response:
        print(response.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--project", required=True)
    for name in ("check", "publish"):
        s = sub.add_parser(name)
        s.add_argument("--project", required=True)
        s.add_argument("--file", required=True)
        if name == "publish":
            s.add_argument("--url", required=True)
    args = parser.parse_args()
    result = {"prepare": prepare, "check": check, "publish": publish}[args.command](args)
    if args.command == "check" and result[1]:
        sys.exit(1)


if __name__ == "__main__":
    main()
