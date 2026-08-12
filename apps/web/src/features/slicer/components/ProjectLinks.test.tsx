// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectLinks } from './ProjectLinks';

afterEach(cleanup);

describe('ProjectLinks', () => {
  it('renders every destination as a named safe external link', () => {
    render(<ProjectLinks />);

    const destinations = [
      ['Support SliceMe on Buy Me a Coffee', 'https://buymeacoffee.com/slicemeweb'],
      ['SliceMe repository', 'https://github.com/itymarcel/sliceme'],
      ['Custom Orca repository', 'https://github.com/itymarcel/custom-orca'],
    ] as const;

    destinations.forEach(([name, href]) => {
      expect(screen.getByRole('link', { name })).toMatchObject({
        href,
        target: '_blank',
        rel: 'noreferrer',
      });
    });
  });
});
