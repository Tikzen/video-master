"""Audio QA you can do without ears: loudness by chapter, spectral balance, impact contrast,
onset ↔ event sync, clipping/silence, and a spectrogram image with chapter/event markers.

    python film.py audio-qa                  # analyses audio/score.wav (or --wav path / an .mp4)

Read the report like this (references/craft/sound.md → "QA without listening"):
  * phone_loss_db: chapter loudness lost through a 250 Hz high-pass (a phone/laptop speaker proxy).
    Energetic music sits around 6–10 dB; > 12 dB means the section is nearly all sub and will feel empty
    on phones. phone_lift_db: for each drop, phone loudness of the bar after vs the bar before (want ≥ 2).
  * bands: share of energy in sub(20–80) low(80–250) mid(250–2k) presence(2–6k) air(6–20k), dB re max
    (descriptive; dance drops are normally sub-led).
  * impact_contrast: RMS 0.2 s after a hit/drop minus RMS of the 45 ms just before it. Drops want
    ≥ 8 dB; < 8 dB → the hit doesn't land: add a pre-hit breath (Score.breath) or pull the build down
    (Score.section). Swells that END on the hit are good; sounds that straddle it mask it.
  * sync: every hit/drop/word/tick event should have an onset within ±40 ms. Misses mean the sound
    is missing, late, or masked.
"""
import json
import os
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile

BANDS = [("sub", 20, 80), ("low", 80, 250), ("mid", 250, 2000), ("presence", 2000, 6000), ("air", 6000, 20000)]


def _load(path):
    if path.lower().endswith((".mp4", ".mov", ".m4a", ".aac", ".mkv")):
        from ..cli import ffmpeg_bin
        raw = subprocess.run([ffmpeg_bin(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le",
                              "-"], capture_output=True).stdout
        return 48000, np.frombuffer(raw, np.int16).astype(np.float32) / 32767
    sr, x = wavfile.read(path)
    x = x.astype(np.float32)
    if x.ndim == 2:
        x = x.mean(1)
    if np.abs(x).max() > 2:
        x = x / 32767
    return sr, x


def band_table(x, sr):
    F = np.abs(np.fft.rfft(x)) ** 2
    fr = np.fft.rfftfreq(len(x), 1 / sr)
    e = {n: 10 * np.log10(F[(fr >= a) & (fr < b)].sum() + 1e-12) for n, a, b in BANDS}
    mx = max(e.values())
    return {k: round(float(v - mx), 1) for k, v in e.items()}


def rms_db(x):
    return float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)) if len(x) else -120.0


def onsets(x, sr, hop_s=0.005, thresh=0.6):
    hop = int(sr * hop_s)
    n = len(x) // hop
    e = np.array([np.sqrt((x[i * hop:(i + 1) * hop] ** 2).mean()) for i in range(n)])
    le = np.log(e + 1e-4)
    d = np.maximum(np.diff(le, prepend=le[0]), 0)
    # adaptive threshold: local median + k
    med = signal.medfilt(d, 41)
    peaks, _ = signal.find_peaks(d, height=med + thresh, distance=int(0.03 / hop_s))
    return peaks * hop_s, e


