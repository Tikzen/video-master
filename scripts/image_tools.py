#!/usr/bin/env python3
"""Configure project image tools or invoke the vendored PPT Master adapters."""
from __future__ import annotations
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


# Mirrors imageBackends in assets/starter-project/src/image-tools.mjs.
BACKEND_VARIABLES = {
    "openai": {"key": "OPENAI_API_KEY", "model": "OPENAI_MODEL", "base": "OPENAI_BASE_URL"},
    "gemini": {"key": "GEMINI_API_KEY", "model": "GEMINI_MODEL", "base": "GEMINI_BASE_URL"},
    "minimax": {"key": "MINIMAX_API_KEY", "model": "MINIMAX_MODEL", "base": "MINIMAX_BASE_URL"},
    "qwen": {"key": "QWEN_API_KEY", "model": "QWEN_MODEL", "base": "QWEN_BASE_URL"},
    "zhipu": {"key": "ZHIPU_API_KEY", "model": "ZHIPU_MODEL", "base": "ZHIPU_BASE_URL"},
    "volcengine": {"key": "LAS_API_KEY", "model": "VOLCENGINE_MODEL", "base": "VOLCENGINE_BASE_URL"},
    "tencent": {"key": "TENCENT_API_KEY", "model": "TENCENT_MODEL", "base": "TENCENT_BASE_URL"},
    "siliconflow": {"key": "SILICONFLOW_API_KEY", "model": "SILICONFLOW_MODEL", "base": "SILICONFLOW_BASE_URL"},
    "openrouter": {"key": "OPENROUTER_API_KEY", "model": "OPENROUTER_MODEL", "base": "OPENROUTER_BASE_URL"},
}


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("setup")
    setup.add_argument("--project", required=True)
    setup.add_argument("--path", choices=("builtin","external"), required=True)
    setup.add_argument("--backend", default="openai")
    generate = sub.add_parser("generate")
    generate.add_argument("--project", required=True)
    generate.add_argument("--authorize-requests", action="store_true")
    generate.add_argument("--backend", dest="backend_override", default=None,
                          help="Use a different configured provider for this call (e.g. an edit-capable model "
                               "for expression differentials). Its variables must be filled in .env.")
    generate.add_argument("image_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    root = Path(args.project).resolve(strict=True)
    skill = Path(__file__).resolve().parents[1]
    if args.command == "setup":
        node = shutil.which("node")
        if not node:
            raise SystemExit("Node.js is required")
        result = subprocess.run([node,str(root/"src/image-tools.mjs"),args.path,args.backend],cwd=root)
        raise SystemExit(result.returncode)
    selection = json.loads((root/"asset_tools.json").read_text(encoding="utf-8"))
    if selection["image_path"] == "builtin" and not args.backend_override:
        raise SystemExit("Use the agent's built-in image tool. This CLI cannot emulate it. No paid request was made.")
    if not args.authorize_requests:
        raise SystemExit("External requests require explicit user authorization. Then pass --authorize-requests.")
    backend = args.backend_override or selection["backend"]
    if backend not in BACKEND_VARIABLES:
        raise SystemExit("Unknown image backend: " + backend)
    vendor = skill/"vendor/ppt-master"
    sys.path.insert(0,str(vendor))
    from config import load_prefixed_env_file
    old = Path.cwd()
    try:
        os.chdir(root)
        load_prefixed_env_file(("IMAGE_","OPENAI_","GEMINI_","MINIMAX_","QWEN_",
                                "ZHIPU_","VOLCENGINE_","LAS_","TENCENT_","TOKENHUB_",
                                "SILICONFLOW_","OPENROUTER_","REPLICATE_","FAL_"))
    finally:
        os.chdir(old)
    variables=selection.get("configuration_variables") if backend == selection["backend"] else BACKEND_VARIABLES[backend]
    if not variables:
        raise SystemExit("Re-select the external image tool to create its configuration contract.")
    missing=[name for name in variables.values() if not os.environ.get(name,"").strip()]
    if missing:
        raise SystemExit("Fill these variables locally before requests: "+", ".join(missing))
    # Capture provider logs and redact configured secrets before displaying anything.
    secrets = [value for key,value in os.environ.items()
               if re.search(r"(API_KEY|API_TOKEN|TOKENHUB_API_KEY|FAL_KEY)$",key) and len(value)>3]
    image_args = args.image_args[1:] if args.image_args[:1] == ["--"] else args.image_args
    result = subprocess.run([sys.executable,str(vendor/"image_gen.py"),"--backend",backend,*image_args],
                            cwd=root,capture_output=True,text=True,encoding="utf-8",errors="replace")
    output = result.stdout + result.stderr
    for secret in secrets:
        output = output.replace(secret,"[REDACTED]")
    print(output,end="")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
