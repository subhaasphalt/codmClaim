const { chromium } = require('playwright');

const URL = 'https://store.callofdutymobile.com/en-in/codm';
const PLAYER_ID = process.env.PLAYER_ID;
const MAX_ATTEMPTS = 3;

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
    await page.waitForTimeout(4000);

    // Dismiss cookie/popup banners if present
    for (const label of [/accept/i, /agree/i, /got it/i, /close/i]) {
      const b = page.getByRole('button', { name: label }).first();
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
    }

    // 1. Enter player ID
    const input = page.locator('input[placeholder*="ID" i], input[type="text"]').first();
    await input.waitFor({ timeout: 30000 });
    await input.fill(PLAYER_ID);

    const confirm = page.getByRole('button', { name: /confirm|login|log in|submit|ok/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForTimeout(3000);

    // 2. Choose a product -> Gifts
    await page.getByText(/^\s*gifts?\s*$/i).first().click({ timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. Claim
    const claim = page.getByRole('button', { name: /claim|get|redeem/i }).first();
    const already = page.getByText(/already (claimed|received)|claimed/i).first();

    if (await claim.isVisible({ timeout: 15000 }).catch(() => false)) {
      await claim.click();
      await page.waitForTimeout(4000);
      const ok = await page.getByText(/success|claimed|received/i).first()
        .isVisible({ timeout: 15000 }).catch(() => false);
      if (!ok) throw new Error('Clicked claim but saw no success message');
      console.log('Gift claimed.');
    } else if (await already.isVisible().catch(() => false)) {
      console.log('Already claimed today - treating as success.');
    } else {
      throw new Error('No claim button or claimed message found');
    }
    await browser.close();
    return true;
  } catch (err) {
    console.error(`Attempt ${n} failed: ${err.message}`);
    await page.screenshot({ path: `fail-${n}.png`, fullPage: true }).catch(() => {});
    await browser.close();
    return false;
  }
}

(async () => {
  if (!PLAYER_ID) { console.error('PLAYER_ID env var missing'); process.exit(1); }
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (await attempt(i)) process.exit(0);
    await new Promise(r => setTimeout(r, 30000));
  }
  process.exit(1);
})();
