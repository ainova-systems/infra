# Playwright on this host

Sandboxed Chrome and a pinned, root-owned Playwright Core are installed for every coding account.

| Command | Does |
|---|---|
| `agent-playwright --check` | Opens sandboxed Chrome, runs JavaScript, clicks, captures a screenshot in memory. Host readiness. |
| `agent-playwright --check-url <url>` | Readiness, then the target's HTTP success, DOM and screenshot with normal TLS verification. |
| `agent-playwright script.cjs` | Runs a standalone CommonJS script with the shared `playwright-core` as a lookup fallback. |
| `agent-playwright --version` | Prints the shared Playwright Core version. |
| `google-chrome --version` | Prints the shared browser version. |

Run every command as the coding account, never as root. Browser profiles and processes belong to
the calling account.

`--check-url` proves reachability only. A login page can pass; authentication, the deployed commit
and each acceptance step still need their own verification. Never put credentials in the URL.

Standalone script:

```javascript
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    console.log(await page.title());
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
```

Project tests use their own lockfile-matched Playwright package and select the shared browser:

```javascript
use: {
  channel: 'chrome',
  launchOptions: { chromiumSandbox: true },
}
```

`channel: 'chrome'` resolves to `/opt/google/chrome/chrome`; an explicit `executablePath` may name it
instead. Chrome on PATH does not select it for Playwright.

| Rule | Why |
|---|---|
| Do not disable the Chrome sandbox, TLS verification or AppArmor | They are the browser's isolation controls |
| Do not grant user namespaces to writable browser caches | A writable sandbox binary defeats the sandbox |
| Firefox and WebKit are project-owned | The host baseline is Chromium/Chrome only |
| Containers bring their own browser | Host browser binaries and libraries are not mounted into containers |
| Project checkouts own their wrappers | A project's own Playwright script, when it ships one, runs from that checkout |
