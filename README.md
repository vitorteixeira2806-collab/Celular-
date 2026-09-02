# Artec Galvanotécnica — Landing page

Landing page moderna (single page, HTML + CSS + JS puro, sem build) para a Artec Galvanotécnica.

## Estrutura

```
index.html       página completa
css/style.css    estilos, animações e responsivo
js/main.js       menu, reveal on scroll, contadores, formulário → WhatsApp
assets/img/      fotos (veja assets/img/README.md) e favicon
```

## Como rodar

Abra `index.html` no navegador ou sirva a pasta:

```bash
python3 -m http.server 8080
```

## Publicação

É um site estático: funciona em qualquer hospedagem (Vercel, Netlify, GitHub Pages, cPanel).
Basta enviar os arquivos da raiz.

## Onde editar

- **Contatos** (WhatsApp, telefone, e-mail, endereço): procure por `wa.me/5511945149778`,
  `+551139310606`, `vendas@artecgal.com.br` e `Rua Sebastião Morais` no `index.html`.
- **Cores**: variáveis no topo de `css/style.css` (`--primary`, `--primary-2`, `--bg`).
- **Fotos**: `assets/img/README.md`.
