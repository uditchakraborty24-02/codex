if (!localStorage.getItem("loggedInUser")) {
  window.location.href = "/";
}

const uploadZone    = document.getElementById("uploadZone");
const uploadPrompt  = document.getElementById("uploadPrompt");
const uploadPreview = document.getElementById("uploadPreview");
const uploadInfo    = document.getElementById("uploadInfo");
const figmaFile     = document.getElementById("figmaFile");
const figmaPreview  = document.getElementById("figmaPreview");
const uploadClear   = document.getElementById("uploadClear");
const siteUrl       = document.getElementById("siteUrl");
const vpWidth       = document.getElementById("vpWidth");
const vpHeight      = document.getElementById("vpHeight");
const compareBtn    = document.getElementById("compareBtn");
const compareStatus = document.getElementById("compareStatus");
const emptyState    = document.getElementById("emptyState");
const resultsContent= document.getElementById("resultsContent");
const mismatchScore = document.getElementById("mismatchScore");
const designBadge   = document.getElementById("designBadge");
const pctColor      = document.getElementById("pctColor");
const pctOverlap    = document.getElementById("pctOverlap");
const pctStructure  = document.getElementById("pctStructure");
const pctSpacing    = document.getElementById("pctSpacing");
const pctTypography = document.getElementById("pctTypography");
const barColor      = document.getElementById("barColor");
const barOverlap    = document.getElementById("barOverlap");
const barStructure  = document.getElementById("barStructure");
const barSpacing    = document.getElementById("barSpacing");
const barTypography = document.getElementById("barTypography");
const progressWrap  = document.getElementById("progressWrap");
const progressFill  = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const designFindings = document.getElementById("designFindings");
const findingsList  = document.getElementById("findingsList");
const displayCanvas = document.getElementById("displayCanvas");
const sensHint      = document.getElementById("sensHint");

let figmaImage  = null;
let figmaCanvas = null;
let siteCanvas  = null;
let diffCanvas  = null;
let activeView  = "figma";
let sensitivity = 15;

const sensLabels = {
  30: "Ignores minor colour shifts, catches layout differences",
  15: "Balanced — flags visible colour and spacing changes",
   5: "Strict — flags any subtle pixel difference"
};

// ── File upload ───────────────────────────────────────────────────────────────
uploadZone.addEventListener("click", (e) => {
  if (!e.target.closest("#uploadClear")) figmaFile.click();
});

uploadZone.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !e.target.closest("#uploadClear")) {
    e.preventDefault();
    figmaFile.click();
  }
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) loadFile(file);
});

figmaFile.addEventListener("change", () => {
  if (figmaFile.files[0]) loadFile(figmaFile.files[0]);
});

uploadClear.addEventListener("click", (e) => {
  e.stopPropagation();
  clearUpload();
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      figmaImage = img;
      figmaPreview.src = ev.target.result;
      uploadInfo.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
      vpWidth.value  = img.naturalWidth;
      vpHeight.value = img.naturalHeight;
      uploadPrompt.classList.add("hidden");
      uploadPreview.classList.remove("hidden");
      checkReady();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function clearUpload() {
  figmaImage = null;
  figmaFile.value = "";
  figmaPreview.src = "";
  uploadPrompt.classList.remove("hidden");
  uploadPreview.classList.add("hidden");
  checkReady();
}

siteUrl.addEventListener("input", checkReady);

function checkReady() {
  compareBtn.disabled = !(figmaImage && siteUrl.value.trim());
}

// ── Sensitivity tabs ──────────────────────────────────────────────────────────
document.querySelectorAll(".sens-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sens-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    sensitivity = parseInt(btn.dataset.value, 10);
    sensHint.textContent = sensLabels[sensitivity] || "";
  });
});

// ── View tabs ─────────────────────────────────────────────────────────────────
document.querySelectorAll(".design-comp-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".design-comp-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeView = btn.dataset.view;
    renderView();
  });
});

