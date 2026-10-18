#!/usr/bin/env python3
"""Start, verify and open the portable project WebUI before asking for choices."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import webbrowser

from runtime_tools import npm_command


SKILL_DIR = Path(__file__).resolve().parents[1]
PANELS = ("images", "voice", "music", "quality", "review", "production", "delivery")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


HTTP = build_opener(ProxyHandler({}), NoRedirect())


def read_json(file: Path):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def local_url(url: str) -> str:
    parsed = urlparse(url)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1"
            or parsed.username or parsed.password or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or not parsed.port):
        raise ValueError("Workbench receipts must use a plain loopback HTTP URL")
    return f"http://127.0.0.1:{parsed.port}"


def request_json(url: str, route: str, payload=None, timeout=3):
    url = local_url(url) + route
    request = Request(url, data=None if payload is None else json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json"})
    try:
        with HTTP.open(request, timeout=timeout) as response:
            if response.url != url:
                raise RuntimeError("Workbench redirected the request; refusing to follow it")
            return json.loads(response.read(2_000_000).decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read(10000).decode("utf-8")).get("error", "request failed")
        except (ValueError, AttributeError):
            detail = "request failed (or refused redirect)"
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from None


def health(url: str, root: Path):
    try:
        result = request_json(url, "/api/health", timeout=0.5)
        if (isinstance(result, dict) and result.get("service") == "video-master"
                and result.get("status") == "ok" and isinstance(result.get("root"), str)
                and Path(result.get("root", "")).resolve() == root
                and not result.get("read_only", False)):
            return result
    except (OSError, RuntimeError, ValueError):
        pass
    return None


def checked_editor_dir(root: Path) -> Path:
    folder = root / ".editor"
    if not folder.resolve().is_relative_to(root):
        raise RuntimeError("Project .editor resolves outside the project")
    folder.mkdir(exist_ok=True)
    return folder


@contextmanager
def launch_lock(folder: Path):
    file = folder / "workbench-launch.lock"
    if not file.resolve().is_relative_to(folder.resolve()):
        raise RuntimeError("Workbench lock resolves outside the project")
    with file.open("a+b") as handle:
        handle.seek(0, os.SEEK_END)
        if not handle.tell():
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise RuntimeError("Another launcher is starting this project; retry after it finishes") from None
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def initialize(root: Path):
    if root.is_relative_to(SKILL_DIR):
        raise RuntimeError("Use a separate output project, never the installed skill directory")
    if not root.exists() or (root.is_dir() and not any(root.iterdir())):
        subprocess.run([sys.executable, str(SKILL_DIR / "scripts/init_video_project.py"), str(root)],
                       check=True, stdout=sys.stderr)
    required = ("video.json", "timeline.json", "package.json", "src/server.mjs", "src/planner.html")
    missing = [file for file in required if not (root / file).is_file()]
    if missing:
        raise RuntimeError(f"Not a compatible WebUI project: missing {', '.join(missing)}. "
                           "Preserve this project and choose a new empty output directory.")


def node_runtime(explicit: str | None) -> str:
    value = explicit or os.environ.get("VIDEO_MASTER_NODE") or shutil.which("node")
    if not value:
        raise RuntimeError("Node.js 22+ is required. Install it or provide --node / VIDEO_MASTER_NODE.")
    resolved = shutil.which(value) or value
    result = subprocess.run([resolved, "--version"], capture_output=True, text=True, timeout=15)
    if result.returncode or int(result.stdout.strip().lstrip("v").split(".")[0]) < 22:
        raise RuntimeError("Node.js 22+ is required for this project")
    return str(Path(resolved).resolve())


def dependencies(node: str, root: Path, skip_install: bool):
    probe = [node, "-e", "for (const p of ['lucide','@ffmpeg-installer/ffmpeg','ffprobe-static','playwright']) require.resolve(p)"]
    if subprocess.run(probe, cwd=root, capture_output=True, timeout=15).returncode == 0:
        return False
    if skip_install:
        raise RuntimeError("Project npm dependencies are missing; remove --skip-install or install them in this project")
    print("Installing missing project npm dependencies; Chromium is only needed later for rendering.", file=sys.stderr)
    subprocess.run([*npm_command(node), "install", "--no-audit", "--no-fund"],
                   cwd=root, check=True, stdout=sys.stderr, stderr=sys.stderr, timeout=600)
    if subprocess.run(probe, cwd=root, capture_output=True, timeout=15).returncode:
        raise RuntimeError("npm completed but required project dependencies are still missing")
    return True


def find_slot(root: Path, folder: Path, port: int | None):
    receipt_file = folder / "workbench.json"
    if not receipt_file.resolve().is_relative_to(root):
        raise RuntimeError("Workbench receipt resolves outside the project")
    try:
        receipt = read_json(receipt_file)
        url = local_url(receipt["url"])
        if (Path(receipt["root"]).resolve() == root
                and (port is None or urlparse(url).port == port)):
            current = health(url, root)
            if current:
                return urlparse(url).port, current
    except (OSError, KeyError, TypeError, ValueError):
        pass
    if port == 0:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            return probe.getsockname()[1], None
    first_free = None
    ports = [port] if port is not None else range(5179, 5199)
    for candidate in ports:
        url = f"http://127.0.0.1:{candidate}"
        current = health(url, root)
        if current:
            return candidate, current
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", candidate))
                first_free = first_free or candidate
            except OSError:
                continue
    if first_free:
        return first_free, None
    raise RuntimeError("Requested port is occupied by another service/project; choose another --port or --port 0")


def detached(command: list[str], root: Path, log):
    options = {"cwd": root, "stdin": subprocess.DEVNULL, "stdout": log, "stderr": log}
    if os.name != "nt":
        return subprocess.Popen(command, start_new_session=True, **options)
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    try:
        return subprocess.Popen(command, creationflags=flags | 0x01000000,
                                startupinfo=startup, **options)
    except OSError as exc:
        if exc.winerror not in (5, 87):
            raise
        return subprocess.Popen(command, creationflags=flags, startupinfo=startup, **options)


def start_server(node: str, root: Path, folder: Path, port: int, timeout: float):
    log_path = folder / "workbench.log"
    if not log_path.resolve().is_relative_to(root):
        raise RuntimeError("Workbench log resolves outside the project")
    with log_path.open("ab") as log:
        child = detached([node, str(root / "src/server.mjs"), "--port", str(port)], root, log)
    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise RuntimeError(f"Workbench exited {child.returncode}; inspect {log_path}")
        current = health(url, root)
        if current and current.get("pid") == child.pid and current.get("instance_id"):
            return current
        time.sleep(0.15)
    # Only this launcher's own child is terminated, never a recorded or foreign PID.
    child.terminate()
    child.wait(timeout=10)
    raise RuntimeError(f"Workbench readiness timed out; inspect {log_path}")


def save_receipt(folder: Path, root: Path, url: str, current: dict):
    target = folder / "workbench.json"
    if not target.resolve().is_relative_to(root):
        raise RuntimeError("Workbench receipt resolves outside the project")
    temporary = folder / f"workbench-{os.getpid()}.tmp"
    with temporary.open("x", encoding="utf-8") as file:
        json.dump({"service": "video-master", "root": str(root), "url": url,
                   "pid": current.get("pid"), "instance_id": current.get("instance_id"),
                   "log": str(folder / "workbench.log")}, file, indent=2)
    os.replace(temporary, target)


def publish(url: str, file: Path):
    proposal = read_json(file)
    if not isinstance(proposal, dict) or proposal.get("stage") not in ("stage1", "stage2"):
        raise RuntimeError("Proposal must be a stage1/stage2 JSON object authored for the current request")
    stage = proposal["stage"]
    flow = request_json(url, "/api/workflow")
    if stage == "stage2":
        if not flow["confirmations"].get("stage1") or not flow["confirmations"].get("stage1_hash"):
            raise RuntimeError("Stage 1 must actually be confirmed before publishing Stage 2")
        proposal["stage1_hash"] = flow["confirmations"]["stage1_hash"]
    old = {key: value for key, value in flow[stage].items() if key != "proposal_hash"}
    if proposal != old:
        request_json(url, "/api/proposals", {"proposal": proposal, "expected_hash": flow[stage]["proposal_hash"]})
    return stage


def verify_round(url: str, stage: str):
    flow = request_json(url, "/api/workflow")
    proposal = flow[stage]
    if stage == "stage2":
        if not flow["confirmations"].get("stage1") or len(proposal.get("candidates", [])) != 3:
            raise RuntimeError("Stage 2 needs the actual Stage 1 receipt and three authored treatments")
        if proposal.get("stage1_hash") != flow["confirmations"]["stage1_hash"]:
            raise RuntimeError("Stage 2 is stale; publish treatments bound to the current Stage 1 receipt")
    else:
        fields = proposal.get("fields", {})
        choices = [field for key, field in fields.items()
                   if key in ("genre", "topic", "audience", "purpose", "style")]
        known_context = isinstance(proposal.get("context"), dict) and bool(proposal["context"])
        if (not choices and not known_context) or any(len(field.get("choices", [])) != 3 for field in choices):
            raise RuntimeError("Publish a contextual Stage 1 proposal with three candidates per displayed choice "
                               "before opening; starter defaults are not the user's planning page")
    return {"stage": stage, "proposal_hash": proposal["proposal_hash"],
            "confirmed": bool(flow["confirmations"].get(stage))}


def open_browser(url: str, suppressed: bool):
    if suppressed:
        return {"attempted": False, "accepted": False, "reason": "--no-browser; use a host opener or give the URL"}
    if sys.platform not in ("win32", "darwin") and not (
            os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
            or os.environ.get("BROWSER") or "microsoft" in platform.release().lower()):
        return {"attempted": False, "accepted": False, "reason": "No desktop display; provide the URL/port forward"}
    try:
        if "microsoft" in platform.release().lower() and not os.environ.get("BROWSER"):
            powershell = shutil.which("powershell.exe")
            if not powershell:
                candidate = Path("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe")
                powershell = str(candidate) if candidate.is_file() else None
            if not powershell:
                raise OSError("WSL browser opening requires Windows PowerShell or an explicit BROWSER")
            import base64
            encoded = base64.b64encode(url.encode("utf-8")).decode("ascii")
            script = ("$ErrorActionPreference='Stop'; $u=[Text.Encoding]::UTF8.GetString("
                      f"[Convert]::FromBase64String('{encoded}')); Start-Process -FilePath $u")
            result = subprocess.run([powershell, "-NoProfile", "-NonInteractive", "-EncodedCommand",
                                     base64.b64encode(script.encode("utf-16le")).decode("ascii")],
                                    capture_output=True, timeout=15)
            accepted = result.returncode == 0
        else:
            accepted = bool(webbrowser.open(url))
        return {"attempted": True, "accepted": accepted,
                "reason": "OS dispatch only, not proof of page visibility" if accepted else "No browser accepted the URL"}
    except (OSError, subprocess.TimeoutExpired, webbrowser.Error) as exc:
        return {"attempted": True, "accepted": False, "reason": str(exc)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--proposal", help="Agent-authored contextual stage1/stage2 JSON; published before opening")
    surface = parser.add_mutually_exclusive_group()
    surface.add_argument("--round", choices=("stage1", "stage2"))
    surface.add_argument("--panel", choices=PANELS)
    surface.add_argument("--editor", action="store_true")
    parser.add_argument("--port", type=int, help="Exact port, or 0 for an OS-selected free port")
    parser.add_argument("--node", help="Node.js executable; otherwise VIDEO_MASTER_NODE or PATH")
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--no-browser", action="store_true", help="Keep WebUI; open with host tool or publish the URL")
    parser.add_argument("--timeout", type=float, default=30, help="Server readiness timeout in seconds")
    args = parser.parse_args()
    if args.port is not None and not 0 <= args.port <= 65535:
        parser.error("--port must be 0..65535")
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be greater than zero and at most 300 seconds")
    if args.proposal and (args.panel or args.editor):
        parser.error("--proposal opens its choice round, not an unrelated panel/editor")
    if args.proposal and args.round:
        proposal = read_json(Path(args.proposal).expanduser().resolve())
        if not isinstance(proposal, dict) or proposal.get("stage") != args.round:
            parser.error("--round does not match the proposal; no project changes were made")
    root = Path(args.project).expanduser().resolve()
    initialize(root)
    folder = checked_editor_dir(root)
    with launch_lock(folder):
        port, current = find_slot(root, folder, args.port)
        reused = current is not None
        installed = False
        if not current:
            node = node_runtime(args.node)
            installed = dependencies(node, root, args.skip_install)
            current = start_server(node, root, folder, port, args.timeout)
        url = f"http://127.0.0.1:{port}"
        save_receipt(folder, root, url, current)
        stage = publish(url, Path(args.proposal).expanduser().resolve()) if args.proposal else None
        if stage and args.round and stage != args.round:
            raise RuntimeError("--round does not match the published proposal")
        round_name = stage or args.round or (None if args.panel or args.editor else "stage1")
        state = verify_round(url, round_name) if round_name else None
        page = (url + f"/create?round={round_name}" if round_name else
                url + f"/create?panel={args.panel}" if args.panel else url + "/")
        # Serve the page before asking an OS or agent-host browser to open it.
        with HTTP.open(page, timeout=3) as response:
            if response.url != page or response.status != 200:
                raise RuntimeError("The selected WebUI page is not reachable")
        browser = open_browser(page, args.no_browser)
    print(json.dumps({"status": "ready", "root": str(root), "url": url, "page_url": page,
                      "reused": reused, "installed_dependencies": installed,
                      "pid": current.get("pid"), "round": state, "browser": browser,
                      "receipt": str(folder / "workbench.json"), "log": str(folder / "workbench.log")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, TypeError, subprocess.SubprocessError) as exc:
        print(f"Workbench startup failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
