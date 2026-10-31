(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STORE = "ncs.form.v1";
  const FIELDS = ["businessName", "businessType", "location", "contact", "productName", "details", "price", "platform"];
  const RADIOS = ["tone", "language"];

  const form = $("#form");
  const resultsEl = $("#results");
  const errorEl = $("#error");
  const statusEl = $("#status");
  const submitBtn = $("#submit");
  let busy = false;
  let hasResults = false;

  /* ---------- helpers ---------- */

  function el(tag, props) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(function (entry) {
      const k = entry[0], v = entry[1];
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    const kids = Array.prototype.slice.call(arguments, 2).flat(Infinity);
    kids.forEach(function (kid) {
      if (kid == null) return;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }

  function announce(msg) {
    statusEl.textContent = "";
    setTimeout(function () { statusEl.textContent = msg; }, 50);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = el("textarea", { readonly: "", style: "position:fixed;opacity:0;top:0;left:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function copyButton(text, label) {
    const idle = label || "Copy";
    const btn = el("button", { type: "button", class: "btn small" }, idle);
    btn.addEventListener("click", async function () {
      const ok = await copyText(text);
      btn.textContent = ok ? "Copied" : "Copy failed";
      announce(ok ? "Copied to clipboard" : "Could not copy. Select the text and copy it by hand.");
      setTimeout(function () { btn.textContent = idle; }, 1600);
    });
    return btn;
  }

  function formatPrice(raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    if (/^[\d,.\s]+$/.test(t)) {
      const n = Number(t.replace(/[,\s]/g, ""));
      if (!isNaN(n)) return "₦" + n.toLocaleString("en-NG");
    }
    return t.replace(/^(?:NGN|N|#)\s*(?=\d)/i, "₦");
  }

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "promo";
  }

  /* ---------- saved form ---------- */

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; }
  }

  function saveForm(v) {
    const safe = Object.assign({}, v);
    delete safe.accessCode;
    try { localStorage.setItem(STORE, JSON.stringify(safe)); } catch (e) { /* storage unavailable */ }
  }

  function restore() {
    const saved = loadSaved();
    FIELDS.forEach(function (n) {
      if (saved[n] != null && form.elements[n]) form.elements[n].value = saved[n];
    });
    RADIOS.forEach(function (n) {
      if (!saved[n]) return;
      const r = form.querySelector('input[name="' + n + '"][value="' + saved[n] + '"]');
      if (r) r.checked = true;
    });
  }

  function readForm() {
    const v = {};
    FIELDS.forEach(function (n) { v[n] = form.elements[n].value.trim(); });
    RADIOS.forEach(function (n) {
      const r = form.querySelector('input[name="' + n + '"]:checked');
      v[n] = r ? r.value : "";
    });
    v.accessCode = form.elements.accessCode ? form.elements.accessCode.value.trim() : "";
    v.price = formatPrice(v.price);
    return v;
  }

  /* ---------- access code (only when the server asks for one) ---------- */

  fetch("/api/config")
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (cfg) {
      const need = !!cfg.requiresAccessCode;
      $("#accessField").hidden = !need;
      form.elements.accessCode.required = need;
    })
    .catch(function () { /* config is optional */ });

  /* ---------- submit ---------- */

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;
    const v = readForm();
    form.elements.price.value = v.price;
    saveForm(v);
    hideError();
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v)
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      render(data, v);
    } catch (err) {
      showError(err instanceof TypeError
        ? "No connection. Check your data or Wi-Fi and try again."
        : err.message);
    } finally {
      setBusy(false);
    }
  });

  function setBusy(on) {
    busy = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Writing…" : (hasResults ? "Create again" : "Create my content");
    if (on) {
      announce("Writing your content");
      if (hasResults) resultsEl.classList.add("stale");
      else resultsEl.replaceChildren(el("p", { class: "empty" }, "Writing your content. This takes about ten seconds."));
    } else {
      resultsEl.classList.remove("stale");
    }
  }

  /* ---------- results ---------- */

  function section(title) {
    const kids = Array.prototype.slice.call(arguments, 1);
    return el("section", { class: "section" }, el("h2", { tabindex: "-1" }, title), kids);
  }

  function render(data, v) {
    hasResults = true;
    const parts = [];

    parts.push(section("Captions for " + v.platform,
      data.captions.map(function (t) {
        return el("article", { class: "caption" }, el("p", {}, t), copyButton(t));
      })));

    if (data.hashtags.length) {
      const all = data.hashtags.map(function (t) { return "#" + t; }).join(" ");
      parts.push(section("Hashtags",
        el("div", { class: "tags" }, data.hashtags.map(function (t) { return el("span", { class: "tag" }, "#" + t); })),
        copyButton(all, "Copy all hashtags")));
    }

    if (data.productDescription) {
      parts.push(section("Product description",
        el("p", { class: "prose" }, data.productDescription),
        copyButton(data.productDescription)));
    }

    if (data.whatsappMessages.length) {
      parts.push(section("WhatsApp messages",
        el("div", { class: "chat" }, data.whatsappMessages.map(function (m) {
          return el("div", { class: "msg" },
            el("p", { class: "bubble" }, m),
            el("div", { class: "actions" },
              copyButton(m),
              el("a", {
                class: "btn small wa",
                href: "https://wa.me/?text=" + encodeURIComponent(m),
                target: "_blank",
                rel: "noopener"
              }, "Send on WhatsApp")));
        }))));
    }

    parts.push(promoSection(data, v));

    resultsEl.replaceChildren.apply(resultsEl, parts);
    announce("Your content is ready");
    const heading = $("h2", resultsEl);
    resultsEl.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (heading) heading.focus({ preventScroll: true });
  }

  /* ---------- promo image ---------- */

  let fontsReady = Promise.resolve();
  if (document.fonts && document.fonts.load) {
    fontsReady = Promise.all([
      document.fonts.load("900 60px Archivo"),
      document.fonts.load("800 30px Archivo"),
      document.fonts.load("500 30px Archivo")
    ]).catch(function () { /* fall back to system font */ });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Not an image")); };
      img.src = url;
    });
  }

  function chipGroup(name, legend, options, current, onChange) {
    const fs = el("fieldset", {}, el("legend", {}, legend));
    const row = el("div", { class: "chips" });
    options.forEach(function (opt) {
      const input = el("input", { type: "radio", name: name, value: opt.value });
      if (opt.value === current) input.checked = true;
      input.addEventListener("change", function () { onChange(opt.value); });
      const label = el("span", {}, opt.dot ? el("i", { class: "dot", style: "background:" + opt.dot }) : null, opt.label);
      row.append(el("label", { class: "chip" }, input, label));
    });
    fs.append(row);
    return fs;
  }

  function textField(id, label, value, max, onInput) {
    const input = el("input", { id: id, type: "text", maxlength: String(max) });
    input.value = value;
    input.addEventListener("input", function () { onInput(input.value); });
    return el("div", { class: "field" }, el("label", { class: "lbl", for: id }, label), input);
  }

  function promoSection(data, v) {
    const state = {
      format: /whatsapp|tiktok/i.test(v.platform) ? "story" : "square",
      style: "danfo",
      headline: data.promo.headline || v.productName,
      tagline: data.promo.tagline,
      cta: data.promo.cta || "Order today",
      img: null
    };

    const canvas = el("canvas", { class: "poster", role: "img", "aria-label": "Preview of your promo image" });
    let raf = 0;
    function redraw() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(async function () {
        await fontsReady;
        window.Poster.draw(canvas, {
          format: state.format,
          style: state.style,
          business: v.businessName,
          headline: state.headline,
          tagline: state.tagline,
          cta: state.cta,
          price: v.price,
          contact: v.contact,
          location: v.location,
          img: state.img
        });
      });
    }

    const fileInput = el("input", { type: "file", accept: "image/*" });
    const removeBtn = el("button", { type: "button", class: "btn small", hidden: "" }, "Remove photo");
    const photoMsg = el("p", { class: "note", role: "status" }, "A clear photo of your product makes the image work harder.");
    fileInput.addEventListener("change", async function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        state.img = await loadImage(file);
        removeBtn.hidden = false;
        photoMsg.textContent = "Photo added.";
        redraw();
      } catch (err) {
        photoMsg.textContent = "That file could not be opened as a photo. Try a JPG or PNG.";
      }
    });
    removeBtn.addEventListener("click", function () {
      state.img = null;
      fileInput.value = "";
      removeBtn.hidden = true;
      photoMsg.textContent = "Photo removed.";
      redraw();
    });

    function getBlob() {
      return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
    }

    const fileName = slug(v.businessName) + "-promo.png";

    const downloadBtn = el("button", { type: "button", class: "btn" }, "Download image");
    downloadBtn.addEventListener("click", async function () {
      const blob = await getBlob();
      if (!blob) { announce("Could not create the image. Try again."); return; }
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: fileName });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      announce("Image downloaded");
    });

    const actions = el("div", { class: "poster-actions" }, downloadBtn);

    if (navigator.share && navigator.canShare) {
      const shareBtn = el("button", { type: "button", class: "btn wa" }, "Share image");
      shareBtn.addEventListener("click", async function () {
        const blob = await getBlob();
        if (!blob) return;
        const file = new File([blob], fileName, { type: "image/png" });
        if (!navigator.canShare({ files: [file] })) {
          announce("Sharing images is not supported here. Use Download image instead.");
          return;
        }
        try {
          await navigator.share({ files: [file], text: state.headline });
        } catch (err) { /* person closed the share sheet */ }
      });
      actions.append(shareBtn);
    }

    const controls = el("div", { class: "promo-controls" },
      chipGroup("posterFormat", "Size", [
        { value: "square", label: "Square post" },
        { value: "story", label: "Story or Status" }
      ], state.format, function (val) { state.format = val; redraw(); }),
      chipGroup("posterStyle", "Colours", Object.keys(window.Poster.STYLES).map(function (k) {
        return { value: k, label: window.Poster.STYLES[k].label, dot: window.Poster.STYLES[k].bg };
      }), state.style, function (val) { state.style = val; redraw(); }),
      el("div", { class: "photo-row" },
        el("label", { class: "btn small photo-btn" }, "Add product photo", fileInput),
        removeBtn),
      photoMsg,
      textField("pHeadline", "Headline", state.headline, 60, function (t) { state.headline = t; redraw(); }),
      textField("pTagline", "Tagline", state.tagline, 120, function (t) { state.tagline = t; redraw(); }),
      textField("pCta", "Button text", state.cta, 40, function (t) { state.cta = t; redraw(); })
    );

    redraw();
    return section("Promo image", controls, canvas, actions);
  }

  restore();

  /* ---------- helpful workspace tools ---------- */
  function addWorkspaceTools() {
    const toolbar = el("div", { class: "workspace-tools", "aria-label": "Form tools" });
    const sample = el("button", { type: "button", class: "btn small" }, "✦ Try a sample");
    const clear = el("button", { type: "button", class: "btn small" }, "Clear form");
    const saved = el("span", { class: "save-indicator", role: "status" }, "Draft saves automatically");
    toolbar.append(sample, clear, saved);
    form.insertBefore(toolbar, form.firstChild);

    const meter = el("div", { class: "completion-wrap" },
      el("div", { class: "completion-copy" },
        el("span", { text: "Your brief" }),
        el("strong", { text: "0% complete", id: "completionValue" })),
      el("div", { class: "completion-track", role: "progressbar", "aria-label": "Form completion", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "completion-fill" })));
    form.insertBefore(meter, form.querySelector("fieldset"));
    const fill = $(".completion-fill", meter);
    const value = $("#completionValue", meter);
    const track = $(".completion-track", meter);

    function updateMeter() {
      const required = ["businessName", "productName"];
      const optional = ["businessType", "details", "price", "contact", "location"];
      const count = required.filter(n => form.elements[n].value.trim()).length +
        optional.filter(n => form.elements[n].value.trim()).length;
      const percent = Math.round(count / (required.length + optional.length) * 100);
      fill.style.width = percent + "%";
      value.textContent = percent + "% complete";
      track.setAttribute("aria-valuenow", String(percent));
    }

    sample.addEventListener("click", function () {
      const example = {
        businessName: "Ade's Fabrics",
        businessType: "Fashion and tailoring",
        productName: "Premium Ankara two-piece set",
        details: "Beautiful prints, comfortable fabric, sizes 8–20. Available for pickup and delivery.",
        price: "25000",
        contact: "08030000000",
        location: "Surulere, Lagos"
      };
      Object.keys(example).forEach(n => { if (form.elements[n]) form.elements[n].value = example[n]; });
      updateMeter();
      saveForm(readForm());
      announce("Sample business details added. Edit them to match your business.");
    });
    clear.addEventListener("click", function () {
      form.reset();
      if (form.elements.accessCode) form.elements.accessCode.value = "";
      try { localStorage.removeItem(STORE); } catch (e) {}
      updateMeter();
      saved.textContent = "Draft cleared";
      announce("Form cleared");
    });

    form.addEventListener("input", function () {
      updateMeter();
      const v = readForm();
      saveForm(v);
      saved.textContent = "Draft saved";
    });
    form.addEventListener("change", updateMeter);

    form.querySelectorAll("input[maxlength], textarea[maxlength]").forEach(function (field) {
      if (field.type === "radio" || field.type === "password" || field.type === "file") return;
      const counter = el("span", { class: "char-count", "aria-live": "polite" });
      const update = function () { counter.textContent = field.value.length + " / " + field.maxLength; };
      field.parentElement.append(counter);
      field.addEventListener("input", update);
      update();
    });
    updateMeter();
  }

  function installFocusShortcuts() {
    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        if (!busy) form.requestSubmit();
      }
    });
  }

  addWorkspaceTools();
  installFocusShortcuts();
})();
