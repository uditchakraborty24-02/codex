// Auth guard
const _user = JSON.parse(localStorage.getItem("loggedInUser") || "null");
if (!_user) { window.location.href = "/"; }
const USER_EMAIL = (_user && _user.email) ? _user.email.trim().toLowerCase() : "";

// ── Browser select ───────────────────────────────────────────
const browserSelect = document.getElementById("browserSelect");
(async () => {
  try {
    const res      = await fetch("/api/browsers");
    const browsers = await res.json();
    const ICONS    = { chrome: "🟡", edge: "🔵", firefox: "🦊", brave: "🦁", opera: "🔴", default: "🌐" };
    browserSelect.innerHTML = browsers.map(b =>
      `<option value="${b.path || ''}">${(ICONS[b.id] || "🌐")} ${b.name}</option>`
    ).join('');
  } catch {
    browserSelect.innerHTML = '<option value="">🌐 Default</option>';
  }
})();
function getBrowserPath() { return browserSelect.value || null; }

// ── Headless toggle ──────────────────────────────────────────
const headlessToggle = document.getElementById("headlessToggle");
const headlessLabel  = document.getElementById("headlessLabel");
headlessToggle.addEventListener("change", () => {
  headlessLabel.textContent = headlessToggle.checked ? "Show Browser" : "Headless";
});
function isHeadless() { return !headlessToggle.checked; }

// ── Screenshot modal ─────────────────────────────────────────
function showScreenshot(dataUrl) {
  const img      = document.getElementById("screenshotImg");
  const fallback = document.getElementById("screenshotFallback");
  if (dataUrl) {
    img.src = dataUrl;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
    img.onerror = () => {
      img.classList.add("hidden");
      fallback.classList.remove("hidden");
    };
  } else {
    img.src = "";
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
  }
  document.getElementById("screenshotModal").style.display = "flex";
}
document.getElementById("closeScreenshotBtn").addEventListener("click", () => {
  document.getElementById("screenshotModal").style.display = "none";
});
document.getElementById("screenshotBackdrop").addEventListener("click", () => {
  document.getElementById("screenshotModal").style.display = "none";
});

function attachScreenshotBtn(tr, dataUrl) {
  const existing = tr.querySelector(".func-screenshot-btn");
  if (existing) existing.remove();
  tr.dataset.screenshot = dataUrl || "";
  if (!dataUrl) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "func-screenshot-btn";
  btn.title = "View failure screenshot";
  btn.textContent = "📸";
  btn.addEventListener("click", () => showScreenshot(dataUrl));
  tr.querySelector(".col-actions-cell").appendChild(btn);
}

// ── Mode tabs ────────────────────────────────────────────────
const modeTabs    = document.querySelectorAll(".func-mode-tab");
const writePanel  = document.getElementById("writePanel");
const uploadPanel = document.getElementById("uploadPanel");

modeTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    modeTabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    const mode = tab.dataset.mode;
    writePanel.classList.toggle("hidden", mode !== "write");
    uploadPanel.classList.toggle("hidden", mode !== "upload");
  });
});

// ── Save indicator ───────────────────────────────────────────
const saveIndicator = (() => {
  const el = document.createElement("span");
  el.className = "func-save-indicator";
  el.id = "saveIndicator";
  document.querySelector(".func-header-actions").prepend(el);
  return el;
})();

let saveTimer = null;

function markDirty() {
  saveIndicator.textContent = "Unsaved changes";
  saveIndicator.className = "func-save-indicator dirty";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveTestCases, 1500);
}

async function saveTestCases() {
  saveIndicator.textContent = "Saving…";
  saveIndicator.className = "func-save-indicator saving";
  try {
    await fetch("/api/testcases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER_EMAIL, cases: collectRows() }),
    });
    saveIndicator.textContent = "Saved";
    saveIndicator.className = "func-save-indicator saved";
  } catch {
    saveIndicator.textContent = "Save failed";
    saveIndicator.className = "func-save-indicator error";
  }
}

