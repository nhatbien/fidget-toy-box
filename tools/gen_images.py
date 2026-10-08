#!/usr/bin/env python3
"""Generate game art with Codex CLI's built-in image generation tool.

Usage: python3 tools/gen_images.py BATCH [BATCH ...]   (batches defined in image_prompts.json)
       python3 tools/gen_images.py --only NAME [NAME ...]  (regenerate specific images)
Raw PNGs land in art_src/<name>.png; logs in art_src/logs/.
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art_src"
LOGS = ART / "logs"
MODEL = "gpt-5.6-sol"


def build_prompt(items, style):
    lines = [
        "You are generating game art. Use your built-in image generation tool (image_gen).",
        "Generate each image below with ONE image generation call, then copy the resulting PNG",
        "from wherever the tool stored it into the current working directory using the exact",
        "file name given. Do not create, edit or delete any other files.",
        "",
    ]
    for i, it in enumerate(items, 1):
        bg = style if it["transparent"] else (
            "Art style: premium casual mobile game art, glossy stylized 3D render, "
            "vibrant saturated colors, soft warm lighting.")
        if it["name"] in ("bg_wood",):
            bg = ""
        lines += [
            f"--- Image {i}: save as {it['name']}.png ---",
            f"Size / aspect: {it['size']}" + (" with a TRANSPARENT background (real alpha channel)" if it["transparent"] else " (opaque)"),
            f"Subject: {it['prompt']}",
            bg,
            "",
        ]
    lines += [
        "After all images are saved, run python3 with PIL to print name, size and mode of each saved",
        "file. For images that must be transparent: if the mode is not RGBA or the corners are not",
        "transparent, regenerate that one image once, asking the tool explicitly for a transparent",
        "background, and overwrite the file. Finally print DONE.",
    ]
    return "\n".join(lines)


def run_batch(label, items, style):
    prompt = build_prompt(items, style)
    log = LOGS / f"{label}.log"
    cmd = [
        "codex", "exec", "-m", MODEL, "--enable", "image_generation",
        "--skip-git-repo-check", "-s", "workspace-write", "-C", str(ART), prompt,
    ]
    with open(log, "w") as f:
        r = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
    missing = [it["name"] for it in items if not (ART / f"{it['name']}.png").exists()]
    return label, r.returncode, missing


def main():
    cfg = json.loads((ROOT / "tools" / "image_prompts.json").read_text())
    LOGS.mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    jobs = []
    if args and args[0] == "--only":
        want = set(args[1:])
        for items in cfg["batches"].values():
            for it in items:
                if it["name"] in want:
                    jobs.append((f"only_{it['name']}", [it]))
    else:
        for b in args or cfg["batches"].keys():
            jobs.append((b, cfg["batches"][b]))
    with ThreadPoolExecutor(max_workers=len(jobs) or 1) as ex:
        for label, code, missing in ex.map(lambda j: run_batch(j[0], j[1], cfg["style_icon"]), jobs):
            print(f"[{label}] exit={code} missing={missing or 'none'}", flush=True)


if __name__ == "__main__":
    main()
