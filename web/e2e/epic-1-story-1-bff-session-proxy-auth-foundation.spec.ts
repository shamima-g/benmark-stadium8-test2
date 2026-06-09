import { test, expect } from '@playwright/test';

// Non-routable: BFF auth foundation (session proxy route handlers + session provider) is infrastructure-only with no user-facing route — proxy/provider/typed-error behaviour is verified by Vitest (AC-1/2/3).
test.fixme('Epic 1, Story 1: BFF session proxy and auth foundation (deferred to consumer stories)', () => {
  // Intentionally empty — playwright-runner detects test.fixme( and auto-skips.
  // E2E coverage of real sign-in/redirect flows arrives with the routable consumer
  // stories that build the sign-in screen and protected shell on top of this foundation.
  expect(true).toBe(true);
});