def audio_qa(film, wav=None, tol=0.04):
    root = film.root
    wav = wav or os.path.join(root, "audio", "score.wav")
    if not os.path.exists(wav):
        raise FileNotFoundError(wav)
    sr, x = _load(wav)
    dur = len(x) / sr
    rep = dict(file=wav, seconds=round(dur, 3), peak_dbfs=round(float(20 * np.log10(np.abs(x).max() + 1e-9)), 2),
               rms_dbfs=round(rms_db(x), 2), clipped_samples=int((np.abs(x) > 0.999).sum()))
    rep["duration_matches_film"] = abs(dur - film.duration) < 0.05
    phone = signal.sosfilt(signal.butter(4, 250, "high", fs=sr, output="sos"), x)   # small-speaker proxy
    chs = []
    for c in film.chapters:
        a, b = int(c.t0 * sr), int(c.t1 * sr)
        full, ph = rms_db(x[a:b]), rms_db(phone[a:b])
        chs.append(dict(chapter=c.name, t0=round(c.t0, 3), rms_db=round(full, 1), phone_rms_db=round(ph, 1),
                        phone_loss_db=round(full - ph, 1), bands=band_table(x[a:b], sr)))
    rep["chapters"] = chs
    # silences > 0.4 s (unintended dropouts)
    hop = int(sr * 0.05)
    lv = np.array([rms_db(x[i:i + hop]) for i in range(0, len(x) - hop, hop)])
    quiet = np.where(lv < -55)[0]
    runs, start = [], None
    for i in range(len(lv)):
        if lv[i] < -55 and start is None:
            start = i
        if (lv[i] >= -55 or i == len(lv) - 1) and start is not None:
            if (i - start) * 0.05 >= 0.4:
                runs.append([round(start * 0.05, 2), round(i * 0.05, 2)])
            start = None
    rep["silences_over_0.4s"] = runs
    # sync against declared events
    on, env = onsets(x, sr)
    sync = []
    for e in film.events.all():
        if e.kind not in ("hit", "drop", "word", "tick", "land", "slam", "click"):
            continue
        dt = on - e.t
        k = int(np.argmin(np.abs(dt))) if len(on) else -1
        off = float(dt[k]) if k >= 0 else None
        sync.append(dict(event=e.name, t=round(e.t, 3), kind=e.kind, nearest_onset_ms=None if off is None else round(off * 1000, 1),
                         ok=off is not None and abs(off) <= tol))
    rep["sync"] = sync
    # impact contrast
    con = []
    for e in film.events.all():
        if e.kind in ("drop", "hit", "slam"):
            pre = x[max(0, int((e.t - 0.05) * sr)):int((e.t - 0.005) * sr)]
            post = x[int(e.t * sr):int((e.t + 0.2) * sr)]
            item = dict(event=e.name, t=round(e.t, 3), kind=e.kind, contrast_db=round(rms_db(post) - rms_db(pre), 1))
            if e.kind == "drop":     # does the drop still exist on a phone? (bar after vs bar before, >250 Hz)
                span = film.grid.bar_s if film.grid else 1.0
                before = phone[max(0, int((e.t - span) * sr)):int(e.t * sr)]
                after = phone[int(e.t * sr):int((e.t + span) * sr)]
                item["phone_lift_db"] = round(rms_db(after) - rms_db(before), 1)
            con.append(item)
    rep["impact_contrast"] = con
    warn = []
    for c in chs:
        if c["phone_loss_db"] > 12:
            warn.append("%s: loses %.1f dB on a phone speaker (energy is almost all < 250 Hz) — add mid/presence "
                        "content: clap, stab, arp, a knock layer on the kick" % (c["chapter"], c["phone_loss_db"]))
    for c in con:
        if c["kind"] == "drop" and c["contrast_db"] < 8:
            warn.append("%s @%.2fs: drop contrast only %.1f dB (want ≥ 8) — add Score.breath()/Score.section()"
                        % (c["event"], c["t"], c["contrast_db"]))
        if c.get("phone_lift_db") is not None and c["phone_lift_db"] < 2:
            warn.append("%s @%.2fs: on a phone the drop lifts only %.1f dB — the impact lives in the sub; add "
                        "presence (crash, clap, stab, brighter pad)" % (c["event"], c["t"], c["phone_lift_db"]))
    miss = [s for s in sync if not s["ok"]]
    if miss:
        warn.append("%d/%d sync events without an onset within ±%d ms: %s" % (len(miss), len(sync), tol * 1000,
                                                                              ", ".join(m["event"] for m in miss[:8])))
    if rep["clipped_samples"] > 0:
        warn.append("clipping: %d samples" % rep["clipped_samples"])
    if runs:
        warn.append("unexpected silences: %s" % runs)
    rep["warnings"] = warn
    out = os.path.join(root, "renders", "qa")
    os.makedirs(out, exist_ok=True)
    png = os.path.join(out, "%s_audio.png" % film.name)
    spectrogram_png(x, sr, png, film)
    rep["spectrogram"] = png
    with open(os.path.join(out, "%s_audio.json" % film.name), "w") as fh:
        json.dump(rep, fh, indent=1, ensure_ascii=False)
    print(json.dumps({k: rep[k] for k in ("file", "seconds", "peak_dbfs", "rms_dbfs", "warnings", "spectrogram")},
                     indent=1, ensure_ascii=False))
    for c in chs:
        print("  %-10s %6.1f dB  phone %6.1f (−%4.1f)  %s" % (c["chapter"], c["rms_db"], c["phone_rms_db"], c["phone_loss_db"],
                                                         "  ".join("%s %5.1f" % kv for kv in c["bands"].items())))
    for c in con:
        print("  %-12s %7.3fs  contrast %5.1f dB%s" % (c["event"], c["t"], c["contrast_db"],
              ("   phone lift %.1f dB" % c["phone_lift_db"]) if "phone_lift_db" in c else ""))
    return rep


def spectrogram_png(x, sr, path, film=None, width=1600, height=420):
    from PIL import Image, ImageDraw
    f, t, S = signal.spectrogram(x, sr, nperseg=2048, noverlap=1536)
    S = 10 * np.log10(S + 1e-12)
    fl = np.geomspace(30, 16000, height)
    img = np.zeros((height, len(t)))
    for i, ff in enumerate(fl):
        img[height - 1 - i] = S[min(np.searchsorted(f, ff), len(f) - 1)]
    img = np.clip((img + 100) / 70, 0, 1)
    spec = Image.fromarray((img * 255).astype(np.uint8)).resize((width, height)).convert("RGB")
    wf = Image.new("RGB", (width, 140), (20, 20, 24))
    d = ImageDraw.Draw(wf)
    seg = max(1, len(x) // width)
    for i in range(width):
        a = x[i * seg:(i + 1) * seg]
        if len(a):
            d.line([(i, 70 - a.max() * 68), (i, 70 - a.min() * 68)], fill=(230, 120, 90))
    out = Image.new("RGB", (width, height + 160), (0, 0, 0))
    out.paste(wf, (0, 0))
    out.paste(spec, (0, 160))
    d = ImageDraw.Draw(out)
    dur = len(x) / sr
    if film:
        for c in film.chapters:
            xx = int(c.t0 / dur * width)
            d.line([(xx, 140), (xx, height + 160)], fill=(255, 230, 0))
            d.text((xx + 3, 142), c.name[:10], fill=(255, 230, 0))
        for e in film.events.all():
            xx = int(e.t / dur * width)
            d.line([(xx, 150), (xx, 160)], fill=(120, 220, 255))
    out.save(path)
    return path
