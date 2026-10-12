# Reels Engrenza: "parceiro certo"

Pipeline de produção do Reels de 9,6s (1080x1920, 30fps, H.264/AAC).

## Entregas (biblioteca Higgsfield)
| Arquivo | Link |
|---|---|
| Final (legenda + cartela) | https://d2ol7oe51mr4n9.cloudfront.net/user_3J1UKLoplgfnd1vkzDdKaReF2nE/551338f6-8a27-4001-865d-72ac79c1d0ba.mp4 |
| Meta Ads (sem textos, cartela só com logo) | https://d2ol7oe51mr4n9.cloudfront.net/user_3J1UKLoplgfnd1vkzDdKaReF2nE/8816e8c0-228e-460e-8f7a-7e5e7cb661b2.mp4 |
| Legenda do post | `out/legenda-post.md` |

## Como foi feito
1. Primeiro quadro: Nano Banana Pro (Higgsfield), logo oficial como referência. Aprovado: quadro 2
   (job `3849f90f-d0d9-494e-b942-d4e0453af5b3`).
2. Takes: Veo 3.1 (preview, qualidade high), 8s, 9:16, com áudio. 6 takes gerados; escolhido o
   take 4 (job `a5c5dad6-4164-4772-ad47-20a27fe182cd`), o único sem peças soltas ou física quebrada.
3. Montagem: `reels/03_compose.py` (ffmpeg). Cartela usa o PNG oficial `assets/logo-engrenza.png`,
   nunca logo gerado por IA.

`reels/01_frames.py` e `reels/02_takes.py` fazem as etapas 1–2 via fal.ai (precisam de `FAL_KEY`
no `.env` e do fal.ai liberado na rede).

Para remontar: `python3 reels/03_compose.py caminho/do/take.mp4`
