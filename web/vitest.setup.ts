// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';

// Accessibility testing with axe-core. The matchers are registered at runtime
// via expect.extend; their TypeScript types are augmented for Vitest 4 in
// src/__tests__/vitest-axe.d.ts.
import * as matchers from 'vitest-axe/matchers';
import { expect, vi } from 'vitest';

expect.extend(matchers);

// Testing Library + Vitest fake-timer interop.
//
// @testing-library/dom's `waitFor` / `findBy*` only know how to drive a frozen
// clock forward when they believe Jest fake timers are active: their detection
// is `typeof jest !== 'undefined' && (setTimeout._isMockFunction || 'clock' in
// setTimeout)`, and when it returns true they advance the clock with
// `jest.advanceTimersByTime(interval)`. Under Vitest there is no `jest` global,
// so the detection short-circuits to false and `waitFor` polls on the (now
// frozen) real clock — which never ticks, so any `findBy*` after
// `vi.useFakeTimers()` hangs until the test times out.
//
// Vitest's faked `setTimeout` DOES carry a `clock` property, so we only need to
// supply a minimal `jest`-shaped global exposing `advanceTimersByTime`, routed
// to Vitest's own timer control. The detection still gates on the `clock`
// property, so this shim is inert under real timers and changes nothing for the
// many suites that never call `vi.useFakeTimers()`. This lets fake-timer suites
// (e.g. the session-lifecycle timers) use `findByRole` / `waitFor` exactly as
// they would under Jest.
const globalWithJest = globalThis as typeof globalThis & {
  jest?: { advanceTimersByTime: (ms: number) => void };
};
if (typeof globalWithJest.jest === 'undefined') {
  globalWithJest.jest = {
    advanceTimersByTime: (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
  };
}

// Polyfill for Web APIs needed by Next.js
// These are required for testing files that import from 'next/server'
if (typeof Request === 'undefined') {
  global.Request = class Request {
    url: string;
    method: string;
    headers: Headers;

    constructor(input: string | Request, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers);
    }
  } as unknown as typeof Request;
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    status: number;
    statusText: string;
    headers: Headers;
    body: unknown;

    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers);
    }

    json() {
      return Promise.resolve(JSON.parse(this.body as string));
    }
  } as unknown as typeof Response;
}

if (typeof Headers === 'undefined') {
  global.Headers = class Headers {
    private headers: Map<string, string> = new Map();

    constructor(init?: HeadersInit) {
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) =>
            this.headers.set(key.toLowerCase(), value),
          );
        } else if (init instanceof Headers) {
          init.forEach((value, key) => this.headers.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) =>
            this.headers.set(key.toLowerCase(), value),
          );
        }
      }
    }

    get(name: string) {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name: string) {
      return this.headers.has(name.toLowerCase());
    }

    delete(name: string) {
      this.headers.delete(name.toLowerCase());
    }

    forEach(callback: (value: string, key: string, parent: Headers) => void) {
      this.headers.forEach((value, key) => callback(value, key, this));
    }
  } as unknown as typeof Headers;
}
