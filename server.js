const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os   = require('os');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const BROWSER_REGISTRY = [
  { id: 'chrome', name: 'Chrome', paths: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]},
  { id: 'edge', name: 'Edge', paths: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]},
  { id: 'firefox', name: 'Firefox', paths: [
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  ]},
  { id: 'brave', name: 'Brave', paths: [
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ]},
  { id: 'opera', name: 'Opera', paths: [
    'C:\\Program Files\\Opera\\opera.exe',
    'C:\\Program Files (x86)\\Opera\\opera.exe',
  ]},
];

function findInstalledBrowsers() {
  return BROWSER_REGISTRY
    .map(b => { const p = b.paths.find(x => fs.existsSync(x)); return p ? { id: b.id, name: b.name, path: p } : null; })
    .filter(Boolean);
}

function findWindowsBrowser() {
  for (const b of BROWSER_REGISTRY) {
    for (const p of b.paths) { if (fs.existsSync(p)) return p; }
  }
  return null;
}

// ── Playwright Firefox path discovery ──────────────────────────────────────
// Playwright downloads Firefox to ~/.cache/ms-playwright on Linux.
// We scan that directory to find the actual binary after `npx playwright install`.
function getPlaywrightFirefoxPath() {
  try {
    // playwright-core exposes executablePath() when the browser is installed
    const { firefox } = require('playwright-core');
    if (typeof firefox.executablePath === 'function') {
      const p = firefox.executablePath();
      if (p && fs.existsSync(p)) return p;
    }
  } catch {}

  // Fallback: scan ~/.cache/ms-playwright for a firefox-* entry
  try {
    const cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
    if (!fs.existsSync(cacheDir)) return null;
    const entries = fs.readdirSync(cacheDir).filter(d => d.startsWith('firefox'));
    for (const entry of entries) {
      for (const rel of ['firefox/firefox', 'firefox-linux/firefox']) {
        const p = path.join(cacheDir, entry, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return null;
}

// ── Firefox launch via Playwright ──────────────────────────────────────────
// Works on both Windows (system Firefox via executablePath) and Linux
// (Playwright-managed Firefox installed by install-browsers.js).
// The shim exposes a Puppeteer-compatible page/browser API so executeStep and
// evaluateExpected need no changes.
async function launchFirefox(exePath, headless) {
  const { firefox } = require('playwright-core');

  const launchOptions = { headless };
  if (exePath) launchOptions.executablePath = exePath;
  if (!headless) launchOptions.args = ['-foreground'];

  const pwBrowser = await firefox.launch(launchOptions);
  const context   = await pwBrowser.newContext({ viewport: { width: 1280, height: 800 } });
  const pwPage    = await context.newPage();

  const WU_MAP = {
    networkidle0: 'networkidle', networkidle2: 'networkidle',
    load: 'load', domcontentloaded: 'domcontentloaded',
  };

  const page = {
    url() { return pwPage.url(); },

    async goto(url, opts = {}) {
      await pwPage.goto(url, {
        waitUntil: WU_MAP[opts.waitUntil] || 'load',
        timeout: opts.timeout || 30000,
      });
      return { url: () => pwPage.url() };
    },

    async evaluate(fn, ...args) { return pwPage.evaluate(fn, ...args); },
    async title()               { return pwPage.title(); },
    async setViewport()         { /* handled by context viewport */ },

    async click(selector, opts = {}) {
      await pwPage.click(selector, opts.clickCount ? { clickCount: opts.clickCount } : {});
    },

    async type(selector, text) {
      await pwPage.fill(selector, '');
      await pwPage.type(selector, String(text));
    },

    async waitForNavigation(opts = {}) {
      try { await pwPage.waitForLoadState('load', { timeout: opts.timeout || 3000 }); } catch {}
    },

    // Returns a base64 string — captureScreenshot() handles Buffer vs string already
    async screenshot() {
      const buf = await pwPage.screenshot({ type: 'png' });
      return buf.toString('base64');
    },

    keyboard: {
      async press(key) {
        const map = { Return: 'Enter', Space: 'Space' };
        await pwPage.keyboard.press(map[key] || key);
      },
    },

    browser() { return browser; },
  };

  const browser = {
    async newPage()    { return page; },
    async pages()      { return [page]; },
    async close()      { try { await pwBrowser.close(); } catch {} },
    async disconnect() { try { await pwBrowser.close(); } catch {} },
  };

  return browser;
}

async function launchBrowser(headless = true, executablePath = null) {
  // Firefox is always launched via Playwright regardless of platform
  const isFirefox = executablePath && executablePath.toLowerCase().includes('firefox');
  if (isFirefox) return launchFirefox(executablePath, headless);

  if (process.platform === 'win32') {
    const exePath = executablePath || findWindowsBrowser();
    return puppeteer.launch({
      headless,
      executablePath: exePath,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        ...(!headless ? ['--start-maximized'] : []),
      ],
    });
  }

  // Linux / Render — use @sparticuz/chromium
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: null,
    executablePath: await chromium.executablePath(),
    headless: headless ? chromium.headless : false,
  });
}

const app = express();
const PORT = process.env.PORT || 8000;
const USERS_FILE = path.join(__dirname, 'users.json');
const TC_FILE    = path.join(__dirname, 'testcases.json');

function readTC() {
  try {
    const data = fs.readFileSync(TC_FILE, 'utf8').trim();
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function writeTC(data) {
  fs.writeFileSync(TC_FILE, JSON.stringify(data, null, 2), 'utf8');
}

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

// GET  /api/testcases?email=...
app.get('/api/testcases', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'email query param required.' });
  const all = readTC();
  res.json(all[email] || { cases: [] });
});

