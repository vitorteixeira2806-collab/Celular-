"""Etapa 4/5: monta o Reels final e a versão sem textos com ffmpeg.

Uso: python3 reels/03_compose.py out/takes/take-2.mp4

Gera:
  out/engrenza-reels-final.mp4   legenda inicial + cartela (frase, logo PNG, site)
  out/engrenza-reels-ads.mp4     sem textos sobrepostos: take + cartela só com o logo PNG
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "assets" / "logo-engrenza.png"
FONTS = ROOT / "assets" / "fonts"
OUT = ROOT / "out"

W, H, FPS = 1080, 1920, 30
BG = "0x080B10"
CARD = 2.0          # duração da cartela
XFADE = 0.4         # transição take -> cartela
MAX_MB = 15

CAPTION = ["Quando a empresa está", "quase tombando…"]
TAGLINE = ["Às vezes, sua empresa", "só precisa do", "parceiro certo."]
SITE = "engrenza.com.br"

# Área segura do Reels: textos no terço superior/central, margem esquerda,
# longe da faixa inferior (~35%) e da coluna de ícones à direita (~150px).
CAP_X, CAP_Y, CAP_SIZE, CAP_LEAD = 80, 300, 62, 78


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
         "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    return float(info["format"]["duration"]), any(
        s["codec_type"] == "audio" for s in info["streams"])


def write_txt(tmp, name, text):
    p = Path(tmp) / name
    p.write_text(text, encoding="utf-8")
    return p


def esc(p):
    return str(p).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def drawtext(textfile, font, size, x, y, t0, t1, fade=0.3, shadow=True):
    alpha = (f"if(lt(t,{t0}),0,if(lt(t,{t0 + fade}),(t-{t0})/{fade},"
             f"if(lt(t,{t1 - fade}),1,if(lt(t,{t1}),({t1}-t)/{fade},0))))")
    s = (f"drawtext=fontfile='{esc(font)}':textfile='{esc(textfile)}':fontsize={size}:"
         f"fontcolor=white:x={x}:y={y}:alpha='{alpha}'")
    if shadow:
        s += ":shadowcolor=black@0.65:shadowx=0:shadowy=3"
    return s


def build(take, dst, with_text):
    dur, has_audio = probe(take)
    total = dur + CARD - XFADE
    medium = FONTS / "SpaceGrotesk-Medium.ttf"
    semibold = FONTS / "SpaceGrotesk-SemiBold.ttf"

    with tempfile.TemporaryDirectory() as tmp:
        # --- take: normaliza para 1080x1920@30 + legenda inicial
        v0 = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
              f"fps={FPS},setsar=1,format=yuv420p")
        if with_text:
            for i, line in enumerate(CAPTION):
                f = write_txt(tmp, f"cap{i}.txt", line)
                v0 += "," + drawtext(f, semibold, CAP_SIZE, CAP_X, CAP_Y + i * CAP_LEAD, 0.3, 3.0)
        v0 += "[take]"

        # --- cartela: fundo #080B10, frase, logo PNG oficial com fade, site
        logo_w = 560
        lw, lh = Image.open(LOGO).size
        logo_h = round(logo_w * lh / lw)
        tag_size, tag_lead = 66, 84
        tag_y0 = 620
        logo_y = tag_y0 + len(TAGLINE) * tag_lead + 90
        card = f"color=c={BG}:s={W}x{H}:r={FPS}:d={CARD},format=yuv420p"
        if with_text:
            for i, line in enumerate(TAGLINE):
                f = write_txt(tmp, f"tag{i}.txt", line)
                card += "," + drawtext(f, medium, tag_size, "(w-text_w)/2", tag_y0 + i * tag_lead,
                                       0.0, CARD + 1, fade=0.35, shadow=False)
            f = write_txt(tmp, "site.txt", SITE)
            card += "," + drawtext(f, medium, 40, "(w-text_w)/2", logo_y + logo_h + 60,
                                   0.75, CARD + 1, fade=0.35, shadow=False)
        else:
            logo_y = (H - logo_h) // 2 - 80
        card += "[cardbg]"
        logo = (f"[1:v]scale={logo_w}:-1,format=rgba,"
                f"fade=t=in:st={0.45 if with_text else 0.2}:d=0.5:alpha=1[logo]")
        overlay = (f"[cardbg][logo]overlay=x=(W-w)/2:y={logo_y}:shortest=1:"
                   f"eof_action=pass,format=yuv420p[card]")

        xf = f"[take][card]xfade=transition=fade:duration={XFADE}:offset={dur - XFADE},format=yuv420p[v]"

        if has_audio:
            a = (f"[0:a]aresample=48000,aformat=channel_layouts=stereo,"
                 f"afade=t=out:st={dur - 0.8}:d=0.8,apad,atrim=0:{total}[a]")
        else:
            a = f"anullsrc=r=48000:cl=stereo,atrim=0:{total}[a]"

        graph = ";".join([v0, card, logo, overlay, xf, a])
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
               "-i", str(take), "-loop", "1", "-t", str(CARD), "-i", str(LOGO),
               "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
               "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "11M",
               "-bufsize", "22M", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
               "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
               "-movflags", "+faststart", "-t", f"{total:.3f}", str(dst)]
        subprocess.run(cmd, check=True)

    mb = dst.stat().st_size / 1e6
    print(f"  -> {dst.relative_to(ROOT)}  {total:.2f}s  {mb:.1f} MB")
    if mb > MAX_MB:
        sys.exit(f"Arquivo acima de {MAX_MB} MB; reduza -maxrate.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("take")
    a = ap.parse_args()
    for p in (LOGO, FONTS / "SpaceGrotesk-Medium.ttf"):
        if not p.exists():
            sys.exit(f"Arquivo não encontrado: {p}")
    OUT.mkdir(exist_ok=True)
    build(Path(a.take), OUT / "engrenza-reels-final.mp4", with_text=True)
    build(Path(a.take), OUT / "engrenza-reels-ads.mp4", with_text=False)


if __name__ == "__main__":
    main()
