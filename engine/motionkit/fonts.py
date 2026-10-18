"""Font registry, discovery and installation.

Roles map to files. Defaults:
  display  → bundled Archivo variable (wght 100–900, wdth 62–125)       [OFL]
  mono     → bundled JetBrains Mono variable (wght 100–800)             [OFL]
  cjk      → system CJK bold (Noto Sans CJK SC / Microsoft YaHei / PingFang / Source Han)
  cjk_regular → system CJK regular

Register project fonts BEFORE drawing (e.g. in film.py):
    from motionkit import fonts
    fonts.register("display", "assets/fonts/BricolageGrotesque-VF.ttf")
    fonts.register("serif", "assets/fonts/Fraunces-VF.ttf")

Install any Google/Fontsource family (needs npm + network once; OFL/Apache licences are copied):
    python -m motionkit.fonts install "Bricolage Grotesque" --dest assets/fonts
    python -m motionkit.fonts check assets/fonts/X.ttf "每一帧 EVERY FRAME"
    python -m motionkit.fonts list
"""
import glob
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLED = os.path.join(HERE, "fonts")

_REG = {
    "display": (os.path.join(BUNDLED, "Archivo-VF.ttf"), 0),
    "mono": (os.path.join(BUNDLED, "JetBrainsMono-VF.ttf"), 0),
}

# (path glob, preferred face-name substring) in priority order
_CJK_BOLD = [
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "SC"),
    ("/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc", "SC"),
    ("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc", "SC"),
    ("C:/Windows/Fonts/msyhbd.ttc", "Microsoft YaHei"),
    ("C:/Windows/Fonts/Dengb.ttf", None),
    ("C:/Windows/Fonts/simhei.ttf", None),
    ("/System/Library/Fonts/PingFang.ttc", "PingFang SC"),
    ("/Library/Fonts/SourceHanSansSC-Bold.otf", None),
    ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", None),
]
_CJK_REG = [
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "SC"),
    ("/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "SC"),
    ("C:/Windows/Fonts/msyh.ttc", "Microsoft YaHei"),
    ("C:/Windows/Fonts/Deng.ttf", None),
    ("/System/Library/Fonts/PingFang.ttc", "PingFang SC"),
    ("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", None),
]
_CJK_SERIF = [
    ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", "SC"),
    ("C:/Windows/Fonts/simsun.ttc", None),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", "SC"),
]


def _ttc_index(path, want):
    if not path.lower().endswith((".ttc", ".otc")) or not want:
        return 0
    try:
        from fontTools.ttLib import TTCollection
        col = TTCollection(path, lazy=True)
        for i, f in enumerate(col.fonts):
            name = f["name"].getDebugName(4) or f["name"].getDebugName(1) or ""
            if want in name:
                return i
    except Exception:
        pass
    return 0


def _first(cands):
    for p, want in cands:
        for q in glob.glob(p):
            if os.path.exists(q):
                return q, _ttc_index(q, want)
    return None


def register(role, path, index=0):
    """Map a role to a font file (absolute or relative to CWD/project). Clears cached faces for that role."""
    p = os.path.abspath(path)
    if not os.path.exists(p):
        raise FileNotFoundError("font for role %r not found: %s" % (role, p))
    _REG[role] = (p, index)
    from . import text
    text._FACES.pop(role, None)


def resolve(role):
    if role in _REG:
        return _REG[role]
    if os.path.exists(role):
        return role, 0
    table = {"cjk": _CJK_BOLD, "cjk_regular": _CJK_REG, "cjk_serif": _CJK_SERIF}.get(role)
    if table:
        hit = _first(table)
        if hit:
            _REG[role] = hit
            return hit
        raise FileNotFoundError(
            "No CJK font found for role %r on %s. Install Noto Sans CJK / Source Han Sans, or register one: "
            "fonts.register(%r, 'path/to/font.ttf')" % (role, platform.system(), role))
    raise KeyError("Unknown font role %r. Register it with motionkit.fonts.register(role, path)." % role)


def roles():
    out = {}
    for r in list(_REG) + ["cjk", "cjk_regular"]:
        try:
            out[r] = resolve(r)
        except Exception as e:  # noqa
            out[r] = ("MISSING: %s" % e, -1)
    return out


def check(path_or_role, text, index=0):
    """Return missing characters for a font file or role."""
    from .text import Face, face
    fc = face(path_or_role) if path_or_role in _REG or path_or_role in ("cjk", "cjk_regular") else Face(path_or_role, index)
    return fc.missing(text)


def _slug(family):
    return family.strip().lower().replace(" ", "-")


def install(family, dest, variable=True, subset="latin"):
    """Fetch a Fontsource package with npm, convert the woff2 to TTF into dest. Returns the TTF path.
    Variable 'standard' files carry every axis (wght+wdth+opsz… when the family has them)."""
    from fontTools.ttLib import TTFont
    os.makedirs(dest, exist_ok=True)
    slug = _slug(family)
    pkg = "@fontsource-variable/%s" % slug if variable else "@fontsource/%s" % slug
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        raise RuntimeError("npm not found; install Node.js or download the font manually")
    tmp = tempfile.mkdtemp(prefix="mk-font-")
    subprocess.run([npm, "init", "-y"], cwd=tmp, check=True, capture_output=True)
    r = subprocess.run([npm, "install", pkg], cwd=tmp, capture_output=True, text=True)
    if r.returncode != 0:
        if variable:
            return install(family, dest, False, subset)
        raise RuntimeError("npm install %s failed: %s" % (pkg, r.stderr[-400:]))
    root = os.path.join(tmp, "node_modules", *pkg.split("/"))
    files = sorted(glob.glob(os.path.join(root, "files", "*.woff2")))
    pick = None
    pref = (["%s-standard-normal" % subset, "%s-full-normal" % subset, "%s-wght-normal" % subset] if variable
            else ["%s-700-normal" % subset, "%s-400-normal" % subset])
    for p in pref:
        for f in files:
            if f.endswith(p + ".woff2") or (p in os.path.basename(f) and "italic" not in f):
                pick = f
                break
        if pick:
            break
    if not pick:
        raise RuntimeError("no %s woff2 found in %s (have %d files)" % (subset, pkg, len(files)))
    font = TTFont(pick)
    font.flavor = None
    name = family.replace(" ", "") + ("-VF" if variable else "") + ".ttf"
    out = os.path.join(dest, name)
    font.save(out)
    for lic in ("LICENSE", "LICENSE.md", "OFL.txt"):
        lp = os.path.join(root, lic)
        if os.path.exists(lp):
            shutil.copy(lp, os.path.join(dest, family.replace(" ", "") + "-LICENSE.txt"))
            break
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in font["fvar"].axes] if "fvar" in font else []
    shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps({"font": out, "axes": axes, "source": pkg}))
    return out


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="python -m motionkit.fonts")
    sub = ap.add_subparsers(dest="cmd")
    a = sub.add_parser("install")
    a.add_argument("family")
    a.add_argument("--dest", default="assets/fonts")
    a.add_argument("--static", action="store_true")
    a.add_argument("--subset", default="latin")
    c = sub.add_parser("check")
    c.add_argument("font")
    c.add_argument("text")
    sub.add_parser("list")
    args = ap.parse_args(argv)
    if args.cmd == "install":
        install(args.family, args.dest, not args.static, args.subset)
    elif args.cmd == "check":
        miss = check(args.font, args.text)
        print(json.dumps({"font": args.font, "missing": miss, "ok": not miss}, ensure_ascii=False))
        sys.exit(1 if miss else 0)
    else:
        print(json.dumps({k: list(v) for k, v in roles().items()}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
