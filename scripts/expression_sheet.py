#!/usr/bin/env python3
"""Character expression-differential sheet (人物差分要求表) for studio hosts.

Run `build` whenever the storyboard/script is written or changed. The sheet comes from the same
program.json that drives the video: every expression a line asks for, with its lines, screen time,
acting note and an identity-locked edit prompt. A second image model can then produce the
differentials from the host's master image, one reference edit per row.

  python expression_sheet.py build    --project P [--program program.json]
  python expression_sheet.py generate --project P --authorize-requests [--backend gemini] [--model M]
                                      [--host host-a] [--only smile,smile_talk] [--limit N]
  python expression_sheet.py check    --project P        # size / alpha / pose-lock vs the master
  python expression_sheet.py apply    --project P        # write passing images into program.json

Outputs (project-relative): expression_sheet.json (manifest, status per row), expression_sheet.md
(the human-readable table), images under assets/art/hosts/<host-id>/<key>.png.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
CPS = 4.3  # placeholder speech rate (字/s) when no measured timeline exists yet

# Acting vocabulary. Add a row in program.json `expression_notes` for any custom name.
EXPRESSIONS = {
    "neutral": ("自然待机", "relaxed neutral face, soft closed-mouth smile, eyes open and attentive"),
    "smile": ("微笑问候", "warm friendly smile, eyes slightly curved, cheeks lifted"),
    "explain": ("讲解", "engaged explaining face, eyebrows slightly raised, confident small smile"),
    "excited": ("兴奋揭晓", "excited bright face, wide sparkling eyes, big open smile, eyebrows up"),
    "thinking": ("思考提问", "thoughtful face, eyes glancing up to one side, one eyebrow raised, lips pressed"),
    "surprised": ("惊讶", "surprised face, eyes wide, eyebrows high, small round open mouth"),
    "serious": ("认真提醒", "serious focused face, eyebrows slightly lowered, firm closed mouth"),
    "listening": ("倾听反应", "attentive listening face, gentle nod-like expression, soft eyes, closed mouth"),
    "happy": ("开心", "happy face, closed-eye smile, cheerful"),
    "worried": ("担心", "worried face, eyebrows tilted up in the middle, small frown"),
}
MOUTH_OPEN = "mouth open mid-syllable as if speaking (a natural 'ah' shape), everything else unchanged"
EYES_CLOSED = "eyes gently closed mid-blink, everything else unchanged"
LOCK = ("Use the reference image as the identity and layout authority. Keep EXACTLY the same character, hairstyle, "
        "outfit, colours, line art, body pose, hands, proportions, camera framing, canvas size and position, and keep "
        "the background fully transparent. Do not move, rescale, crop or redraw the body. Change ONLY the face: ")
LOCK_ZH = "以参考图为身份与构图基准：角色、发型、服装、配色、线稿、身体姿势、手、比例、取景、画布尺寸与位置完全不变，背景保持透明；不得移动、缩放、裁切或重画身体。只改脸部："


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def save(path, data):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def measured_spans(root):
    """{line_index: (start, end)} from a built timeline (expression cues), when available."""
    timeline = load(root / "timeline.json", {})
    spans = {}
    for cue in timeline.get("cues", []):
        if cue.get("kind") == "expression" and str(cue.get("id", "")).startswith("expression-"):
            spans[int(cue["id"].split("-")[1])] = (cue["start_sec"], cue["end_sec"])
    return spans


def build(args):
    root = Path(args.project).resolve(strict=True)
    program = load(root / args.program)
    hosts = program.get("hosts") or []
    if not hosts:
        raise SystemExit("program.json has no hosts; cast the hosts before building the sheet")
    notes = {**{k: v for k, v in EXPRESSIONS.items()}, **{k: (v.get("label", k), v["prompt"]) for k, v in
                                                          program.get("expression_notes", {}).items()}}
    spans, cursor, gap = measured_spans(root), 0.0, program.get("gap_seconds", 0.3)
    previous = {r["key"] + "@" + r["host"]: r for r in load(root / "expression_sheet.json", {}).get("rows", [])}
    usage = {}
    for i, line in enumerate(program.get("lines", [])):
        speaker = line.get("speaker", "host-a")
        expr = line.get("expression", "neutral")
        est = max(0.6, len([c for c in line.get("text", "") if not c.isspace()]) / CPS)
        t0, t1 = spans.get(i, (cursor, cursor + est + gap))
        cursor = t1
        u = usage.setdefault((speaker, expr), {"lines": [], "seconds": 0.0})
        u["lines"].append({"index": i, "start": round(t0, 2), "text": line.get("text", "")[:40], "camera": line.get("camera", "studio")})
        u["seconds"] += t1 - t0
    rows = []
    for host in hosts:
        hid = host["id"]
        master = host.get("master") or (host.get("expressions") or {}).get("neutral")
        needed = {"neutral"} | {e for (s, e) in usage if s == hid}
        for expr in sorted(needed, key=lambda e: (e != "neutral", -usage.get((hid, e), {"seconds": 0})["seconds"], e)):
            label, face = notes.get(expr, (expr, f"{expr} expression (describe it in program.json expression_notes)"))
            u = usage.get((hid, expr), {"lines": [], "seconds": 0.0})
            variants = [(expr, face, "base"), (f"{expr}_talk", f"{face}; {MOUTH_OPEN}", "talk")]
            if expr == "neutral" or u["seconds"] >= 6:
                variants.append((f"{expr}_blink", f"{face}; {EYES_CLOSED}", "blink"))
            for key, desc, role in variants:
                is_master = key == "neutral" and bool(master)   # the master立绘 IS the neutral base
                old = previous.get(f"{key}@{hid}", {})
                rows.append({
                    "host": hid, "host_name": host.get("name", hid), "key": key, "expression": expr, "label": label,
                    "variant": role, "priority": "P0" if expr == "neutral" or role == "base" else ("P1" if role == "talk" else "P2"),
                    "lines": [l["index"] for l in u["lines"]], "seconds": round(u["seconds"], 1),
                    "usage": u["lines"][:6], "reference": master,
                    "output": master if is_master else f"assets/art/hosts/{hid}/{key}.png",
                    "prompt": LOCK + desc + ".",
                    "prompt_zh": LOCK_ZH + f"{label}（{desc}）。",
                    "status": "master" if is_master else old.get("status", "pending"),
                    **({"result": old["result"]} if old.get("result") else {}),
                })
    sheet = {"schema": "video-master.expression-sheet.v1", "generated_at": now(), "program": args.program,
             "rule": "Differentials are whole images on the master's exact canvas; only the face changes.",
             "rows": rows}
    save(root / "expression_sheet.json", sheet)
    (root / "expression_sheet.md").write_text(markdown(sheet, hosts), encoding="utf-8")
    missing = [h["id"] for h in hosts if not (h.get("master") or (h.get("expressions") or {}).get("neutral"))]
    print(json.dumps({"status": "built", "rows": len(rows), "hosts": len(hosts),
                      "missing_master": missing or None, "sheet": "expression_sheet.md"}, ensure_ascii=False))


def markdown(sheet, hosts):
    out = ["# 人物差分要求表", "",
           "由分镜脚本（program.json）自动生成；脚本改动后重新运行 `expression_sheet.py build`。",
           "", "统一要求：每张差分都以该主播的母版立绘为参考图做编辑，画布尺寸、位置、身体、服装、线稿和配色与母版逐像素对齐，"
           "背景透明，只改脸部。`_talk` 是同一表情的张嘴帧，用于说话；`_blink` 是闭眼帧，用于眨眼。缺少的差分会退回基础表情，"
           "不会让画面出错，但会显得呆板。生成后运行 `check`，对位不通过的图片不得进入成片。", ""]
    for host in hosts:
        hid = host["id"]
        rows = [r for r in sheet["rows"] if r["host"] == hid]
        if not rows:
            continue
        out += [f"## {host.get('name', hid)}（{hid}）", "",
                f"母版 / 参考图：`{rows[0]['reference'] or '缺失：先确定主播母版'}`", "",
                "| 优先级 | 文件键 | 表情 | 帧 | 用到的台词 | 屏幕时长 | 状态 |", "|---|---|---|---|---|---:|---|"]
        for r in rows:
            used = "；".join(f"#{u['index'] + 1} {u['text']}" for u in r["usage"][:3]) + (" …" if len(r["lines"]) > 3 else "")
            out.append(f"| {r['priority']} | `{r['key']}` | {r['label']} | {dict(base='基础', talk='张嘴', blink='闭眼')[r['variant']]} | "
                       f"{used or '待机/倾听'} | {r['seconds']:.1f}s | {r['status']} |")
        out += ["", "<details><summary>生成提示词</summary>", ""]
        for r in rows:
            out += [f"- `{r['key']}`：{r['prompt_zh']}", f"  - EN: {r['prompt']}"]
        out += ["", "</details>", ""]
    return "\n".join(out)


def generate(args):
    root = Path(args.project).resolve(strict=True)
    sheet = load(root / "expression_sheet.json")
    only = set(args.only.split(",")) if args.only else None
    todo = [r for r in sheet["rows"] if r["status"] in ("pending", "failed", "rejected")
            and (not args.host or r["host"] == args.host) and (not only or r["key"] in only)]
    todo = todo[: args.limit] if args.limit else todo
    if not todo:
        print(json.dumps({"status": "nothing-to-do"}))
        return
    if not args.authorize_requests:
        raise SystemExit(f"{len(todo)} reference edits would be sent to the image provider. "
                         "Get the user's approval for this scope/cost, then pass --authorize-requests.")
    by_key = {(r["host"], r["key"]): r for r in sheet["rows"]}
    for r in todo:
        if not r.get("reference") or not (root / r["reference"]).exists():
            r["status"], r["error"] = "blocked", "missing master/reference image"
            continue
        # Talk/blink frames are edits of their own base expression (same face), not of the master.
        base = by_key.get((r["host"], r["expression"]))
        source = r["reference"]
        if r["variant"] != "base" and base and base["status"] in ("generated", "passed", "master") and (root / base["output"]).exists():
            source = base["output"]
        out = root / r["output"]
        out.parent.mkdir(parents=True, exist_ok=True)
        size = master_size(root / r["reference"])
        ratio = aspect(size) if size else "1:1"
        command = [sys.executable, str(SKILL / "scripts/image_tools.py"), "generate", "--project", str(root),
                   "--authorize-requests"]
        if args.backend:
            command += ["--backend", args.backend]
        command += ["--", r["prompt"], "--reference-image", source, "--aspect_ratio", ratio,
                    "-o", str(out.parent.relative_to(root)), "--filename", out.stem]
        if args.model:
            command += ["--model", args.model]
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace")
        made = next((p for p in out.parent.glob(out.stem + ".*") if p.suffix.lower() in (".png", ".webp", ".jpg", ".jpeg")), None)
        if result.returncode == 0 and made:
            if made != out:
                from PIL import Image
                Image.open(made).save(out)
            r["status"], r["generated_at"] = "generated", now()
            r.pop("error", None)
        else:
            r["status"], r["error"] = "failed", (result.stdout + result.stderr).strip()[-400:]
        save(root / "expression_sheet.json", sheet)
        print(json.dumps({"key": r["key"], "host": r["host"], "status": r["status"]}, ensure_ascii=False))
    (root / "expression_sheet.md").write_text(markdown(sheet, load(root / sheet["program"])["hosts"]), encoding="utf-8")


def master_size(path):
    from PIL import Image
    try:
        return Image.open(path).size
    except OSError:
        return None


def aspect(size):
    w, h = size
    options = {"1:1": 1, "2:3": 2 / 3, "3:4": 3 / 4, "4:5": 4 / 5, "9:16": 9 / 16, "3:2": 3 / 2, "4:3": 4 / 3, "16:9": 16 / 9}
    return min(options, key=lambda k: abs(options[k] - w / h))


def check(args):
    """Pose-lock check: same canvas, real alpha, body silhouette below the head matches the master."""
    import numpy as np
    from PIL import Image
    root = Path(args.project).resolve(strict=True)
    sheet = load(root / "expression_sheet.json")
    report = []
    for r in sheet["rows"]:
        if r["status"] not in ("generated", "passed", "failed-check"):
            continue
        path = root / r["output"]
        issues = []
        try:
            im = Image.open(path).convert("RGBA")
            ref = Image.open(root / r["reference"]).convert("RGBA")
        except OSError as error:
            issues.append(f"unreadable: {error}")
            im = ref = None
        if im is not None:
            issues_note = None
            if im.size != ref.size:
                # Providers often return a different resolution; resample before judging alignment.
                issues_note = f"resized {im.size[0]}x{im.size[1]} to master canvas {ref.size[0]}x{ref.size[1]}"
                if abs(im.size[0] / im.size[1] - ref.size[0] / ref.size[1]) > 0.01:
                    issues.append("aspect ratio differs from the master; regenerate or pad to the master canvas")
                else:
                    im = im.resize(ref.size, Image.LANCZOS)
                    im.save(path)
            a, b = np.asarray(im)[..., 3] > 32, np.asarray(ref)[..., 3] > 32
            if a.mean() > 0.97:
                issues.append("no transparency (background baked in): remove background before use")
            rows = np.where(b.any(axis=1))[0]
            if len(rows):
                top, bottom = rows.min(), rows.max()
                cut = top + int((bottom - top) * args.head_fraction)       # ignore the head/face region
                body_a, body_b = a[cut:], b[cut:]
                union = np.logical_or(body_a, body_b).sum()
                iou = float(np.logical_and(body_a, body_b).sum() / union) if union else 1.0
                ra = np.where(a.any(axis=1))[0]
                shift = abs(int(ra.max()) - int(bottom)) if len(ra) else 999
                if iou < args.min_iou:
                    issues.append(f"body moved/redrawn (silhouette IoU {iou:.2f} < {args.min_iou})")
                if shift > max(3, ref.size[1] * 0.01):
                    issues.append(f"base line shifted {shift}px")
                r["check"] = {"iou": round(iou, 3), "base_shift_px": shift, **({"note": issues_note} if issues_note else {})}
        r["status"] = "failed-check" if issues else "passed"
        r["issues"] = issues
        report.append({"key": r["key"], "host": r["host"], "status": r["status"], "issues": issues})
    save(root / "expression_sheet.json", sheet)
    (root / "expression_sheet.md").write_text(markdown(sheet, load(root / sheet["program"])["hosts"]), encoding="utf-8")
    print(json.dumps({"checked": len(report), "failed": [x for x in report if x["issues"]]}, ensure_ascii=False, indent=1))


def apply(args):
    root = Path(args.project).resolve(strict=True)
    sheet = load(root / "expression_sheet.json")
    program_path = root / sheet["program"]
    program = load(program_path)
    added = 0
    for host in program["hosts"]:
        exprs = host.setdefault("expressions", {})
        for r in sheet["rows"]:
            if r["host"] == host["id"] and r["status"] == "passed":
                exprs[r["key"]] = r["output"]
                added += 1
    save(program_path, program)
    pending = [f"{r['host']}:{r['key']}" for r in sheet["rows"] if r["status"] not in ("passed", "master")]
    print(json.dumps({"applied": added, "not_ready": pending or None}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build")
    b.add_argument("--project", required=True)
    b.add_argument("--program", default="program.json")
    g = sub.add_parser("generate")
    g.add_argument("--project", required=True)
    g.add_argument("--authorize-requests", action="store_true")
    g.add_argument("--backend", help="edit-capable provider for differentials (can differ from the master's)")
    g.add_argument("--model")
    g.add_argument("--host")
    g.add_argument("--only")
    g.add_argument("--limit", type=int)
    c = sub.add_parser("check")
    c.add_argument("--project", required=True)
    c.add_argument("--head-fraction", type=float, default=0.42, help="top share of the figure treated as the face region")
    c.add_argument("--min-iou", type=float, default=0.9)
    a = sub.add_parser("apply")
    a.add_argument("--project", required=True)
    args = parser.parse_args()
    {"build": build, "generate": generate, "check": check, "apply": apply}[args.command](args)


if __name__ == "__main__":
    main()
