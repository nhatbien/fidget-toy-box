#!/usr/bin/env python3
"""Turn raw Codex art (art_src/*.png) into small in-game WebP files (assets/img/).

- Toy thumbnails: cropped to their visible pixels, bottom-aligned on a square canvas so
  they sit on the menu shelf, resized to 512px.
- Wood texture: 512px tile.
- Logo: cropped to visible pixels, max 1024px wide.
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art_src"
OUT = ROOT / "assets" / "img"
TOYS = ["popit", "spinner", "bubblewrap", "slime", "switches", "xylophone",
        "sand", "balloons", "drums", "spinart", "zen", "cradle"]


def webp(img, dest, q=82):
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        img.save(tmp.name)
        subprocess.run(["cwebp", "-quiet", "-q", str(q), "-alpha_q", "90", "-m", "6",
                        tmp.name, "-o", str(dest)], check=True)
    print(f"{dest.name:24s} {img.size} {dest.stat().st_size // 1024} KB")


def visible_bbox(img, threshold=12):
    a = img.getchannel("A").point(lambda v: 255 if v > threshold else 0)
    return a.getbbox()


def thumb(name, size=512, pad=0.04):
    img = Image.open(SRC / f"thumb_{name}.png").convert("RGBA")
    img = img.crop(visible_bbox(img))
    inner = int(size * (1 - 2 * pad))
    scale = inner / max(img.size)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - img.width) // 2
    y = size - int(size * pad * 0.5) - img.height  # bottom aligned
    canvas.alpha_composite(img, (x, y))
    webp(canvas, OUT / f"thumb_{name}.webp")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TOYS:
        thumb(t)
    wood = Image.open(SRC / "bg_wood.png").convert("RGB").resize((512, 512), Image.LANCZOS)
    webp(wood, OUT / "bg_wood.webp", q=78)
    logo = Image.open(SRC / "logo.png").convert("RGBA")
    logo = logo.crop(visible_bbox(logo))
    if logo.width > 1024:
        logo = logo.resize((1024, round(logo.height * 1024 / logo.width)), Image.LANCZOS)
    webp(logo, OUT / "logo.webp", q=85)


if __name__ == "__main__":
    main()
