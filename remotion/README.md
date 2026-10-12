# Reels "precisa de um site?": Remotion

Remontagem do Reels de referência (bolinha na bancada + cartelas de texto + loop) em 1080×1920, 30 fps,
com os tempos exatos do original.

## Rodar

```bash
cd remotion
npm install
npm run studio      # prévia no navegador, com as duas versões lado a lado no menu
npm run render      # gera ../out/reels-engrenza.mp4 e ../out/reels-original.mp4
npm run check       # confere os dois vídeos antes de postar
```

## O que editar (`src/config.ts`)

- **`TEXTOS`**: as cinco cartelas, na ordem. Palavras soltas ficam todas no mesmo tamanho grande;
  frases no meio quebram em duas linhas sozinhas (ou force com `\n`).
- **`ENGRENZA.pontoFinal`**: o azul do ponto final da última cartela. `#48A4EC` foi conferido no
  PNG oficial do logo; confirme com o manual da marca.
- Paletas, fonte e posição do texto ficam no mesmo arquivo.

## Tempos (medidos na gravação do original, 30 fps)

| Trecho | Original | Frames |
|---|---|---|
| gancho (bolinha) | 0,000–2,133s | 64 |
| "precisa de um site?" | 2,133–2,933s | 24 |
| "moderno." | 2,933–3,800s | 26 |
| "rápido." | 3,800–4,633s | 25 |
| "achado no google." | 4,633–5,500s | 26 |
| "chama no direct." | 5,500–7,167s | 50 |
| total / volta ao início | 7,167s | 215 |

## Arquivos opcionais em `public/`

- **`hook.mp4`**: sua bolinha filmada no celular. Entram os primeiros 2,133s (ajuste o ponto de
  partida em `HOOK_INICIO_S`). Sem ele, entra uma bolinha animada provisória. Filme em pé, de cima,
  com a bolinha entrando pela direita, quicando, rolando e caindo pela borda da mesa até ~2s.
- **`music.mp3`**: trilha. Entram 7,167s a partir de `MUSICA_INICIO_S`, com fade de 8ms nas pontas
  para o loop não estalar. Sem ela, o vídeo sai sem áudio e você coloca uma música em alta direto
  no Instagram.

O `npm run render` detecta os dois sozinho. A imagem sai do Remotion e o áudio é montado pelo ffmpeg
com corte exato: o AAC do Remotion deixa ~40ms de silêncio no começo, o que abriria um buraco na emenda.

## As duas versões

- **Engrenza**: fundo `#080B10` e off-white `#ECEFF3`, Space Grotesk Bold, ponto final azul só na
  última cartela.
- **Original**: verde `#0E2E1F` e creme `#F3E8D8`, Inter Tight Bold. As cores foram estimadas a
  partir da gravação de tela (HDR convertido para SDR), então são aproximadas.

## Checagem (`npm run check`)

1. 1080×1920, 30 fps, 215 frames, nenhum frame preto
2. cortes exatamente nos frames 64, 88, 114, 139 e 165
3. texto fora da área dos botões, do topo e da legenda do Reels
4. loop: termina na cartela final, recomeça no gancho com corte seco, sem frame congelado no gancho;
   com áudio, mesma duração do vídeo e sem estalo na emenda

Imagens para olhar em `../out/check/`: frames-chave, área segura (zonas da interface em vermelho) e
os 2 últimos + 2 primeiros frames da emenda.
