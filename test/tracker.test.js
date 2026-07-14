/**
 * Playwright integration test for the tracker.
 *
 * Serves the test page, intercepts requests to the ingestion API,
 * and verifies that user interactions produce correctly shaped event batches.
 */

import { test, expect } from '@playwright/test';

const TEST_PAGE = 'test/index.html';

/**
 * Collect intercepted event batches sent to the ingestion API.
 */
async function setupEventInterceptor(page) {
  const captured = { events: [], checkpoints: [] };

  await page.route('**/api/v1/events', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.events) captured.events.push(...body.events);
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: body?.events?.length || 0, rejected: 0 }) });
  });

  await page.route('**/api/v1/checkpoints', async (route) => {
    const body = route.request().postDataJSON();
    if (body) captured.checkpoints.push(body);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ checkpoint_id: body?.checkpoint_id || 'mock' }) });
  });

  return captured;
}

test.describe('Tracker Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Override tracker config to point to intercepted routes
    await page.addInitScript(() => {
      window.__trailscript_config = {
        ingestionUrl: 'http://localhost:9999',
        siteKey: 'sk_test_integration',
      };
    });
  });

  test('emits navigation event on page load', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    // Wait for the transport flush interval
    await page.waitForTimeout(3000);

    const navEvents = captured.events.filter((e) => e.event_type === 'navigation');
    expect(navEvents.length).toBeGreaterThanOrEqual(1);

    const nav = navEvents[0];
    expect(nav).toHaveProperty('event_id');
    expect(nav).toHaveProperty('session_id');
    expect(nav).toHaveProperty('tab_id');
    expect(nav).toHaveProperty('sequence');
    expect(nav).toHaveProperty('timestamp');
    expect(nav).toHaveProperty('page');
    expect(nav.page).toHaveProperty('url');
  });

  test('captures click events with target selectors', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.click('#primary-btn');
    await page.waitForTimeout(3000);

    const clicks = captured.events.filter((e) => e.event_type === 'click');
    expect(clicks.length).toBeGreaterThanOrEqual(1);

    const click = clicks[0];
    expect(click.target).toBeTruthy();
    expect(click.target.selectors).toBeTruthy();
    expect(click.target.tag).toBe('BUTTON');
  });

  test('captures fill events from form input', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#email', 'test@example.com');
    // Trigger change event by clicking elsewhere
    await page.click('h1');
    await page.waitForTimeout(3000);

    const fills = captured.events.filter((e) => e.event_type === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(1);
  });

  test('normalizes password field to synthetic value', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#password', 'SuperSecret123!');
    await page.click('h1');
    await page.waitForTimeout(3000);

    const fills = captured.events.filter((e) => e.event_type === 'fill');
    const passwordFill = fills.find((e) => e.target?.attributes?.type === 'password'
      || e.target?.attributes?.id === 'password');
    expect(passwordFill).toBeTruthy();
    expect(passwordFill.payload.value).toBe('TestPass123!');
    expect(passwordFill.payload.is_sensitive).toBeUndefined();
    expect(passwordFill.payload.previous_value).toBeUndefined();
  });

  test('normalizes all text input values regardless of field name', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#pin', '1234');
    await page.fill('#secret-field', 'my-api-key');
    await page.click('h1');
    await page.waitForTimeout(3000);

    const fills = captured.events.filter((e) => e.event_type === 'fill');

    const pinFill = fills.find((e) => e.target?.attributes?.id === 'pin'
      || e.target?.attributes?.name === 'pin_code');
    expect(pinFill).toBeTruthy();
    expect(pinFill.payload.value).toBe('test value');
    expect(pinFill.payload.is_sensitive).toBeUndefined();

    const secretFill = fills.find((e) => e.target?.attributes?.id === 'secret-field'
      || e.target?.attributes?.name === 'secret_key');
    expect(secretFill).toBeTruthy();
    expect(secretFill.payload.value).toBe('test value');
    expect(secretFill.payload.is_sensitive).toBeUndefined();
  });

  test('normalizes normal text fields to synthetic value', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#name', 'John Doe');
    await page.click('h1');
    await page.waitForTimeout(3000);

    const fills = captured.events.filter((e) => e.event_type === 'fill');
    const nameFill = fills.find((e) => e.target?.attributes?.id === 'name'
      || e.target?.attributes?.name === 'name');
    expect(nameFill).toBeTruthy();
    expect(nameFill.payload.value).toBe('test value');
    expect(nameFill.payload.is_sensitive).toBeUndefined();
    expect(nameFill.payload.previous_value).toBeUndefined();
  });

  test('normalizes email field to type-appropriate value', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#email', 'real-user@company.com');
    await page.click('h1');
    await page.waitForTimeout(3000);

    const fills = captured.events.filter((e) => e.event_type === 'fill');
    const emailFill = fills.find((e) => e.target?.attributes?.type === 'email'
      || e.target?.attributes?.id === 'email');
    expect(emailFill).toBeTruthy();
    expect(emailFill.payload.value).toBe('user@example.com');
  });

  test('normalizes form values in DOM checkpoints', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.fill('#password', 'SuperSecret123!');
    await page.fill('#email', 'real@email.com');
    await page.fill('#name', 'John Doe');
    // Trigger a checkpoint by navigating
    await page.click('#spa-nav');
    await page.waitForTimeout(3000);

    const checkpoints = captured.checkpoints;
    for (const cp of checkpoints) {
      if (!cp.form_values) continue;
      for (const fv of cp.form_values) {
        const type = fv.type || '';
        if (type === 'password') {
          expect(fv.value).toBe('TestPass123!');
        } else if (type === 'email') {
          expect(fv.value).toBe('user@example.com');
        } else if (type === 'text') {
          expect(fv.value).toBe('test value');
        }
      }
    }
  });

  test('preserves actual values for select and checkbox', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.selectOption('#role', 'admin');
    await page.check('#terms');
    await page.waitForTimeout(3000);

    const selects = captured.events.filter((e) => e.event_type === 'select_option');
    expect(selects.length).toBeGreaterThanOrEqual(1);
    expect(selects[0].payload.value).toBe('admin');

    const checks = captured.events.filter((e) => e.event_type === 'check');
    expect(checks.length).toBeGreaterThanOrEqual(1);
    expect(checks[0].payload.checked).toBe(true);
  });

  test('captures select option events', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.selectOption('#role', 'admin');
    await page.waitForTimeout(3000);

    const selects = captured.events.filter((e) => e.event_type === 'select_option');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  test('captures checkbox check events', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.check('#terms');
    await page.waitForTimeout(3000);

    const checks = captured.events.filter((e) => e.event_type === 'check');
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  test('captures SPA navigation via pushState', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.click('#spa-nav');
    await page.waitForTimeout(3000);

    const navs = captured.events.filter((e) => e.event_type === 'navigation');
    // Should have initial page_load nav + SPA nav
    expect(navs.length).toBeGreaterThanOrEqual(2);
  });

  test('event schema has all required fields', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.click('#primary-btn');
    await page.waitForTimeout(3000);

    for (const event of captured.events) {
      expect(typeof event.event_id).toBe('string');
      expect(typeof event.session_id).toBe('string');
      expect(typeof event.tab_id).toBe('string');
      expect(typeof event.sequence).toBe('number');
      expect(typeof event.timestamp).toBe('string');
      expect(typeof event.event_type).toBe('string');
      expect(event.page).toBeTruthy();
      expect(typeof event.page.url).toBe('string');
    }
  });

  test('session_id is consistent across interactions', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.click('#primary-btn');
    await page.click('#secondary-btn');
    await page.waitForTimeout(3000);

    const sessionIds = new Set(captured.events.map((e) => e.session_id));
    expect(sessionIds.size).toBe(1);
  });

  test('sequence numbers are monotonically increasing', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    await page.click('#primary-btn');
    await page.click('#secondary-btn');
    await page.waitForTimeout(3000);

    const sequences = captured.events.map((e) => e.sequence);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  });

  test('captures DOM checkpoints on navigation', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    // Wait for checkpoint to be captured (navigation triggers checkpoint)
    await page.waitForTimeout(3000);

    expect(captured.checkpoints.length).toBeGreaterThanOrEqual(1);

    const cp = captured.checkpoints[0];
    expect(cp).toHaveProperty('checkpoint_id');
    expect(cp).toHaveProperty('session_id');
    expect(cp).toHaveProperty('timestamp');
    expect(cp).toHaveProperty('url');
  });

  // The site key travels differently depending on which transport wins, so each
  // path is pinned separately. Asserting only "the key arrived somehow" would
  // stay green if one of the two carriers silently regressed.
  //
  //   sendBeacon (primary)  — cannot set custom headers, so the key rides in
  //                           the request BODY as `site_key`.
  //   fetch      (fallback) — sets the `X-Site-Key` HEADER.

  async function captureSiteKeyCarriers(page) {
    const seen = { header: null, body: null };
    const capture = (request) => {
      seen.header ??= request.headers()['x-site-key'] ?? null;
      try {
        seen.body ??= JSON.parse(request.postData() || '{}').site_key ?? null;
      } catch {
        // Non-JSON body — leave unset.
      }
    };
    await page.route('**/api/v1/events', async (route) => {
      capture(route.request());
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: 0, rejected: 0 }) });
    });
    await page.route('**/api/v1/checkpoints', async (route) => {
      capture(route.request());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ checkpoint_id: 'mock' }) });
    });
    return seen;
  }

  test('site key rides in the body on the sendBeacon path', async ({ page }) => {
    const seen = await captureSiteKeyCarriers(page);

    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);
    await page.click('#primary-btn');
    await page.waitForTimeout(3000);

    expect(seen.body).toBe('sk_test_integration');
    // Not an incidental detail — it's *why* the key is in the body at all.
    expect(seen.header).toBeNull();
  });

  test('site key rides in the X-Site-Key header when sendBeacon is unavailable', async ({ page }) => {
    // Force the fetch fallback by making sendBeacon report failure.
    await page.addInitScript(() => {
      navigator.sendBeacon = () => false;
    });
    const seen = await captureSiteKeyCarriers(page);

    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);
    await page.click('#primary-btn');
    await page.waitForTimeout(3000);

    expect(seen.header).toBe('sk_test_integration');
  });

  test('captures click-settle checkpoint after non-navigation click', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);

    // Wait for initial navigation checkpoint to settle
    await page.waitForTimeout(1000);
    const checkpointsBefore = captured.checkpoints.length;

    // Click a non-navigation, non-form-submit button
    await page.click('#primary-btn');
    // Wait for the 500ms settle timer + buffer
    await page.waitForTimeout(1500);

    const settleCheckpoints = captured.checkpoints.slice(checkpointsBefore);
    expect(settleCheckpoints.length).toBeGreaterThanOrEqual(1);

    // The settle checkpoint should have trigger_event_id matching the click event
    const clickEvents = captured.events.filter((e) => e.event_type === 'click');
    const lastClick = clickEvents[clickEvents.length - 1];
    const settleCP = settleCheckpoints.find(
      (cp) => cp.trigger_event_id === lastClick.event_id
    );
    expect(settleCP).toBeTruthy();
    expect(settleCP).toHaveProperty('visible_elements');
    expect(settleCP).toHaveProperty('url');
  });

  test('debounces click-settle checkpoint across rapid clicks', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);
    await page.waitForTimeout(1000);
    const checkpointsBefore = captured.checkpoints.length;

    // Rapid clicks — should produce only one settle checkpoint
    await page.click('#primary-btn');
    await page.waitForTimeout(100);
    await page.click('#primary-btn');
    await page.waitForTimeout(100);
    await page.click('#primary-btn');

    // Wait for settle timer (500ms from last click + buffer)
    await page.waitForTimeout(1500);

    const settleCheckpoints = captured.checkpoints.slice(checkpointsBefore);
    // Should be exactly 1 settle checkpoint (not 3)
    // Mutation observer may also fire, so allow up to 2
    expect(settleCheckpoints.length).toBeLessThanOrEqual(2);
    expect(settleCheckpoints.length).toBeGreaterThanOrEqual(1);

    // The settle checkpoint should reference the LAST click event
    const clickEvents = captured.events.filter((e) => e.event_type === 'click');
    const lastClick = clickEvents[clickEvents.length - 1];
    const settleCP = settleCheckpoints.find(
      (cp) => cp.trigger_event_id === lastClick.event_id
    );
    expect(settleCP).toBeTruthy();
  });

  test('navigation cancels pending click-settle checkpoint', async ({ page }) => {
    const captured = await setupEventInterceptor(page);
    await page.goto(`file://${process.cwd()}/${TEST_PAGE}`);
    await page.waitForTimeout(1000);
    const checkpointsBefore = captured.checkpoints.length;

    // Click a button, then immediately trigger navigation
    await page.click('#primary-btn');
    await page.waitForTimeout(50);
    await page.click('#spa-nav'); // triggers navigation → shouldCheckpoint

    // Wait for everything to settle
    await page.waitForTimeout(2000);

    const newCheckpoints = captured.checkpoints.slice(checkpointsBefore);
    // Should have a navigation checkpoint but NOT a separate settle checkpoint
    // for the primary-btn click (it was cancelled by navigation)
    const clickEvents = captured.events.filter((e) => e.event_type === 'click');
    const primaryClick = clickEvents.find(
      (e) => e.target?.attributes?.id === 'primary-btn'
    );
    const settleForPrimary = newCheckpoints.find(
      (cp) => cp.trigger_event_id === primaryClick?.event_id
    );
    // The settle checkpoint for primary-btn should have been cancelled
    expect(settleForPrimary).toBeFalsy();
  });
});
