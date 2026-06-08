const loginTab = document.querySelector("#loginTab");
const signupTab = document.querySelector("#signupTab");
const authForm = document.querySelector("#authForm");
const nameField = document.querySelector(".name-field");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const eyeBtn       = document.querySelector("#eyeBtn");
const submitBtn    = document.querySelector("#submitBtn");

eyeBtn.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  eyeBtn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  eyeBtn.querySelector("svg").innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
});
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
