#!/usr/bin/env python3
"""Initialize the optional HTML rendering backend in a new project; no global installs."""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess

SKILL = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('target', type=Path)
    parser.add_argument('--name', default='code-mv')
    parser.add_argument('--duration', type=float, default=10)
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--install-browser', action='store_true')
    args = parser.parse_args()
    root = args.target.resolve()
    if root.exists() and any(root.iterdir()):
        parser.error('Target must be new or empty; existing projects are never reinitialized')
    if not math.isfinite(args.duration) or args.duration <= 0 or args.fps <= 0 or min(args.width, args.height) <= 0 or args.width % 2 or args.height % 2:
        parser.error('Use positive duration/fps and positive even dimensions')
    root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(SKILL / 'assets/multiplane-template', root, dirs_exist_ok=True)
    tools = root / 'tools'
    tools.mkdir()
    shutil.copy2(SKILL / 'engine/multiplane/runner.mjs', tools / 'multiplane.mjs')
    policy = tools / 'timeline'
    policy.mkdir()
    for name in ('track-state.js', 'audio-mix.js', 'render-window.mjs'):
        shutil.copy2(SKILL / 'assets/starter-project/src' / name, policy / name)
    for name in ('video.json', 'timeline.json'):
        file = root / name
        data = json.loads(file.read_text(encoding='utf-8'))
        data.update(duration_seconds=args.duration, fps=args.fps)
        if name == 'video.json':
            data.update(name=args.name, width=args.width, height=args.height)
        file.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    shot = root / 'shot.html'
    shot.write_text(shot.read_text(encoding='utf-8').replace('width:1920px;height:1080px',
                    f'width:{args.width}px;height:{args.height}px'), encoding='utf-8')
    env = os.environ.copy()
    for key, folder in {'TEMP':'temp', 'TMP':'temp', 'MULTIPLANE_HOME':'multiplane',
                        'PLAYWRIGHT_BROWSERS_PATH':'browsers', 'npm_config_cache':'npm-cache'}.items():
        env[key] = (env.get('VIDEO_MASTER_TEMP') or str(root / '.runtime' / folder)) if key in ('TEMP', 'TMP') else env.get(key) or str(root / '.runtime' / folder)
        if env[key] != '0':
            Path(env[key]).mkdir(parents=True, exist_ok=True)
    env['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD'] = '1'
    if args.install or args.install_browser:
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise SystemExit('Node >=24 and npm are required; source project remains initialized')
        subprocess.run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=root, env=env, check=True)
    if args.install_browser:
        node = shutil.which('node')
        subprocess.run([node, str(root / 'node_modules/playwright/cli.js'), 'install', 'chromium'], cwd=root, env=env, check=True)
    print(json.dumps({'target':str(root), 'backend':'multiplane', 'version':'0.3.13',
                      'next':['node tools/multiplane.mjs doctor', 'node tools/multiplane.mjs stills --at 1,5,9',
                              'node tools/multiplane.mjs verify', 'node tools/multiplane.mjs render'],
                      'runtime_environment':{k:env[k] for k in ('MULTIPLANE_HOME','PLAYWRIGHT_BROWSERS_PATH','TEMP','npm_config_cache')}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
