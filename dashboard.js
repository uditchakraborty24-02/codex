const savedUser = sessionStorage.getItem("loggedInUser");

if (!savedUser) {
  window.location.href = "/";
} else {
  const user = JSON.parse(savedUser);
  const displayName = user.name || "User";
  const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  document.querySelector("#dashboardName").textContent = displayName;
  document.querySelector("#profileName").textContent = displayName;
  document.querySelector("#profileEmail").textContent = user.email || "";
  document.querySelector("#dashboardInitial").textContent = initial;
}

document.querySelector("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("loggedInUser");
  window.location.href = "/";
});

document.querySelectorAll("[data-href]").forEach((card) => {
  card.addEventListener("click", () => {
    window.location.href = card.dataset.href;
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = card.dataset.href;
    }
  });
});

const devToast = document.querySelector("#devToast");
let toastTimer = null;

function showDevToast() {
  clearTimeout(toastTimer);
  devToast.classList.add("show");
  toastTimer = setTimeout(() => devToast.classList.remove("show"), 3000);
}

document.querySelectorAll("[data-dev]").forEach((card) => {
  card.addEventListener("click", showDevToast);

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showDevToast();
    }
  });
});

// ── Design Testing modal ──────────────────────────────────
const designModal = document.createElement("div");
designModal.className = "report-modal-overlay";
designModal.id = "designModalOverlay";
designModal.innerHTML = `
  <div class="report-modal-box">
    <p class="report-modal-title">Design Testing</p>
    <p class="report-modal-sub">Choose a testing approach</p>
    <div class="report-modal-choices">
      <button class="report-choice" id="designChoiceFigma">
        <span class="report-choice-icon">🎨</span>
        <strong>Figma Compare</strong>
        <span>Upload Figma screenshot and compare with live site pixel by pixel</span>
      </button>
      <button class="report-choice" id="designChoiceOthers">
        <span class="report-choice-icon">⚙</span>
        <strong>Others</strong>
        <span>More testing approaches</span>
      </button>
    </div>
    <button class="report-modal-cancel" id="designModalCancel">Cancel</button>
  </div>
`;
document.body.appendChild(designModal);

function openDesignModal() {
  designModal.classList.add("active");
}

function closeDesignModal() {
  designModal.classList.remove("active");
}

document.getElementById("designChoiceFigma").addEventListener("click", () => {
  closeDesignModal();
  window.location.href = "/design-testing.html";
});

document.getElementById("designChoiceOthers").addEventListener("click", () => {
  closeDesignModal();
  showDevToast();
});

document.getElementById("designModalCancel").addEventListener("click", closeDesignModal);
designModal.addEventListener("click", (e) => { if (e.target === designModal) closeDesignModal(); });

document.querySelectorAll("[data-design]").forEach((card) => {
  card.addEventListener("click", openDesignModal);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDesignModal();
    }
  });
});
