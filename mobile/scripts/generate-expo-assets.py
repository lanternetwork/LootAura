#!/usr/bin/env python3
"""Regenerate derived Expo assets from mobile/assets/icon.png."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parents[1] / "assets"
ICON = ASSETS / "icon.png"
BRAND_BG = (58, 34, 104, 255)  # #3A2268


def save_opaque(path: Path, size: int, source: Image.Image) -> None:
    resized = source.resize((size, size), Image.Resampling.LANCZOS)
    if resized.mode != "RGBA":
        resized = resized.convert("RGBA")
    background = Image.new("RGBA", (size, size), BRAND_BG + (255,))
    background.alpha_composite(resized)
    if path.name == "adaptive-icon.png":
        resized.save(path, format="PNG", optimize=True)
    else:
        background.convert("RGB").save(path, format="PNG", optimize=True)


def main() -> int:
    if not ICON.is_file():
        print(
            "Missing mobile/assets/icon.png. Add a 1024x1024 brand icon first "
            "(see assets/ICON_REQUIREMENTS.md).",
            file=sys.stderr,
        )
        return 1

    source = Image.open(ICON)
    ASSETS.mkdir(parents=True, exist_ok=True)
    save_opaque(ASSETS / "icon.png", 1024, source)
    save_opaque(ASSETS / "adaptive-icon.png", 1024, source)
    save_opaque(ASSETS / "splash.png", 2048, source)
    save_opaque(ASSETS / "favicon.png", 48, source)
    print("Regenerated mobile/assets icon, adaptive-icon, splash, favicon")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