function collectRows() {
  return Array.from(tbody.querySelectorAll("tr")).map(tr => {
    const inputs    = tr.querySelectorAll("input.func-cell-input");
    const areas     = tr.querySelectorAll("textarea.func-cell-area");
    const actualDiv = tr.querySelector(".func-actual-output");
    const badge = tr.querySelector(".func-status-badge");
    return {
      name:     inputs[0] ? inputs[0].value : "",
      details:  areas[0]  ? areas[0].value  : "",
      steps:    areas[1]  ? areas[1].value  : "",
      expected: areas[2]  ? areas[2].value  : "",
      actual:   actualDiv ? actualDiv.dataset.value || "" : "",
      status:   badge     ? badge.textContent : "Not Started",
    };
  });
}

// ── Write Test Case ──────────────────────────────────────────
const tbody          = document.getElementById("testCaseBody");
const emptyState     = document.getElementById("writeEmptyState");
const rowCountLabel  = document.getElementById("rowCountLabel");
const writeTableWrap = document.getElementById("writeTableWrap");

const STATUS_OPTIONS = ["Not Started", "Pass", "Fail", "Blocked"];

function statusCls(val) {
  return { Pass: "st-pass", Fail: "st-fail", Blocked: "st-blocked", "Not Started": "st-pending" }[val] || "st-pending";
}

function refreshMeta() {
  const count = tbody.children.length;
  emptyState.classList.toggle("hidden", count > 0);
  writeTableWrap.classList.toggle("hidden", count === 0);
  rowCountLabel.textContent = count === 1 ? "1 test case" : `${count} test cases`;
  Array.from(tbody.children).forEach((row, i) => {
    row.querySelector(".col-sr-cell").textContent = i + 1;
  });
}

function autoResize() {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
}

function makeCell(tag, placeholder, value) {
  const el = document.createElement(tag);
  el.className = "func-cell-" + (tag === "textarea" ? "area" : "input");
  el.placeholder = placeholder;
  el.value = value;
  if (tag === "textarea") {
    el.rows = 3;
    el.addEventListener("input", autoResize);
    el.addEventListener("input", markDirty);
    setTimeout(() => autoResize.call(el));
  } else {
    el.addEventListener("input", markDirty);
  }
  return el;
}

// ── Shared: run a test row ───────────────────────────────────
function setActual(div, text) {
  if (!div) return;
  div.textContent = text;
  div.dataset.value = text;
  div.title = text;
}

async function runTestCase(tr, runBtn) {
  const areas     = tr.querySelectorAll("textarea.func-cell-area");
  const actualDiv = tr.querySelector(".func-actual-output");
  const badge     = tr.querySelector(".func-status-badge");
  const stepsArea    = areas[1];
  const expectedArea = areas[2];

  const steps    = stepsArea    ? stepsArea.value.trim()    : "";
  const expected = expectedArea ? expectedArea.value.trim() : "";

  if (!steps) {
    setActual(actualDiv, "No steps provided. Add steps in the Steps column first.");
    return;
  }

  runBtn.disabled = true;
  runBtn.innerHTML = `<span class="func-spinner"></span>`;
  tr.classList.add("row-running");
  setActual(actualDiv, "Running…");

  try {
    const res  = await fetch("/api/run-testcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, expected, headless: isHeadless(), browserPath: getBrowserPath() }),
    });
    const data = await res.json();

    setActual(actualDiv, data.actual || "");

    const newStatus = data.status || "Fail";
    if (badge) { badge.textContent = newStatus; badge.className = "func-status-badge " + statusCls(newStatus); }
    attachScreenshotBtn(tr, newStatus === "Fail" ? (data.screenshot || null) : null);

    tr.classList.remove("row-running");
    tr.classList.add(newStatus === "Pass" ? "row-pass" : "row-fail");
    setTimeout(() => tr.classList.remove("row-pass", "row-fail"), 2200);

    markDirty();
  } catch (err) {
    setActual(actualDiv, "Runner error: " + err.message);
    if (badge) { badge.textContent = "Fail"; badge.className = "func-status-badge st-fail"; }
    tr.classList.remove("row-running");
    markDirty();
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = "▶";
  }
}

