(() => {
  "use strict";

  const canvas = document.getElementById("netCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width, height, nodes;
  const COLORS = ["#7c5cfc", "#3b82f6", "#22d3ee"];
  const NODE_COUNT_BASE = 70; // per 1,000,000 px^2 roughly, scaled below
  const LINK_DIST = 130;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    const area = width * height;
    const count = Math.min(90, Math.max(30, Math.round((area / 1000000) * NODE_COUNT_BASE)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          ctx.strokeStyle = `rgba(124, 92, 252, ${(1 - dist / LINK_DIST) * 0.12})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      ctx.beginPath();
      ctx.fillStyle = n.c;
      ctx.globalAlpha = 0.55;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!reduceMotion) requestAnimationFrame(step);
  }

  resize();
  window.addEventListener("resize", resize);

  if (!reduceMotion) {
    requestAnimationFrame(step);
  } else {
    step(); // draw a single static frame
  }
})();
