#!/usr/bin/env python3
"""Store / portal images from the Codex key art (art_src/) → store/.

  store/youtube/   thumbnails WITHOUT title text (Playables forbids branding/logos in thumbnails)
  store/titled/    the same crops with the game logo, for itch.io, CrazyGames, GameDistribution…
  store/icon_*.png square icons
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art_src"
OUT = ROOT / "store"


def crop_to(img, ratio, anchor_y=0.5):
    w, h = img.size
    if w / h > ratio:
        nw = round(h * ratio)
        x = (w - nw) // 2
        return img.crop((x, 0, x + nw, h))
    nh = round(w / ratio)
    y = round((h - nh) * anchor_y)
    return img.crop((0, y, w, y + nh))


def fit(img, size, anchor_y=0.5):
    return crop_to(img, size[0] / size[1], anchor_y).resize(size, Image.LANCZOS)


def add_logo(img, logo, width_frac, top_frac):
    img = img.convert("RGBA")
    lw = round(img.width * width_frac)
    lg = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    x = (img.width - lg.width) // 2
    y = round(img.height * top_frac)
    # soft dark glow behind the logo so it reads on any background
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    alpha = lg.getchannel("A").point(lambda a: int(a * 0.55))
    blob = Image.new("RGBA", lg.size, (40, 18, 5, 255))
    blob.putalpha(alpha)
    shadow.alpha_composite(blob, (x, y + max(4, lg.height // 40)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(6, lg.height // 18)))
    img.alpha_composite(shadow)
    img.alpha_composite(lg, (x, y))
    return img.convert("RGB")


def save(img, path, quality=90):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".jpg":
        img.convert("RGB").save(path, quality=quality, optimize=True, progressive=True)
    else:
        img.save(path, optimize=True)
    print(f"{str(path.relative_to(ROOT)):42s} {img.size[0]}x{img.size[1]}  {path.stat().st_size // 1024} KB")


def main():
    land = Image.open(SRC / "cover_land.png").convert("RGB")
    port = Image.open(SRC / "cover_port.png").convert("RGB")
    icon = Image.open(SRC / "icon.png").convert("RGB")
    logo = Image.open(SRC / "logo.png").convert("RGBA")
    logo = logo.crop(logo.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox())

    sizes = {
        "landscape_1920x1080": (land, (1920, 1080), 0.45, (0.42, 0.03)),
        "landscape_1280x720": (land, (1280, 720), 0.45, (0.42, 0.03)),
        "landscape_800x450": (land, (800, 450), 0.45, (0.42, 0.03)),
        "portrait_1080x1920": (port, (1080, 1920), 0.5, (0.86, 0.035)),
        "portrait_800x1200": (port, (800, 1200), 0.4, (0.86, 0.03)),
        "square_1080x1080": (land, (1080, 1080), 0.5, (0.64, 0.025)),
        "square_800x800": (land, (800, 800), 0.5, (0.64, 0.025)),
        "itch_cover_630x500": (land, (630, 500), 0.5, (0.64, 0.025)),
    }
    for name, (src, size, ay, (lw, ly)) in sizes.items():
        base = fit(src, size, ay)
        save(base, OUT / "youtube" / f"{name}.jpg")
        save(add_logo(base, logo, lw, ly), OUT / "titled" / f"{name}.jpg")
    for s in (1024, 512, 256):
        save(icon.resize((s, s), Image.LANCZOS), OUT / f"icon_{s}.png")


if __name__ == "__main__":
    main()