function addRow(data = {}, silent = false) {
  const tr = document.createElement("tr");

  // Sr No
  const tdSr = document.createElement("td");
  tdSr.className = "col-sr-cell";
  tdSr.textContent = tbody.children.length + 1;
  tr.appendChild(tdSr);

  // Text columns
  const fields = [
    { tag: "input",    placeholder: "e.g. Login with valid credentials",                key: "name"     },
    { tag: "textarea", placeholder: "Describe what this test verifies",                  key: "details"  },
    { tag: "textarea", placeholder: "1. Open https://yoursite.com\n2. Enter value in field\n3. Click button", key: "steps"    },
    { tag: "textarea", placeholder: "User is redirected to dashboard",                   key: "expected" },
    { tag: "textarea", placeholder: "Filled automatically when you click ▶ Run",        key: "actual"   },
  ];

  fields.forEach(f => {
    const td = document.createElement("td");
    if (f.key === "actual") {
      const div = document.createElement("div");
      div.className = "func-actual-output";
      div.dataset.value = data[f.key] || "";
      div.textContent = data[f.key] || "";
      div.title = data[f.key] || "";
      td.appendChild(div);
    } else {
      td.appendChild(makeCell(f.tag, f.placeholder, data[f.key] || ""));
    }
    tr.appendChild(td);
  });

  // Status (read-only badge, set automatically on run)
  const tdSt = document.createElement("td");
  const badge = document.createElement("span");
  const st = data.status || "Not Started";
  badge.className = "func-status-badge " + statusCls(st);
  badge.textContent = st;
  tdSt.appendChild(badge);
  tr.appendChild(tdSt);

  // Actions: Run + Delete
  const tdAct = document.createElement("td");
  tdAct.className = "col-actions-cell";

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "func-run-btn";
  runBtn.title = "Run this test case";
  runBtn.textContent = "▶";
  runBtn.addEventListener("click", () => runTestCase(tr, runBtn));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "func-del-btn";
  delBtn.title = "Remove row";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", () => { tr.remove(); refreshMeta(); markDirty(); });

  tdAct.appendChild(runBtn);
  tdAct.appendChild(delBtn);
  tr.appendChild(tdAct);

  tbody.appendChild(tr);
  refreshMeta();

  if (!silent) {
    tr.querySelector("input, textarea").focus();
    markDirty();
  }
}

document.getElementById("addRowBtn").addEventListener("click", () => addRow());

// ── Run All (Write) ──────────────────────────────────────────
document.getElementById("runAllBtn").addEventListener("click", async () => {
  const rows = Array.from(tbody.querySelectorAll("tr"));
  if (!rows.length) return;

  const runAllBtn = document.getElementById("runAllBtn");
  runAllBtn.disabled = true;
  runAllBtn.textContent = "Running…";

  for (const tr of rows) {
    const runBtn = tr.querySelector(".func-run-btn");
    await runTestCase(tr, runBtn);
    await new Promise(r => setTimeout(r, 300));
  }

  runAllBtn.disabled = false;
  runAllBtn.textContent = "▶ Run All";
});

// ── Clear All (Write) ────────────────────────────────────────
document.getElementById("clearAllBtn").addEventListener("click", () => {
  if (!tbody.children.length) return;
  if (!confirm("Remove all test cases? This cannot be undone.")) return;
  tbody.innerHTML = "";
  refreshMeta();
  markDirty();
});

// ── Clear Results (Write) ────────────────────────────────────
document.getElementById("clearResultsBtn").addEventListener("click", () => {
  Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
    const actualDiv = tr.querySelector(".func-actual-output");
    const badge     = tr.querySelector(".func-status-badge");
    if (actualDiv) { actualDiv.textContent = ""; actualDiv.dataset.value = ""; actualDiv.title = ""; }
    if (badge)     { badge.textContent = "Not Started"; badge.className = "func-status-badge st-pending"; }
    tr.querySelector(".func-screenshot-btn")?.remove();
    tr.dataset.screenshot = "";
    tr.classList.remove("row-pass", "row-fail", "row-running");
  });
  markDirty();
});

