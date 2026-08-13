// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GitHubLinks, SupportLink } from './ProjectLinks';

afterEach(cleanup);

describe('ProjectLinks', () => {
  it('renders every destination as a named safe external link', () => {
    render(<><SupportLink /><GitHubLinks /></>);

    const destinations = [
      ['Support SliceMe on Buy Me a Coffee', 'https://buymeacoffee.com/slicemeweb'],
      ['SliceMe on GitHub', 'https://github.com/itymarcel/sliceme'],
      ['Custom Orca on GitHub', 'https://github.com/itymarcel/custom-orca'],
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
