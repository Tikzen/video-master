#!/usr/bin/env python3
"""Create a code-film project (motionkit) — for MV / showreel / brand film / studio / presentation pieces
that need more than the JSON compositor.

    python "${SKILL_DIR}/scripts/init_code_film.py" "<absolute-project>/code-film" --title "Launch film" \
        --duration 15 --bars 8 [--genre mv|studio|present] [--from-example dian-xian-mian]

* Copies assets/code-film-template (or an example) into the target; never overwrites existing files.
* Vendors the engine into <target>/.motionkit so the project renders without the skill installed.
* Checks Python dependencies and prints the exact pip command if any are missing.
The target may live inside an initialized Video Master project (recommended: <project>/code-film),
so the WebUI/workbench, receipts and delivery folders stay where the workflow expects them.
"""
import argparse
import importlib
import json
import os
import shutil
import sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(SKILL, "assets", "code-film-template")
EXAMPLES = os.path.join(SKILL, "assets", "examples")
ENGINE = os.path.join(SKILL, "engine", "motionkit")
DEPS = {"cairo": "pycairo", "uharfbuzz": "uharfbuzz", "numpy": "numpy", "scipy": "scipy", "cv2": "opencv-python-headless",
        "PIL": "pillow", "fontTools": "fonttools", "brotli": "brotli"}
SKIP = {"__pycache__", "renders", "cache", "delivery", "audio", ".motionkit"}


def check_deps():
    missing = []
    for mod, pkg in DEPS.items():
        try:
            importlib.import_module(mod)
        except Exception:
            missing.append(pkg)
    ff = shutil.which("ffmpeg") or os.environ.get("FFMPEG_PATH")
    if not ff:
        try:
            import imageio_ffmpeg  # noqa: F401
            ff = "imageio-ffmpeg"
        except Exception:
            missing.append("imageio-ffmpeg")
    return missing, ff


def copy_tree(src, dst, subst):
    made = []
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP]
        rel = os.path.relpath(root, src)
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            if f.endswith((".pyc", ".png")) and rel.startswith("renders"):
                continue
            s, d = os.path.join(root, f), os.path.join(dst, rel, f)
            if os.path.exists(d):
                continue
            if f.endswith((".py", ".md")):
                with open(s, encoding="utf-8") as fh:
                    txt = fh.read()
                for k, v in subst.items():
                    txt = txt.replace(k, str(v))
                with open(d, "w", encoding="utf-8") as fh:
                    fh.write(txt)
            else:
                shutil.copy2(s, d)
            made.append(os.path.relpath(d, dst))
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--title", default="Untitled film")
    ap.add_argument("--name", default=None)
    ap.add_argument("--duration", type=float, default=12.0)
    ap.add_argument("--bars", type=int, default=6)
    ap.add_argument("--genre", choices=["mv", "studio", "present"], default="mv")
    ap.add_argument("--from-example", default=None, help="copy a bundled example instead of the blank template")
    ap.add_argument("--no-engine-copy", action="store_true", help="use MOTIONKIT_PATH instead of vendoring")
    a = ap.parse_args()
    target = os.path.abspath(a.target)
    os.makedirs(target, exist_ok=True)
    name = a.name or os.path.basename(target.rstrip("/\\")).lower().replace(" ", "-")
    bpm = 60.0 * a.bars * 4 / a.duration
    subst = {"__TITLE__": a.title, "__NAME__": name, "__BARS__": a.bars, "__DUR__": a.duration, "__BPM__": "%.3f" % bpm}
    src = os.path.join(EXAMPLES, "code-film-" + a.from_example) if a.from_example else TEMPLATE
    if not os.path.isdir(src):
        sys.exit("no such example: %s" % src)
    made = copy_tree(src, target, subst)
    if not a.from_example:
        lp = os.path.join(target, "look.py")
        with open(lp, encoding="utf-8") as fh:
            txt = fh.read()
        txt = txt.replace("DUR = 1920, 1080, 60, 12.0", "DUR = 1920, 1080, 60, %s" % a.duration)
        txt = txt.replace("mk.Grid.fit(DUR, bars=6)", "mk.Grid.fit(DUR, bars=%d)" % a.bars)
        with open(lp, "w", encoding="utf-8") as fh:
            fh.write(txt)
    if not a.no_engine_copy:
        dst = os.path.join(target, ".motionkit", "motionkit")
        if not os.path.exists(dst):
            shutil.copytree(ENGINE, dst, ignore=shutil.ignore_patterns("__pycache__"))
    missing, ff = check_deps()
    out = dict(target=target, genre=a.genre, created=len(made), bpm=round(bpm, 3),
               engine=os.path.join(target, ".motionkit"), ffmpeg=ff, missing_python=missing,
               next=["cd \"%s\"" % target, "python film.py info", "python film.py still 1.0"],
               read=["references/craft/README.md", "references/craft/genre-%s.md" % a.genre])
    if missing:
        out["install"] = "python -m pip install " + " ".join(missing)
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
