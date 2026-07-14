/**
 * Unit tests for PII redaction (M-1).
 *
 * Pure string logic — no browser fixture, so these run under the Playwright
 * test runner without launching a browser.
 */

import { test, expect } from '@playwright/test';
import { redactPII, REDACTED } from '../src/normalisation/redact.js';

test.describe('redactPII', () => {
  test('redacts email addresses', () => {
    const out = redactPII('Signed in as jane.doe+work@example.co.uk');
    expect(out).not.toContain('jane.doe+work@example.co.uk');
    expect(out).toContain(REDACTED);
    expect(out).toContain('Signed in as');
  });

  test('redacts credit-card-like digit runs', () => {
    expect(redactPII('Card 4111 1111 1111 1111 charged')).not.toContain('4111');
    expect(redactPII('4111-1111-1111-1111')).toBe(REDACTED);
  });

  test('redacts phone numbers', () => {
    expect(redactPII('Call +1 (555) 123-4567 now')).not.toContain('555');
    expect(redactPII('Call +1 (555) 123-4567 now')).toContain(REDACTED);
  });

  test('redacts long standalone digit runs (account/SSN-like)', () => {
    expect(redactPII('SSN 123456789 on file')).not.toContain('123456789');
    expect(redactPII('Order 4567012')).toContain(REDACTED);
  });

  test('redacts long opaque alphanumeric tokens', () => {
    const token = 'a1b2c3d4e5f6g7h8i9j0k1l2';
    expect(redactPII(`token=${token}`)).not.toContain(token);
  });

  test('preserves ordinary structural label text', () => {
    expect(redactPII('Dashboard')).toBe('Dashboard');
    expect(redactPII('Submit')).toBe('Submit');
    expect(redactPII('Total: 5 items')).toBe('Total: 5 items');
    expect(redactPII('Order #42 confirmed')).toBe('Order #42 confirmed');
    expect(redactPII('Add to cart')).toBe('Add to cart');
  });

  test('does not redact ordinary long words without digits', () => {
    expect(redactPII('internationalization')).toBe('internationalization');
  });

  test('passes through empty / null / non-string values unchanged', () => {
    expect(redactPII('')).toBe('');
    expect(redactPII(null)).toBe(null);
    expect(redactPII(undefined)).toBe(undefined);
  });

  test('redacts multiple PII occurrences in one string', () => {
    const out = redactPII('Email a@b.com or call 555-123-4567');
    expect(out).not.toContain('a@b.com');
    expect(out).not.toContain('555-123-4567');
    expect((out.match(/\[redacted\]/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
