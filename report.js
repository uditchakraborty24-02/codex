(function () {

  // ── Inject modal into page ──────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "reportModalOverlay";
  overlay.className = "report-modal-overlay";
  overlay.innerHTML = `
    <div class="report-modal-box">
      <p class="report-modal-title">Generate Report</p>
      <p class="report-modal-sub">Choose your preferred format</p>
      <div class="report-modal-choices">
        <button class="report-choice" id="reportChoiceHtml">
          <span class="report-choice-icon">⬇</span>
          <strong>Download HTML</strong>
          <span>Save as file, open anytime in browser</span>
        </button>
        <button class="report-choice" id="reportChoicePdf">
          <span class="report-choice-icon">🖨</span>
          <strong>Save as PDF</strong>
          <span>Opens print dialog — choose "Save as PDF"</span>
        </button>
      </div>
      <button class="report-modal-cancel" id="reportModalCancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  let _html = "";
  let _filename = "";

  function closeModal() {
    overlay.classList.remove("active");
  }

  document.getElementById("reportChoiceHtml").addEventListener("click", () => {
    const blob = new Blob([_html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = _filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    closeModal();
  });

  document.getElementById("reportChoicePdf").addEventListener("click", () => {
    const printHtml = _html.replace(
      "</body>",
      "<script>window.onload=function(){window.print();}<\/script></body>"
    );
    const blob = new Blob([printHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) alert("Popup blocked — please allow popups for this site and try again.");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    closeModal();
  });

  document.getElementById("reportModalCancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  window.showReportModal = function (html, filename) {
    _html = html;
    _filename = filename;
    overlay.classList.add("active");
  };

  // ── Shared helpers ──────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#172033;background:#f3f6fb;padding:32px}
    .rw{max-width:900px;margin:0 auto}
    .rh{background:linear-gradient(135deg,#172033 0%,#1d4ed8 100%);color:#fff;padding:36px;border-radius:16px;margin-bottom:20px}
    .rh h1{font-size:1.85rem;margin-bottom:6px}
    .rh p{opacity:.78;font-size:.95rem;margin-top:4px}
    .rb{display:inline-block;padding:5px 16px;border-radius:999px;font-size:.8rem;font-weight:800;margin-top:14px;letter-spacing:.04em}
    .rb.pass{background:#d1fae5;color:#065f46}
    .rb.warn{background:#fef3c7;color:#92400e}
    .rb.fail{background:#fee2e2;color:#991b1b}
    .rs{background:#fff;border-radius:14px;padding:24px;margin-bottom:16px;box-shadow:0 2px 12px rgba(23,32,51,.07)}
    .rs h2{font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#2563eb;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #e2e8f0}
    .kv{display:grid;grid-template-columns:160px 1fr;gap:10px 20px;align-items:start}
    .kv .k{color:#667085;font-size:.88rem;font-weight:700;padding-top:2px}
    .kv .v{font-size:.92rem;word-break:break-all}
    .st{display:inline-flex;align-items:center;padding:3px 12px;border-radius:999px;font-weight:700;font-size:.9rem}
    .st.ok{background:#dcfce7;color:#166534}
    .st.rd{background:#e0f2fe;color:#075985}
    .st.wn{background:#fef3c7;color:#92400e}
    .st.er{background:#fee2e2;color:#991b1b}
    .mg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .mc{padding:18px;border:1px solid #e2e8f0;border-radius:12px;text-align:center}
    .mc .ml{font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#667085;margin-bottom:8px}
    .mc .mv{font-size:1.4rem;font-weight:800}
    .mc.mok{background:#ecfdf5;border-color:#bbf7d0;color:#047857}
    .mc.mer{background:#fff1f2;border-color:#fecdd3;color:#be123c}
    pre{background:#0f172a;color:#93c5fd;padding:18px;border-radius:10px;font-family:Consolas,'Courier New',monospace;font-size:.84rem;line-height:1.6;white-space:pre-wrap;word-break:break-all;margin-top:8px}
    .rf{text-align:center;padding:20px;color:#94a3b8;font-size:.8rem;margin-top:4px}
    @media print{
      body{background:#fff;padding:16px}
      .rs{box-shadow:none;border:1px solid #e2e8f0;break-inside:avoid}
      .rh,.mc{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
  `;

  function wrap(body, title) {
    const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body>
<div class="rw">
${body}
  <div class="rf">Generated by Codex &nbsp;·&nbsp; ${ts}</div>
</div>
</body>
</html>`;
  }

  function ts() {
    return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  }

  // ── API Report ──────────────────────────────────────────────────────────────
  window.buildApiReport = function (req, resp) {
    const sc = resp.status;
    const stClass = sc >= 500 ? "er" : sc >= 400 ? "wn" : sc >= 300 ? "rd" : "ok";
    const badgeClass = sc >= 400 ? "fail" : sc >= 300 ? "warn" : "pass";
    const badgeText = sc >= 400 ? "FAILED" : sc >= 300 ? "REDIRECTED" : "PASSED";

    const reqHeaderLines = (req.headers || [])
      .filter(h => h.name)
      .map(h => `${esc(h.name)}: ${esc(h.value)}`)
      .join("\n");

    const respHeaderLines = Object.entries(resp.headers || {})
      .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
      .join("\n");

    let body = resp.body || "";
    try { body = JSON.stringify(JSON.parse(body), null, 2); } catch {}
    const size = new Blob([resp.body || ""]).size;

    const html = `
  <div class="rh">
    <h1>API Test Report</h1>
    <p>${esc(req.method)} &nbsp;·&nbsp; ${esc(req.url)}</p>
    <span class="rb ${badgeClass}">${badgeText}</span>
  </div>

  <div class="rs">
    <h2>Request</h2>
    <div class="kv">
      <div class="k">Method</div><div class="v">${esc(req.method)}</div>
      <div class="k">URL</div><div class="v">${esc(req.url)}</div>
      <div class="k">Headers</div><div class="v">${reqHeaderLines ? `<pre>${reqHeaderLines}</pre>` : '<span style="color:#94a3b8">—</span>'}</div>
      <div class="k">Body</div><div class="v">${req.body ? `<pre>${esc(req.body)}</pre>` : '<span style="color:#94a3b8">—</span>'}</div>
    </div>
  </div>

  <div class="rs">
    <h2>Response Summary</h2>
    <div class="kv">
      <div class="k">Status</div><div class="v"><span class="st ${stClass}">${sc} ${esc(resp.statusText || "")}</span></div>
      <div class="k">Time</div><div class="v">${resp.timeMs} ms</div>
      <div class="k">Size</div><div class="v">${size} B</div>
      <div class="k">Content-Type</div><div class="v">${esc(resp.contentType || "—")}</div>
    </div>
  </div>

  ${respHeaderLines ? `<div class="rs"><h2>Response Headers</h2><pre>${respHeaderLines}</pre></div>` : ""}

  <div class="rs">
    <h2>Response Body</h2>
    <pre>${esc(body)}</pre>
  </div>`;

    return { html: wrap(html, "API Test Report"), filename: `api-report-${ts()}.html` };
  };

  // ── Performance Report ──────────────────────────────────────────────────────
  window.buildPerfReport = function (cfg, result) {
    const hasErr = result.errorCount > 0;
    const allFail = result.successCount === 0;
    const badgeClass = allFail ? "fail" : hasErr ? "warn" : "pass";
    const badgeText = allFail ? "FAILED" : hasErr ? "COMPLETED WITH ERRORS" : "COMPLETED";
    const stClass = allFail ? "er" : hasErr ? "wn" : "ok";

    const errorRows = (result.errors || []).map(e => `
    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #e2e8f0">
      <div class="kv">
        <div class="k">Status</div><div class="v">${esc(String(e.status || "—"))}</div>
        <div class="k">Message</div><div class="v">${esc(e.message)}</div>
        <div class="k">Time</div><div class="v">${e.timeMs} ms</div>
      </div>
    </div>`).join("");

    const html = `
  <div class="rh">
    <h1>Load Test Report</h1>
    <p>${esc(cfg.method)} &nbsp;·&nbsp; ${esc(cfg.url)}</p>
    <span class="rb ${badgeClass}">${badgeText}</span>
  </div>

  <div class="rs">
    <h2>Test Configuration</h2>
    <div class="kv">
      <div class="k">Target URL</div><div class="v">${esc(cfg.url)}</div>
      <div class="k">Method</div><div class="v">${esc(cfg.method)}</div>
      <div class="k">Test Type</div><div class="v">${cfg.type === "button" ? "Button Action Endpoint" : "Hit URL"}</div>
      <div class="k">Virtual Users</div><div class="v">${Number(result.virtualUsers).toLocaleString()}</div>
      <div class="k">Actual Requests</div><div class="v">${Number(result.actualRequests).toLocaleString()}</div>
      <div class="k">Concurrency</div><div class="v">${Number(result.concurrency).toLocaleString()} at once</div>
      ${cfg.body ? `<div class="k">Request Body</div><div class="v"><pre>${esc(cfg.body)}</pre></div>` : ""}
    </div>
  </div>

  <div class="rs">
    <h2>Run Summary</h2>
    <div class="kv">
      <div class="k">Status</div><div class="v"><span class="st ${stClass}">${badgeText}</span></div>
      <div class="k">Total Time</div><div class="v">${result.totalTimeMs} ms</div>
      <div class="k">Throughput</div><div class="v">${Number(result.requestsPerSecond).toFixed(2)} req/s</div>
    </div>
  </div>

  <div class="rs">
    <h2>Metrics</h2>
    <div class="mg">
      <div class="mc mok"><div class="ml">Successful</div><div class="mv">${Number(result.successCount).toLocaleString()}</div></div>
      <div class="mc mer"><div class="ml">Errors</div><div class="mv">${Number(result.errorCount).toLocaleString()}</div></div>
      <div class="mc"><div class="ml">Avg Response</div><div class="mv">${Math.round(result.averageMs)} ms</div></div>
      <div class="mc"><div class="ml">Fastest</div><div class="mv">${result.fastestMs} ms</div></div>
      <div class="mc"><div class="ml">Slowest</div><div class="mv">${result.slowestMs} ms</div></div>
      <div class="mc"><div class="ml">Throughput</div><div class="mv">${Number(result.requestsPerSecond).toFixed(2)} <small style="font-size:.65em;font-weight:600">req/s</small></div></div>
    </div>
  </div>

  ${result.errors && result.errors.length ? `<div class="rs"><h2>Error Samples</h2>${errorRows}</div>` : ""}`;

    return { html: wrap(html, "Load Test Report"), filename: `perf-report-${ts()}.html` };
  };

  // ── Design Report ───────────────────────────────────────────────────────────
  window.buildDesignReport = function (cfg, diff, diffDataUrl) {
    const pct      = parseFloat(diff.mismatchPercent);
    const badgeClass = pct < 25 ? "pass" : pct < 50 ? "warn" : "fail";
    const badgeText  = pct < 25 ? "MINOR MISMATCH" : pct < 50 ? "MODERATE MISMATCH" : "MAJOR MISMATCH";

    function metricRow(label, score) {
      const p   = Math.round(score * 100);
      const col  = p >= 85 ? "#16a34a" : p >= 60 ? "#d97706" : "#dc2626";
      return `
        <tr>
          <td class="k">${esc(label)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
                <div style="width:${p}%;height:100%;background:${col};border-radius:3px"></div>
              </div>
              <span style="font-weight:800;color:${col};min-width:38px;text-align:right">${p}%</span>
            </div>
          </td>
        </tr>`;
    }

    function findingDot(score) {
      return score >= 0.90 ? "#16a34a" : score >= 0.65 ? "#d97706" : "#dc2626";
    }

    const findings = [
      { label: "Color",       score: diff.color },
      { label: "Overlap",     score: diff.overlap },
      { label: "Structure",   score: diff.structure },
      { label: "Spacing",     score: diff.spacing },
      { label: "Typography",  score: diff.typography },
    ];

    const findingTexts = {
      Color:      [
        `Colors match well — the site palette is consistent with the design.`,
        `Some color differences — a few elements use slightly different shades or tones.`,
        `Significant color mismatch — the site and design look noticeably different in color.`
      ],
      Overlap:    [
        `Content regions overlap well — elements are placed in matching positions on both designs.`,
        `Some content misalignment — a few elements appear in different areas between the design and the site.`,
        `Poor content overlap — many elements are positioned differently or are missing.`
      ],
      Structure:  [
        `Layout and element positions match the design.`,
        `Minor layout differences — some elements may be slightly shifted or resized.`,
        `Layout doesn't match — elements appear to be missing, moved, or sized differently.`
      ],
      Spacing:    [
        `Spacing, padding, and gaps match the design.`,
        `Some spacing differences — margins or padding may be slightly off.`,
        `Spacing doesn't match — gaps, padding, or margins differ noticeably from the design.`
      ],
      Typography: [
        `Text and font styles look consistent with the design.`,
        `Minor text differences — font weight, size, or line spacing may differ slightly.`,
        `Typography doesn't match — fonts, text sizes, or text layout differ from the design.`
      ]
    };

    const findingRows = findings.map(f => {
      const p   = Math.round(f.score * 100);
      const idx  = f.score >= 0.90 ? 0 : f.score >= 0.65 ? 1 : 2;
      const dot  = findingDot(f.score);
      return `<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;font-size:.88rem;line-height:1.5">
        <span style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${dot};margin-top:5px;display:inline-block"></span>
        <span><strong>${esc(f.label)} (${p}%):</strong> ${findingTexts[f.label][idx]}</span>
      </li>`;
    }).join("");

    const imgSection = diffDataUrl ? `
  <div class="rs">
    <h2>Diff Overlay</h2>
    <p style="font-size:.82rem;color:#667085;margin-bottom:12px">Green = Figma&nbsp;&nbsp;·&nbsp;&nbsp;Red = Live Site&nbsp;&nbsp;·&nbsp;&nbsp;Black = Match</p>
    <img src="${diffDataUrl}" style="max-width:100%;border-radius:10px;border:1px solid #e2e8f0" alt="Diff overlay">
  </div>` : "";

    const html = `
  <div class="rh">
    <h1>Design Compare Report</h1>
    <p>${esc(cfg.url)} &nbsp;·&nbsp; ${esc(cfg.width)} × ${esc(cfg.height)} px</p>
    <span class="rb ${badgeClass}">${badgeText} — ${pct}%</span>
  </div>

  <div class="rs">
    <h2>Comparison Settings</h2>
    <div class="kv">
      <div class="k">Page URL</div><div class="v">${esc(cfg.url)}</div>
      <div class="k">Viewport</div><div class="v">${esc(cfg.width)} × ${esc(cfg.height)} px</div>
      <div class="k">Sensitivity</div><div class="v">${esc(cfg.sensitivity)}</div>
      <div class="k">Overall Mismatch</div><div class="v"><strong>${pct}%</strong></div>
    </div>
  </div>

  <div class="rs">
    <h2>Metric Breakdown</h2>
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${findings.map(f => metricRow(f.label, f.score)).join("")}
      </tbody>
    </table>
  </div>

  <div class="rs">
    <h2>What's Different</h2>
    <ul style="list-style:none;padding:0;margin:0">${findingRows}</ul>
  </div>

  ${imgSection}`;

    return { html: wrap(html, "Design Compare Report"), filename: `design-report-${ts()}.html` };
  };

})();
