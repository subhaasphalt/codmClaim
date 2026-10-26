const { chromium } = require('playwright');

const URL = 'https://store.callofdutymobile.com/en-in/codm';
const PLAYER_ID = process.env.PLAYER_ID;
const MAX_ATTEMPTS = 3;

// Poll until one of the matching elements is visible, then return it
async function waitVisible(page, locator, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const n = await locator.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = locator.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function attempt(n) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 1. Enter player ID (typed slowly so the site's validation fires)
    const input = page.locator('input[placeholder*="ID" i], input[type="text"]').first();
    await input.waitFor({ timeout: 30000 });
    await input.click();