// ── Load saved test cases on start ──────────────────────────
async function loadTestCases() {
  try {
    const res  = await fetch(`/api/testcases?email=${encodeURIComponent(USER_EMAIL)}`);
    const data = await res.json();
    if (data.cases && data.cases.length > 0) {
      data.cases.forEach(c => addRow(c, true));
      saveIndicator.textContent = "Loaded";
      saveIndicator.className = "func-save-indicator saved";
      setTimeout(() => { saveIndicator.textContent = ""; saveIndicator.className = "func-save-indicator"; }, 2000);
    } else {
      addRow({}, true);
    }
  } catch {
    addRow({}, true);
  }
}

loadTestCases();

// ── Upload: save / load ──────────────────────────────────────
let uploadFilename = "";

function collectUploadRows() {
  return Array.from(uploadBody.querySelectorAll("tr")).map(tr => ({
    name:     tr.cells[1] ? tr.cells[1].textContent : "",
    details:  tr.cells[2] ? tr.cells[2].textContent : "",
    steps:    tr.dataset.steps    || "",
    expected: tr.dataset.expected || "",
    actual:   tr.querySelector(".func-actual-output")?.dataset.value || "",
    status:   tr.querySelector(".func-status-badge")?.textContent || "Not Started",
  }));
}

async function saveUploadCases() {
  const cases = collectUploadRows();
  if (!cases.length) return;
  try {
    await fetch("/api/testcases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER_EMAIL, uploadCases: cases, uploadFilename }),
    });
  } catch {}
}

async function loadUploadCases() {
  try {
    const res  = await fetch(`/api/testcases?email=${encodeURIComponent(USER_EMAIL)}`);
    const data = await res.json();
    if (!data.uploadCases || !data.uploadCases.length) return;
    uploadFilename = data.uploadFilename || "Saved upload";
    uploadBody.innerHTML = "";
    data.uploadCases.forEach((row, i) => uploadBody.appendChild(addUploadRow(row, i)));
    uploadWrap.classList.remove("hidden");
    const n = data.uploadCases.length;
    uploadMeta.textContent = `${n} test case${n !== 1 ? "s" : ""} loaded from "${uploadFilename}"`;
    uploadPrompt.querySelector("strong").textContent = "Drop your Excel file here";
    uploadPrompt.querySelector("span").textContent   = "or click to browse (.xlsx, .xls, .csv)";
    document.getElementById("uploadRunAllBtn").classList.remove("hidden");
    document.getElementById("uploadClearBtn").classList.remove("hidden");
    document.getElementById("uploadClearAllBtn").classList.remove("hidden");
    document.getElementById("uploadReportWrap").classList.remove("hidden");
  } catch {}
}

// ── Upload: build a single interactive row ───────────────────
function addUploadRow(data, index) {
  const { name='', details='', steps='', expected='', actual='', status='Not Started' } = data;

  const tr = document.createElement("tr");
  tr.dataset.steps    = steps;
  tr.dataset.expected = expected;

  // Sr No
  const tdSr = document.createElement("td");
  tdSr.textContent = index + 1;
  tr.appendChild(tdSr);

  // Read-only text cells
  [name, details, steps, expected].forEach(val => {
    const td = document.createElement("td");
    td.textContent = val;
    tr.appendChild(td);
  });

  // Actual Output
  const tdActual = document.createElement("td");
  const actualDiv = document.createElement("div");
  actualDiv.className = "func-actual-output";
  actualDiv.dataset.value = actual;
  actualDiv.textContent = actual;
  actualDiv.title = actual;
  tdActual.appendChild(actualDiv);
  tr.appendChild(tdActual);

  // Status (read-only badge, set automatically on run)
  const tdSt = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "func-status-badge " + statusCls(status);
  badge.textContent = status;
  tdSt.appendChild(badge);
  tr.appendChild(tdSt);

  // Actions: Run + Delete
  const tdAct = document.createElement("td");
  tdAct.className = "col-actions-cell";

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "func-run-btn";
  runBtn.title = "Run this test case";
  runBtn.textContent = "▶";
  runBtn.addEventListener("click", () => runUploadRow(tr, runBtn));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "func-del-btn";
  delBtn.title = "Remove row";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", () => {
    tr.remove();
    // Re-number remaining rows
    Array.from(uploadBody.querySelectorAll("tr")).forEach((r, i) => {
      if (r.cells[0]) r.cells[0].textContent = i + 1;
    });
    const remaining = uploadBody.querySelectorAll("tr").length;
    if (remaining === 0) {
      uploadWrap.classList.add("hidden");
      document.getElementById("uploadRunAllBtn").classList.add("hidden");
      document.getElementById("uploadClearBtn").classList.add("hidden");
      document.getElementById("uploadClearAllBtn").classList.add("hidden");
      document.getElementById("uploadReportWrap").classList.add("hidden");
      uploadMeta.textContent = "";
    } else {
      uploadMeta.textContent = `${remaining} test case${remaining !== 1 ? "s" : ""} — ${uploadFilename}`;
    }
    saveUploadCases();
  });

  tdAct.appendChild(runBtn);
  tdAct.appendChild(delBtn);
  tr.appendChild(tdAct);

  return tr;
}

