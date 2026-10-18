"""Video Master's standalone stdout adapter for vendored image components.

This is not PPT Master's official-distribution bootstrap or transcript logger.
Upstream adapter attribution is retained in this folder's LICENSE.
"""
import sys


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
