// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeMachinePopover } from './TimeMachinePopover';

const FAKE_CHANGELOG = `# Changelog

## 2026-09-02

- Fixed multipart layer-height overrides.
- Added README disclosure.
`;

const HEADING_CHANGELOG = `# Changelog

## 2026-09-02

- Fixed multipart layer-height overrides.
`;

const SCRIPT_CHANGELOG = `## heading

- <script>alert("x")</script>
- plain
`;

function mockFetchResolved(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  } as unknown as Response);
}

function createDeferredFetch() {
  let resolve: (value: Response) => void = () => {
    throw new Error('deferred fetch not controlled');
  };
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  const fetchMock = vi.fn(() => promise);
  return { fetchMock, resolve };
}

const ResizeObserverMock = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

describe('TimeMachinePopover', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders nothing when closed', () => {
    render(<TimeMachinePopover open={false} onClose={vi.fn()} />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /changelog/i })).toBeNull();
  });

  it('fetches /changelog.md and renders markdown when opened', async () => {
    vi.stubGlobal('fetch', mockFetchResolved(FAKE_CHANGELOG));
    const onClose = vi.fn();
    render(<TimeMachinePopover open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Fixed multipart layer-height overrides.')).toBeTruthy();
    });

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /changelog/i })).toBeTruthy();
    expect(screen.getByText('Added README disclosure.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /close changelog/i })).toBeTruthy();
  });

  it('shows a loading state before the fetch completes', async () => {
    const { fetchMock, resolve } = createDeferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<TimeMachinePopover open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Loading changelog…')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith('/changelog.md');

    await act(async () => {
      resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(HEADING_CHANGELOG),
      } as unknown as Response);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Fixed multipart layer-height overrides.')).toBeTruthy();
    });
  });

  it('renders a network error message when the fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    render(<TimeMachinePopover open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Could not load changelog')).toBeTruthy();
      expect(screen.getByText('fetch failed')).toBeTruthy();
    });
  });

  it('renders a "no changelog available" message when the response is empty', async () => {
    vi.stubGlobal('fetch', mockFetchResolved(''));
    const onClose = vi.fn();
    render(<TimeMachinePopover open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('No changelog available.')).toBeTruthy();
    });
  });

  it('closes and calls onClose on Escape', async () => {
    vi.stubGlobal('fetch', mockFetchResolved('# Heading\n'));
    const onClose = vi.fn();
    render(<TimeMachinePopover open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes and calls onClose when clicking outside the popover', async () => {
    vi.stubGlobal('fetch', mockFetchResolved('# Heading\n'));
    const onClose = vi.fn();
    const { container } = render(<TimeMachinePopover open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    fireEvent.click(container);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes and calls onClose when the close button is clicked', async () => {
    vi.stubGlobal('fetch', mockFetchResolved('# Heading\n'));
    const onClose = vi.fn();
    render(<TimeMachinePopover open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    screen.getByRole('button', { name: /close changelog/i }).click();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('escapes markdown headings, list items, and inline code safely', async () => {
    const { fetchMock, resolve } = createDeferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<TimeMachinePopover open={true} onClose={vi.fn()} />);

    await act(async () => {
      expect(fetchMock).toHaveBeenCalledWith('/changelog.md');
      resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SCRIPT_CHANGELOG),
      } as unknown as Response);
      await Promise.resolve();
    });

    const root = screen.getByRole('dialog');
    expect(root.innerHTML).not.toContain('<script>');
    expect(root.innerHTML).toContain('&lt;script&gt;');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('plain')).toBeTruthy();
  });
});