function renderView() {
  const src = activeView === "figma" ? figmaCanvas
            : activeView === "site"  ? siteCanvas
            : diffCanvas;
  if (!src) return;

  const ctx = displayCanvas.getContext("2d");
  displayCanvas.width  = src.width;
  displayCanvas.height = src.height;
  ctx.clearRect(0, 0, src.width, src.height);
  ctx.drawImage(src, 0, 0);
}

// ── Run comparison ────────────────────────────────────────────────────────────
compareBtn.addEventListener("click", async () => {
  if (!figmaImage || !siteUrl.value.trim()) return;

  compareBtn.disabled = true;
  compareStatus.textContent = "";
  emptyState.classList.add("hidden");
  resultsContent.classList.add("hidden");
  designFindings.classList.add("hidden");
  progressWrap.classList.remove("hidden");

  await progressTo(5,  "Starting…",                  250);
  await progressTo(15, "Capturing site screenshot…", 300);

  // Slowly creep bar while waiting for the server screenshot (longest step)
  let creepId = setInterval(() => {
    const cur = parseFloat(progressFill.style.width) || 15;
    if (cur < 35) progressFill.style.width = `${Math.min(35, cur + 0.6).toFixed(1)}%`;
  }, 130);

  try {
    // 1. Server-side screenshot
    const captureRes = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url:    siteUrl.value.trim(),
        width:  parseInt(vpWidth.value, 10)  || 1280,
        height: parseInt(vpHeight.value, 10) || 900
      })
    });

    clearInterval(creepId);
    const captureData = await captureRes.json();
    if (!captureRes.ok) throw new Error(captureData.message || "Screenshot capture failed.");

    await progressTo(42, "Loading images…", 380);

    // 2. Load site image
    const siteImg = await loadImage(captureData.screenshot);

    await progressTo(54, "Preparing canvas…",   400);
    await progressTo(63, "Comparing colours…",  420);
    await progressTo(71, "Checking structure…", 400);
    await progressTo(78, "Measuring spacing…",  380);
    await progressTo(84, "Analysing fonts…",    380);

    // 3. Draw both images scaled to figma dimensions
    const W = figmaImage.naturalWidth;
    const H = figmaImage.naturalHeight;

    figmaCanvas = makeCanvas(W, H);
    figmaCanvas.getContext("2d").drawImage(figmaImage, 0, 0, W, H);

    siteCanvas = makeCanvas(W, H);
    siteCanvas.getContext("2d").drawImage(siteImg, 0, 0, W, H);

    // 4. Pixel diff
    const diff = analyzeDesigns(figmaCanvas, siteCanvas, sensitivity, W, H);
    diffCanvas = diff.canvas;

    await progressTo(91, "Building overlay…",   350);
    await progressTo(96, "Generating report…",  350);

    // 5. Show results
    const pct = diff.mismatchPercent;
    mismatchScore.textContent = `${pct}%`;

    let badgeText, badgeCls, scoreCls;
    if (pct < 25)      { badgeText = "Minor Mismatch";    badgeCls = "badge-pass"; scoreCls = "score-pass"; }
    else if (pct < 50) { badgeText = "Moderate Mismatch"; badgeCls = "badge-warn"; scoreCls = "score-warn"; }
    else               { badgeText = "Major Mismatch";    badgeCls = "badge-fail"; scoreCls = "score-fail"; }

    designBadge.textContent  = badgeText;
    designBadge.className    = `design-result-badge ${badgeCls}`;
    mismatchScore.className  = `design-score ${scoreCls}`;

    setMetric(barColor,      pctColor,      diff.color);
    setMetric(barOverlap,    pctOverlap,    diff.overlap);
    setMetric(barStructure,  pctStructure,  diff.structure);
    setMetric(barSpacing,    pctSpacing,    diff.spacing);
    setMetric(barTypography, pctTypography, diff.typography);

    // Reset to figma tab
    activeView = "figma";
    document.querySelectorAll(".design-comp-tab").forEach((b, i) => b.classList.toggle("active", i === 0));

    await progressTo(100, "Done", 250);
    progressWrap.classList.add("hidden");
    compareStatus.textContent = "";
    renderFindings(diff);
    resultsContent.classList.remove("hidden");
    renderView();

  } catch (err) {
    clearInterval(creepId);
    progressWrap.classList.add("hidden");
    compareStatus.textContent = `Error: ${err.message}`;
    emptyState.classList.remove("hidden");
  } finally {
    compareBtn.disabled = false;
    checkReady();
  }
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load captured screenshot."));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