// POST /api/testcases  { email, cases?: [...], uploadCases?: [...], uploadFilename?: string }
app.post('/api/testcases', (req, res) => {
  const { email, cases, uploadCases, uploadFilename } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return res.status(400).json({ message: 'email required.' });
  if (cases !== undefined && !Array.isArray(cases))
    return res.status(400).json({ message: 'cases must be an array.' });
  if (uploadCases !== undefined && !Array.isArray(uploadCases))
    return res.status(400).json({ message: 'uploadCases must be an array.' });

  const all = readTC();
  const existing = all[cleanEmail] || {};
  if (cases       !== undefined) existing.cases          = cases;
  if (uploadCases !== undefined) existing.uploadCases    = uploadCases;
  if (uploadFilename)            existing.uploadFilename = uploadFilename;
  existing.updatedAt = new Date().toISOString();
  all[cleanEmail] = existing;
  writeTC(all);
  res.json({ ok: true });
});

// ── Test-case step executor helpers ─────────────────────────

const SUBMIT_WORDS = new Set(['login','signin','sign in','sign up','signup','submit','send','save','confirm','create account','register','next','continue','proceed','go','search']);

async function clickByText(page, text) {
  const t = text.trim();
  const clicked = await page.evaluate((t) => {
    const tl = t.toLowerCase();
    const matches = (e) => (e.textContent || e.value || '').trim().toLowerCase().includes(tl);
    const matchesAttr = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || '').toLowerCase().includes(tl);

    // Priority 1: visible submit buttons (most likely what user means)
    let el = [...document.querySelectorAll('button[type="submit"], input[type="submit"]')].find(matches);
    // Priority 2: buttons inside a form
    if (!el) el = [...document.querySelectorAll('form button, form input[type="button"]')].find(matches);
    // Priority 3: any button / link
    if (!el) el = [...document.querySelectorAll('button, a, [role="button"], input[type="button"]')].find(e => matches(e) || matchesAttr(e));
    // Priority 4: anything focusable
    if (!el) el = [...document.querySelectorAll('[tabindex]')].find(e => matches(e) || matchesAttr(e));

    if (el) { el.click(); return true; }
    return false;
  }, t);
  if (!clicked) throw new Error(`Clickable element "${t}" not found on page`);

  // For submit-like buttons wait for navigation or settle time
  const isSubmit = SUBMIT_WORDS.has(t.toLowerCase());
  if (isSubmit) {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {}),
      new Promise(r => setTimeout(r, 2000)),
    ]);
  } else {
    await new Promise(r => setTimeout(r, 400));
  }
}

