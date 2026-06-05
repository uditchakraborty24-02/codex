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
