#!/usr/bin/env python3
"""Package the portable skill, excluding credentials and generated runtime data."""
import argparse
from pathlib import Path
import zipfile


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    output=Path(args.output).resolve()
    if output.exists():
        raise SystemExit("Refusing to overwrite an existing package")
    output.parent.mkdir(parents=True,exist_ok=True)
    excluded={"node_modules","__pycache__", ".editor", ".git","delivery","renders","validation","voice-samples",".asr-env",".venv","cache",".motionkit",".runtime",".deps","projects"}
    omitted_files={Path("assets/starter-project/assets/catalog")/f"{genre}.png"
                   for genre in ("mv","studio","product","report")}
    omitted_files.add(Path("assets/starter-project/audio/demo-score.wav"))
    with zipfile.ZipFile(output,"x",zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(root.rglob("*")):
            if not file.is_file() or file.resolve()==output:
                continue
            relative=file.relative_to(root)
            if excluded.intersection(relative.parts) or relative in omitted_files or file.suffix==".pyc":
                continue
            if relative.parts[:2]==("assets","examples") and "audio" in relative.parts:
                continue  # generated example scores are rebuilt by `python score.py`
            if file.name.startswith(".env") and file.name!=".env.example":
                continue
            archive.write(file,Path("video-master")/relative)
    with zipfile.ZipFile(output) as archive:
        names=archive.namelist()
        assert "video-master/SKILL.md" in names
        for required in ("scripts/start_workbench.py", "scripts/agent_control.py",
                         "scripts/init_multiplane.py", "engine/multiplane/runner.mjs",
                         "references/renderers/multiplane.md", "assets/multiplane-template/shot.html", "assets/multiplane-template/preview.html",
                         "assets/multiplane-template/package.json", "assets/starter-project/src/track-state.js",
                         "references/agent-workbench.md", "references/interaction-contract.md",
                         "assets/starter-project/src/planner.html",
                         "assets/starter-project/src/planner.js",
                         "assets/starter-project/src/planner.css",
                         "assets/starter-project/src/composition.js",
                         "assets/starter-project/src/composition-transitions.js",
                         "assets/starter-project/src/mv-plan.mjs",
                         "assets/starter-project/src/motion-sfx.mjs",
                         "assets/examples/build-motion-study.mjs",
                         "assets/examples/build-material-study.mjs",
                         "references/composition-format.md",
                         "references/visual-design-playbook.md",
                         "references/motion-style-library.md",
                         "vendor/mg-styles-15/LICENSE",
                         "engine/motionkit/__init__.py", "engine/motionkit/film.py", "engine/motionkit/cli.py",
                         "engine/motionkit/fonts/Archivo-VF.ttf", "engine/motionkit/fonts/Archivo-LICENSE.txt",
                         "scripts/init_code_film.py", "assets/code-film-template/film.py",
                         "assets/examples/code-film-dian-xian-mian/film.py",
                         "assets/examples/code-film-studio-timeline/film.py",
                         "assets/examples/code-film-present-launch/film.py",
                         "references/craft/README.md", "references/motionkit-api.md",
                         "assets/starter-project/src/finish.js", "assets/starter-project/src/studio-host.js",
                         "assets/starter-project/src/studio-motion.js", "scripts/expression_sheet.py",
                         "scripts/studio_rounds.py", "assets/studio-rounds/host-source.example.json",
                         "assets/studio-rounds/source-generate.png"):
            assert f"video-master/{required}" in names, f"Missing portable WebUI file: {required}"
        assert not any(Path(name).name.startswith(".env") and Path(name).name!=".env.example" for name in names)
    print(f"{output} ({output.stat().st_size} bytes)")


if __name__=="__main__":
    main()
