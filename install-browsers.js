// Runs automatically after `npm install` (postinstall).
// On Linux (Render), downloads Playwright's Firefox binary + system deps.
// On Windows (local dev), nothing to do — system browsers are used.
if (process.platform !== 'linux') process.exit(0);

const { execSync } = require('child_process');

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

console.log('[install-browsers] Installing Playwright Firefox for Linux...');

// Try with system deps first; fall back without if it fails (e.g. no sudo)
if (!run('npx playwright install firefox --with-deps')) {
  console.log('[install-browsers] Retrying without --with-deps...');
  run('npx playwright install firefox');
}

console.log('[install-browsers] Done.');
