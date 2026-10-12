"""Etapa 2: gera 3 versões do primeiro quadro (1080x1920) com o logo como referência.

Uso: python3 reels/01_frames.py [--n 3] [--model fal-ai/nano-banana-pro/edit]
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

import fal

ROOT = fal.ROOT
# referência para a IA: logo oficial sobre fundo escuro (o PNG transparente tem texto branco)
LOGO = ROOT / "assets" / "logo-engrenza-original.jpg"
OUT = ROOT / "out" / "frames"

PROMPT = (
    "Vertical 9:16 photorealistic still from a smartphone video filmed from the passenger seat "
    "of a car driving on a Marginal highway in São Paulo, Brazil, on an overcast grey day, "
    "flat soft daylight, slight windshield reflection, realistic phone-camera look, mild motion blur. "
    "Ahead in our lane, a white box truck with large bold black letters \"SUA EMPRESA\" on the side "
    "of its cargo box is dangerously tilted, balancing on its two left wheels, its right wheels in the air. "
    "In the right lane, a matte black box truck is pulling in, approaching the white truck. "
    "The matte black truck's cargo box carries the company logo from the reference image, reproduced exactly: "
    "the symbol of three slanted parallelogram bars (top and bottom off-white, middle one blue) on the left, "
    "the bold white wordmark \"ENGRENZA\" and the smaller line \"MARKETING INDUSTRIAL\" below it, "
    "same proportions, colors and letterforms, painted large on the black cargo box. "
    "Both texts sharp and legible. Concrete median, other distant cars, urban skyline and river embankment. "
    "No people visible, no crash, no debris."
)


def to_1080x1920(src, dst):
    im = Image.open(src).convert("RGB")
    im = ImageOps.fit(im, (1080, 1920), Image.LANCZOS, centering=(0.5, 0.5))
    im.save(dst, quality=95)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--model", default="fal-ai/nano-banana-pro/edit")
    a = ap.parse_args()
    if not LOGO.exists():
        raise SystemExit(f"Logo não encontrado: {LOGO}")
    OUT.mkdir(parents=True, exist_ok=True)

    res = fal.run(a.model, {
        "prompt": PROMPT,
        "image_urls": [fal.data_uri(LOGO)],
        "num_images": a.n,
        "aspect_ratio": "9:16",
        "resolution": "2K",
        "output_format": "png",
    })
    (OUT / "response.json").write_text(json.dumps(res, indent=2, ensure_ascii=False))
    for i, img in enumerate(res["images"], 1):
        raw = fal.download(img["url"], OUT / f"raw-{i}.png")
        to_1080x1920(raw, OUT / f"frame-{i}.jpg")
        print(f"  -> out/frames/frame-{i}.jpg")


if __name__ == "__main__":
    main()
