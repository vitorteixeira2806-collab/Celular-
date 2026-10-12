"""Reels "tipografia cinética" da Engrenza: gancho em vídeo + cortes secos com texto gigante + loop.

Uso: python3 reels/04_kinetic.py caminho/do/gancho.mp4 [--start 0.3] [--out out/engrenza-kinetic.mp4]

Estrutura (inspirada no formato "need a website? / clean. / modern."):
  0–2,0s   gancho (trecho do vídeo, com o áudio original)
  2,0–7,2s cartelas de texto alternando fundo escuro/claro, ponto final em azul da marca
  7,2–7,9s volta ao início do gancho, para o Reels rodar em loop sem emenda
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "assets" / "fonts" / "SpaceGrotesk-Bold.ttf"
LOGO = ROOT / "assets" / "logo-engrenza.png"

W, H, FPS = 1080, 1920, 30
DARK, LIGHT, WHITE, BLUE = "#080B10", "#E6E8EB", "#FFFFFF", "#48A4EC"
HOOK, TAIL = 2.0, 0.7
MAX_W = 980          # largura útil do texto
TEXT_CY = 900        # centro vertical do texto (área segura do Reels)

# (texto, fundo, duração, mostra o logo)
CARDS = [
    ("precisa de clientes B2B?", DARK, 0.8, False),
    ("posicionamento.", LIGHT, 0.9, False),
    ("conteúdo.", DARK, 0.85, False),
    ("campanhas.", LIGHT, 0.85, False),
    ("chama no WhatsApp.", DARK, 1.8, True),
]
WORDS = [c[0] for c in CARDS[1:4]]  # palavras soltas usam o mesmo tamanho


def fit(text, max_size=170):
    size = max_size
    while size > 40:
        f = ImageFont.truetype(str(FONT), size)
        if f.getlength(text) <= MAX_W:
            return f
        size -= 2
    return ImageFont.truetype(str(FONT), size)


def card(text, bg, with_logo, font, path):
    im = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(im)
    fg = WHITE if bg == DARK else DARK
    # pontuação final em azul da marca
    body, end = (text[:-1], text[-1]) if text[-1] in ".?" else (text, "")
    total = font.getlength(text)
    x = (W - total) / 2
    asc, desc = font.getmetrics()
    y = TEXT_CY - (asc + desc) / 2
    d.text((x, y), body, font=font, fill=fg)
    d.text((x + font.getlength(body), y), end, font=font, fill=BLUE)
    if with_logo:
        logo = Image.open(LOGO).convert("RGBA")
        lx = (W - logo.width) // 2
        im.paste(logo, (lx, int(TEXT_CY + 170)), logo)
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hook")
    ap.add_argument("--start", type=float, default=0.3)
    ap.add_argument("--out", default=str(ROOT / "out" / "engrenza-kinetic.mp4"))
    a = ap.parse_args()

    word_font = min((fit(w) for w in WORDS), key=lambda f: f.size)
    with tempfile.TemporaryDirectory() as tmp:
        inputs, parts = ["-i", a.hook], []
        for i, (text, bg, dur, logo) in enumerate(CARDS):
            font = word_font if text in WORDS else fit(text)
            p = Path(tmp) / f"c{i}.png"
            card(text, bg, logo, font, p)
            inputs += ["-loop", "1", "-t", str(dur), "-framerate", str(FPS), "-i", str(p)]
        norm = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1,format=yuv420p"
        s = a.start
        g = [
            f"[0:v]trim={s}:{s + HOOK},setpts=PTS-STARTPTS,{norm}[h]",
            f"[0:v]trim={s}:{s + TAIL},setpts=PTS-STARTPTS,{norm}[t]",
            f"[0:a]atrim={s}:{s + HOOK},asetpts=PTS-STARTPTS,afade=t=out:st={HOOK - 0.12}:d=0.12[ha]",
            f"[0:a]atrim={s}:{s + TAIL},asetpts=PTS-STARTPTS,afade=t=in:d=0.08[ta]",
        ]
        mid = sum(c[2] for c in CARDS)
        for i in range(len(CARDS)):
            g.append(f"[{i + 1}:v]fps={FPS},setsar=1,format=yuv420p[c{i}]")
        g.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{mid}[sil]")
        g.append("[ha]aresample=48000,aformat=channel_layouts=stereo[ha2]")
        g.append("[ta]aresample=48000,aformat=channel_layouts=stereo[ta2]")
        vids = "[h]" + "".join(f"[c{i}]" for i in range(len(CARDS))) + "[t]"
        g.append(f"{vids}concat=n={len(CARDS) + 2}:v=1:a=0[v]")
        g.append("[ha2][sil][ta2]concat=n=3:v=0:a=1[a]")
        out = Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
                        "-filter_complex", ";".join(g), "-map", "[v]", "-map", "[a]",
                        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
                        "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                        str(out)], check=True)
    print(f"  -> {out}  {HOOK + mid + TAIL:.1f}s  {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
