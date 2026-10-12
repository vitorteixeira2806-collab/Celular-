"""Etapa 3: gera takes image-to-video de 8s, 9:16, a partir do quadro aprovado.

Uso: python3 reels/02_takes.py out/frames/frame-2.jpg [--n 3] [--model fal-ai/veo3.1/image-to-video]
"""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fal

OUT = fal.ROOT / "out" / "takes"

PROMPT = (
    "0–3s the white truck wobbles on two wheels about to tip over; 3–6s the black Engrenza truck pulls "
    "alongside, gently leans its side against it and pushes it back, the white truck drops onto four wheels "
    "with a realistic suspension bounce; 6–8s both trucks drive side by side, stable. Handheld smartphone "
    "footage, real physics, heavy weight, no crash, no people, text on trucks stays sharp. Audio: highway "
    "ambience, engine rumble, soft metal creak on contact."
)


def payload(model, image):
    if "kling" in model:
        return {"prompt": PROMPT, "start_image_url": image, "duration": "8", "generate_audio": True}
    return {
        "prompt": PROMPT,
        "image_url": image,
        "aspect_ratio": "9:16",
        "duration": "8s",
        "resolution": "1080p",
        "generate_audio": True,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frame")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--model", default="fal-ai/veo3.1/image-to-video")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    image = fal.data_uri(Path(a.frame))

    def one(i):
        res = fal.run(a.model, payload(a.model, image), timeout=1800)
        (OUT / f"take-{i}.json").write_text(json.dumps(res, indent=2, ensure_ascii=False))
        dst = fal.download(res["video"]["url"], OUT / f"take-{i}.mp4")
        print(f"  -> {dst.relative_to(fal.ROOT)}", flush=True)

    with ThreadPoolExecutor(a.n) as ex:
        list(ex.map(one, range(1, a.n + 1)))


if __name__ == "__main__":
    main()
