"""Command line for a film script:  python film.py <command> [...]

  info                          grid, chapters, events, gaps
  still T [T ...]               full-res PNGs            → renders/stills/
  sheet T0 T1 N [--cols C]      timecoded contact sheet  → renders/sheets/
  sheet --chapters [--per K]    K frames per chapter, one sheet per chapter
  range T0 T1                   short native-fps MP4 preview (motion check) → renders/preview/
  diff [F0 F1]                  frame-to-frame change curve + unexpected-jump report → renders/qa/
  loop                          compare first and last frame (for looping pieces)
  chunks K0 K1 [--n 12]         render chunks K0..K1-1 of n (resumable, .done markers) → renders/chunks/
  assemble [--audio WAV]        concat chunks (+ mux audio) → delivery/<name>.mp4 (+ _master.mp4)
  render                        chunks 0..n then assemble (hosts without a per-command time limit)
  audio-qa [--wav WAV]          spectrogram + section loudness/bands + onset↔event sync report
  events                        write renders/qa/events.json and print the sync table

Every command writes NEW files; nothing in delivery/ is overwritten unless --force.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from multiprocessing import Pool

import numpy as np


def _film():
    from .film import _ACTIVE
    if not _ACTIVE:
        raise RuntimeError("no Film instance; import the film script first")
    return _ACTIVE[-1]


def ffmpeg_bin(name="ffmpeg"):
    env = os.environ.get("FFMPEG_PATH" if name == "ffmpeg" else "FFPROBE_PATH")
    if env and os.path.exists(env):
        return env
    p = shutil.which(name)
    if p:
        return p
    if name == "ffmpeg":
        try:
            import imageio_ffmpeg
            return imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            pass
    raise RuntimeError("%s not found: install it, set %s, or `pip install imageio-ffmpeg`"
                       % (name, "FFMPEG_PATH" if name == "ffmpeg" else "FFPROBE_PATH"))


def _dirs(f):
    d = {k: f.path("renders", k) for k in ("stills", "sheets", "preview", "chunks", "qa")}
    d["delivery"] = f.path("delivery")
    for v in d.values():
        os.makedirs(v, exist_ok=True)
    return d


def _font(size):
    from PIL import ImageFont
    p = os.path.join(os.path.dirname(__file__), "fonts", "JetBrainsMono-VF.ttf")
    try:
        return ImageFont.truetype(p, size)
    except Exception:
        return ImageFont.load_default()


# ------------------------------------------------------------------ stills & sheets
def still(f, ts, samples=None):
    from PIL import Image
    d = _dirs(f)
    out = []
    for t in ts:
        fi = min(int(round(float(t) * f.fps)), f.nframes - 1)
        t0 = time.time()
        img = f.render_frame(fi, samples)
        p = os.path.join(d["stills"], "%s_f%04d_t%07.3f.png" % (f.name, fi, fi / f.fps))
        Image.fromarray(img).save(p)
        print("still %s  %.2fs" % (p, time.time() - t0), flush=True)
        out.append(p)
    return out


def _sheet_job(args):
    fi, samples, scale = args
    from PIL import Image
    f = _film()
    img = f.render_frame(fi, samples)
    im = Image.fromarray(img).resize((int(f.width * scale), int(f.height * scale)), Image.LANCZOS)
    return fi, np.asarray(im)


def _pool(f, workers):
    return Pool(workers) if workers > 1 else None


def _map(pool, fn, jobs):
    return pool.map(fn, jobs) if pool else [fn(j) for j in jobs]


def sheet(f, fis, name, cols=6, scale=0.2, samples=None, workers=2, title=None):
    from PIL import Image, ImageDraw
    d = _dirs(f)
    f.run_precompute()
    pool = _pool(f, workers)
    try:
        res = _map(pool, _sheet_job, [(fi, samples, scale) for fi in fis])
    finally:
        if pool:
            pool.close()
    w, h = int(f.width * scale), int(f.height * scale)
    rows = (len(fis) + cols - 1) // cols
    pad, lab, head = 4, 18, (26 if title else 0)
    out = Image.new("RGB", (cols * (w + pad) + pad, head + rows * (h + lab + pad) + pad), (36, 36, 40))
    dr = ImageDraw.Draw(out)
    fnt = _font(12)
    if title:
        dr.text((8, 6), title, fill=(235, 235, 235), font=_font(14))
    for k, (fi, arr) in enumerate(res):
        r, c = divmod(k, cols)
        x = pad + c * (w + pad)
        y = head + pad + r * (h + lab + pad)
        out.paste(Image.fromarray(arr), (x, y + lab))
        ch = f.chapter_at(fi / f.fps)
        dr.text((x + 2, y + 3), "f%04d %.3fs %s" % (fi, fi / f.fps, ch.name if ch else ""), fill=(220, 220, 220),
                font=fnt)
    p = os.path.join(d["sheets"], name)
    out.save(p)
    print("sheet", p, flush=True)
    return p


def sheet_range(f, t0, t1, n, cols, scale, samples, workers):
    fis = [min(int(round((t0 + (t1 - t0) * k / max(1, n - 1)) * f.fps)), f.nframes - 1) for k in range(n)]
    return sheet(f, fis, "%s_sheet_%07.3f-%07.3f.png" % (f.name, t0, t1), cols, scale, samples, workers,
                 "%s  %.3f–%.3f s" % (f.name, t0, t1))


def sheet_chapters(f, per, cols, scale, samples, workers):
    out = []
    for c in f.chapters:
        fis = [min(int(round((c.t0 + c.dur * (k + 0.5) / per) * f.fps)), f.nframes - 1) for k in range(per)]
        out.append(sheet(f, fis, "%s_ch%02d_%s.png" % (f.name, c.index, c.name or "chapter"), cols, scale, samples,
                         workers, "%02d %s %s  %.3f–%.3f s" % (c.index, c.glyph, c.name, c.t0, c.t1)))
    return out


# ------------------------------------------------------------------ continuity QA
def _small_job(fi):
    from PIL import Image
    f = _film()
    img = f.render_frame(fi, samples=1, with_post=False, with_hud=False)
    return fi, np.asarray(Image.fromarray(img).resize((f.width // 8, f.height // 8), Image.BILINEAR), np.float32)


def diff(f, f0=0, f1=None, workers=2):
    """Mean absolute change between consecutive frames. Flags spikes that are much larger than their
    neighbourhood and not at a declared cut — those are usually accidental pops (state mismatch at a handoff)."""
    d = _dirs(f)
    f1 = f.nframes if f1 is None else f1
    f.run_precompute()
    pool = _pool(f, workers)
    try:
        res = dict(_map(pool, _small_job, list(range(f0, f1))))
    finally:
        if pool:
            pool.close()
    vals = []
    for fi in range(f0 + 1, f1):
        vals.append((fi, float(np.abs(res[fi] - res[fi - 1]).mean())))
    arr = np.array([v for _, v in vals]) if vals else np.zeros(1)
    flags = []
    cut_frames = {int(round(c * f.fps)) for c in f.cuts}
    for i, (fi, v) in enumerate(vals):
        lo, hi = max(0, i - 6), min(len(vals), i + 7)
        neigh = np.concatenate([arr[lo:i], arr[i + 1:hi]])
        med = float(np.median(neigh)) if len(neigh) else 0.0
        if v > 4.0 * med + 3.0 and fi not in cut_frames and (fi - 1) not in cut_frames:
            ch = f.chapter_at(fi / f.fps)
            flags.append(dict(frame=fi, t=round(fi / f.fps, 3), change=round(v, 2), neighbourhood=round(med, 2),
                              chapter=ch.name if ch else ""))
    mx = max(arr.max(), 1e-6)
    txt = os.path.join(d["qa"], "%s_diff_%04d-%04d.txt" % (f.name, f0, f1))
    with open(txt, "w") as fh:
        for fi, v in vals:
            fh.write("f%04d %7.3fs %6.2f %s\n" % (fi, fi / f.fps, v, "#" * int(50 * v / mx)))
    rep = dict(file=txt, frames=[f0, f1], max=round(float(arr.max()), 2), median=round(float(np.median(arr)), 2),
               suspicious=flags)
    with open(txt.replace(".txt", ".json"), "w") as fh:
        json.dump(rep, fh, indent=1)
    print(json.dumps(rep, indent=1))
    return rep


def loop(f):
    a = f.render_frame(0, samples=1, with_post=False, with_hud=False).astype(np.float32)
    b = f.render_frame(f.nframes - 1, samples=1, with_post=False, with_hud=False).astype(np.float32)
    v = float(np.abs(a - b).mean())
    rep = dict(first_last_mean_abs_diff=round(v, 3), seamless=v < 2.0)
    print(json.dumps(rep))
    return rep


# ------------------------------------------------------------------ encoding
def _edges(f, n):
    e = np.linspace(0, f.nframes, n + 1).astype(int)
    return [(k, int(e[k]), int(e[k + 1])) for k in range(n)]


def _chunk_job(args):
    k, a, b, crf = args
    f = _film()
    d = _dirs(f)
    out = os.path.join(d["chunks"], "chunk_%02d.mp4" % k)
    cmd = [ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", "%dx%d" % (f.width, f.height), "-r", str(f.fps), "-i", "-",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-tune", "film",
           "-x264-params", "keyint=%d:min-keyint=%d" % (f.fps, f.fps),
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for fi in range(a, b):
        p.stdin.write(f.render_frame(fi).tobytes())
    p.stdin.close()
    p.wait()
    if p.returncode != 0:
        raise RuntimeError("ffmpeg failed on chunk %d" % k)
    with open(os.path.join(d["chunks"], "chunk_%02d.done" % k), "w") as fh:
        fh.write("%d %d %.1f\n" % (a, b, time.time() - t0))
    return k, b - a, time.time() - t0


def chunks(f, k0, k1, n=12, workers=2, crf=12):
    d = _dirs(f)
    f.run_precompute()
    jobs = [(k, a, b, crf) for (k, a, b) in _edges(f, n)
            if k0 <= k < k1 and not os.path.exists(os.path.join(d["chunks"], "chunk_%02d.done" % k))]
    t0 = time.time()
    pool = _pool(f, workers)
    try:
        it = pool.imap_unordered(_chunk_job, jobs) if pool else map(_chunk_job, jobs)
        for k, cnt, dt in it:
            print("chunk %02d  %d frames  %.1fs (%.2fs/f)" % (k, cnt, dt, dt / max(cnt, 1)), flush=True)
    finally:
        if pool:
            pool.close()
    done = [k for k in range(n) if os.path.exists(os.path.join(d["chunks"], "chunk_%02d.done" % k))]
    print("chunks done: %d/%d  (%.1fs this call)" % (len(done), n, time.time() - t0))
    return done


def assemble(f, audio=None, n=12, name=None, crf=18, force=False, preset="fast"):
    d = _dirs(f)
    missing = [k for k in range(n) if not os.path.exists(os.path.join(d["chunks"], "chunk_%02d.done" % k))]
    if missing:
        raise RuntimeError("chunks not finished: %s (run `chunks`)" % missing)
    lst = os.path.join(d["chunks"], "list.txt")
    with open(lst, "w") as fh:
        for k in range(n):
            fh.write("file 'chunk_%02d.mp4'\n" % k)
    name = name or f.name
    master = os.path.join(d["delivery"], name + "_master.mp4")
    final = os.path.join(d["delivery"], name + ".mp4")
    for p in (master, final):
        if os.path.exists(p) and not force:
            raise RuntimeError("%s exists; pass --force or --name for a new version" % p)
    silent = os.path.join(d["chunks"], "master_silent.mp4")
    subprocess.run([ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
                    silent], check=True)
    audio = audio or (f.path("audio", "score.wav") if os.path.exists(f.path("audio", "score.wav")) else None)
    amap = (["-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k"] if audio else [])
    subprocess.run([ffmpeg_bin(), "-y", "-loglevel", "error", "-i", silent] + amap +
                   ["-c:v", "copy", "-t", "%.3f" % f.duration, "-movflags", "+faststart", master], check=True)
    subprocess.run([ffmpeg_bin(), "-y", "-loglevel", "error", "-i", master, "-c:v", "libx264", "-preset", preset,
                    "-crf", str(crf), "-tune", "film", "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"] +
                   (["-c:a", "copy"] if audio else []) + ["-movflags", "+faststart", final], check=True)
    rep = probe(final)
    rep.update(master=master, delivery=final, audio=audio)
    print(json.dumps(rep, indent=1))
    return rep


def probe(path):
    try:
        exe = ffmpeg_bin("ffprobe")
    except RuntimeError:
        return {"probe": "ffprobe unavailable"}
    out = subprocess.run([exe, "-v", "error", "-show_entries",
                          "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,sample_rate,channels",
                          "-show_entries", "format=duration,size", "-of", "json", path], capture_output=True, text=True)
    try:
        return json.loads(out.stdout)
    except Exception:
        return {"probe_error": out.stderr[-300:]}


def range_preview(f, t0, t1, scale=0.5):
    d = _dirs(f)
    f.run_precompute()
    a, b = int(round(t0 * f.fps)), min(int(round(t1 * f.fps)), f.nframes)
    out = os.path.join(d["preview"], "%s_%07.3f-%07.3f.mp4" % (f.name, t0, t1))
    w, h = int(f.width * scale) // 2 * 2, int(f.height * scale) // 2 * 2
    cmd = [ffmpeg_bin(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", "%dx%d" % (f.width, f.height), "-r", str(f.fps), "-i", "-", "-vf",
           "scale=%d:%d,format=yuv420p" % (w, h), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fi in range(a, b):
        p.stdin.write(f.render_frame(fi).tobytes())
    p.stdin.close()
    p.wait()
    print("preview", out)
    return out


# ------------------------------------------------------------------ main
def main(f, argv=None):
    ap = argparse.ArgumentParser(prog="film.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd")
    ap.add_argument("args", nargs="*")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--scale", type=float, default=0.2)
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2))))
    ap.add_argument("--n", type=int, default=12, help="number of chunks")
    ap.add_argument("--per", type=int, default=6, help="frames per chapter for sheet --chapters")
    ap.add_argument("--chapters", action="store_true")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--wav", default=None)
    ap.add_argument("--name", default=None)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preset", default="fast", help="x264 preset for the delivery encode")
    a = ap.parse_args(argv)
    if a.cmd == "info":
        print(f.info())
    elif a.cmd == "still":
        f.run_precompute()
        still(f, a.args, a.samples)
    elif a.cmd == "sheet":
        if a.chapters or not a.args:
            sheet_chapters(f, a.per, a.cols, a.scale, a.samples, a.workers)
        else:
            sheet_range(f, float(a.args[0]), float(a.args[1]), int(a.args[2]) if len(a.args) > 2 else 24,
                        a.cols, a.scale, a.samples, a.workers)
    elif a.cmd == "range":
        range_preview(f, float(a.args[0]), float(a.args[1]))
    elif a.cmd == "diff":
        diff(f, int(a.args[0]) if a.args else 0, int(a.args[1]) if len(a.args) > 1 else None, a.workers)
    elif a.cmd == "loop":
        loop(f)
    elif a.cmd == "chunks":
        chunks(f, int(a.args[0]) if a.args else 0, int(a.args[1]) if len(a.args) > 1 else a.n, a.n, a.workers)
    elif a.cmd == "assemble":
        assemble(f, a.audio, a.n, a.name, a.crf, a.force, a.preset)
    elif a.cmd == "render":
        chunks(f, 0, a.n, a.n, a.workers)
        assemble(f, a.audio, a.n, a.name, a.crf, a.force, a.preset)
    elif a.cmd == "audio-qa":
        from .audio.analyze import audio_qa
        audio_qa(f, a.wav)
    elif a.cmd == "events":
        d = _dirs(f)
        p = os.path.join(d["qa"], "events.json")
        f.events.to_json(p)
        print(f.events.table())
        print("wrote", p)
    elif a.cmd == "precompute":
        f.run_precompute()
    else:
        ap.print_help()
        return 2
    return 0
