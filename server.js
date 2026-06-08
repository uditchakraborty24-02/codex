const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const WINDOWS_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findWindowsBrowser() {
  for (const p of WINDOWS_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function launchBrowser() {
  if (process.platform === 'win32') {
    const executablePath = findWindowsBrowser();
    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: null,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

const app = express();
const PORT = process.env.PORT || 8000;
const USERS_FILE = path.join(__dirname, 'users.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8').trim();
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function hashPassword(password, saltBase64) {
  const salt = saltBase64 ? Buffer.from(saltBase64, 'base64') : crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function verifyPassword(password, saltBase64, storedHash) {
  try {
    const { hash } = hashPassword(password, saltBase64);
    const a = Buffer.from(hash, 'base64');
    const b = Buffer.from(storedHash, 'base64');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// POST /api/signup
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanName || !cleanEmail || !password || String(password).length < 6) {
    return res.status(400).json({ message: 'Name, email, and a 6 character password are required.' });
  }

  const users = readUsers();
  if (users.find(u => u.email === cleanEmail)) {
    return res.status(409).json({ message: 'That email is already signed up. Try logging in.' });
  }

  const { salt, hash } = hashPassword(password, null);
  users.push({ name: cleanName, email: cleanEmail, salt, passwordHash: hash });
  writeUsers(users);
  res.status(201).json({ name: cleanName, email: cleanEmail });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();

  const user = readUsers().find(u => u.email === cleanEmail);
  if (user && verifyPassword(String(password || ''), user.salt, user.passwordHash)) {
    return res.json({ name: user.name, email: user.email });
  }
  res.status(401).json({ message: 'Email or password does not match a saved account.' });
});

// POST /api/request  (API tester proxy)
// headers arrive as [{name, value}, ...] from api-testing.js
app.post('/api/request', async (req, res) => {
  const { method = 'GET', url, body, headers = [] } = req.body || {};
  const cleanMethod = String(method || 'GET').trim().toUpperCase();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  if (!allowed.includes(cleanMethod)) return res.status(400).json({ message: 'Unsupported HTTP method.' });
  if (!url) return res.status(400).json({ message: 'Request URL is required.' });

  try { new URL(url); } catch {
    return res.status(400).json({ message: 'Enter a valid absolute URL.' });
  }

  const { protocol } = new URL(url);
  if (!['http:', 'https:'].includes(protocol)) {
    return res.status(400).json({ message: 'Only http and https URLs are supported.' });
  }

  const fetchHeaders = {};
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const k = String(h.name || '').trim();
      if (k) fetchHeaders[k] = String(h.value || '');
    }
  }

  const start = Date.now();
  try {
    const options = { method: cleanMethod, headers: fetchHeaders, signal: AbortSignal.timeout(30000) };
    if (!['GET', 'HEAD'].includes(cleanMethod) && body) {
      options.body = body;
      const hasContentType = Object.keys(fetchHeaders).some(k => k.toLowerCase() === 'content-type');
      if (!hasContentType) fetchHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, options);
    const timeMs = Date.now() - start;
    const responseBody = await response.text();
    const responseHeaders = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });

    res.json({
      status: response.status,
      statusText: response.statusText,
      timeMs,
      headers: responseHeaders,
      body: responseBody,
      contentType: response.headers.get('content-type') || ''
    });
  } catch (err) {
    res.status(502).json({ message: `Request failed: ${err.message}`, timeMs: Date.now() - start });
  }
});

// POST /api/load-test
app.post('/api/load-test', async (req, res) => {
  const { users: userCount, method = 'GET', url, body, concurrency: concIn } = req.body || {};
  const users = parseInt(userCount, 10);
  const concurrency = Math.min(parseInt(concIn, 10) || 10, 100000);
  const cleanMethod = String(method || 'GET').trim().toUpperCase();
  const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

  if (!users || users < 1) return res.status(400).json({ message: 'Select at least one user or machine.' });
  if (!allowed.includes(cleanMethod)) return res.status(400).json({ message: 'Unsupported HTTP method for load testing.' });

  try { new URL(url); } catch {
    return res.status(400).json({ message: 'Enter a valid absolute URL.' });
  }

  const { protocol } = new URL(url);
  if (!['http:', 'https:'].includes(protocol)) {
    return res.status(400).json({ message: 'Only http and https URLs are supported.' });
  }

  const actualRequests = Math.min(users, 1000);
  const results = [];
  const errorSamples = [];
  const totalStart = Date.now();

  async function makeRequest() {
    const start = Date.now();
    try {
      const options = { method: cleanMethod, signal: AbortSignal.timeout(20000) };
      if (!['GET', 'HEAD'].includes(cleanMethod) && body) {
        options.body = body;
        options.headers = { 'Content-Type': 'application/json' };
      }
      const response = await fetch(url, options);
      return { ok: response.status >= 200 && response.status < 400, status: response.status, timeMs: Date.now() - start, error: null };
    } catch (err) {
      return { ok: false, status: 0, timeMs: Date.now() - start, error: err.message };
    }
  }

  let i = 0;
  while (i < actualRequests) {
    const batchSize = Math.min(concurrency, actualRequests - i);
    const batchResults = await Promise.all(Array.from({ length: batchSize }, makeRequest));
    results.push(...batchResults);
    i += batchSize;
  }

  const totalTimeMs = Date.now() - totalStart;
  let successCount = 0, errorCount = 0, sumMs = 0, fastestMs = Infinity, slowestMs = 0;

  for (const r of results) {
    sumMs += r.timeMs;
    if (r.timeMs < fastestMs) fastestMs = r.timeMs;
    if (r.timeMs > slowestMs) slowestMs = r.timeMs;
    if (r.ok) {
      successCount++;
    } else {
      errorCount++;
      if (errorSamples.length < 8) {
        errorSamples.push({ status: r.status, message: r.error || `HTTP status ${r.status}`, timeMs: r.timeMs });
      }
    }
  }

  if (!isFinite(fastestMs)) fastestMs = 0;

  res.json({
    virtualUsers: users,
    actualRequests,
    concurrency,
    isLocalTarget: false,
    successCount,
    errorCount,
    averageMs: results.length ? Math.round((sumMs / results.length) * 100) / 100 : 0,
    fastestMs,
    slowestMs,
    totalTimeMs,
    requestsPerSecond: totalTimeMs > 0 ? Math.round((results.length / (totalTimeMs / 1000)) * 100) / 100 : 0,
    errors: errorSamples
  });
});

// POST /api/capture  (screenshot for design comparison)
app.post('/api/capture', async (req, res) => {
  const { url, width = 1280, height = 900 } = req.body || {};

  try { new URL(url); } catch {
    return res.status(400).json({ message: 'Enter a valid absolute URL.' });
  }

  let browser;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: parseInt(width, 10), height: parseInt(height, 10) });
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });

    // Let fonts and CSS settle before capturing
    await new Promise(r => setTimeout(r, 800));

    const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
    res.json({ screenshot: `data:image/png;base64,${screenshot}` });
  } catch (err) {
    res.status(500).json({ message: `Capture failed: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
