#!/usr/bin/env python3
"""Local speech transcription with measured segment/word timestamps."""
import argparse
import json
import os
from pathlib import Path
import sys
import subprocess


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default=os.environ.get("VM_ASR_MODEL", "small"))
    parser.add_argument("--language", default="auto")
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH", "ffmpeg"))
    args = parser.parse_args()
    from faster_whisper import WhisperModel
    import numpy as np
    # Feed normalized samples directly, avoiding PyAV decoder API drift.
    decoded = subprocess.run(
        [args.ffmpeg, "-v", "error", "-i", str(Path(args.input).resolve()),
         "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
        capture_output=True, check=True, timeout=180)
    audio = np.frombuffer(decoded.stdout, dtype=np.float32).copy()
    if not audio.size:
        raise ValueError("Empty audio")
    model = WhisperModel(args.model, device="cpu", compute_type="int8",
                         cpu_threads=min(8, os.cpu_count() or 4))
    segments, info = model.transcribe(
        audio, beam_size=5, word_timestamps=True, vad_filter=True,
        language=None if args.language == "auto" else args.language,
        condition_on_previous_text=False,
    )
    rows = []
    for segment in segments:
        if not segment.text.strip():
            continue
        rows.append({
            "start": segment.start, "end": segment.end, "text": segment.text.strip(),
            "avg_logprob": segment.avg_logprob,
            "words": [{"start": word.start, "end": word.end,
                       "text": word.word, "probability": word.probability}
                      for word in segment.words or []],
        })
    if not rows:
        raise ValueError("No speech detected; supply an audible narration recording")
    result = {
        "schema": "video-master.transcript.v1", "engine": "faster-whisper",
        "model": args.model, "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration, "segments": rows,
        "text": "".join(row["text"] for row in rows),
        "speaker_diarization": False, "human_review": "not_recorded",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(".tmp.json")
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(output)
    def stamp(seconds):
        milliseconds = round(seconds * 1000)
        return (f"{milliseconds // 3600000:02d}:"
                f"{milliseconds // 60000 % 60:02d}:"
                f"{milliseconds // 1000 % 60:02d},"
                f"{milliseconds % 1000:03d}")
    output.with_suffix(".srt").write_text(
        "\n\n".join(f"{index + 1}\n{stamp(row['start'])} --> {stamp(row['end'])}\n{row['text']}"
                    for index, row in enumerate(rows)) + "\n", encoding="utf-8")
    print(json.dumps({"status": "done", "segments": len(rows), "output": str(output)}))


if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError:
        print("Install local ASR: python -m pip install 'faster-whisper>=1.1,<2'. "
              "Set VIDEO_MASTER_PYTHON to that interpreter.", file=sys.stderr)
        raise SystemExit(1)
    except Exception as error:
        print(f"Local transcription failed ({type(error).__name__}); "
              "check model availability, CPU memory and audio quality.", file=sys.stderr)
        raise SystemExit(1)