function sobelEdges(d, w, h) {
  function L(x, y) {
    const i = (y * w + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -L(x-1,y-1)+L(x+1,y-1) - 2*L(x-1,y)+2*L(x+1,y) - L(x-1,y+1)+L(x+1,y+1);
      const gy = -L(x-1,y-1)-2*L(x,y-1)-L(x+1,y-1) + L(x-1,y+1)+2*L(x,y+1)+L(x+1,y+1);
      out[y * w + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 360);
    }
  }
  return out;
}

function scoreColor(d1, d2) {
  const h1 = new Float32Array(512), h2 = new Float32Array(512);
  const n  = d1.length / 4;
  for (let i = 0; i < d1.length; i += 4) {
    h1[(d1[i] >> 5) * 64 + (d1[i+1] >> 5) * 8 + (d1[i+2] >> 5)]++;
    h2[(d2[i] >> 5) * 64 + (d2[i+1] >> 5) * 8 + (d2[i+2] >> 5)]++;
  }
  let sim = 0;
  for (let i = 0; i < 512; i++) sim += Math.min(h1[i], h2[i]);
  return sim / n;
}

function scoreOverlap(d1, d2) {
  // Jaccard similarity of content regions (pixels darker than near-white threshold)
  const THRESH = 230;
  let both = 0, either = 0;
  for (let i = 0; i < d1.length; i += 4) {
    const l1 = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
    const l2 = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
    const c1 = l1 < THRESH, c2 = l2 < THRESH;
    if (c1 && c2) both++;
    if (c1 || c2) either++;
  }
  return either === 0 ? 1 : both / either;
}

function scoreEdgeMap(e1, e2, n, thinOnly) {
  let sim = 0;
  for (let i = 0; i < n; i++) {
    const a = thinOnly ? (e1[i] >= 0.05 && e1[i] <= 0.4 ? e1[i] : 0) : e1[i];
    const b = thinOnly ? (e2[i] >= 0.05 && e2[i] <= 0.4 ? e2[i] : 0) : e2[i];
    sim += 1 - Math.abs(a - b);
  }
  return sim / n;
}

function scoreSpacing(d1, d2, w, h) {
  const rP1 = new Float32Array(h), rP2 = new Float32Array(h);
  const cP1 = new Float32Array(w), cP2 = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i  = (y * w + x) * 4;
      const l1 = (0.299*d1[i] + 0.587*d1[i+1] + 0.114*d1[i+2]) / 255;
      const l2 = (0.299*d2[i] + 0.587*d2[i+1] + 0.114*d2[i+2]) / 255;
      rP1[y] += l1; rP2[y] += l2;
      cP1[x] += l1; cP2[x] += l2;
    }
  }
  let rSim = 0, cSim = 0;
  for (let y = 0; y < h; y++) rSim += 1 - Math.abs(rP1[y]/w - rP2[y]/w);
  for (let x = 0; x < w; x++) cSim += 1 - Math.abs(cP1[x]/h - cP2[x]/h);
  return (rSim/h + cSim/w) / 2;
}

