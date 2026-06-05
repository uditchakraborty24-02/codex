const loadForm = document.querySelector("#loadForm");
const virtualUsersInput = document.querySelector("#virtualUsers");
const testTypeInput = document.querySelector("#testType");
const methodInput = document.querySelector("#loadMethod");
const urlInput = document.querySelector("#loadUrl");
const bodyInput = document.querySelector("#loadBody");
const concurrencyInput = document.querySelector("#concurrency");
const runLoadBtn = document.querySelector("#runLoadBtn");

let lastPerfResult = null;
let lastPerfConfig = null;

const runStatus = document.querySelector("#runStatus");
const resultUsers = document.querySelector("#resultUsers");
const resultTotalTime = document.querySelector("#resultTotalTime");
const resultSuccess = document.querySelector("#resultSuccess");
const resultErrors = document.querySelector("#resultErrors");
const resultAverage = document.querySelector("#resultAverage");
const resultRange = document.querySelector("#resultRange");
const resultThroughput = document.querySelector("#resultThroughput");
const resultActual = document.querySelector("#resultActual");
const errorOutput = document.querySelector("#errorOutput");

if (!sessionStorage.getItem("loggedInUser")) {
  window.location.href = "/";
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function setRunning(isRunning) {
  runLoadBtn.disabled = isRunning;
  runLoadBtn.textContent = isRunning ? "Running..." : "Run Load Test";
}

function resetMetrics() {
  resultUsers.textContent = "--";
  resultTotalTime.textContent = "--";
  resultSuccess.textContent = "--";
  resultErrors.textContent = "--";
  resultAverage.textContent = "--";
  resultRange.textContent = "--";
  resultThroughput.textContent = "--";
  resultActual.textContent = "--";
}

testTypeInput.addEventListener("change", () => {
  if (testTypeInput.value === "button") {
    methodInput.value = "POST";
    if (!bodyInput.value.trim()) {
      bodyInput.value = '{"event": "button_click"}';
    }
  }
});

loadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setRunning(true);
  resetMetrics();
  runStatus.textContent = "Running";
  runStatus.className = "status-code status-neutral";
  errorOutput.textContent = "Load test in progress...";
  document.getElementById("genPerfReport").classList.add("hidden");

  lastPerfConfig = {
    users: Number(virtualUsersInput.value),
    type: testTypeInput.value,
    method: methodInput.value,
    url: urlInput.value,
    body: bodyInput.value,
    concurrency: Number(concurrencyInput.value)
  };

  try {
    const response = await fetch("/api/load-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        users: Number(virtualUsersInput.value),
        type: testTypeInput.value,
        method: methodInput.value,
        url: urlInput.value,
        body: bodyInput.value,
        concurrency: Number(concurrencyInput.value)
      })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Load test failed.");
    }

    runStatus.textContent = result.errorCount > 0 ? "Completed with errors" : "Completed";
    runStatus.className = `status-code ${result.errorCount > 0 ? "status-warning" : "status-success"}`;
    resultUsers.textContent = result.virtualUsers.toLocaleString();
    resultTotalTime.textContent = formatMs(result.totalTimeMs);
    resultSuccess.textContent = result.successCount.toLocaleString();
    resultErrors.textContent = result.errorCount.toLocaleString();
    resultAverage.textContent = formatMs(result.averageMs);
    resultRange.textContent = `${formatMs(result.fastestMs)} / ${formatMs(result.slowestMs)}`;
    resultThroughput.textContent = `${result.requestsPerSecond.toFixed(2)} req/s`;
    resultActual.textContent = `${result.actualRequests.toLocaleString()} sampled`;

    lastPerfResult = result;
    document.getElementById("genPerfReport").classList.remove("hidden");

    let notes = "";
    if (result.isLocalTarget) {
      notes = "Note: Requests to the local server run sequentially (concurrent mode requires an external URL).\n\n";
    }
    errorOutput.textContent = notes + (result.errors.length ? JSON.stringify(result.errors, null, 2) : "No errors captured.");
  } catch (error) {
    runStatus.textContent = "Failed";
    runStatus.className = "status-code status-error";
    errorOutput.textContent = error.message;
  } finally {
    setRunning(false);
  }
});

document.getElementById("genPerfReport").addEventListener("click", () => {
  if (!lastPerfConfig || !lastPerfResult) return;
  const { html, filename } = buildPerfReport(lastPerfConfig, lastPerfResult);
  showReportModal(html, filename);
});
