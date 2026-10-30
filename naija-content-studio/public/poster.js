/*
 * Promo poster renderer. Draws onto a <canvas> in the browser.
 * Also loads in Node (with the "canvas" package) so the layout can be tested.
 */
(function () {
  "use strict";

  const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';

  const STYLES = {
    danfo:  { label: "Danfo",  bg: "#F7B500", ink: "#141414", accent: "#141414", accentInk: "#F7B500" },
    adire:  { label: "Adire",  bg: "#1B2559", ink: "#EEF1F7", accent: "#F7B500", accentInk: "#141A3A" },
    pepper: { label: "Pepper", bg: "#B8260F", ink: "#FFFFFF", accent: "#F7B500", accentInk: "#141414" },
    leaf:   { label: "Leaf",   bg: "#17653F", ink: "#FFFFFF", accent: "#F7B500", accentInk: "#141414" }
  };

  function roundPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function wrap(c, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (!line || c.measureText(next).width <= maxW) line = next;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Re-wrap at the narrowest width that keeps the same number of lines,
  // so the last line is not a lone short word.
  function balance(c, text, maxW, lineCount) {
    let lo = Math.floor(maxW / 2);
    let hi = maxW;
    while (hi - lo > 4) {
      const mid = Math.floor((lo + hi) / 2);
      if (wrap(c, text, mid).length <= lineCount) hi = mid; else lo = mid;
    }
    const out = wrap(c, text, hi);
    return out.length === lineCount && out.every(function (l) { return c.measureText(l).width <= maxW; }) ? out : null;
  }

  // Largest font size that fits the text in maxLines lines. Leaves c.font set.
  function fit(c, text, maxW, maxLines, maxSize, minSize, weight) {
    let lines = [];
    for (let size = maxSize; size >= minSize; size -= 2) {
      c.font = weight + " " + size + "px " + FONT;
      lines = wrap(c, text, maxW);
      if (lines.length <= maxLines && lines.every(function (l) { return c.measureText(l).width <= maxW; })) {
        if (lines.length > 1) lines = balance(c, text, maxW, lines.length) || lines;
        return { size: size, lines: lines };
      }
    }
    c.font = weight + " " + minSize + "px " + FONT;
    lines = wrap(c, text, maxW).slice(0, maxLines);
    const last = lines.length - 1;
    if (last >= 0) {
      let t = lines[last];
      while (t.length > 1 && c.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      if (wrap(c, text, maxW).length > maxLines) lines[last] = t + "…";
    }
    return { size: minSize, lines: lines };
  }

  function fitLine(c, text, maxW, maxSize, minSize, weight) {
    const r = fit(c, text, maxW, 1, maxSize, minSize, weight);
    return { size: r.size, text: r.lines[0] || "" };
  }

  // Overlapping ring pattern, a nod to adire cloth.
  function rings(c, W, H, color) {
    const step = 132;
    c.save();
    c.globalAlpha = 0.08;
    c.strokeStyle = color;
    c.lineWidth = 5;
    for (let row = 0, y = 0; y < H + step; row++, y += step) {
      for (let x = (row % 2) * (step / 2); x < W + step; x += step) {
        for (let r = 12; r <= 52; r += 20) {
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }
    c.restore();
  }

  function drawCover(c, img, x, y, w, h, r) {
    c.save();
    roundPath(c, x, y, w, h, r);
    c.clip();
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    c.restore();
  }

  function sticker(c, s, cx, cy, price) {
    const R = 120;
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.14);
    c.fillStyle = s.accent;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = s.accentInk;
    c.globalAlpha = 0.4;
    c.lineWidth = 4;
    c.lineCap = "round";
    c.setLineDash([1, 13]);
    c.beginPath();
    c.arc(0, 0, R - 14, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;

    const f = fit(c, price, 190, 2, 64, 26, 900);
    const lh = Math.round(f.size * 1.1);
    c.fillStyle = s.accentInk;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const startY = -((f.lines.length - 1) * lh) / 2;
    f.lines.forEach(function (line, i) { c.fillText(line, 0, startY + i * lh); });
    c.restore();
  }

  /**
   * o = { format: "square" | "story", style, business, headline, tagline, cta,
   *       price, contact, location, img }
   */
  function draw(canvas, o) {
    const story = o.format === "story";
    const W = 1080;
    const H = story ? 1920 : 1080;
    const M = 64;
    const top = story ? 190 : 64;     // Stories keep clear of the app's top bar
    const bottom = story ? 210 : 64;  // and the reply bar

    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d");
    const s = STYLES[o.style] || STYLES.danfo;

    c.fillStyle = s.bg;
    c.fillRect(0, 0, W, H);
    rings(c, W, H, s.ink);
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    // Business name
    const nm = fitLine(c, o.business || "", W - 2 * M, 40, 24, 800);
    c.font = "800 " + nm.size + "px " + FONT;
    c.fillStyle = s.ink;
    c.fillText(nm.text, M, top + 36);

    // Footer: call to action on the left, contact on the right
    const pillH = 92;
    const pillY = H - bottom - pillH;
    const cta = fitLine(c, o.cta || "Order today", 520, 42, 28, 800);
    c.font = "800 " + cta.size + "px " + FONT;
    const pillW = Math.round(c.measureText(cta.text).width + 80);
    c.fillStyle = s.accent;
    roundPath(c, M, pillY, pillW, pillH, pillH / 2);
    c.fill();
    c.fillStyle = s.accentInk;
    c.textBaseline = "middle";
    c.fillText(cta.text, M + 40, pillY + pillH / 2 + 2);

    const contactMax = W - 2 * M - pillW - 32;
    if (contactMax > 220 && (o.contact || o.location)) {
      c.textAlign = "right";
      c.fillStyle = s.ink;
      const both = o.contact && o.location;
      if (o.contact) {
        const f = fitLine(c, o.contact, contactMax, 38, 22, 800);
        c.font = "800 " + f.size + "px " + FONT;
        c.fillText(f.text, W - M, pillY + (both ? 28 : pillH / 2));
      }
      if (o.location) {
        const f = fitLine(c, o.location, contactMax, 30, 20, 500);
        c.font = "500 " + f.size + "px " + FONT;
        c.fillText(f.text, W - M, pillY + (both ? 68 : pillH / 2));
      }
      c.textAlign = "left";
    }
    c.textBaseline = "alphabetic";

    // Photo
    let y = top + 96;
    const hasPhoto = !!o.img;
    const showSticker = hasPhoto && !!o.price;
    let stickerAt = null;
    if (hasPhoto) {
      const ph = story ? 820 : 400;
      const pw = W - 2 * M;
      c.fillStyle = s.accent;
      roundPath(c, M + 14, y + 14, pw, ph, 28);
      c.fill();
      drawCover(c, o.img, M, y, pw, ph, 28);
      stickerAt = { x: W - M - 84, y: y + 96 };
      y += ph + 64;
    } else if (story) {
      y += 60;
    }

    // Text block: shrink the headline until everything fits above the footer
    const avail = pillY - 36;
    const headline = o.headline || "";
    const headLines = hasPhoto ? 2 : (story ? 5 : 3);
    const headMax = hasPhoto ? (story ? 124 : 100) : (story ? 170 : 132);
    const tagMax = story ? 46 : 40;
    const priceMax = story ? 150 : 120;
    let plan = null;
    for (let hMax = headMax; hMax >= 56; hMax -= 8) {
      const h = fit(c, headline, W - 2 * M, headLines, hMax, 56, 900);
      const lhH = Math.round(h.size * 1.05);
      const t = o.tagline ? fit(c, o.tagline, W - 2 * M, 2, tagMax, 28, 500) : null;
      const lhT = t ? Math.round(t.size * 1.32) : 0;
      const p = (!hasPhoto && o.price) ? fit(c, o.price, W - 2 * M, 1, priceMax, 48, 900) : null;
      const total = h.lines.length * lhH +
        (t ? 24 + t.lines.length * lhT : 0) +
        (p ? 32 + Math.round(p.size) : 0);
      plan = { h: h, lhH: lhH, t: t, lhT: lhT, p: p, total: total };
      if (y + total <= avail) break;
    }

    if (!hasPhoto) y += Math.max(0, (avail - y - plan.total) / 3);

    c.fillStyle = s.ink;
    c.font = "900 " + plan.h.size + "px " + FONT;
    plan.h.lines.forEach(function (line, i) {
      c.fillText(line, M, y + plan.h.size * 0.86 + i * plan.lhH);
    });
    y += plan.h.lines.length * plan.lhH;

    if (plan.t) {
      y += 24;
      c.font = "500 " + plan.t.size + "px " + FONT;
      plan.t.lines.forEach(function (line, i) {
        c.fillText(line, M, y + plan.t.size * 0.86 + i * plan.lhT);
      });
      y += plan.t.lines.length * plan.lhT;
    }

    if (plan.p) {
      y += 32;
      c.font = "900 " + plan.p.size + "px " + FONT;
      c.fillStyle = s.accent === s.ink ? s.ink : s.accent;
      c.fillText(plan.p.lines[0], M, y + plan.p.size * 0.86);
    }

    if (showSticker && stickerAt) sticker(c, s, stickerAt.x, stickerAt.y, o.price);
  }

  const api = { STYLES: STYLES, draw: draw };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.Poster = api;
})();
