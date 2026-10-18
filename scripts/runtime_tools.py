"""Resolve a portable npm argv without passing shell-built command strings."""
from pathlib import Path
import shutil


def npm_command(node: str) -> list[str]:
    discovered = shutil.which("npm")
    if discovered:
        resolved = Path(discovered).resolve()
        if resolved.suffix.lower() == ".js":
            return [node, str(resolved)]
        if resolved.suffix.lower() not in {".cmd", ".bat", ".ps1"}:
            return [discovered]
        # Windows npm wrappers are not native executables; run their JS entrypoint.
        cli = resolved.parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
        if cli.is_file():
            return [node, str(cli)]
    cli = Path(node).resolve().parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
    if cli.is_file():
        return [node, str(cli)]
    raise RuntimeError(
        "Cannot locate npm on PATH or beside Node.js. Install npm or use the "
        "manual project initialization and npm install workflow."
    )
