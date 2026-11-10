'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

async function smoke(browserType = chromium, targetUrl) {
  assert.notEqual(process.getuid?.(), 0, 'Run the browser check as an agent account, never root');
  if (targetUrl !== undefined) {
    const target = new URL(targetUrl);
    assert.ok(['https:', 'http:'].includes(target.protocol), 'Target must use HTTP or HTTPS');
    assert.ok(!target.username && !target.password, 'Do not pass credentials in the target URL');
  }
  const browser = await browserType.launch({
    channel: 'chrome',
    chromiumSandbox: true,
    headless: true,
    timeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.goto('data:text/html,<title>agent-playwright-ready</title><button onclick="this.textContent=\'clicked\'">Ready</button>');
    assert.equal(await page.title(), 'agent-playwright-ready');
    await page.getByRole('button').click();
    assert.equal(await page.getByRole('button').textContent(), 'clicked');
    const screenshot = await page.screenshot();
    assert.equal(screenshot.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    console.log(`PASS Playwright sandboxed Chrome: navigation, JavaScript, click, screenshot; browser=${browser.version()}`);
    if (targetUrl !== undefined) {
      // Reachability is distinct from application acceptance; never click an external page here.
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.ok(response && response.ok(), `Target returned HTTP ${response?.status() ?? 'no response'}`);
      assert.equal(await page.evaluate(() => document.readyState !== 'loading'), true);
      const targetScreenshot = await page.screenshot({ timeout: 30000 });
      assert.equal(targetScreenshot.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      console.log(`PASS Playwright target: HTTP ${response.status()}, DOM, JavaScript, screenshot (application acceptance still required)`);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { smoke };
if (require.main === module) {
  smoke(chromium, process.argv[2]).catch(error => {
    console.error(`FAIL Playwright browser: ${error.message}`);
    process.exitCode = 1;
  });
}