async function fillField(page, field, value) {
  // Locate the element and return a usable CSS selector for it
  const selector = await page.evaluate((f) => {
    const norm = s => s.toLowerCase().replace(/[\s\-_]+/g, '');
    const fn   = norm(f);
    const inputs = [...document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea'
    )];
    const el = inputs.find(i => {
      const label = document.querySelector(`label[for="${i.id}"]`);
      const attrs = [
        norm(i.placeholder || ''),
        norm(i.name        || ''),
        norm(i.id          || ''),
        norm(i.type        || ''),
        norm(label ? label.textContent : ''),
      ];
      return attrs.some(a => a.includes(fn) || (fn.includes(a) && a.length > 2));
    });
    if (!el) return null;
    if (el.id)   return '#' + el.id;
    if (el.name) return `[name="${el.name}"]`;
    if (el.type) return `input[type="${el.type}"]`;
    return 'textarea';
  }, field);

  if (!selector) throw new Error(`Input field "${field}" not found on page`);

  // Use Puppeteer's native type() — sends real keyboard events, works on all frameworks
  await page.click(selector, { clickCount: 3 }); // focus + select any existing text
  await page.type(selector, String(value), { delay: 30 });
  await new Promise(r => setTimeout(r, 150));
}

async function assertOnPage(page, what) {
  const url = page.url();
  const found = await page.evaluate(w => document.body.innerText.toLowerCase().includes(w.toLowerCase()), what);
  if (!found && !url.toLowerCase().includes(what.toLowerCase())) {
    throw new Error(`"${what}" not found on page (URL: ${url})`);
  }
}