function buildDiffOverlay(d1, d2, c1, c2, w, h, threshold) {
  const dc  = makeCanvas(w, h);
  const ctx = dc.getContext("2d");
  const img = ctx.createImageData(w, h);
  const dd  = img.data;

  for (let i = 0; i < d1.length; i += 4) {
    const lFigma = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
    const lSite  = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
    const excess = lFigma - lSite;

    // Only the surplus luminance goes into each channel:
    // matching pixels → excess ≈ 0 → both channels ≈ 0 → black (no yellow)
    // Figma-only content → excess > 0 → green
    // Site-only content  → excess < 0 → red
    dd[i]     = Math.min(255, Math.max(0, Math.round(-excess * 2))); // R = site surplus
    dd[i + 1] = Math.min(255, Math.max(0, Math.round( excess * 2))); // G = figma surplus
    dd[i + 2] = 0;
    dd[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return dc;
}

function analyzeDesigns(c1, c2, threshold, w, h) {
  const d1 = c1.getContext("2d").getImageData(0, 0, w, h).data;
  const d2 = c2.getContext("2d").getImageData(0, 0, w, h).data;
  const e1 = sobelEdges(d1, w, h);
  const e2 = sobelEdges(d2, w, h);

  const color      = scoreColor(d1, d2);
  const overlap    = scoreOverlap(d1, d2);
  const structure  = scoreEdgeMap(e1, e2, w * h, false);
  const spacing    = scoreSpacing(d1, d2, w, h);
  const typography = scoreEdgeMap(e1, e2, w * h, true);
  const overall    = (color + overlap + structure + spacing + typography) / 5;

  return {
    canvas:         buildDiffOverlay(d1, d2, c1, c2, w, h, threshold),
    color, overlap, structure, spacing, typography, overall,
    mismatchPercent: ((1 - overall) * 100).toFixed(1),
    total:          w * h,
    mismatch:       Math.round(w * h * (1 - overall))
  };
}

function setMetric(barEl, pctEl, score) {
  const pct = Math.round(score * 100);
  pctEl.textContent    = `${pct}%`;
  barEl.style.width    = `${pct}%`;
  barEl.style.background = pct >= 85 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
}

function setProgress(pct, label) {
  progressFill.style.width  = `${pct}%`;
  progressLabel.textContent = label;
}

function progressTo(pct, label, ms = 380) {
  setProgress(pct, label);
  return new Promise(r => setTimeout(r, ms));
}

function generateFindings(diff) {
  function lvl(s) { return s >= 0.90 ? 'pass' : s >= 0.65 ? 'warn' : 'fail'; }
  const c  = Math.round(diff.color      * 100);
  const b  = Math.round(diff.overlap    * 100);
  const s  = Math.round(diff.structure  * 100);
  const sp = Math.round(diff.spacing    * 100);
  const ty = Math.round(diff.typography * 100);
  return [
    {
      level: lvl(diff.color),
      text: c >= 90
        ? `Colors match well — the site palette is consistent with the design (${c}% match).`
        : c >= 65
          ? `Some color differences — a few elements use slightly different shades or tones (${c}% match).`
          : `Significant color mismatch — the site and design look noticeably different in color (${c}% match).`
    },
    {
      level: lvl(diff.overlap),
      text: b >= 90
        ? `Content regions overlap well — elements are placed in matching positions on both designs (${b}% match).`
        : b >= 65
          ? `Some content misalignment — a few elements appear in different areas between the design and the site (${b}% match).`
          : `Poor content overlap — many elements are positioned differently or are missing between the design and the site (${b}% match).`
    },
    {
      level: lvl(diff.structure),
      text: s >= 90
        ? `Layout and element positions match the design (${s}% match).`
        : s >= 65
          ? `Minor layout differences — some elements may be slightly shifted or resized (${s}% match).`
          : `Layout doesn't match — elements appear to be missing, moved, or sized differently (${s}% match).`
    },
    {
      level: lvl(diff.spacing),
      text: sp >= 90
        ? `Spacing, padding, and gaps match the design (${sp}% match).`
        : sp >= 65
          ? `Some spacing differences — margins or padding may be slightly off (${sp}% match).`
          : `Spacing doesn't match — gaps, padding, or margins differ noticeably from the design (${sp}% match).`
    },
    {
      level: lvl(diff.typography),
      text: ty >= 90
        ? `Text and font styles look consistent with the design (${ty}% match).`
        : ty >= 65
          ? `Minor text differences — font weight, size, or line spacing may differ slightly (${ty}% match).`
          : `Typography doesn't match — fonts, text sizes, or text layout differ from the design (${ty}% match).`
    }
  ];
}

function renderFindings(diff) {
  findingsList.innerHTML = generateFindings(diff)
    .map(f => `<li class="finding-item finding-${f.level}"><span class="finding-dot"></span><span>${f.text}</span></li>`)
    .join('');
  designFindings.classList.remove('hidden');
}
