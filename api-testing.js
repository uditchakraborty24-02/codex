const requestForm = document.querySelector("#requestForm");
const methodInput = document.querySelector("#method");
const urlInput = document.querySelector("#requestUrl");
const bodyInput = document.querySelector("#requestBody");
const headersList = document.querySelector("#headersList");
const addHeaderBtn = document.querySelector("#addHeaderBtn");
const sendBtn = document.querySelector("#sendBtn");
const statusValue = document.querySelector("#statusValue");
const timeValue = document.querySelector("#timeValue");
const sizeValue = document.querySelector("#sizeValue");
const responseOutput = document.querySelector("#responseOutput");
const responseTabs = document.querySelectorAll(".response-tab");

let lastResponse = null;
let activeTab = "body";

function requireSession() {
  if (!sessionStorage.getItem("loggedInUser")) {
    window.location.href = "/";
  }
}

function addHeaderRow(name = "", value = "") {
  const row = document.createElement("div");
  row.className = "header-row";
  row.innerHTML = `
    <input class="header-name" type="text" placeholder="Header name" value="${escapeAttribute(name)}">
    <input class="header-value" type="text" placeholder="Value" value="${escapeAttribute(value)}">
    <button class="icon-btn" type="button" aria-label="Remove header">x</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  headersList.appendChild(row);
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function collectHeaders() {
  return Array.from(document.querySelectorAll(".header-row"))
    .map((row) => ({
      name: row.querySelector(".header-name").value.trim(),
      value: row.querySelector(".header-value").value
    }))
    .filter((header) => header.name);
}

function formatBody(body, contentType) {
  const looksJson = contentType && contentType.toLowerCase().includes("json");
  if (!body) {
    return "";
  }

  if (looksJson || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }

  return body;
}

function renderResponse() {
  if (!lastResponse) {
    responseOutput.textContent = "Send a request to inspect the response.";
    return;
  }

  if (activeTab === "headers") {
    responseOutput.textContent = JSON.stringify(lastResponse.headers || {}, null, 2);
    return;
  }

  responseOutput.textContent = formatBody(lastResponse.body || "", lastResponse.contentType || "");
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  sendBtn.textContent = isLoading ? "Sending..." : "Send";
}

function setStatusClass(status) {
  statusValue.className = "status-code";

  if (status >= 200 && status < 300) {
    statusValue.classList.add("status-success");
  } else if (status >= 300 && status < 400) {
    statusValue.classList.add("status-redirect");
  } else if (status >= 400 && status < 500) {
    statusValue.classList.add("status-warning");
  } else if (status >= 500) {
    statusValue.classList.add("status-error");
  } else {
    statusValue.classList.add("status-neutral");
  }
}

async function sendRequest(event) {
  event.preventDefault();
  setLoading(true);
  statusValue.textContent = "Sending";
  setStatusClass(0);
  timeValue.textContent = "--";
  sizeValue.textContent = "--";
  responseOutput.textContent = "Waiting for response...";

  try {
    const response = await fetch("/api/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        method: methodInput.value,
        url: urlInput.value,
        headers: collectHeaders(),
        body: bodyInput.value
      })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Request failed.");
    }

    lastResponse = payload;
    statusValue.textContent = `${payload.status} ${payload.statusText || ""}`.trim();
    setStatusClass(payload.status);
    timeValue.textContent = `${payload.timeMs} ms`;
    sizeValue.textContent = `${new Blob([payload.body || ""]).size} B`;
    renderResponse();
  } catch (error) {
    lastResponse = {
      body: JSON.stringify({ message: error.message }, null, 2),
      headers: {},
      contentType: "application/json"
    };
    statusValue.textContent = "Error";
    statusValue.className = "status-code status-error";
    responseOutput.textContent = lastResponse.body;
  } finally {
    setLoading(false);
  }
}

responseTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    responseTabs.forEach((item) => item.classList.toggle("active", item === tab));
    renderResponse();
  });
});

addHeaderBtn.addEventListener("click", () => addHeaderRow());
requestForm.addEventListener("submit", sendRequest);

requireSession();
addHeaderRow("Content-Type", "application/json");
