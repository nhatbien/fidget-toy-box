#!/usr/bin/env python3
"""Marketing App Store screenshots: Codex background + real gameplay in a device frame + headline.

Inputs:  art_src/promo/bg_<n>.png (Codex), store/appstore/{iphone_6_3,ipad_13}/<nn>_<toy>.jpg (real captures)
Outputs: store/appstore_promo/{iphone_6_3,ipad_13}/<nn>_<toy>.png  (1206x2622 and 2064x2752)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "art_src" / "fonts" / "Baloo2.ttf"
SLIDES = [
    ("01_menu", "12 Fidget Toys", "in One Cozy Box"),
    ("02_popit", "Pop Every", "Bubble"),
    ("03_spinner", "Spin & Beat", "Your Record"),
    ("04_bubblewrap", "Endless", "Bubble Wrap"),
    ("05_slime", "Squish &", "Stretch Slime"),
    ("06_xylophone", "Play & Learn", "Little Songs"),
    ("07_sand", "Slice Rainbow", "Kinetic Sand"),
    ("08_drums", "Make Your", "Own Beats"),
]
DEVICES = {
    # canvas size, device width fraction, bezel, corner radius fraction, island
    "iphone_6_3": ((1206, 2622), 0.78, 30, 0.12, True),
    "ipad_13": ((2064, 2752), 0.74, 44, 0.05, False),
}


def font(size, weight="ExtraBold"):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_name(weight)
    return f


def cover(img, size):
    w, h = size
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=255)
    return m


def draw_headline(canvas, lines, top, max_w):
    d = ImageDraw.Draw(canvas)
    W = canvas.width
    size = int(W * (0.105 if canvas.width < 1500 else 0.075))
    y = top
    for i, text in enumerate(lines):
        f = font(size)
        while d.textlength(text, font=f) > max_w and size > 40:
            size -= 4
            f = font(size)
        tw = d.textlength(text, font=f)
        x = (W - tw) / 2
        stroke = max(6, size // 11)
        # soft shadow
        sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((x, y + size * 0.08), text, font=f, fill=(40, 10, 0, 150), stroke_width=stroke, stroke_fill=(40, 10, 0, 150))
        canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.06)))
        fill = (255, 255, 255) if i == 0 else (255, 232, 120)
        d.text((x, y), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=(70, 30, 10))
        y += int(size * 0.98)
    return y


def make(device, slide, bg_path, shot_path, out_path):
    (W, H), frac, bezel, rfrac, island = DEVICES[device]
    canvas = cover(Image.open(bg_path).convert("RGB"), (W, H)).convert("RGBA")
    bottom_text = draw_headline(canvas, slide[1:], int(H * 0.035), W * 0.9)

    shot = Image.open(shot_path).convert("RGB")
    dev_w = int(W * frac)
    scr_w = dev_w - bezel * 2
    scr_h = round(scr_w * shot.height / shot.width)
    dev_h = scr_h + bezel * 2
    top = bottom_text + int(H * 0.025)
    if top + dev_h > H - int(H * 0.02):  # keep it on the canvas; bottom may bleed slightly for iPhone
        top = H - int(H * 0.02) - dev_h
    left = (W - dev_w) // 2
    R = int(dev_w * rfrac)

    # drop shadow
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([left, top + 30, left + dev_w, top + dev_h + 30], R, fill=(30, 10, 40, 140))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(40)))
    # bezel with a thin metallic rim
    body = Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle([0, 0, dev_w - 1, dev_h - 1], R, fill=(170, 170, 180, 255))
    bd.rounded_rectangle([5, 5, dev_w - 6, dev_h - 6], R - 5, fill=(18, 18, 22, 255))
    scr = shot.resize((scr_w, scr_h), Image.LANCZOS)
    body.paste(scr, (bezel, bezel), rounded_mask((scr_w, scr_h), max(8, R - bezel)))
    if island:
        iw, ih = int(scr_w * 0.3), int(scr_w * 0.085)
        bd.rounded_rectangle([(dev_w - iw) // 2, bezel + int(ih * 0.45), (dev_w + iw) // 2, bezel + int(ih * 1.45)], ih // 2, fill=(0, 0, 0, 255))
    canvas.alpha_composite(body, (left, top))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, optimize=True)
    print(out_path.relative_to(ROOT), canvas.size)


def main():
    for device in DEVICES:
        for i, slide in enumerate(SLIDES, 1):
            make(device, slide, ROOT / "art_src" / "promo" / f"bg_{i}.png",
                 ROOT / "store" / "appstore" / device / f"{slide[0]}.jpg",
                 ROOT / "store" / "appstore_promo" / device / f"{slide[0]}.png")


if __name__ == "__main__":
    main()
