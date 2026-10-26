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
    await input.fill('');
    await input.pressSequentially(PLAYER_ID, { delay: 120 });
    await input.press('Tab');

    // 2. Wait for the "Welcome <name>" confirmation
    const welcome = await waitVisible(page, page.getByText(/welcome/i), 30000);
    if (!welcome) throw new Error('Player ID was not verified (no Welcome message)');
    console.log('Player ID verified.');

    // 3. Wait for products to finish loading, then click the GIFTS tab
    const gifts = await waitVisible(page, page.getByText(/^\s*gifts?\s*$/i), 60000);
    if (!gifts) throw new Error('GIFTS tab never appeared (products did not load)');
    await gifts.click();
    console.log('Opened Gifts tab.');
    await page.waitForTimeout(2000);

    // 4. Find CLAIM GIFT (or detect already-claimed)
    const claimLoc = page.getByText(/^\s*claim gift\s*$/i);
    const doneLoc = page.getByText(/already claimed|claimed|received/i);
    const end = Date.now() + 30000;
    let claim = null, done = null;
    while (Date.now() < end && !claim && !done) {
      claim = await waitVisible(page, claimLoc, 2000);
      if (!claim) done = await waitVisible(page, doneLoc, 1000);
    }

    if (claim) {
      await claim.click();
      console.log('Clicked CLAIM GIFT on the card.');

      // A confirmation modal opens: "You are about to claim your Gift"
      const modalText = page.getByText(/you are about to claim/i);
      const modal = await waitVisible(page, modalText, 15000);
      if (!modal) throw new Error('Confirmation modal did not appear');
      await page.waitForTimeout(1000);

      // The modal's yellow button = the LAST visible "CLAIM GIFT" on the page
      // (card button comes first, modal title second, modal button last)
      const all = page.getByText(/^\s*claim gift\s*$/i);
      const count = await all.count();
      let confirmBtn = null;
      for (let i = count - 1; i >= 0; i--) {
        const el = all.nth(i);
        if (await el.isVisible().catch(() => false)) { confirmBtn = el; break; }
      }
      if (!confirmBtn) throw new Error('Could not find the CLAIM GIFT button inside the modal');
      await confirmBtn.click();
      console.log('Clicked CLAIM GIFT in the confirmation modal.');
      await page.waitForTimeout(5000);

      const body = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '');
      console.log('--- page text after claim ---\n' + body);

      // Success = the "about to claim" modal is gone (or replaced by a result message)
      const modalStill = await waitVisible(page, modalText, 2000);
      if (modalStill) throw new Error('Confirmation modal still open after clicking claim');
      console.log('Gift claimed.');
    } else if (done) {
      console.log('Already claimed today - treating as success.');
    } else {
      throw new Error('Neither CLAIM GIFT nor a claimed message was found');
    }
    await browser.close();
    return true;
  } catch (err) {
    console.error(`Attempt ${n} failed: ${err.message}`);
    await page.screenshot({ path: `fail-${n}.png`, fullPage: true }).catch(() => {});
    const text = await page.evaluate(() => document.body.innerText.slice(0, 1500)).catch(() => '');
    console.error('--- page text ---\n' + text);
    await browser.close();
    return false;
  }
}

(async () => {
  console.log('claim.js version: v3 (modal-aware)');
  if (!PLAYER_ID) { console.error('PLAYER_ID env var missing'); process.exit(1); }
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (await attempt(i)) process.exit(0);
    await new Promise(r => setTimeout(r, 20000));
  }
  process.exit(1);
})();
