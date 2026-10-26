const { chromium } = require('playwright');

const STORE_URL = 'https://store.callofdutymobile.com/en-in/codm';
const PLAYER_ID = process.env.PLAYER_ID;
const MAX_ATTEMPTS = 3;
const CLAIM_RE = /^\s*claim gift\s*$/i;

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

// Last visible match (used for the modal's button)
async function lastVisible(locator) {
  const n = await locator.count().catch(() => 0);
  for (let i = n - 1; i >= 0; i--) {
    const el = locator.nth(i);
    if (await el.isVisible().catch(() => false)) return el;
  }
  return null;
}

// Screenshots are named fail-*.png so the workflow's failure artifact picks them up
async function shot(page, n, name, full = true) {
  await page.screenshot({ path: `fail-${n}-${name}.png`, fullPage: full }).catch(() => {});
}

// Load the store, enter the ID, open the Gifts tab, wait for the Daily Gift card
async function openGifts(page, n, tag) {
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const input = page.locator('input[placeholder*="ID" i], input[type="text"]').first();
  await input.waitFor({ timeout: 30000 });
  await input.click();
  await input.fill('');
  await input.pressSequentially(PLAYER_ID, { delay: 120 });
  await input.press('Tab');

  const welcome = await waitVisible(page, page.getByText(/welcome/i), 30000);
  if (!welcome) throw new Error('Player ID was not verified (no Welcome message)');
  console.log(`[${tag}] Player ID verified.`);

  const gifts = await waitVisible(page, page.getByText(/^\s*gifts?\s*$/i), 60000);
  if (!gifts) throw new Error('GIFTS tab never appeared (products did not load)');
  await gifts.click();
  await page.waitForTimeout(2000);

  const card = await waitVisible(page, page.getByText(/daily gift/i), 30000);
  if (!card) throw new Error('Daily Gift card not found in the Gifts tab');
  console.log(`[${tag}] Gifts tab open, Daily Gift card visible.`);
}

async function claimFlow(page, n) {
  // Step A: click CLAIM GIFT on the card
  const cardBtn = await waitVisible(page, page.getByText(CLAIM_RE), 5000);
  if (!cardBtn) throw new Error('CLAIM GIFT button not found on the card');
  await cardBtn.click();
  console.log('Clicked CLAIM GIFT on the card.');

  // Step B: wait for the confirmation modal
  const modalText = page.getByText(/you are about to claim/i);
  if (!(await waitVisible(page, modalText, 15000))) {
    throw new Error('Confirmation modal did not appear');
  }
  await page.waitForTimeout(1000);
  await shot(page, n, '3-modal-open', false);

  // Step C: find the modal container = innermost element holding BOTH the
  // "about to claim" text AND a CLAIM GIFT element; its last CLAIM GIFT is the button
  const modal = page.locator('div, section, aside, dialog')
    .filter({ hasText: /you are about to claim/i })
    .filter({ has: page.getByText(CLAIM_RE) })
    .last();

  let btn = null;
  if ((await modal.count().catch(() => 0)) > 0) {
    btn = await lastVisible(modal.getByText(CLAIM_RE));
    const txt = (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    console.log('Modal content: ' + txt);
  }
  if (!btn) {
    console.log('Modal container not found, falling back to last visible CLAIM GIFT on page.');
    btn = await lastVisible(page.getByText(CLAIM_RE));
  }
  if (!btn) throw new Error('Could not find the CLAIM GIFT button inside the modal');

  // Step D: click it (normal -> forced -> DOM click)
  try {
    await btn.click({ timeout: 10000 });
  } catch (e) {
    console.log('Normal click failed: ' + e.message.split('\n')[0]);
    try {
      await btn.click({ force: true, timeout: 5000 });
    } catch (e2) {
      console.log('Forced click failed, using DOM click.');
      await btn.evaluate(el => el.click());
    }
  }
  console.log('Clicked CLAIM GIFT in the confirmation modal.');

  await page.waitForTimeout(6000);
  await shot(page, n, '4-after-claim', false);
  const stillOpen = await waitVisible(page, modalText, 1000);
  console.log(stillOpen ? 'Modal still open after click.' : 'Modal closed after click.');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1500);
}

async function attempt(n) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();

  // Log non-GET requests (e.g. the claim API call) so we can see if the server accepted it
  page.on('response', async (r) => {
    try {
      const req = r.request();
      if (req.method() === 'GET') return;
      const u = r.url().split('?')[0];
      if (/google|doubleclick|facebook|sentry|analytics|tiktok|clarity|hotjar|segment/i.test(u)) return;
      const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      console.log(`[net] ${req.method()} ${r.status()} ${u.slice(0, 110)} ${body}`);
    } catch (_) {}
  });

  try {
    await openGifts(page, n, 'before');
    await shot(page, n, '1-gifts');

    // Is the gift claimable right now?
    const claimable = await waitVisible(page, page.getByText(CLAIM_RE), 5000);
    if (!claimable) {
      console.log('No CLAIM GIFT button on the Daily Gift card - already claimed today. Success.');
      await browser.close();
      return true;
    }

    await claimFlow(page, n);

    // Verify on a fresh page load that the gift is no longer claimable
    await openGifts(page, n, 'verify');
    await shot(page, n, '5-verify');
    if (await waitVisible(page, page.getByText(CLAIM_RE), 5000)) {
      throw new Error('Gift is still claimable after claiming - the claim did not register');
    }
    console.log('Gift claimed (verified after fresh page load).');

    await browser.close();
    return true;
  } catch (err) {
    console.error(`Attempt ${n} failed: ${err.message}`);
    await shot(page, n, '9-fail');
    const text = await page.evaluate(() => document.body.innerText.slice(0, 1200)).catch(() => '');
    console.error('--- page text ---\n' + text);
    await browser.close();
    return false;
  }
}

(async () => {
  console.log('claim.js version: v4 (verified claim + diagnostics)');
  if (!PLAYER_ID) { console.error('PLAYER_ID env var missing'); process.exit(1); }
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (await attempt(i)) process.exit(0);
    await new Promise(r => setTimeout(r, 20000));
  }
  process.exit(1);
})();
