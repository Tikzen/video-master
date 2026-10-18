"""Video Master adapter for PPT Master's image runner; project-local env only."""
import os
from pathlib import Path


def resolve_env_path() -> Path:
    return Path.cwd() / ".env"


def load_prefixed_env_file(prefixes, *, deprecated_keys=None):
    from dotenv import dotenv_values
    path = resolve_env_path()
    if not path.is_file():
        return None
    for key, value in dotenv_values(path).items():
        if not key.startswith(prefixes):
            continue
        if key in (deprecated_keys or {}):
            raise ValueError(f"Unsupported environment variable: {key}")
        if value is not None:
            os.environ.setdefault(key, value)
    return path