// ── Upload Test Case ─────────────────────────────────────────
const uploadZone   = document.getElementById("excelUploadZone");
const excelInput   = document.getElementById("excelFile");
const uploadWrap   = document.getElementById("uploadTableWrap");
const uploadMeta   = document.getElementById("uploadMeta");
const uploadBody   = document.getElementById("uploadTableBody");
const uploadPrompt = document.getElementById("excelUploadPrompt");

loadUploadCases();

uploadZone.addEventListener("click", () => excelInput.click());
uploadZone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); excelInput.click(); }
});
uploadZone.addEventListener("dragover",  e => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f) handleExcelFile(f);
});
excelInput.addEventListener("change", e => {
  if (e.target.files[0]) handleExcelFile(e.target.files[0]);
});

function handleExcelFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb   = XLSX.read(data, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      renderUploadTable(rows, file.name);
    } catch (err) {
      showUploadError("Could not read file: " + err.message);
    }
  };
  reader.onerror = () => showUploadError("Failed to read the file.");
  reader.readAsArrayBuffer(file);
}

function showUploadError(msg) {
  uploadWrap.classList.add("hidden");
  const p = Object.assign(document.createElement("p"), { className: "func-upload-error", textContent: msg });
  uploadZone.after(p);
  setTimeout(() => p.remove(), 4000);
}

const COL_ALIASES = {
  "sr no":"sr","sr":"sr","no":"sr","#":"sr",
  "test case name":"name","name":"name","title":"name",
  "test case details":"details","details":"details","description":"details",
  "steps":"steps","step":"steps",
  "expected output":"expected","expected":"expected",
  "actual output":"actual","actual":"actual",
  "status":"status",
};

// ── Run a single upload row ──────────────────────────────────
async function runUploadRow(tr, runBtn) {
  const actualDiv = tr.querySelector(".func-actual-output");
  const badge     = tr.querySelector(".func-status-badge");
  const steps     = tr.dataset.steps    || "";
  const expected  = tr.dataset.expected || "";

  if (!steps) {
    setActual(actualDiv, "No steps provided in this row.");
    return;
  }

  runBtn.disabled = true;
  runBtn.innerHTML = `<span class="func-spinner"></span>`;
  tr.classList.add("row-running");
  setActual(actualDiv, "Running…");

  try {
    const res  = await fetch("/api/run-testcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, expected, headless: isHeadless(), browserPath: getBrowserPath() }),
    });
    const data = await res.json();

    setActual(actualDiv, data.actual || "");

    const newStatus = data.status || "Fail";
    if (badge) { badge.textContent = newStatus; badge.className = "func-status-badge " + statusCls(newStatus); }
    attachScreenshotBtn(tr, newStatus === "Fail" ? (data.screenshot || null) : null);

    tr.classList.remove("row-running");
    tr.classList.add(newStatus === "Pass" ? "row-pass" : "row-fail");
    setTimeout(() => tr.classList.remove("row-pass", "row-fail"), 2200);
    saveUploadCases();
  } catch (err) {
    setActual(actualDiv, "Runner error: " + err.message);
    if (badge) { badge.textContent = "Fail"; badge.className = "func-status-badge st-fail"; }
    tr.classList.remove("row-running");
    saveUploadCases();
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = "▶";
  }
}

