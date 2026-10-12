"""Checagem do vídeo final antes de entregar.

Uso: python3 scripts/check.py                  (confere ../out/reels-engrenza.mp4 e ../out/reels-original.mp4)
     python3 scripts/check.py caminho/video.mp4

Confere:
  1. formato: 1080x1920, 30 fps, 215 frames (7,167s), sem frame preto
  2. cortes nos frames exatos do original (64, 88, 114, 139, 165)
  3. texto fora da área dos botões, do topo e da legenda do Reels
  4. loop: último frame é a cartela final, primeiro é o gancho, sem frame repetido/congelado
     no gancho, áudio (se houver) com a mesma duração e sem estalo na emenda
Gera imagens em ../out/check/ para olhar: frames-chave, área segura e emenda do loop.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
OUT = RAIZ.parent / "out"
W, H, FPS = 1080, 1920, 30

# lidos do config.ts para não duplicar números
cfg = (RAIZ / "src" / "config.ts").read_text()
GANCHO = int(re.search(r"GANCHO_FRAMES = (\d+)", cfg).group(1))
CARTELAS = [int(x) for x in re.search(r"CARTELAS_FRAMES = \[([\d,\s]+)\]", cfg).group(1).split(",")]
TOTAL = GANCHO + sum(CARTELAS)
CORTES = [int(c) for c in np.cumsum([GANCHO] + CARTELAS[:-1])]

# Interface do Reels sobre um vídeo 1080x1920 (iPhone/Android, com folga)
ZONAS = {
    "topo (Reels/câmera)": (0, 0, W, 220),
    "botões (curtir/comentar/enviar)": (940, 980, W, 1800),
    "legenda e @perfil": (0, 1560, 940, H),
}

falhas = []


def ok(cond, msg):
    print(("  ok    " if cond else "  FALHA ") + msg)
    if not cond:
        falhas.append(msg)


def probe(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format",
                        "-of", "json", str(video)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def frames(video, w, h):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={w}:{h}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.int16)


def frame_cheio(video, n):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"select=eq(n\\,{n})",
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.int16)


def mascara_texto(img):
    # fundo = cor mais comum; texto = tudo que foge dela
    cores, cont = np.unique(img.reshape(-1, 3), axis=0, return_counts=True)
    fundo = cores[cont.argmax()]
    return np.abs(img - fundo).sum(2) > 60


def checar(video):
    nome = video.stem
    print(f"\n== {video.name}")
    info = probe(video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    n = int(v["nb_read_frames"])
    ok(v["width"] == W and v["height"] == H, f"resolução {v['width']}x{v['height']}")
    ok(v["r_frame_rate"] == "30/1", f"fps {v['r_frame_rate']}")
    ok(n == TOTAL, f"{n} frames (esperado {TOTAL} = {TOTAL / FPS:.3f}s)")

    pequeno = frames(video, 270, 480)
    lum = pequeno.mean(axis=(1, 2, 3))
    plano = pequeno.reshape(len(pequeno), -1, 3).std(axis=1).max(axis=1) < 2
    ok(not np.any(plano & (lum < 12)), "nenhum frame preto")

    # cortes = saltos grandes entre frames vizinhos
    dif = np.abs(np.diff(pequeno, axis=0)).mean(axis=(1, 2, 3))
    achados = [i + 1 for i, d in enumerate(dif) if d > 25]
    ok(achados == CORTES, f"cortes nos frames {achados} (original: {CORTES} = "
       + " / ".join(f"{c / FPS:.3f}s" for c in CORTES) + ")")

    # gancho sem frame congelado (vídeo travado ou duplicado)
    gancho = dif[: GANCHO - 1]
    ok(np.all(gancho > 0.05), f"gancho sem frame repetido (menor diferença {gancho.min():.2f})")

    # loop: último frame -> primeiro
    salto = np.abs(pequeno[-1] - pequeno[0]).mean()
    ok(salto > 25, f"emenda do loop é um corte seco como os outros ({salto:.0f})")
    ok(np.abs(pequeno[-1] - pequeno[-2]).mean() < 1, "último frame é a cartela final (sem sobra)")

    # área segura do Reels
    meios = [GANCHO + sum(CARTELAS[:i]) + CARTELAS[i] // 2 for i in range(len(CARTELAS))]
    folhas = []
    for i, f in enumerate(meios):
        img = frame_cheio(video, f)
        m = mascara_texto(img)
        ys, xs = np.where(m)
        caixa = (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None
        invade = [z for z, (x0, y0, x1, y1) in ZONAS.items() if m[y0:y1, x0:x1].any()]
        ok(not invade, f"cartela {i + 1}: texto em x {caixa[0]}–{caixa[2]}, y {caixa[1]}–{caixa[3]}"
           + (f" INVADE {', '.join(invade)}" if invade else " fora da interface do Reels"))
        im = Image.fromarray(img.astype(np.uint8))
        d = ImageDraw.Draw(im, "RGBA")
        for x0, y0, x1, y1 in ZONAS.values():
            d.rectangle((x0, y0, x1 - 1, y1 - 1), fill=(255, 40, 40, 60), outline=(255, 40, 40, 255), width=4)
        folhas.append(im.resize((270, 480)))

    # áudio
    if a:
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "f32le", "-ac", "1",
                              "-ar", "48000", "-"], capture_output=True, check=True).stdout
        s = np.frombuffer(pcm, np.float32)
        dur_a = len(s) / 48000  # amostras decodificadas (sem o "priming" do AAC)
        ok(abs(dur_a - TOTAL / FPS) < 0.03, f"áudio {dur_a:.3f}s = vídeo {TOTAL / FPS:.3f}s")
        if np.abs(s).max() < 1e-4:
            print("  info  trilha de áudio muda")
        else:
            ponta = max(np.abs(s[:48]).max(), np.abs(s[-48:]).max())  # 1ms em cada ponta
            ok(ponta < 0.05, f"sem estalo na emenda do áudio (pico nas pontas {ponta:.3f})")
    else:
        print("  info  sem áudio (coloque a música direto no Instagram ou salve public/music.mp3)")

    # imagens para olhar
    dest = OUT / "check"
    dest.mkdir(parents=True, exist_ok=True)
    chave = [0, 10, 20, 30, 45, 63] + meios + [TOTAL - 1]
    folha = Image.new("RGB", (270 * 6, 480 * 2))
    for k, f in enumerate(chave[:12]):
        folha.paste(Image.fromarray(pequeno[f].astype(np.uint8)), ((k % 6) * 270, (k // 6) * 480))
    folha.save(dest / f"{nome}-frames.png")
    seg = Image.new("RGB", (270 * len(folhas), 480))
    for k, im in enumerate(folhas):
        seg.paste(im, (k * 270, 0))
    seg.save(dest / f"{nome}-area-segura.png")
    emenda = Image.new("RGB", (270 * 4, 480))
    for k, f in enumerate([TOTAL - 2, TOTAL - 1, 0, 1]):
        emenda.paste(Image.fromarray(pequeno[f].astype(np.uint8)), (k * 270, 0))
    emenda.save(dest / f"{nome}-loop.png")
    print(f"  imagens: out/check/{nome}-frames.png, -area-segura.png, -loop.png")


videos = [Path(p) for p in sys.argv[1:]] or [OUT / "reels-engrenza.mp4", OUT / "reels-original.mp4"]
for vid in videos:
    checar(vid)
print("\nTUDO CERTO" if not falhas else f"\n{len(falhas)} FALHA(S)")
sys.exit(1 if falhas else 0)