async function executeStep(page, raw) {
  const s = raw.trim();

  // OPEN / NAVIGATE  — extract the first http(s) URL found anywhere in the step text
  const openM = s.match(/^(?:open|navigate to|go to|visit|load)\b(.+)$/i);
  if (openM) {
    const rest     = openM[1].trim().replace(/^["']|["']$/g, '');
    const urlMatch = rest.match(/https?:\/\/[^\s"']+/i);
    const url      = urlMatch ? urlMatch[0].replace(/[.,;)>]+$/, '') : rest;
    if (!url.startsWith('http')) {
      throw new Error(`No URL found in step "${s}". Include a full URL — e.g. Open https://yoursite.com`);
    }
    await page.goto(url, { waitUntil: 'load', timeout: 25000 });
    await new Promise(r => setTimeout(r, 800));
    return `Opened ${url}`;
  }

  // WAIT
  const waitM = s.match(/^wait\s+(\d+(?:\.\d+)?)\s*(?:second|sec|s)?s?$/i);
  if (waitM) {
    await new Promise(r => setTimeout(r, Math.min(parseFloat(waitM[1]) * 1000, 10000)));
    return `Waited ${waitM[1]}s`;
  }

  // CLEAR field
  const clearM = s.match(/^clear\s+(?:the\s+)?(.+?)(?:\s+(?:field|input))?$/i);
  if (clearM) {
    await fillField(page, clearM[1].trim(), '');
    return `Cleared ${clearM[1].trim()}`;
  }

  // TYPE / ENTER / FILL  "value" in "field"
  const typeM = s.match(/^(?:type|enter|fill|input|write)\s+(.+?)\s+(?:in(?:to)?|at|for)\s+(?:the\s+)?(.+?)(?:\s+(?:field|input|box|area|form))?$/i);
  if (typeM) {
    const value = typeM[1].trim().replace(/^["']|["']$/g, '');
    const field = typeM[2].trim();
    await fillField(page, field, value);
    return `Entered "${value}" in ${field}`;
  }

  // CLICK
  const clickM = s.match(/^click(?:\s+(?:on|the))?\s+(.+?)(?:\s+(?:button|link|tab|element|icon))?$/i);
  if (clickM) {
    await clickByText(page, clickM[1].trim());
    return `Clicked "${clickM[1].trim()}"`;
  }

  // PRESS key
  const pressM = s.match(/^press\s+(.+)$/i);
  if (pressM) {
    const key = pressM[1].trim();
    await page.keyboard.press(key.charAt(0).toUpperCase() + key.slice(1));
    return `Pressed ${key}`;
  }

  // SCROLL
  const scrollM = s.match(/^scroll\s+(down|up)(?:\s+(\d+))?/i);
  if (scrollM) {
    const dir = scrollM[1].toLowerCase();
    const px  = parseInt(scrollM[2] || '400');
    await page.evaluate((d, p) => window.scrollBy(0, d === 'down' ? p : -p), dir, px);
    return `Scrolled ${dir} ${px}px`;
  }

  // CHECK / VERIFY / ASSERT
  const checkM = s.match(/^(?:check|verify|assert|ensure|expect|confirm)\s+(?:that\s+)?(.+)$/i);
  if (checkM) {
    await assertOnPage(page, checkM[1].trim());
    return `Verified: ${checkM[1].trim()}`;
  }

  throw new Error(
    `Unrecognised step: "${s}". Supported formats:\n` +
    `  Open [url]\n  Click [text]\n  Enter [value] in [field]\n` +
    `  Verify [text is visible]\n  Wait [n] seconds\n  Press [key]\n  Scroll down/up`
  );
}

async function evaluateExpected(page, expected, fallbackUrl = '') {
  // Firefox BiDi bug: page.url() / window.location.href returns chrome://gfx/content/srgb.icc
  // Use fallbackUrl (last URL from step text) when that happens.
  const rawUrl = await page.evaluate(() => window.location.href).catch(() => {
    try { return page.url(); } catch { return ''; }
  });
  const url = (rawUrl && rawUrl.startsWith('http')) ? rawUrl : fallbackUrl;

  const isFirefoxBug = !rawUrl || !rawUrl.startsWith('http');

  const bodyText = isFirefoxBug ? '' :
    await page.evaluate(() => document.body.innerText || '').catch(() => '');
  const heading  = isFirefoxBug ? '' : await page.evaluate(() => {
    const el = document.querySelector('h1, h2, .welcome-copy h1, [id*="dashboardName"]');
    return el ? el.textContent.trim() : '';
  }).catch(() => '');
  const title    = isFirefoxBug ? '' :
    await page.evaluate(() => document.title || '').catch(() => '');
  const hasError = isFirefoxBug ? '' : await page.evaluate(() => {
    const el = document.querySelector('.message.error, .error-msg, .alert-danger, [class*="error"][class*="message"]')
            || [...document.querySelectorAll('.message, [class*="alert"], [class*="notice"]')]
                .find(e => /error|fail|invalid|wrong|incorrect|denied|mismatch/i.test(e.className + e.textContent));
    return el ? el.textContent.trim() : '';
  }).catch(() => '');

  // Page name: heading → title → URL path segment → 'page'
  let pageName = heading || title;
  if (!pageName && url) {
    try {
      const seg = new URL(url).pathname.replace(/\.[^/]+$/, '').split('/').filter(Boolean).pop();
      if (seg) pageName = seg.charAt(0).toUpperCase() + seg.slice(1);
    } catch { /* ignore */ }
  }
  pageName = pageName || 'page';

  const pageLabel   = /page$/i.test(pageName) ? pageName : `${pageName} Page`;
  const buildActual = (pass) => pass
    ? `${pageLabel} opened`
    : (hasError ? `Error: ${hasError.substring(0, 120)}` : 'Expected page did not open.');

  if (!expected.trim()) return { actual: buildActual(true), pass: true };

  const exp       = expected.toLowerCase();
  const urlLower  = url.toLowerCase();
  const bodyLower = bodyText.toLowerCase();
  const headLower = heading.toLowerCase();
  const haystack  = bodyLower + ' ' + urlLower;

  const checks = [
    { patterns: ['redirect.*dashboard','dashboard.*redirect','dashboard','welcome'],
      test: () => urlLower.includes('dashboard') || bodyLower.includes('welcome') || headLower.includes('dashboard') },
    { patterns: ['redirect.*login','back to login','login page'],
      test: () => urlLower.endsWith('/') || bodyLower.includes('sign in') || headLower.includes('login') || headLower.includes('sign in') },
    { patterns: ['error','wrong','invalid','incorrect','fail','not match','mismatch'],
      test: () => !!hasError || bodyLower.includes('does not match') || bodyLower.includes('invalid') || bodyLower.includes('incorrect') },
    { patterns: ['success','created','registered','account.*creat'],
      test: () => urlLower.includes('dashboard') || bodyLower.includes('welcome') || bodyLower.includes('success') },
  ];

  for (const { patterns, test } of checks) {
    if (patterns.some(p => new RegExp(p).test(exp))) {
      const pass = test();
      return { actual: buildActual(pass), pass };
    }
  }

  const STOP = new Set(['is','the','a','an','to','and','or','of','in','on','at','by','for','with','that','this','it','are','was','were','be','been','has','have','had','will','would','should','could','may','might','user','page','shown','displays','should']);
  const keywords = exp.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const matched  = keywords.filter(w => haystack.includes(w));
  const score    = keywords.length ? matched.length / keywords.length : 1;

  return { actual: buildActual(score >= 0.35), pass: score >= 0.35 };
}

// GET /api/browsers
app.get('/api/browsers', (req, res) => {
  if (process.platform !== 'win32') {
    // Linux (Render): Chrome via @sparticuz/chromium; Firefox via playwright install
    const browsers = [{ id: 'chrome', name: 'Chrome', path: null }];
    const ffPath = getPlaywrightFirefoxPath();
    if (ffPath) browsers.push({ id: 'firefox', name: 'Firefox', path: ffPath });
    return res.json(browsers);
  }
  // Windows: scan for system-installed browsers
  const browsers = findInstalledBrowsers();
  if (!browsers.length) browsers.push({ id: 'default', name: 'Default', path: null });
  res.json(browsers);
});

async function captureScreenshot(page) {
  try {
    const result = await page.screenshot({ type: 'png', encoding: 'base64' });
    // puppeteer v21 may return a Buffer even with encoding:'base64'
    const b64 = Buffer.isBuffer(result) ? result.toString('base64') : String(result);
    if (!b64 || b64 === 'null' || b64 === 'undefined') return null;
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

// POST /api/run-testcase  { steps, expected }
app.post('/api/run-testcase', async (req, res) => {
  const { steps, expected = '', headless = true, browserPath = null } = req.body || {};
  if (!steps || !steps.trim()) return res.status(400).json({ message: 'steps required' });

  let browser;
  try {
    browser = await launchBrowser(headless, browserPath || null);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Split by newlines; if the whole text arrived on one line (no newlines),
    // also split on the "N. " / "N) " numbered-list pattern mid-string.
    const normalized = steps.replace(/(\d+[\.\)]\s+)/g, '\n$1');
    const lines = normalized
      .split(/\r?\n/)
      .map(l => l.replace(/^[\d]+[.)\s]*/, '').trim())
      .filter(Boolean);
    const log   = [];

    for (const line of lines) {
      try {
        const result = await executeStep(page, line);
        log.push(`✓ ${result}`);
      } catch (err) {
        log.push(`✗ ${line} → ${err.message}`);
        const actual = `Step failed: ${err.message.substring(0, 120)}`;
        const screenshot = await captureScreenshot(page);
        return res.json({ actual, status: 'Fail', log, screenshot });
      }
    }

    // Extract last http URL from step text — used as fallback when Firefox BiDi
    // reports a chrome:// internal URL instead of the real page URL.
    const urlMatches = steps.match(/https?:\/\/[^\s"'\n]+/gi) || [];
    const lastNavUrl = urlMatches.length
      ? urlMatches[urlMatches.length - 1].replace(/[.,;)>\]]+$/, '')
      : '';

    const { actual, pass } = await evaluateExpected(page, expected, lastNavUrl);
    const screenshot = pass ? null : await captureScreenshot(page);
    res.json({ actual, status: pass ? 'Pass' : 'Fail', log, ...(screenshot ? { screenshot } : {}) });
  } catch (err) {
    res.json({ actual: `Runner error: ${err.message}`, status: 'Fail', log: [err.message] });
  } finally {
    if (browser) {
      if (!headless) {
        // Keep browser visible for 8 s so user can inspect the final page state
        setTimeout(() => browser.close().catch(() => {}), 8000);
      } else {
        await browser.close();
      }
    }
  }
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
