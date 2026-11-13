# Rota Âmbar — Corridas de Rua

Jogo de corrida 3D de mundo aberto para **celular na horizontal**, rodando no navegador e
**100% offline depois da primeira visita**. Cidade, carros, nomes e músicas são originais
(a cidade fictícia de Baía Âmbar é gerada por código a partir de uma seed fixa).

- **Stack:** Three.js + Vite, sem backend, sem CDN, sem arquivos de imagem, modelo ou áudio.
  Gráficos low-poly procedurais, sons e rádio sintetizados com Web Audio API.
- **PWA:** manifest (`display: fullscreen`, `orientation: landscape`), ícones PNG gerados em
  código no build e service worker que guarda tudo em cache na primeira visita.

## Rodar no computador

```bash
cd rota-ambar
npm install
npm run dev        # desenvolvimento (http://localhost:5173)
npm run build      # gera dist/
npm run preview    # serve dist/ com o service worker (teste do modo offline)
```

Para testar como celular: DevTools do Chrome > modo dispositivo > 844x390 com toque.

## Publicar no Netlify

O `netlify.toml` já está nesta pasta. No Netlify: **Add new site > Import an existing project**,
escolha o repositório e defina:

| Campo | Valor |
| --- | --- |
| Base directory | `rota-ambar` |
| Build command | `npm run build` |
| Publish directory | `rota-ambar/dist` |

Ou pela CLI: `npm run build && npx netlify deploy --prod --dir=dist` (dentro de `rota-ambar`).
O jogo usa caminhos relativos, então também funciona em subpastas e em qualquer hospedagem estática.

## Instalar na tela inicial

Abra o endereço publicado **uma vez com internet** (isso baixa e guarda o jogo inteiro).

- **Android (Chrome):** menu ⋮ > **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** botão Compartilhar > **Adicionar à Tela de Início**.

Abra pelo ícone: o jogo roda em tela cheia, em paisagem e sem internet. Em navegadores que não
deixam travar a orientação, aparece a tela "Gire o celular" e o jogo pausa em retrato.

## Controles

| Toque | Ação |
| --- | --- |
| Polegar esquerdo | Direção: botões ◀ ▶, volante deslizante ou inclinar o celular (escolha em Opções) |
| ACEL / FREIO | Acelerar / frear e dar ré (parado) |
| DRIFT | Freio de mão |
| NITRO | Turbo (recarrega sozinho e mais rápido com drift e saltos) |
| Topo da tela | Recolocar na pista, rádio, câmera, mapa, pausa |

Em Opções: aceleração automática, assistência de direção, tamanho e opacidade dos botões,
vibração, densidade do trânsito, qualidade (auto/baixa/média/alta), economia de bateria (30 fps),
volumes, mudo e estação da rádio.

**A pé** (toque em SAIR com o carro parado): analógico à esquerda para andar, arraste à direita
para olhar, ATIRAR, MIRAR, RECARGA, ARMA (pistola, submetralhadora, escopeta) e ENTRAR perto de
qualquer carro — o seu ou um do trânsito.

Teclado (apoio para testes): `W A S D` ou setas, `Espaço` freio de mão, `Shift` nitro,
`C` câmera, `M` mapa, `R` recolocar, `Esc`/`P` pausa, `F` sair/entrar no carro.
A pé: `W A S D` anda, setas olham, `Espaço` atira, `E` mira, `R` recarrega, `Q` troca de arma.

Controle (PlayStation, Xbox e similares, via Gamepad API): analógico esquerdo dirige/anda,
direito olha, R2 acelera/atira, L2 freia/mira, ✕ nitro, R1 freio de mão, △ sai/entra,
□ recarrega, L1 troca de arma, Options pausa.

## Modos

- **Passeio livre:** dirija pela cidade; pare sobre um marcador luminoso para abrir o evento.
  Laranja = corrida, azul = oficina, vermelho = desafio de fuga. Toque no mapa para marcar um destino.
- **Corridas de rua:** 8 eventos (circuito e ponto a ponto) contra 5 rivais.
- **Contra o relógio:** os mesmos traçados, com o fantasma da sua melhor volta e medalhas.
- **Fuga da polícia:** 1 a 5 estrelas, viaturas e bloqueios; despiste saindo do campo de visão.
- **A pé:** saia do carro, ande pela cidade, atire, roube carros do trânsito. Pedestres fogem dos
  tiros; com 2 estrelas ou mais os policiais desembarcam e atiram de volta.
- **Oficina:** 6 carros, melhorias de motor, pneus e nitro, e troca de pintura.

O progresso (dinheiro, carros, melhorias, opções e melhores tempos) fica salvo no aparelho (localStorage).

## Estrutura

```
pwa-plugin.js      ícones, manifest e service worker gerados no build
src/world/         geração da cidade (map.js) e renderização por chunks (worldview.js)
src/vehicles/      física, modelos procedurais dos carros, frota instanciada
src/game/          núcleo, trânsito, corridas, IA, polícia, progressão
src/ui/            HUD, minimapa, controles de toque, menus e mapa
src/audio/         motor, efeitos e rádio procedural
```
