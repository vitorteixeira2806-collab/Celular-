/* ARTEC Galvanotécnica — interações da landing page */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* Ano do rodapé */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* Navbar: fundo ao rolar */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Menu mobile */
  const burger = $("#burger");
  const links = $("#navLinks");
  if (burger && links) {
    const close = () => { links.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); };
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    $$("a", links).forEach((a) => a.addEventListener("click", close));
  }

  /* Link ativo conforme a seção visível */
  const sections = $$("main section[id]");
  const navAnchors = $$("#navLinks a");
  if ("IntersectionObserver" in window && sections.length) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navAnchors.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id));
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  /* Reveal ao rolar */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* Contadores animados */
  const counters = $$("[data-count]");
  const animate = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const duration = 1400;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { animate(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.5 });
    counters.forEach((c) => cio.observe(c));
  } else {
    counters.forEach((c) => { c.textContent = c.dataset.count + (c.dataset.suffix || ""); });
  }

  /* Brilho que segue o cursor (fundo e cards) */
  const glow = $(".cursor-glow");
  const cards = $$(".card");
  const fine = window.matchMedia("(pointer: fine)").matches;
  if (fine) {
    window.addEventListener("pointermove", (ev) => {
      if (glow) {
        glow.style.setProperty("--mx", ev.clientX + "px");
        glow.style.setProperty("--my", ev.clientY + "px");
      }
    }, { passive: true });
    cards.forEach((card) => {
      card.addEventListener("pointermove", (ev) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--x", (ev.clientX - r.left) + "px");
        card.style.setProperty("--y", (ev.clientY - r.top) + "px");
      });
    });
  }

  /* Formulário -> WhatsApp */
  const form = $("#contactForm");
  if (form) {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const data = new FormData(form);
      let valid = true;
      ["nome", "telefone"].forEach((name) => {
        const input = form.elements[name];
        const ok = input.value.trim().length > 1;
        input.classList.toggle("is-invalid", !ok);
        if (!ok) valid = false;
      });
      if (!valid) { form.elements.nome.focus(); return; }

      const lines = [
        "Olá, Artec! Gostaria de solicitar um orçamento.",
        "",
        "*Nome:* " + data.get("nome"),
        data.get("empresa") ? "*Empresa:* " + data.get("empresa") : null,
        "*Telefone:* " + data.get("telefone"),
        data.get("email") ? "*E-mail:* " + data.get("email") : null,
        "*Tratamento:* " + data.get("servico"),
        data.get("mensagem") ? "" : null,
        data.get("mensagem") ? "*Detalhes:* " + data.get("mensagem") : null
      ].filter((l) => l !== null);

      const url = "https://wa.me/5511945149778?text=" + encodeURIComponent(lines.join("\n"));
      window.open(url, "_blank", "noopener");
    });
  }
})();