// ── Run All (Upload) ─────────────────────────────────────────
document.getElementById("uploadRunAllBtn").addEventListener("click", async () => {
  const rows = Array.from(uploadBody.querySelectorAll("tr"));
  if (!rows.length) return;

  const btn = document.getElementById("uploadRunAllBtn");
  btn.disabled = true;
  btn.textContent = "Running…";

  for (const tr of rows) {
    const runBtn = tr.querySelector(".func-run-btn");
    await runUploadRow(tr, runBtn);
    await new Promise(r => setTimeout(r, 300));
  }

  btn.disabled = false;
  btn.textContent = "▶ Run All";
});

// ── Clear All (Upload) ───────────────────────────────────────
document.getElementById("uploadClearAllBtn").addEventListener("click", () => {
  if (!uploadBody.children.length) return;
  if (!confirm("Remove all uploaded test cases? This cannot be undone.")) return;
  uploadBody.innerHTML = "";
  uploadWrap.classList.add("hidden");
  uploadMeta.textContent = "";
  uploadFilename = "";
  document.getElementById("uploadRunAllBtn").classList.add("hidden");
  document.getElementById("uploadClearBtn").classList.add("hidden");
  document.getElementById("uploadClearAllBtn").classList.add("hidden");
  document.getElementById("uploadReportWrap").classList.add("hidden");
  saveUploadCases();
});

// ── Clear Results (Upload) ───────────────────────────────────
document.getElementById("uploadClearBtn").addEventListener("click", () => {
  Array.from(uploadBody.querySelectorAll("tr")).forEach(tr => {
    const actualDiv = tr.querySelector(".func-actual-output");
    const badge     = tr.querySelector(".func-status-badge");
    if (actualDiv) { actualDiv.textContent = ""; actualDiv.dataset.value = ""; actualDiv.title = ""; }
    if (badge)     { badge.textContent = "Not Started"; badge.className = "func-status-badge st-pending"; }
    tr.querySelector(".func-screenshot-btn")?.remove();
    tr.dataset.screenshot = "";
    tr.classList.remove("row-pass", "row-fail", "row-running");
  });
  saveUploadCases();
});

function renderUploadTable(rows, filename) {
  if (!rows.length) { showUploadError("The file appears to be empty."); return; }

  const headerRow = rows[0].map(c => String(c).toLowerCase().trim());
  const mapped    = headerRow.map(h => COL_ALIASES[h] || null);
  const hasHeader = mapped.some(m => m !== null);
  const dataStart = hasHeader ? 1 : 0;
  const colMap    = hasHeader ? mapped : null;
  const POS       = { sr:0, name:1, details:2, steps:3, expected:4, actual:5, status:6 };
  const get       = (row, key) => {
    if (colMap) { const idx = colMap.indexOf(key); return idx >= 0 ? String(row[idx] || "").trim() : ""; }
    return String(row[POS[key]] || "").trim();
  };

  const cases = [];
  rows.slice(dataStart).forEach(row => {
    if (row.every(c => c === "" || c === null || c === undefined)) return;
    cases.push({
      name:     get(row, "name"),
      details:  get(row, "details"),
      steps:    get(row, "steps"),
      expected: get(row, "expected"),
      actual:   get(row, "actual") || "",
      status:   get(row, "status") || "Not Started",
    });
  });

  const existingCount = uploadBody.querySelectorAll("tr").length;
  cases.forEach((data, i) => uploadBody.appendChild(addUploadRow(data, existingCount + i)));

  uploadFilename = filename;
  const total = uploadBody.querySelectorAll("tr").length;
  uploadWrap.classList.remove("hidden");
  uploadMeta.textContent = `${total} test case${total !== 1 ? "s" : ""} total (${cases.length} added from "${filename}")`;
  uploadPrompt.querySelector("strong").textContent = "Drop your Excel file here";
  uploadPrompt.querySelector("span").textContent   = "or click to browse (.xlsx, .xls, .csv)";
  document.getElementById("uploadRunAllBtn").classList.remove("hidden");
  document.getElementById("uploadClearBtn").classList.remove("hidden");
  document.getElementById("uploadClearAllBtn").classList.remove("hidden");
  document.getElementById("uploadReportWrap").classList.remove("hidden");

  saveUploadCases();
}

