/**
 * Type augmentation for the vitest-axe matchers under Vitest 4.
 *
 * vitest-axe ships an augmentation against the legacy `Vi.Assertion` namespace,
 * which Vitest 4 no longer merges into. Without this, `tsc --noEmit` does not
 * see `toHaveNoViolations` on the assertion type even though it is registered at
 * runtime via `expect.extend` in vitest.setup.ts. We re-declare the matcher
 * against Vitest 4's `Assertion`/`AsymmetricMatchersContaining` interfaces.
 */
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  interface Assertion<T = unknown> extends AxeMatchers {
    // Preserve the generic parameter so existing call sites keep their typing.
    _axeAssertion?: T;
  }
  // A type alias (not an empty extending interface) — surfaces the AxeMatchers
  // members on the asymmetric-matcher type without tripping
  // @typescript-eslint/no-empty-object-type.
  type AsymmetricMatchersContaining = AxeMatchers;
}
