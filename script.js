const loginTab = document.querySelector("#loginTab");
const signupTab = document.querySelector("#signupTab");
const authForm = document.querySelector("#authForm");
const nameField = document.querySelector(".name-field");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const submitBtn = document.querySelector("#submitBtn");
const linkSwitch = document.querySelector("#linkSwitch");
const formTitle = document.querySelector("#formTitle");
const formEyebrow = document.querySelector("#formEyebrow");
const message = document.querySelector("#message");

let mode = "login";

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type || ""}`.trim();
}

function setMode(nextMode) {
  mode = nextMode;
  const isSignup = mode === "signup";

  loginTab.classList.toggle("active", !isSignup);
  signupTab.classList.toggle("active", isSignup);
  loginTab.setAttribute("aria-selected", String(!isSignup));
  signupTab.setAttribute("aria-selected", String(isSignup));

  nameField.classList.toggle("hidden", !isSignup);
  nameInput.required = isSignup;
  passwordInput.autocomplete = isSignup ? "new-password" : "current-password";

  formEyebrow.textContent = isSignup ? "New here?" : "Welcome back";
  formTitle.textContent = isSignup ? "Create your account" : "Login to your account";
  submitBtn.textContent = isSignup ? "Sign Up" : "Login";
  linkSwitch.textContent = isSignup ? "Already signed up? Login" : "Need an account? Sign up";

  authForm.reset();
  setMessage("", "");
  emailInput.focus();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Something went wrong.");
  }

  return payload;
}

async function handleSignup() {
  const name = nameInput.value.trim();
  const email = normalizeEmail(emailInput.value);
  const password = passwordInput.value;

  await postJson("/api/signup", { name, email, password });
  setMessage(`Account created for ${name}. You can login now.`, "success");
  setTimeout(() => setMode("login"), 850);
}

async function handleLogin() {
  const email = normalizeEmail(emailInput.value);
  const password = passwordInput.value;
  const user = await postJson("/api/login", { email, password });

  localStorage.setItem("loggedInUser", JSON.stringify(user));
  window.location.href = "/dashboard.html";
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("", "");

  if (!authForm.checkValidity()) {
    authForm.reportValidity();
    return;
  }

  if (passwordInput.value.length < 6) {
    setMessage("Password must be at least 6 characters.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = mode === "signup" ? "Signing up..." : "Logging in...";

  try {
    if (mode === "signup") {
      await handleSignup();
    } else {
      await handleLogin();
    }
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = mode === "signup" ? "Sign Up" : "Login";
  }
});

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));
linkSwitch.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
