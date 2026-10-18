#!/usr/bin/env python3
"""Read-only capability report; installs nothing and makes no paid requests."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--python", default=sys.executable, help="Interpreter intended for local ASR")
    parser.add_argument("--native-image-tool", choices=["available", "unavailable", "unknown"], default="unknown",
                        help="Set available only after the host agent verifies its actual image tool")
    args = parser.parse_args()
    root = Path(args.project).resolve(strict=True)
    if Path(args.python).is_file():
        args.python = str(Path(args.python).resolve())
    node = shutil.which("node")
    checks = {"project": str(root), "python": args.python, "node": node,
              "native_image_tool": args.native_image_tool, "requires_codex": False}

    def command(argv):
        try:
            result = subprocess.run(argv, cwd=root, capture_output=True, text=True,
                                    encoding="utf-8", errors="replace", timeout=30)
            return {"ok": result.returncode == 0, "output": result.stdout.strip(),
                    "error": "" if result.returncode == 0 else "Capability unavailable; install dependencies or inspect locally"}
        except (OSError, subprocess.TimeoutExpired):
            return {"ok": False, "error": "Command unavailable or timed out"}

    if node:
        checks["node_version"] = command([node, "--version"])
        checks["runtime"] = command([node, "--input-type=module", "-e",
            "import {chromium} from 'playwright'; import {ffmpegPath,ffprobePath} from './src/media.mjs';"
            "import fs from 'node:fs'; console.log(JSON.stringify({"
            "chromium_installed:fs.existsSync(chromium.executablePath()),"
            "ffmpeg_installed:fs.existsSync(ffmpegPath),ffprobe_installed:fs.existsSync(ffprobePath)}));"])
        checks["local_voices"] = command([node, "src/local-tts.mjs", "voices"])
    checks["local_asr"] = command([args.python, "-c",
        "import faster_whisper; print('faster-whisper import OK; model weights still require a separate check')"])
    print(json.dumps(checks, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
