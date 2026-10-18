#!/usr/bin/env python3
"""Create a studio/product/report project from an agent-authored program."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
from runtime_tools import npm_command


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--draft-only",action="store_true")
    parser.add_argument("--authorize-tts",action="store_true",help="User-authorized paid MiniMax synthesis")
    parser.add_argument("--env-file",help="Existing private env file to copy into this NEW project")
    args=parser.parse_args()
    source=Path(args.input).resolve(strict=True)
    program=json.loads(source.read_text(encoding="utf-8-sig"))
    target=Path(args.output).resolve()
    skill=Path(__file__).resolve().parents[1]
    node=shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required")
    try:
        npm=npm_command(node)
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    subprocess.run([sys.executable,str(skill/"scripts/init_video_project.py"),str(target)],check=True)
    if args.env_file:
        env=Path(args.env_file).resolve(strict=True)
        if (target/".env").exists():
            raise SystemExit("Refusing to overwrite existing .env")
        shutil.copy2(env,target/".env")
    def copy_media(value):
        original=(source.parent/value).resolve(strict=True)
        name=f"assets/inputs/{len(copied):03d}{original.suffix.lower()}"
        destination=target/name
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(original,destination)
        copied.append(name)
        return name
    copied=[]
    if program.get("background"):
        program["background"]=copy_media(program["background"])
    if program.get("desk"):
        program["desk"]=copy_media(program["desk"])
    for host in program.get("hosts",[]):
        host["expressions"]={key:copy_media(value) for key,value in host.get("expressions",{}).items()}
    for item in program.get("lines",[])+program.get("pages",[]):
        if item.get("audio"):
            item["audio"]=copy_media(item["audio"])
        if item.get("media"):
            item["media"]["src"]=copy_media(item["media"]["src"])
    if program.get("music",{}).get("src"):
        program["music"]["src"]=copy_media(program["music"]["src"])
    (target/"program.json").write_text(json.dumps(program,ensure_ascii=False,indent=2),encoding="utf-8")
    def run(*command):
        subprocess.run(list(command),cwd=target,check=True)
    run(*npm,"install","--no-audit","--no-fund")
    run(node,"node_modules/playwright/cli.js","install","chromium")
    run(node,"src/create-program.mjs","--input","program.json",*(["--authorize-tts"] if args.authorize_tts else []))
    run(node,"src/validate.mjs")
    if not args.draft_only:
        run(node,"src/render.mjs","--output","delivery/final.mp4")
    print(f"Project: {target}")


if __name__=="__main__":
    main()
