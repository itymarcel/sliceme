// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUsageSessionId } from './useUsageSession';

describe('usage session IDs', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('creates a UUID when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(17);
        return bytes;
      },
    });

    const id = getUsageSessionId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getUsageSessionId()).toBe(id);
  });
});
