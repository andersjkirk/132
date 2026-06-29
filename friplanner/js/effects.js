/* Friplanner — professional motion layer: scroll reveal, count-up numbers,
   mouse parallax on the aurora, confetti bursts, button ripples. Pure vanilla,
   respects prefers-reduced-motion. */

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- scroll reveal (staggered) ---------- */
  const revealObserver = reduceMotion
    ? null
    : new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("fx-in");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      );

  function observeReveals(root = document) {
    if (!revealObserver) return;
    root.querySelectorAll(".fx-reveal:not(.fx-in)").forEach((el, i) => {
      el.style.setProperty("--fx-delay", `${Math.min(i * 60, 360)}ms`);
      revealObserver.observe(el);
    });
  }

  /* ---------- count-up on numbers ---------- */
  function countUp(el, to, { decimals = 0, duration = 650 } = {}) {
    const from = parseFloat(el.dataset.fxValue || "0") || 0;
    el.dataset.fxValue = String(to);
    if (reduceMotion || from === to) {
      el.textContent = decimals ? to.toFixed(decimals) : Math.round(to);
      return;
    }
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const v = from + (to - from) * easeOutCubic(p);
      el.textContent = decimals ? v.toFixed(decimals) : Math.round(v);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- mouse / device parallax on aurora ---------- */
  function initParallax() {
    if (reduceMotion) return;
    const sun = document.querySelector(".sun");
    if (!sun) return;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener("pointermove", (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    function loop() {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      sun.style.setProperty("--px", `${cx * 22}px`);
      sun.style.setProperty("--py", `${cy * 22}px`);
      requestAnimationFrame(loop);
    }
    loop();
  }

  /* ---------- confetti burst ---------- */
  const COLORS = ["#2A9CC0", "#1E7E9E", "#FFC65C", "#FF7E5F", "#FFE0A3", "#7FD4E8"];
  function confetti(x, y, amount = 70) {
    if (reduceMotion) return;
    let canvas = document.getElementById("fx-confetti");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "fx-confetti";
      Object.assign(canvas.style, {
        position: "fixed", inset: "0", width: "100%", height: "100%",
        pointerEvents: "none", zIndex: "9999",
      });
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const parts = Array.from({ length: amount }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7;
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 5 + Math.random() * 7,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        life: 1,
      };
    });

    let running = 0;
    const startTime = performance.now();
    function frame(now) {
      const dt = Math.min((now - (frame._last || now)) / 16.6, 2);
      frame._last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.22 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.life = Math.max(0, 1 - (now - startTime) / 1400);
        if (p.life > 0 && p.y < window.innerHeight + 30) alive = true;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- button ripple ---------- */
  function initRipples() {
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(".btn-primary, .btn-secondary, .nav-btn, .unit-btn");
      if (!btn || reduceMotion) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "fx-ripple";
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  }

  window.FX = { observeReveals, countUp, confetti, initParallax, initRipples };

  document.addEventListener("DOMContentLoaded", () => {
    initParallax();
    initRipples();
    observeReveals();
  });
})();
