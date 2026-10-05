#!/usr/bin/env python3
"""Ensure landing-page road photos match Swedish högertrafik (drive on the right).

AI/stock images are often mirrored or generated for left-hand traffic. This script
applies the corrections we expect for korpasset.se:

- country-road.jpg, roundabout.jpg: horizontal flip (exterior, no readable text)
- residential-street.jpg: exterior bostadsgata (LHD car in the right lane)

Re-run after replacing any file under app/public/images/landing/.
Requires: pip install pillow
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "app" / "public" / "images" / "landing"
SOURCE = LANDING / "_source"


def flip_horizontal(path: Path) -> None:
    image = Image.open(path)
    image.transpose(Image.FLIP_LEFT_RIGHT).save(path, quality=92, optimize=True)


def copy_source(name: str) -> None:
    src = SOURCE / name
    if not src.is_file():
        raise SystemExit(f"Missing {src}")
    Image.open(src).save(LANDING / name, quality=92, optimize=True)


def main() -> None:
    # Warm AI exports often show left-hand traffic; flip exterior shots without text.
    copy_source("country-road.jpg")
    flip_horizontal(LANDING / "country-road.jpg")

    # Driver POV roundabout: store the raw export, then flip once for högertrafik.
    copy_source("roundabout.jpg")
    flip_horizontal(LANDING / "roundabout.jpg")

    copy_source("residential-street.jpg")
    print("Landing traffic photos updated.")


if __name__ == "__main__":
    main()