// ── Report Generation ────────────────────────────────────────
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectReportRows(tbodyEl, isUpload) {
  return Array.from(tbodyEl.querySelectorAll("tr")).map((tr, i) => {
    let name, details, steps, expected;
    if (isUpload) {
      name     = tr.cells[1]?.textContent?.trim() || "";
      details  = tr.cells[2]?.textContent?.trim() || "";
      steps    = tr.dataset.steps    || "";
      expected = tr.dataset.expected || "";
    } else {
      const inputs = tr.querySelectorAll("input.func-cell-input");
      const areas  = tr.querySelectorAll("textarea.func-cell-area");
      name     = inputs[0]?.value?.trim() || "";
      details  = areas[0]?.value?.trim()  || "";
      steps    = areas[1]?.value?.trim()  || "";
      expected = areas[2]?.value?.trim()  || "";
    }
    return {
      sr:         i + 1,
      name,
      details,
      steps,
      expected,
      actual:     tr.querySelector(".func-actual-output")?.textContent?.trim() || "",
      status:     tr.querySelector(".func-status-badge")?.textContent?.trim() || "Not Started",
      screenshot: tr.dataset.screenshot || "",
    };
  });
}

function buildReportHTML(title, rows) {
  const now      = new Date().toLocaleString();
  const total    = rows.length;
  const pass     = rows.filter(r => r.status === "Pass").length;
  const fail     = rows.filter(r => r.status === "Fail").length;
  const blocked  = rows.filter(r => r.status === "Blocked").length;
  const notStart = total - pass - fail - blocked;

  const tableRows = rows.map(r => {
    const stCls = { Pass: "st-pass", Fail: "st-fail", Blocked: "st-blocked" }[r.status] || "st-pending";
    const ssRow = r.screenshot ? `
<tr class="ss-row">
  <td colspan="7" style="padding:12px 20px;background:#fff5f5;border-bottom:1px solid #fee2e2;">
    <div style="font-size:0.75rem;font-weight:700;color:#991b1b;margin-bottom:8px;">Failure Screenshot</div>
    <img src="${r.screenshot}" style="max-width:100%;border-radius:6px;border:1px solid #fca5a5;" />
  </td>
</tr>` : "";
    return `<tr>
  <td>${r.sr}</td>
  <td>${escHtml(r.name)}</td>
  <td>${escHtml(r.details)}</td>
  <td style="white-space:pre-wrap">${escHtml(r.steps)}</td>
  <td>${escHtml(r.expected)}</td>
  <td>${escHtml(r.actual)}</td>
  <td><span class="badge ${stCls}">${escHtml(r.status)}</span></td>
</tr>${ssRow}`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;background:#f9fafb;padding:32px;font-size:14px}
    h1{font-size:1.5rem;font-weight:800;color:#065f46}
    .meta{color:#6b7280;font-size:0.82rem;margin-top:4px}
    .summary{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
    .card{padding:10px 18px;border-radius:10px;font-weight:700;font-size:0.88rem}
    .c-total{background:#f3f4f6;color:#374151}.c-pass{background:#dcfce7;color:#166534}
    .c-fail{background:#fee2e2;color:#991b1b}.c-blocked{background:#fef3c7;color:#92400e}
    .c-pending{background:#f3f4f6;color:#6b7280}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-top:24px}
    th{background:#f0fdf9;color:#065f46;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:12px 14px;text-align:left;border-bottom:2px solid #d1fae5}
    td{padding:10px 14px;border-bottom:1px solid #f3f4f6;font-size:0.85rem;vertical-align:top}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:700}
    .st-pass{background:#dcfce7;color:#166534}.st-fail{background:#fee2e2;color:#991b1b}
    .st-blocked{background:#fef3c7;color:#92400e}.st-pending{background:#f3f4f6;color:#374151}
    @media print{body{padding:12px;background:#fff}table{box-shadow:none}h1{color:#000}}
  </style>
</head>
<body>
  <h1>${escHtml(title)}</h1>
  <p class="meta">Generated: ${now}</p>
  <div class="summary">
    <div class="card c-total">Total: ${total}</div>
    <div class="card c-pass">Pass: ${pass}</div>
    <div class="card c-fail">Fail: ${fail}</div>
    <div class="card c-blocked">Blocked: ${blocked}</div>
    <div class="card c-pending">Not Started: ${notStart}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:60px">Sr No</th>
        <th>Test Case Name</th>
        <th>Details</th>
        <th>Steps</th>
        <th>Expected Output</th>
        <th>Actual Output</th>
        <th style="width:110px">Status</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
</body>
</html>`;
}

function downloadHtmlReport(html, filename) {
  const blob = new Blob([html], { type: "text/html" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function openPdfReport(html) {
  const win = window.open("", "_blank");
  if (!win) { alert("Allow pop-ups to print the PDF report."); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 700);
}

// Report: Write panel
const writeReportToggle = document.getElementById("writeReportToggle");
const writeReportMenu   = document.getElementById("writeReportMenu");

writeReportToggle.addEventListener("click", e => {
  e.stopPropagation();
  writeReportMenu.classList.toggle("hidden");
});

document.getElementById("writeReportHtml").addEventListener("click", () => {
  writeReportMenu.classList.add("hidden");
  const rows = collectReportRows(tbody, false);
  if (!rows.length) { alert("No test cases to include in the report."); return; }
  const date = new Date().toISOString().slice(0, 10);
  downloadHtmlReport(buildReportHTML("Functional Test Report", rows), `report-${date}.html`);
});

document.getElementById("writeReportPdf").addEventListener("click", () => {
  writeReportMenu.classList.add("hidden");
  const rows = collectReportRows(tbody, false);
  if (!rows.length) { alert("No test cases to include in the report."); return; }
  openPdfReport(buildReportHTML("Functional Test Report", rows));
});

// Report: Upload panel
const uploadReportToggle = document.getElementById("uploadReportToggle");
const uploadReportMenu   = document.getElementById("uploadReportMenu");

uploadReportToggle.addEventListener("click", e => {
  e.stopPropagation();
  uploadReportMenu.classList.toggle("hidden");
});

document.getElementById("uploadReportHtml").addEventListener("click", () => {
  uploadReportMenu.classList.add("hidden");
  const rows = collectReportRows(uploadBody, true);
  if (!rows.length) { alert("No test cases to include in the report."); return; }
  const date = new Date().toISOString().slice(0, 10);
  downloadHtmlReport(buildReportHTML("Functional Test Report (Upload)", rows), `report-upload-${date}.html`);
});

document.getElementById("uploadReportPdf").addEventListener("click", () => {
  uploadReportMenu.classList.add("hidden");
  const rows = collectReportRows(uploadBody, true);
  if (!rows.length) { alert("No test cases to include in the report."); return; }
  openPdfReport(buildReportHTML("Functional Test Report (Upload)", rows));
});

// Close report menus when clicking anywhere outside them
document.addEventListener("click", () => {
  writeReportMenu.classList.add("hidden");
  uploadReportMenu.classList.add("hidden");
});

// ── Download Sample Excel ────────────────────────────────────
document.getElementById("downloadSample").addEventListener("click", () => {
  const BASE = window.location.origin;
  const sampleData = [
    ["Sr No","Test Case Name","Test Case Details","Steps","Expected Output","Actual Output","Status"],
    [1,"Login with valid credentials","Verify a registered user can log in",
      `1. Open ${BASE}\n2. Enter your-email@example.com in Email\n3. Enter yourpassword in Password\n4. Click Login`,
      "User is redirected to dashboard","","Not Started"],
    [2,"Login with invalid password","Verify login fails with wrong password",
      `1. Open ${BASE}\n2. Enter your-email@example.com in Email\n3. Enter wrongpass in Password\n4. Click Login`,
      "Error message is displayed","","Not Started"],
    [3,"Logout functionality","Verify clicking Logout ends the session",
      `1. Open ${BASE}/dashboard.html\n2. Click Logout`,
      "User redirected to login page","","Not Started"],
  ];

  if (typeof XLSX !== "undefined") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws["!cols"] = [{wch:8},{wch:30},{wch:42},{wch:56},{wch:36},{wch:36},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    XLSX.writeFile(wb, "sample-test-cases.xlsx");
  } else {
    const csv = sampleData.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const a   = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "sample-test-cases.csv",
    });
    a.click(); URL.revokeObjectURL(a.href);
  }
});
